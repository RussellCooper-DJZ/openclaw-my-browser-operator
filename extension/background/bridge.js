/**
 * bridge.js — 浏览器操作桥接层
 *
 * 将 OpenClaw Gateway 下发的工具调用映射到真实的浏览器 API。
 * 每个工具函数接收 params 对象，返回 { ok, data } 或 { ok, error }。
 *
 * 支持的工具：
 *   navigate      导航到 URL
 *   click         点击元素
 *   fill          填写表单
 *   select        下拉框选择
 *   scroll        滚动页面
 *   screenshot    截图（base64）
 *   extract_text  提取页面文本
 *   extract_html  提取页面 HTML
 *   extract_table 提取表格数据
 *   run_js        执行 JavaScript
 *   new_tab       新建标签页
 *   close_tab     关闭标签页
 *   get_tabs      获取所有标签页
 *   get_cookies   获取 Cookie
 *   wait_for      等待元素出现
 *   hover         鼠标悬停
 *   key_press     模拟按键
 */

// ── 工具实现 ──────────────────────────────────────────────────────────────────

async function navigate({ url, tabId }) {
  const tab = await resolveTab(tabId);
  await chrome.tabs.update(tab.id, { url });
  await waitForTabLoad(tab.id);
  const updated = await chrome.tabs.get(tab.id);
  return { url: updated.url, title: updated.title };
}

async function click({ selector, text, tabId }) {
  const tab = await resolveTab(tabId);
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel, txt) => {
      const el = sel
        ? document.querySelector(sel)
        : [...document.querySelectorAll('a,button,[role=button],[role=link]')]
            .find(e => e.innerText?.trim().includes(txt));
      if (!el) return { ok: false, error: `Element not found: ${sel || txt}` };
      el.click();
      return { ok: true, tag: el.tagName, text: el.innerText?.slice(0, 80) };
    },
    args: [selector || null, text || ''],
  });
  return result[0].result;
}

async function fill({ selector, value, pressEnter = false, tabId }) {
  const tab = await resolveTab(tabId);
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel, val, enter) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, error: `Element not found: ${sel}` };
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (enter) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return { ok: true };
    },
    args: [selector, value, pressEnter],
  });
  return result[0].result;
}

async function select({ selector, value, tabId }) {
  const tab = await resolveTab(tabId);
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, error: `Element not found: ${sel}` };
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, selected: el.value };
    },
    args: [selector, value],
  });
  return result[0].result;
}

async function scroll({ direction = 'down', amount = 500, selector, tabId }) {
  const tab = await resolveTab(tabId);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (dir, amt, sel) => {
      const el = sel ? document.querySelector(sel) : window;
      const dy = dir === 'up' ? -amt : dir === 'down' ? amt : 0;
      const dx = dir === 'left' ? -amt : dir === 'right' ? amt : 0;
      el.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
    },
    args: [direction, amount, selector || null],
  });
  return { ok: true };
}

async function screenshot({ tabId, fullPage = false }) {
  const tab = await resolveTab(tabId);
  // captureVisibleTab 只能截当前可见区域
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return { ok: true, dataUrl, note: fullPage ? 'fullPage not supported in MV3, captured viewport' : '' };
}

async function extractText({ tabId }) {
  const tab = await resolveTab(tabId);
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText,
  });
  return { ok: true, text: result[0].result, length: result[0].result.length };
}

async function extractHtml({ tabId, selector }) {
  const tab = await resolveTab(tabId);
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel) => sel ? document.querySelector(sel)?.outerHTML : document.documentElement.outerHTML,
    args: [selector || null],
  });
  return { ok: true, html: result[0].result };
}

async function extractTable({ selector = 'table', tabId }) {
  const tab = await resolveTab(tabId);
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel) => {
      const table = document.querySelector(sel);
      if (!table) return { ok: false, error: `Table not found: ${sel}` };
      const rows = Array.from(table.rows).map(r =>
        Array.from(r.cells).map(c => c.innerText.trim())
      );
      return { ok: true, rows, rowCount: rows.length };
    },
    args: [selector],
  });
  return result[0].result;
}

async function runJs({ code, tabId }) {
  const tab = await resolveTab(tabId);
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: new Function(`return (${code})()`),
  });
  return { ok: true, result: result[0].result };
}

async function newTab({ url = 'about:blank', active = true }) {
  const tab = await chrome.tabs.create({ url, active });
  if (url !== 'about:blank') await waitForTabLoad(tab.id);
  return { ok: true, tabId: tab.id, url: tab.url };
}

async function closeTab({ tabId }) {
  const tab = await resolveTab(tabId);
  await chrome.tabs.remove(tab.id);
  return { ok: true };
}

async function getTabs() {
  const tabs = await chrome.tabs.query({});
  return {
    ok: true,
    tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active, windowId: t.windowId })),
  };
}

async function getCookies({ url, name }) {
  const cookies = await chrome.cookies.getAll({ url: url || undefined, name: name || undefined });
  return { ok: true, cookies: cookies.map(c => ({ name: c.name, domain: c.domain, path: c.path })) };
}

async function waitFor({ selector, timeout = 10000, tabId }) {
  const tab = await resolveTab(tabId);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => !!document.querySelector(sel),
      args: [selector],
    });
    if (result[0].result) return { ok: true, selector };
    await sleep(300);
  }
  return { ok: false, error: `Timeout waiting for: ${selector}` };
}

async function hover({ selector, tabId }) {
  const tab = await resolveTab(tabId);
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, error: `Element not found: ${sel}` };
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return { ok: true };
    },
    args: [selector],
  });
  return result[0].result;
}

async function keyPress({ key, selector, tabId }) {
  const tab = await resolveTab(tabId);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (k, sel) => {
      const el = sel ? document.querySelector(sel) : document.activeElement;
      const evt = new KeyboardEvent('keydown', { key: k, bubbles: true });
      (el || document).dispatchEvent(evt);
    },
    args: [key, selector || null],
  });
  return { ok: true };
}

// ── 工具注册表 ────────────────────────────────────────────────────────────────

const TOOLS = {
  navigate,
  click,
  fill,
  select,
  scroll,
  screenshot,
  extract_text:  extractText,
  extract_html:  extractHtml,
  extract_table: extractTable,
  run_js:        runJs,
  new_tab:       newTab,
  close_tab:     closeTab,
  get_tabs:      getTabs,
  get_cookies:   getCookies,
  wait_for:      waitFor,
  hover,
  key_press:     keyPress,
};

export async function dispatch(tool, params = {}) {
  const fn = TOOLS[tool];
  if (!fn) return { ok: false, error: `Unknown tool: ${tool}` };
  try {
    return await fn(params);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export const TOOL_LIST = Object.keys(TOOLS);

// ── 内部工具函数 ──────────────────────────────────────────────────────────────

async function resolveTab(tabId) {
  if (tabId) return chrome.tabs.get(tabId);
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 15000); // 最长等待 15s
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
