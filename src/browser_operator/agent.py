"""
agent.py — LLM 驱动的浏览器 Agent 执行器

将 LLM 的 function-calling 输出映射到 tools.py 中的工具函数，
实现"思考 → 选工具 → 执行 → 观察 → 循环"的 ReAct 范式。
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

from openai import AsyncOpenAI
from playwright.async_api import Page

from .tools import TOOL_REGISTRY, ToolResult

log = logging.getLogger(__name__)

# ── 工具 Schema（OpenAI function-calling 格式）────────────────────────────────

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "navigate",
            "description": "导航到指定 URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "目标 URL"},
                    "wait": {
                        "type": "string",
                        "enum": ["load", "domcontentloaded", "networkidle"],
                        "default": "domcontentloaded",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "click",
            "description": "点击页面元素",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS 选择器或文本"},
                },
                "required": ["selector"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fill",
            "description": "在表单字段中输入文本",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string"},
                    "value": {"type": "string"},
                    "press_enter": {"type": "boolean", "default": False},
                },
                "required": ["selector", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "screenshot",
            "description": "截取当前页面截图并保存",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "保存路径，如 output/page.png"},
                    "full_page": {"type": "boolean", "default": True},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "extract_text",
            "description": "提取页面全部可见文本",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "extract_element",
            "description": "提取指定元素的文本内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string"},
                },
                "required": ["selector"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "extract_table",
            "description": "将页面中的 HTML 表格提取为二维列表",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "default": "table"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "wait_for",
            "description": "等待指定元素出现",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string"},
                    "timeout": {"type": "integer", "default": 15000},
                },
                "required": ["selector"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_js",
            "description": "在页面中执行 JavaScript 并返回结果",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string"},
                },
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": "任务完成，返回最终结果给用户",
            "parameters": {
                "type": "object",
                "properties": {
                    "result": {"type": "string", "description": "任务完成后的总结或提取到的数据"},
                },
                "required": ["result"],
            },
        },
    },
]

SYSTEM_PROMPT = """你是一个浏览器自动化 Agent，运行在用户的本地真实浏览器中（MY Browser 模式）。
你可以使用用户已有的登录状态、Cookie 和会话，无需重新登录任何网站。

执行规则：
1. 每次只调用一个工具，等待结果后再决定下一步
2. 遇到错误时，尝试备选选择器或等待后重试，最多重试 2 次
3. 任务完成后必须调用 finish 工具返回结果
4. 不要假设页面结构，先 extract_text 或 screenshot 观察后再操作
"""


@dataclass
class AgentConfig:
    model: str = "gpt-4.1-mini"
    max_steps: int = 20
    api_key: str = field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""))
    base_url: str | None = None


class BrowserAgent:
    """
    ReAct 范式的浏览器 Agent。

    用法：
        agent = BrowserAgent(page, config)
        result = await agent.run("搜索 OpenClaw 并截图首页")
    """

    def __init__(self, page: Page, config: AgentConfig | None = None) -> None:
        self._page = page
        self._cfg = config or AgentConfig()
        self._client = AsyncOpenAI(
            api_key=self._cfg.api_key,
            **({"base_url": self._cfg.base_url} if self._cfg.base_url else {}),
        )
        self._messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    async def run(self, task: str) -> str:
        """执行一个自然语言任务，返回最终结果字符串。"""
        log.info("Agent 开始执行任务: %s", task)
        self._messages.append({"role": "user", "content": task})

        for step in range(1, self._cfg.max_steps + 1):
            log.debug("Step %d/%d", step, self._cfg.max_steps)

            response = await self._client.chat.completions.create(
                model=self._cfg.model,
                messages=self._messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
            )

            msg = response.choices[0].message
            self._messages.append(msg.model_dump(exclude_none=True))

            # 没有工具调用 → LLM 直接回复，视为完成
            if not msg.tool_calls:
                log.info("Agent 完成（无工具调用）")
                return msg.content or ""

            # 执行所有工具调用（通常只有一个）
            for tc in msg.tool_calls:
                name = tc.function.name
                args = json.loads(tc.function.arguments or "{}")

                log.info("调用工具: %s(%s)", name, args)

                if name == "finish":
                    result_text = args.get("result", "")
                    log.info("Agent 完成: %s", result_text[:100])
                    return result_text

                tool_result = await self._dispatch(name, args)
                observation = json.dumps(tool_result.data if tool_result.ok else {"error": tool_result.error}, ensure_ascii=False)

                self._messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": observation,
                })

        return "已达到最大步骤数，任务未完成。"

    async def _dispatch(self, name: str, args: dict) -> ToolResult:
        fn = TOOL_REGISTRY.get(name)
        if fn is None:
            return ToolResult(ok=False, error=f"未知工具: {name}")
        try:
            return await fn(self._page, **args)
        except Exception as e:
            log.exception("工具 %s 执行异常", name)
            return ToolResult(ok=False, error=str(e))
