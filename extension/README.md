# OpenClaw MY Browser Operator — Edge/Chrome Extension

> 将 OpenClaw AI Agent 连接到你的**真实本地浏览器**，复用已有登录态、Cookie 和本地 IP，无需重新认证。

---

## 架构概览

```
OpenClaw Gateway (ws://127.0.0.1:18789)
        │  WebSocket JSON-RPC
        ▼
┌─────────────────────────────────────┐
│   Service Worker (background/sw.js) │  ← 连接管理 + 授权控制
│   ├── gateway.js  (WS 协议层)       │
│   ├── bridge.js   (17 个浏览器工具) │
│   └── state.js    (状态管理)        │
├─────────────────────────────────────┤
│   Popup  (popup/)                   │  ← 连接配置 + 状态展示
│   Panel  (panel/)                   │  ← 任务授权 + 执行日志
│   Content Script (content/relay.js) │  ← DOM 操作中继
└─────────────────────────────────────┘
```

---

## 安装方法（开发者模式）

### Edge
1. 打开 `edge://extensions/`
2. 开启右上角**开发者模式**
3. 点击**加载解压缩的扩展**
4. 选择本目录（`extension/`）

### Chrome
1. 打开 `chrome://extensions/`
2. 开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择本目录（`extension/`）

---

## 使用流程

### 1. 启动 OpenClaw Gateway

确保 OpenClaw Gateway 在本地运行并监听 WebSocket：

```bash
# OpenClaw 配置文件中开启 browser-relay
# 默认地址：ws://127.0.0.1:18789/browser-relay
```

### 2. 连接插件

点击浏览器工具栏中的 OpenClaw 图标，填写：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| Gateway URL | `ws://127.0.0.1:18789/browser-relay` | OpenClaw Gateway 地址 |
| API Key | 空 | 如 Gateway 开启认证则填写 |
| Profile | `user` | 使用 MY Browser 模式 |

点击**连接**，状态点变绿即表示连接成功。

### 3. 授权任务

当 OpenClaw 发起任务时，侧边栏会自动弹出授权卡片：

- 点击**授权本次任务** → Agent 开始操控浏览器
- 点击**拒绝** → 任务取消

### 4. 查看执行日志

侧边栏实时显示每一步工具调用的执行情况和结果。

---

## 支持的工具（17 个）

| 工具 | 说明 |
|------|------|
| `navigate` | 导航到 URL |
| `click` | 点击元素（支持 CSS selector 或文本匹配） |
| `fill` | 填写表单（支持 Enter 提交） |
| `select` | 下拉框选择 |
| `scroll` | 滚动页面或元素 |
| `screenshot` | 截取当前视口（base64） |
| `extract_text` | 提取页面全文 |
| `extract_html` | 提取页面或元素 HTML |
| `extract_table` | 提取表格数据（返回二维数组） |
| `run_js` | 在页面执行 JavaScript |
| `new_tab` | 新建标签页 |
| `close_tab` | 关闭标签页 |
| `get_tabs` | 获取所有标签页信息 |
| `get_cookies` | 读取 Cookie |
| `wait_for` | 等待元素出现（MutationObserver） |
| `hover` | 鼠标悬停 |
| `key_press` | 模拟按键 |

---

## OpenClaw Gateway 协议

```jsonc
// 握手
Client → { "type": "HELLO", "profile": "user", "apiKey": "...", "version": "1.0.0" }
Gateway → { "type": "WELCOME", "sessionId": "abc123" }

// 任务请求（需用户授权）
Gateway → { "type": "TASK_REQUEST", "sessionId": "abc123", "description": "查询今日新闻" }
Client → { "type": "AUTHORIZED", "sessionId": "abc123" }

// 工具调用
Gateway → { "type": "TOOL_CALL", "id": 1, "tool": "navigate", "params": { "url": "https://..." } }
Client → { "type": "TOOL_RESULT", "id": 1, "result": { "ok": true, "url": "https://..." } }

// 任务完成
Gateway → { "type": "TASK_DONE", "sessionId": "abc123", "summary": "已完成新闻查询" }
```

---

## 文件结构

```
extension/
├── manifest.json          # Manifest V3 配置
├── icons/                 # 插件图标 (16/48/128px)
├── background/
│   ├── sw.js              # Service Worker 主入口
│   ├── gateway.js         # OpenClaw WS 连接（自动重连）
│   ├── bridge.js          # 17 个浏览器操作工具
│   └── state.js           # 状态管理（storage + runtime）
├── popup/
│   ├── popup.html         # 弹窗 UI
│   ├── popup.css          # 深色主题样式
│   └── popup.js           # 连接控制逻辑
├── panel/
│   ├── panel.html         # 侧边栏 UI
│   ├── panel.css          # 深色主题样式
│   └── panel.js           # 授权 + 日志逻辑
└── content/
    └── relay.js           # Content Script DOM 中继
```

---

## 安全说明

- 每次任务执行前**必须用户手动授权**，Agent 无法在未授权状态下操控浏览器
- API Key 存储在 `chrome.storage.local`，不会上传到任何服务器
- 插件仅与本地 Gateway（`127.0.0.1`）通信，不对外暴露任何端口

---

## License

MIT © RussellCooper-DJZ
