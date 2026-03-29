/**
 * state.js — 插件全局状态管理
 *
 * 使用 chrome.storage.local 持久化配置，
 * 使用内存对象维护运行时状态（连接状态、当前任务等）。
 */

// ── 默认配置（持久化到 storage.local）────────────────────────────────────────

export const DEFAULT_CONFIG = {
  gatewayUrl:  'ws://127.0.0.1:18789/browser-relay',
  apiKey:      '',
  autoConnect: false,
  profile:     'user',                // 对应 openclaw.json 中的 profile 名称
  allowedOrigins: ['http://127.0.0.1', 'http://localhost'],
};

// ── 运行时状态（仅内存，重启后重置）─────────────────────────────────────────

export const runtime = {
  connected:    false,
  authorized:   false,
  sessionId:    null,
  pendingTask:  null,   // { sessionId, description, origin }
  taskCount:    0,
  lastError:    null,
};

// ── 配置读写 ──────────────────────────────────────────────────────────────────

export async function loadConfig() {
  const stored = await chrome.storage.local.get('ocConfig');
  return { ...DEFAULT_CONFIG, ...(stored.ocConfig || {}) };
}

export async function saveConfig(patch) {
  const current = await loadConfig();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ ocConfig: next });
  return next;
}

// ── 运行时状态广播（通知 popup / panel）──────────────────────────────────────

export function broadcastState() {
  const snapshot = { ...runtime };
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state: snapshot }).catch(() => {});
}
