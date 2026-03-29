"""
cli.py — 命令行入口

用法：
    # 连接测试
    python -m browser_operator check

    # 列出所有标签页
    python -m browser_operator tabs

    # 执行自然语言任务
    python -m browser_operator run "打开 https://httpbin.org/ip 并告诉我当前 IP"

    # 截图
    python -m browser_operator shot --url https://example.com --out page.png
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

import click

from .cdp import CDPConfig, CDPConnectionError, CDPEngine
from .agent import AgentConfig, BrowserAgent

logging.basicConfig(
    level=logging.WARNING,
    format="%(levelname)s  %(name)s  %(message)s",
)


def _engine(port: int) -> CDPEngine:
    return CDPEngine(CDPConfig(port=port))


# ── CLI 根命令 ────────────────────────────────────────────────────────────────

@click.group()
@click.option("--port", default=9222, show_default=True, help="Chrome CDP 调试端口")
@click.option("--verbose", "-v", is_flag=True, help="显示详细日志")
@click.pass_context
def cli(ctx: click.Context, port: int, verbose: bool) -> None:
    """OpenClaw MY Browser Operator — 本地浏览器 AI 控制工具"""
    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    ctx.ensure_object(dict)
    ctx.obj["port"] = port


# ── check ─────────────────────────────────────────────────────────────────────

@cli.command()
@click.pass_context
def check(ctx: click.Context) -> None:
    """检查本地浏览器 CDP 连接状态"""
    import aiohttp

    async def _run() -> None:
        port = ctx.obj["port"]
        endpoint = f"http://127.0.0.1:{port}"
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"{endpoint}/json/version", timeout=aiohttp.ClientTimeout(total=3)) as r:
                    info = await r.json(content_type=None)
            click.secho("✓ 连接成功", fg="green", bold=True)
            click.echo(f"  浏览器  : {info.get('Browser')}")
            click.echo(f"  端点    : {endpoint}")
            click.echo(f"  协议    : {info.get('Protocol')}")
        except Exception as e:
            click.secho(f"✗ 连接失败: {e}", fg="red", bold=True)
            click.echo("\n启动命令（macOS）：")
            click.echo(f"  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port={port}")
            sys.exit(1)

    asyncio.run(_run())


# ── tabs ──────────────────────────────────────────────────────────────────────

@cli.command()
@click.pass_context
def tabs(ctx: click.Context) -> None:
    """列出本地浏览器中所有已打开的标签页"""

    async def _run() -> None:
        engine = _engine(ctx.obj["port"])
        try:
            tab_list = await engine.list_tabs()
        except CDPConnectionError as e:
            click.secho(str(e), fg="red")
            sys.exit(1)

        if not tab_list:
            click.echo("（无已打开的标签页）")
            return

        click.echo(f"共 {len(tab_list)} 个标签页：\n")
        for i, t in enumerate(tab_list, 1):
            title = (t.title or "(无标题)")[:55]
            url = t.url[:80]
            click.echo(f"  [{i:>2}]  {title}")
            click.echo(f"        {click.style(url, fg='cyan')}\n")

    asyncio.run(_run())


# ── run ───────────────────────────────────────────────────────────────────────

@cli.command()
@click.argument("task")
@click.option("--url", default=None, help="任务开始前先导航到该 URL")
@click.option("--model", default="gpt-4.1-mini", show_default=True, help="LLM 模型名称")
@click.option("--max-steps", default=20, show_default=True, help="最大执行步骤数")
@click.pass_context
def run(ctx: click.Context, task: str, url: str | None, model: str, max_steps: int) -> None:
    """用自然语言描述任务，让 Agent 在本地浏览器中自动完成"""

    async def _run() -> None:
        engine = _engine(ctx.obj["port"])
        try:
            await engine.connect()
        except CDPConnectionError as e:
            click.secho(str(e), fg="red")
            sys.exit(1)

        try:
            page = await engine.active_page()
            if url:
                click.echo(f"导航到: {url}")
                await engine.navigate(page, url)

            click.echo(f"执行任务: {task}\n")
            agent = BrowserAgent(page, AgentConfig(model=model, max_steps=max_steps))
            result = await agent.run(task)
            click.secho("\n── 任务结果 ──────────────────────────────", fg="green")
            click.echo(result)
        finally:
            await engine.disconnect()

    asyncio.run(_run())


# ── shot ──────────────────────────────────────────────────────────────────────

@cli.command()
@click.option("--url", default=None, help="截图前先导航到该 URL")
@click.option("--out", default="screenshot.png", show_default=True, help="截图保存路径")
@click.option("--full/--viewport", default=True, show_default=True, help="全页截图或仅视口")
@click.pass_context
def shot(ctx: click.Context, url: str | None, out: str, full: bool) -> None:
    """截取当前（或指定 URL）页面截图"""

    async def _run() -> None:
        engine = _engine(ctx.obj["port"])
        try:
            await engine.connect()
        except CDPConnectionError as e:
            click.secho(str(e), fg="red")
            sys.exit(1)

        try:
            page = await engine.active_page()
            if url:
                await engine.navigate(page, url)
            await engine.screenshot(page, out, full_page=full)
            click.secho(f"✓ 截图已保存: {Path(out).resolve()}", fg="green")
        finally:
            await engine.disconnect()

    asyncio.run(_run())


# ── __main__ ──────────────────────────────────────────────────────────────────

def main() -> None:
    cli(obj={})


if __name__ == "__main__":
    main()
