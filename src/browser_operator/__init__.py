"""
browser_operator — OpenClaw MY Browser Operator SDK

快速开始：
    from browser_operator import CDPEngine, CDPConfig, BrowserAgent, AgentConfig

    config = CDPConfig(port=9222)
    async with CDPEngine(config).session() as engine:
        page = await engine.new_tab("https://example.com")
        agent = BrowserAgent(page, AgentConfig())
        result = await agent.run("提取页面标题和第一段文字")
        print(result)
"""

from .agent import AgentConfig, BrowserAgent
from .cdp import CDPConfig, CDPConnectionError, CDPEngine, TabInfo
from .tools import TOOL_REGISTRY, ToolResult

__all__ = [
    "CDPConfig",
    "CDPEngine",
    "CDPConnectionError",
    "TabInfo",
    "ToolResult",
    "TOOL_REGISTRY",
    "BrowserAgent",
    "AgentConfig",
]
