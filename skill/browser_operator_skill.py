"""
browser_operator_skill.py — OpenClaw Skill Entrypoint

将 Browser Operator 封装为 OpenClaw 可直接调用的 Skill。
"""

import asyncio
import logging
from typing import Any, Dict

# 假设 OpenClaw SDK 提供了这些基础类
# from openclaw.sdk import Skill, Tool, Context
# 这里为了演示，我们模拟这些类的结构

class Tool:
    def __init__(self, name: str, description: str, func: callable):
        self.name = name
        self.description = description
        self.func = func

class Skill:
    def __init__(self, name: str):
        self.name = name
        self.tools = []

    def register_tool(self, tool: Tool):
        self.tools.append(tool)

# 导入我们自己写的引擎
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent / "src"))

from browser_operator.cdp import CDPEngine, CDPConfig
from browser_operator.agent import BrowserAgent, AgentConfig

log = logging.getLogger(__name__)

# 初始化 Skill
my_browser_skill = Skill("my_browser_operator")

async def run_in_my_browser(task: str, port: int = 9222) -> str:
    """
    在用户的本地真实浏览器中执行自然语言任务。
    
    Args:
        task: 用户想要在浏览器中执行的任务描述
        port: 本地浏览器 CDP 调试端口 (默认 9222)
    """
    config = CDPConfig(port=port)
    engine = CDPEngine(config)
    
    try:
        await engine.connect()
    except Exception as e:
        return f"无法连接到本地浏览器，请确保已使用 --remote-debugging-port={port} 启动 Chrome/Edge。错误: {e}"

    try:
        page = await engine.active_page()
        # 这里可以从 OpenClaw Context 中获取 API Key，此处简化
        agent = BrowserAgent(page, AgentConfig())
        result = await agent.run(task)
        return f"任务执行完成。结果:\n{result}"
    except Exception as e:
        log.exception("执行任务时发生错误")
        return f"执行任务时发生错误: {e}"
    finally:
        await engine.disconnect()

# 注册工具到 Skill
my_browser_skill.register_tool(
    Tool(
        name="run_in_my_browser",
        description="在用户的本地真实浏览器中执行复杂的网页操作任务（复用用户的登录状态和会话）。",
        func=run_in_my_browser
    )
)

# OpenClaw 要求的导出入口
def get_skill() -> Skill:
    return my_browser_skill
