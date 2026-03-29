"""
tools.py — Agent 可调用的浏览器工具集

每个工具函数接收一个 Page 对象和业务参数，返回结构化结果。
工具层不感知 CDP 连接细节，只操作 Page。
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from playwright.async_api import Page

log = logging.getLogger(__name__)


# ── 结果容器 ──────────────────────────────────────────────────────────────────

@dataclass
class ToolResult:
    ok: bool
    data: Any = None
    error: str = ""

    def __bool__(self) -> bool:
        return self.ok


# ── 导航工具 ──────────────────────────────────────────────────────────────────

async def navigate(page: Page, url: str, wait: str = "domcontentloaded") -> ToolResult:
    """导航到指定 URL。"""
    try:
        await page.goto(url, wait_until=wait, timeout=30_000)
        return ToolResult(ok=True, data={"url": page.url, "title": await page.title()})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


# ── 点击工具 ──────────────────────────────────────────────────────────────────

async def click(page: Page, selector: str, timeout: int = 10_000) -> ToolResult:
    """点击页面元素（CSS 选择器或文本）。"""
    try:
        await page.click(selector, timeout=timeout)
        return ToolResult(ok=True, data={"selector": selector})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


# ── 输入工具 ──────────────────────────────────────────────────────────────────

async def fill(page: Page, selector: str, value: str, press_enter: bool = False) -> ToolResult:
    """清空并填写表单字段，可选按下 Enter。"""
    try:
        await page.fill(selector, value, timeout=10_000)
        if press_enter:
            await page.press(selector, "Enter")
        return ToolResult(ok=True, data={"selector": selector, "value": value})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


# ── 截图工具 ──────────────────────────────────────────────────────────────────

async def screenshot(page: Page, path: str, full_page: bool = True) -> ToolResult:
    """截取页面截图并保存到本地文件。"""
    try:
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(out), full_page=full_page)
        return ToolResult(ok=True, data={"path": str(out.resolve()), "size": out.stat().st_size})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


# ── 内容提取工具 ──────────────────────────────────────────────────────────────

async def extract_text(page: Page) -> ToolResult:
    """提取页面全部可见文本。"""
    try:
        text = await page.evaluate("() => document.body.innerText")
        return ToolResult(ok=True, data={"text": text, "length": len(text)})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


async def extract_element(page: Page, selector: str) -> ToolResult:
    """提取单个元素的文本内容。"""
    try:
        el = await page.query_selector(selector)
        if not el:
            return ToolResult(ok=False, error=f"未找到元素: {selector}")
        text = await el.inner_text()
        return ToolResult(ok=True, data={"selector": selector, "text": text.strip()})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


async def extract_table(page: Page, selector: str = "table") -> ToolResult:
    """将页面中的 HTML 表格提取为二维列表。"""
    try:
        rows: list[list[str]] = await page.evaluate(
            """(sel) => {
                const table = document.querySelector(sel);
                if (!table) return [];
                return Array.from(table.rows).map(row =>
                    Array.from(row.cells).map(cell => cell.innerText.trim())
                );
            }""",
            selector,
        )
        return ToolResult(ok=True, data={"rows": rows, "count": len(rows)})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


# ── 等待工具 ──────────────────────────────────────────────────────────────────

async def wait_for(page: Page, selector: str, timeout: int = 15_000) -> ToolResult:
    """等待指定元素出现在 DOM 中。"""
    try:
        await page.wait_for_selector(selector, timeout=timeout)
        return ToolResult(ok=True, data={"selector": selector})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


async def wait_for_url(page: Page, url_pattern: str, timeout: int = 15_000) -> ToolResult:
    """等待页面 URL 匹配指定模式（支持 glob）。"""
    try:
        await page.wait_for_url(url_pattern, timeout=timeout)
        return ToolResult(ok=True, data={"url": page.url})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


# ── JavaScript 执行工具 ────────────────────────────────────────────────────────

async def run_js(page: Page, expression: str) -> ToolResult:
    """在页面上下文中执行任意 JavaScript，返回执行结果。"""
    try:
        result = await page.evaluate(expression)
        return ToolResult(ok=True, data={"result": result})
    except Exception as e:
        return ToolResult(ok=False, error=str(e))


# ── 工具注册表（供 Skill 层反射调用）────────────────────────────────────────

TOOL_REGISTRY: dict[str, Any] = {
    "navigate": navigate,
    "click": click,
    "fill": fill,
    "screenshot": screenshot,
    "extract_text": extract_text,
    "extract_element": extract_element,
    "extract_table": extract_table,
    "wait_for": wait_for,
    "wait_for_url": wait_for_url,
    "run_js": run_js,
}
