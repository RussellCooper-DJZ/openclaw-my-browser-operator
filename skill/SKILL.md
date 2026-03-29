# My Browser Operator Skill

This skill allows OpenClaw to connect to your **local, real browser** (Chrome or Edge) instead of using an isolated sandbox.

By doing this, OpenClaw can:
1. **Reuse your existing logins** (no need to log in again or solve CAPTCHAs).
2. **Use your local IP address** (bypassing anti-bot systems).
3. **Operate visibly** on your screen, giving you full control to intervene.

## Prerequisites

You must start your local Chrome or Edge browser with the remote debugging port enabled.

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Windows:**
```powershell
Start-Process "chrome.exe" "--remote-debugging-port=9222"
```

## Usage

Once the skill is installed and your browser is running in debug mode, you can ask OpenClaw to perform tasks in your browser:

> "Use my browser to go to LinkedIn, check my unread messages, and summarize them."
> 
> "Open my CRM, search for the company 'OpenAI', and extract their latest funding round."

## How it works

This skill uses the Chrome DevTools Protocol (CDP) via Playwright to attach to the existing browser session (`driver: "existing-session"`). It does not launch a new browser instance, ensuring your cookies and sessions remain intact.
