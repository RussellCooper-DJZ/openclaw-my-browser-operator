/**
 * relay.js — Content Script 中继层
 *
 * 注入到每个页面，负责：
 *  1. 接收来自 Service Worker 的 DOM 操作指令（通过 chrome.runtime.onMessage）
 *  2. 在页面上下文中执行操作（click / fill / scroll / extract 等）
 *  3. 将结果回传给 Service Worker
 *
 * 注意：Content Script 运行在隔离环境（isolated world），
 *       可访问 DOM 但无法访问页面的 JS 变量。
 *       需要执行页面 JS 时，通过 chrome.scripting.executeScript 在 MAIN world 执行。
 */

'use strict';

// ── 消息处理 ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.target !== 'content') return false;   // 只处理发给 content 的消息
  handleContentMessage(msg).then(reply).catch(e => reply({ ok: false, error: e.message }));
  return true;
});

async function handleContentMessage(msg) {
  switch (msg.action) {

    case 'CLICK': {
      const el = findElement(msg.selector, msg.text);
      if (!el) return { ok: false, error: `Element not found: ${msg.selector || msg.text}` };
      el.click();
      return { ok: true, tag: el.tagName, text: el.innerText?.slice(0, 80) };
    }

    case 'FILL': {
      const el = document.querySelector(msg.selector);
      if (!el) return { ok: false, error: `Element not found: ${msg.selector}` };
      el.focus();
      el.value = msg.value;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (msg.pressEnter) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return { ok: true };
    }

    case 'SCROLL': {
      const el = msg.selector ? document.querySelector(msg.selector) : window;
      if (!el) return { ok: false, error: `Element not found: ${msg.selector}` };
      const dy = msg.direction === 'up' ? -(msg.amount || 500) : (msg.amount || 500);
      el.scrollBy({ top: dy, behavior: 'smooth' });
      return { ok: true };
    }

    case 'EXTRACT_TEXT':
      return { ok: true, text: document.body.innerText, length: document.body.innerText.length };

    case 'EXTRACT_ELEMENT': {
      const el = document.querySelector(msg.selector);
      if (!el) return { ok: false, error: `Element not found: ${msg.selector}` };
      return { ok: true, text: el.innerText.trim(), html: el.innerHTML };
    }

    case 'EXTRACT_TABLE': {
      const table = document.querySelector(msg.selector || 'table');
      if (!table) return { ok: false, error: 'Table not found' };
      const rows = Array.from(table.rows).map(r =>
        Array.from(r.cells).map(c => c.innerText.trim())
      );
      return { ok: true, rows, rowCount: rows.length };
    }

    case 'WAIT_FOR': {
      const found = await waitForSelector(msg.selector, msg.timeout || 10000);
      return found ? { ok: true } : { ok: false, error: `Timeout: ${msg.selector}` };
    }

    case 'HOVER': {
      const el = document.querySelector(msg.selector);
      if (!el) return { ok: false, error: `Element not found: ${msg.selector}` };
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return { ok: true };
    }

    case 'GET_META':
      return {
        ok:    true,
        url:   location.href,
        title: document.title,
        lang:  document.documentElement.lang,
        readyState: document.readyState,
      };

    default:
      return { ok: false, error: `Unknown content action: ${msg.action}` };
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function findElement(selector, text) {
  if (selector) return document.querySelector(selector);
  if (text) {
    return [...document.querySelectorAll('a, button, [role=button], [role=link], input[type=submit]')]
      .find(el => el.innerText?.trim().includes(text));
  }
  return null;
}

function waitForSelector(selector, timeout) {
  return new Promise(resolve => {
    if (document.querySelector(selector)) return resolve(true);
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
  });
}
