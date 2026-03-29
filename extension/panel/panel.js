/**
 * panel.js — 侧边栏控制逻辑
 *
 * 功能：
 *  - 显示 OpenClaw 任务授权请求
 *  - 实时展示工具调用执行日志
 *  - 显示连接状态和任务统计
 */

const $ = id => document.getElementById(id);

const connDot    = $('conn-dot');
const authCard   = $('auth-card');
const taskDesc   = $('task-desc');
const taskOrigin = $('task-origin');
const btnAuth    = $('btn-authorize');
const btnDeny    = $('btn-deny');
const logList    = $('log-list');
const taskCount  = $('task-count');
const sessionId  = $('session-id');
const btnClear   = $('btn-clear');

let pendingSessionId = null;

// ── 初始化 ────────────────────────────────────────────────────────────────────

async function init() {
  const state = await bg('GET_STATE');
  applyState(state);
}

// ── 状态渲染 ──────────────────────────────────────────────────────────────────

function applyState(s) {
  if (!s) return;

  connDot.className = s.connected
    ? (s.pendingTask ? 'dot dot--pending' : 'dot dot--on')
    : 'dot dot--off';

  taskCount.textContent = s.taskCount ?? 0;
  sessionId.textContent = s.sessionId
    ? `Session: ${s.sessionId.slice(0, 12)}…`
    : '未连接';

  if (s.pendingTask) showAuthCard(s.pendingTask);
  else hideAuthCard();
}

function showAuthCard(task) {
  pendingSessionId    = task.sessionId;
  taskDesc.textContent   = task.description || '（无描述）';
  taskOrigin.textContent = `来源: ${task.origin || 'OpenClaw Gateway'}`;
  authCard.classList.remove('hidden');
}

function hideAuthCard() {
  authCard.classList.add('hidden');
  pendingSessionId = null;
}

// ── 日志追加 ──────────────────────────────────────────────────────────────────

function addLog(badge, badgeClass, text) {
  // 移除空占位符
  const empty = logList.querySelector('.log-empty');
  if (empty) empty.remove();

  const now  = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const item = document.createElement('li');
  item.className = 'log-item';
  item.innerHTML = `
    <span class="log-badge ${badgeClass}">${badge}</span>
    <span class="log-text">${escHtml(text)}</span>
    <span class="log-time">${now}</span>
  `;
  logList.appendChild(item);
  logList.scrollTop = logList.scrollHeight;

  // 最多保留 200 条
  while (logList.children.length > 200) logList.removeChild(logList.firstChild);
}

// ── 按钮事件 ──────────────────────────────────────────────────────────────────

btnAuth.addEventListener('click', async () => {
  await bg('AUTHORIZE');
  hideAuthCard();
  addLog('授权', 'badge--task', '用户已授权本次任务');
});

btnDeny.addEventListener('click', async () => {
  await bg('DENY', { sessionId: pendingSessionId });
  hideAuthCard();
  addLog('拒绝', 'badge--error', '用户已拒绝本次任务');
});

btnClear.addEventListener('click', () => {
  logList.innerHTML = '<li class="log-empty">等待 OpenClaw 下发任务…</li>';
});

// ── 监听后台消息 ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {

    case 'STATE_UPDATE':
      applyState(msg.state);
      break;

    case 'TASK_PENDING':
      showAuthCard(msg.task);
      addLog('任务', 'badge--task', `新任务: ${msg.task.description || '（无描述）'}`);
      break;

    case 'TOOL_EXECUTING':
      addLog(msg.tool, 'badge--tool', formatParams(msg.params));
      break;

    case 'TOOL_DONE':
      if (msg.result?.ok) {
        addLog('✓', 'badge--ok', summarizeResult(msg.tool, msg.result));
      } else {
        addLog('✗', 'badge--error', msg.result?.error || '未知错误');
      }
      break;

    case 'TASK_DONE':
      addLog('完成', 'badge--done', msg.summary || '任务已完成');
      hideAuthCard();
      break;
  }
});

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function bg(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatParams(p = {}) {
  const parts = [];
  if (p.url)      parts.push(p.url.slice(0, 60));
  if (p.selector) parts.push(`sel="${p.selector}"`);
  if (p.value)    parts.push(`val="${String(p.value).slice(0, 40)}"`);
  if (p.code)     parts.push(`js="${String(p.code).slice(0, 40)}"`);
  return parts.join('  ') || JSON.stringify(p).slice(0, 80);
}

function summarizeResult(tool, result) {
  if (tool === 'extract_text')  return `提取文本 ${result.data?.length ?? 0} 字符`;
  if (tool === 'extract_table') return `提取表格 ${result.data?.rowCount ?? 0} 行`;
  if (tool === 'screenshot')    return '截图完成';
  if (tool === 'navigate')      return result.data?.url?.slice(0, 60) ?? 'OK';
  if (tool === 'get_tabs')      return `${result.data?.tabs?.length ?? 0} 个标签页`;
  return 'OK';
}

init();
