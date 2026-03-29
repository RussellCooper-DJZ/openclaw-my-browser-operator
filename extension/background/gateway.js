/**
 * gateway.js — OpenClaw Gateway WebSocket 连接
 *
 * 协议：OpenClaw Browser Relay Protocol（JSON-RPC 2.0 风格）
 *
 * 握手流程：
 *   Client → Gateway : { type: "HELLO", profile: "user", version: "1.0.0", apiKey: "..." }
 *   Gateway → Client : { type: "WELCOME", sessionId: "...", capabilities: [...] }
 *
 * 任务流程：
 *   Gateway → Client : { type: "TASK_REQUEST", sessionId, description, origin }
 *   Client → Gateway : { type: "AUTHORIZED" | "DENIED", sessionId }
 *   Gateway → Client : { type: "TOOL_CALL", id, tool, params, tabId? }
 *   Client → Gateway : { type: "TOOL_RESULT", id, result } | { type: "TOOL_ERROR", id, error }
 *   Gateway → Client : { type: "TASK_DONE", sessionId, summary }
 */

import { runtime, broadcastState } from './state.js';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT      = 10;

export class OpenClawGateway {
  #ws          = null;
  #url         = '';
  #apiKey      = '';
  #profile     = 'user';
  #onMessage   = null;
  #reconnects  = 0;
  #intentional = false;   // 区分主动断开 vs 异常断开

  constructor({ url, apiKey, profile, onMessage }) {
    this.#url       = url;
    this.#apiKey    = apiKey;
    this.#profile   = profile;
    this.#onMessage = onMessage;
  }

  // ── 连接 ──────────────────────────────────────────────────────────────────

  connect() {
    this.#intentional = false;
    this.#reconnects  = 0;
    this.#open();
  }

  #open() {
    console.log('[OpenClaw] Connecting →', this.#url);
    this.#ws = new WebSocket(this.#url);

    this.#ws.onopen = () => {
      this.#reconnects = 0;
      // 握手：向 Gateway 自我介绍
      this.#send({
        type:    'HELLO',
        profile: this.#profile,
        version: chrome.runtime.getManifest().version,
        apiKey:  this.#apiKey,
        agent:   navigator.userAgent,
      });
    };

    this.#ws.onmessage = ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      if (msg.type === 'WELCOME') {
        runtime.connected  = true;
        runtime.sessionId  = msg.sessionId;
        runtime.lastError  = null;
        broadcastState();
        console.log('[OpenClaw] Connected, sessionId =', msg.sessionId);
        return;
      }

      this.#onMessage?.(msg);
    };

    this.#ws.onclose = () => {
      runtime.connected = false;
      broadcastState();
      if (!this.#intentional && this.#reconnects < MAX_RECONNECT) {
        this.#reconnects++;
        console.log(`[OpenClaw] Reconnecting (${this.#reconnects}/${MAX_RECONNECT})…`);
        setTimeout(() => this.#open(), RECONNECT_DELAY_MS);
      }
    };

    this.#ws.onerror = (e) => {
      runtime.lastError = 'WebSocket error — is OpenClaw Gateway running?';
      broadcastState();
    };
  }

  // ── 断开 ──────────────────────────────────────────────────────────────────

  disconnect() {
    this.#intentional = true;
    this.#ws?.close();
    this.#ws = null;
    runtime.connected  = false;
    runtime.authorized = false;
    runtime.sessionId  = null;
    broadcastState();
  }

  // ── 发送消息 ──────────────────────────────────────────────────────────────

  send(msg) { this.#send(msg); }

  #send(msg) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(msg));
    }
  }

  get isConnected() { return this.#ws?.readyState === WebSocket.OPEN; }
}
