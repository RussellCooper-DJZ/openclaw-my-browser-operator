# OpenClaw-MY Browser Operator 完整教程

在 AI 智能体（AI Agent）的发展历程中，浏览器自动化一直是一个核心能力。然而，传统的云端无头浏览器（Cloud Browser）在面对需要复杂身份验证、验证码（CAPTCHA）拦截或高级付费订阅工具时，往往显得力不从心。

参考业界领先的 Manus Browser Operator 架构，**OpenClaw-MY Browser Operator** 提供了一种革命性的解决方案：**直接连接并控制您本地正在运行的真实浏览器**。

---

## 1. 什么是 MY Browser 模式？

MY Browser 模式（`user` profile）直接与您真实的浏览器会话协同工作——**包含您现有的登录状态、Cookie、活动标签页以及本地 IP 地址**。

| 特性 | 云端沙盒浏览器 | MY Browser（本地真实浏览器）|
| :--- | :--- | :--- |
| **运行环境** | 隔离沙盒 | 你的本地桌面浏览器 |
| **身份验证** | 每次重新登录 | **复用已有登录状态** |
| **网络 IP** | 数据中心 IP（易被拦截）| **受信任的本地真实 IP** |
| **最佳场景** | 通用网页搜索 | **付费工具、CRM、敏感后台** |

---

## 2. 技术原理

底层依赖 **Chrome DevTools Protocol (CDP)**。通过配置 `driver: "existing-session"` 和 Playwright 的 `connect_over_cdp()`，OpenClaw 不会启动新的浏览器实例，而是直接附加（Attach）到你当前正在运行的 Chrome/Edge 上。

---

## 3. 配置步骤

### 第一步：以调试模式启动浏览器

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Windows:**
```powershell
Start-Process "chrome.exe" "--remote-debugging-port=9222"
```

### 第二步：修改 `~/.openclaw/openclaw.json`

```json
{
  "browser": {
    "enabled": true,
    "defaultProfile": "user",
    "profiles": {
      "user": {
        "driver": "existing-session",
        "attachOnly": true,
        "cdpUrl": "http://127.0.0.1:9222",
        "color": "#00AA00"
      }
    }
  }
}
```

### 第三步：重启 Gateway

```bash
openclaw gateway restart
```

---

## 4. 实战示例

```bash
# 验证连接
browser-operator check

# 执行任务（使用你已登录的账号）
browser-operator run "打开 LinkedIn，检查我的未读消息并总结"
```
