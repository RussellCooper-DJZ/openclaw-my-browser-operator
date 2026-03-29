/**
 * popup.js — Popup 控制逻辑
 */

const $ = id => document.getElementById(id);

const dot         = $('status-dot');
const statusLabel = $('status-label');
const btnConnect  = $('btn-connect');
const btnDisconn  = $('btn-disconnect');
const taskCount   = $('task-count');
const tabCount    = $('tab-count');
const gwInput     = $('gateway-url');
const apiInput    = $('api-key');
const profileSel  = $('profile');

// ── 初始化：读取已保存配置 + 当前状态 ────────────────────────────────────────

async function init() {
  // 读取持久化配置
  const { ocConfig } = await chrome.storage.local.get('ocConfig');
  if (ocConfig) {
    gwInput.value      = ocConfig.gatewayUrl  || '';
    apiInput.value     = ocConfig.apiKey      || '';
    profileSel.value   = ocConfig.profile     || 'user';
  }

  // 读取运行时状态
  const state = await bg('GET_STATE');
  applyState(state);

  // 读取标签页数量
  const { tabs } = await bg('GET_TABS');
  tabCount.textContent = tabs?.length ?? '—';
}

// ── 状态渲染 ──────────────────────────────────────────────────────────────────

function applyState(s) {
  if (!s) return;
  const connected = s.connected;

  dot.className = connected
    ? (s.pendingTask ? 'dot dot--pending' : 'dot dot--on')
    : 'dot dot--off';

  statusLabel.textContent = connected
    ? (s.pendingTask ? '⚡ 有待授权的任务' : `已连接 · Session: ${s.sessionId?.slice(0, 8) ?? '…'}`)
    : (s.lastError || '未连接到 OpenClaw Gateway');

  btnConnect.disabled  = connected;
  btnDisconn.disabled  = !connected;
  taskCount.textContent = s.taskCount ?? 0;
}

// ── 按钮事件 ──────────────────────────────────────────────────────────────────

btnConnect.addEventListener('click', async () => {
  btnConnect.disabled = true;
  btnConnect.textContent = '连接中…';

  const patch = {
    gatewayUrl: gwInput.value.trim() || 'ws://127.0.0.1:18789/browser-relay',
    apiKey:     apiInput.value.trim(),
    profile:    profileSel.value,
  };

  const res = await bg('CONNECT', { patch });
  if (!res.ok) {
    statusLabel.textContent = `连接失败: ${res.error}`;
    btnConnect.disabled = false;
  }
  btnConnect.textContent = '连接';
});

btnDisconn.addEventListener('click', async () => {
  await bg('DISCONNECT');
  applyState({ connected: false, taskCount: 0 });
});

$('btn-panel').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_PANEL' });
  window.close();
});

// ── 监听后台状态推送 ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE') applyState(msg.state);
});

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function bg(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

init();
