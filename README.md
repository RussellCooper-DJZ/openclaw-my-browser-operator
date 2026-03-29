# openclaw-my-browser-operator

> Connect OpenClaw to your **real local browser** — with your sessions, your logins, your IP.

参考 [Manus Browser Operator](https://manus.im/docs/integrations/manus-browser-operator) 架构，本项目提供了一套**生产级别**的 OpenClaw MY Browser Operator 实现。

---

## 项目结构

```
openclaw-my-browser-operator/
├── pyproject.toml                        # 包配置与依赖
├── config/
│   └── openclaw.json                     # OpenClaw 配置示例
├── src/browser_operator/
│   ├── __init__.py                       # 公开 API
│   ├── __main__.py                       # python -m browser_operator 入口
│   ├── cdp.py                            # CDP 连接引擎（核心）
│   ├── tools.py                          # Agent 可调用工具集
│   ├── agent.py                          # LLM ReAct Agent 执行器
│   └── cli.py                            # 命令行工具
├── skill/
│   ├── SKILL.md                          # OpenClaw Skill 说明
│   ├── skill.json                        # Skill 元数据
│   └── browser_operator_skill.py        # Skill 注册入口
└── docs/
    ├── tutorial.md                       # 完整教程
    └── forum-post.md                     # 论坛讲解帖
```

---

## 架构

```
┌────────────────────────────────────────────────────────┐
│                   OpenClaw Gateway                     │
│                                                        │
│  ┌─────────────┐   tool calls   ┌──────────────────┐  │
│  │  BrowserAgent│ ─────────────► │   tools.py       │  │
│  │  (LLM ReAct) │ ◄───────────── │  navigate/click  │  │
│  └─────────────┘   ToolResult   │  fill/screenshot │  │
│         │                       │  extract/run_js  │  │
│         │                       └────────┬─────────┘  │
│         │                                │             │
│         └────────────────────────────────┘             │
│                        │ CDPEngine                     │
│                        │ connect_over_cdp()            │
└────────────────────────┼───────────────────────────────┘
                         │ CDP WebSocket (127.0.0.1:9222)
                ┌────────▼────────┐
                │  Your Chrome /  │  ← 你的真实登录状态
                │  Edge Browser   │  ← 你的本地 IP
                └─────────────────┘
```

---

## 快速开始

### 1. 安装

```bash
pip install -e .
playwright install chromium
```

### 2. 以调试模式启动浏览器

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

### 3. 验证连接

```bash
browser-operator check
```

### 4. 执行任务

```bash
# 列出所有标签页
browser-operator tabs

# 用自然语言执行任务
browser-operator run "打开 https://httpbin.org/ip 并告诉我当前 IP 地址"

# 截图
browser-operator shot --url https://example.com --out page.png
```

### 5. 作为 SDK 使用

```python
import asyncio
from browser_operator import CDPEngine, CDPConfig, BrowserAgent, AgentConfig

async def main():
    config = CDPConfig(port=9222)
    async with CDPEngine(config).session() as engine:
        page = await engine.new_tab("https://example.com")
        agent = BrowserAgent(page, AgentConfig())
        result = await agent.run("提取页面的标题和第一段文字")
        print(result)

asyncio.run(main())
```

---

## OpenClaw Skill 安装

将 `skill/` 目录复制到你的 OpenClaw skills 目录：

```bash
cp -r skill/ ~/.openclaw/skills/my_browser_operator/
openclaw skills reload
```

之后即可在 OpenClaw 中直接使用：

> "用我的浏览器打开 LinkedIn，检查未读消息并总结。"

---

## License

MIT
