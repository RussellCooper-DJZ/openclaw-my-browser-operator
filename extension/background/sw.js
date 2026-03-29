/**
 * sw.js — Service Worker 主入口
 *
 * 职责：
 *  1. 维护与 OpenClaw Gateway 的 WebSocket 长连接
 *  2. 接收 Gateway 下发的工具调用，通过 bridge.js 执行
 *  3. 处理来自 popup / panel 的控制消息
 *  4. 管理用户授权流程（每次任务前需用户点击"授权"）
 */

import { OpenClawGateway }         from './gateway.js';
import { dispatch, TOOL_LIST }     from './bridge.js';
import { runtime, loadConfig, saveConfig, broadcastState } from './state.js';

// ── 全局单例 ──────────────────────────────────────────────────────────────────

let gateway = null;

// ── 插件安装 ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[OpenClaw] Extension installed');
  const cfg = await loadConfig();
  if (cfg.autoConnect) connectGateway(cfg);
});

// ── 来自 popup / panel 的消息 ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  handleMessage(msg).then(reply).catch(e => reply({ ok: false, error: e.message }));
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {

    case 'CONNECT': {
      const cfg = await loadConfig();
      if (msg.patch) await saveConfig(msg.patch);
      const finalCfg = { ...cfg, ...(msg.patch || {}) };
      connectGateway(finalCfg);
      return { ok: true };
    }

    case 'DISCONNECT': {
      gateway?.disconnect();
      gateway = null;
      return { ok: true };
    }

    case 'AUTHORIZE': {
      if (!runtime.pendingTask) return { ok: false, error: 'No pending task' };
      runtime.authorized = true;
      gateway?.send({ type: 'AUTHORIZED', sessionId: runtime.pendingTask.sessionId });
      broadcastState();
      return { ok: true };
    }

    case 'DENY': {
      if (!runtime.pendingTask) return { ok: false, error: 'No pending task' };
      runtime.authorized  = false;
      runtime.pendingTask = null;
      gateway?.send({ type: 'DENIED', sessionId: msg.sessionId });
      broadcastState();
      return { ok: true };
    }

    case 'GET_STATE':
      return { ...runtime, connected: gateway?.isConnected ?? false };

    case 'GET_TABS': {
      const tabs = await chrome.tabs.query({});
      return { ok: true, tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active })) };
    }

    case 'SAVE_CONFIG':
      await saveConfig(msg.config);
      return { ok: true };

    default:
      return { ok: false, error: `Unknown message: ${msg.type}` };
  }
}

// ── 连接 Gateway ──────────────────────────────────────────────────────────────

function connectGateway(cfg) {
  gateway?.disconnect();

  gateway = new OpenClawGateway({
    url:       cfg.gatewayUrl,
    apiKey:    cfg.apiKey,
    profile:   cfg.profile,
    onMessage: onGatewayMessage,
  });

  gateway.connect();
}

// ── 处理 Gateway 下发的消息 ───────────────────────────────────────────────────

async function onGatewayMessage(msg) {

  // ── 任务请求：需要用户授权 ─────────────────────────────────────────────────
  if (msg.type === 'TASK_REQUEST') {
    runtime.authorized  = false;
    runtime.pendingTask = msg;
    broadcastState();

    // 打开侧边栏让用户确认
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id }).catch(() => {});

    // 通知 panel 显示授权弹窗
    chrome.runtime.sendMessage({ type: 'TASK_PENDING', task: msg }).catch(() => {});
    return;
  }

  // ── 工具调用：需已授权 ────────────────────────────────────────────────────
  if (msg.type === 'TOOL_CALL') {
    if (!runtime.authorized) {
      gateway.send({ type: 'TOOL_ERROR', id: msg.id, error: 'Not authorized' });
      return;
    }

    // 通知 panel 显示当前操作
    chrome.runtime.sendMessage({ type: 'TOOL_EXECUTING', tool: msg.tool, params: msg.params }).catch(() => {});

    const result = await dispatch(msg.tool, { ...msg.params, tabId: msg.tabId });

    gateway.send(
      result.ok
        ? { type: 'TOOL_RESULT', id: msg.id, result }
        : { type: 'TOOL_ERROR',  id: msg.id, error: result.error }
    );

    // 更新 panel 日志
    chrome.runtime.sendMessage({ type: 'TOOL_DONE', tool: msg.tool, result }).catch(() => {});
    return;
  }

  // ── 任务完成 ──────────────────────────────────────────────────────────────
  if (msg.type === 'TASK_DONE') {
    runtime.authorized  = false;
    runtime.pendingTask = null;
    runtime.taskCount  += 1;
    broadcastState();

    chrome.runtime.sendMessage({ type: 'TASK_DONE', summary: msg.summary }).catch(() => {});

    chrome.notifications.create(`task-done-${Date.now()}`, {
      type:    'basic',
      iconUrl: '../icons/icon48.png',
      title:   'OpenClaw 任务完成 ✓',
      message: msg.summary || '任务已成功完成。',
    });
    return;
  }

  // ── 能力查询：告知 Gateway 本插件支持哪些工具 ─────────────────────────────
  if (msg.type === 'CAPABILITIES_QUERY') {
    gateway.send({ type: 'CAPABILITIES', tools: TOOL_LIST, profile: 'user' });
  }
}
