"""
cdp.py — Chrome DevTools Protocol 连接引擎

负责与本地或远程 Chrome/Edge/Brave 建立 CDP 连接，
提供标签页管理、DOM 查询、截图、Cookie 读写等底层能力。
"""

from __future__ import annotations

import asyncio
import base64
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

import aiohttp
from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

log = logging.getLogger(__name__)


@dataclass
class CDPConfig:
    host: str = "127.0.0.1"
    port: int = 9222
    timeout_ms: int = 30_000

    @property
    def endpoint(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def ws_endpoint(self) -> str:
        return f"ws://{self.host}:{self.port}"


@dataclass
class TabInfo:
    id: str
    title: str
    url: str
    type: str


class CDPConnectionError(RuntimeError):
    """无法连接到 CDP 端口时抛出。"""


class CDPEngine:
    """
    对 Playwright CDP 连接的薄封装。

    设计原则：
    - 只负责连接与生命周期管理，不包含业务逻辑
    - 所有方法均为 async，调用方负责 await
    - 通过 async context manager 使用，确保资源释放
    """

    def __init__(self, config: CDPConfig) -> None:
        self._cfg = config
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None

    # ── 生命周期 ──────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        """附加到已运行的本地浏览器（不启动新实例）。"""
        await self._assert_browser_reachable()
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.connect_over_cdp(
            self._cfg.endpoint,
            timeout=self._cfg.timeout_ms,
        )
        contexts = self._browser.contexts
        self._context = contexts[0] if contexts else await self._browser.new_context()
        log.info("CDP 已连接 → %s  (contexts=%d)", self._cfg.endpoint, len(contexts))

    async def disconnect(self) -> None:
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        log.info("CDP 连接已关闭")

    @asynccontextmanager
    async def session(self) -> AsyncIterator[CDPEngine]:
        await self.connect()
        try:
            yield self
        finally:
            await self.disconnect()

    # ── 标签页管理 ────────────────────────────────────────────────────────────

    async def list_tabs(self) -> list[TabInfo]:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{self._cfg.endpoint}/json/list", timeout=aiohttp.ClientTimeout(total=5)) as r:
                data = await r.json(content_type=None)
        return [
            TabInfo(id=t["id"], title=t.get("title", ""), url=t.get("url", ""), type=t.get("type", ""))
            for t in data
            if t.get("type") == "page"
        ]

    async def new_tab(self, url: str = "about:blank") -> Page:
        assert self._context, "未连接，请先调用 connect()"
        page = await self._context.new_page()
        if url != "about:blank":
            await page.goto(url, wait_until="domcontentloaded", timeout=self._cfg.timeout_ms)
        return page

    async def active_page(self) -> Page:
        """返回当前上下文中第一个已打开的页面，若无则新建。"""
        assert self._context
        pages = self._context.pages
        return pages[0] if pages else await self.new_tab()

    # ── 页面操作 ──────────────────────────────────────────────────────────────

    async def navigate(self, page: Page, url: str) -> None:
        await page.goto(url, wait_until="domcontentloaded", timeout=self._cfg.timeout_ms)

    async def screenshot(self, page: Page, path: str, full_page: bool = True) -> bytes:
        data = await page.screenshot(path=path, full_page=full_page)
        log.debug("截图已保存 → %s", path)
        return data

    async def get_text(self, page: Page) -> str:
        return await page.evaluate("() => document.body.innerText")

    async def get_html(self, page: Page) -> str:
        return await page.content()

    async def cookies(self, urls: list[str] | None = None) -> list[dict]:
        assert self._context
        return await self._context.cookies(urls or [])

    async def eval(self, page: Page, expression: str) -> Any:
        return await page.evaluate(expression)

    # ── 内部工具 ──────────────────────────────────────────────────────────────

    async def _assert_browser_reachable(self) -> None:
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(
                    f"{self._cfg.endpoint}/json/version",
                    timeout=aiohttp.ClientTimeout(total=3),
                ) as r:
                    info = await r.json(content_type=None)
            log.info("浏览器版本: %s", info.get("Browser"))
        except Exception as exc:
            raise CDPConnectionError(
                f"无法连接到 {self._cfg.endpoint}。\n"
                "请以 --remote-debugging-port=9222 启动 Chrome/Edge。"
            ) from exc
