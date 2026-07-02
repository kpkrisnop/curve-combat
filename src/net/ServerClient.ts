// src/net/ServerClient.ts
import { parseServerMessage, encode, type ClientMessage, type ServerMessage } from "./protocol";

type Handler = (msg: ServerMessage) => void;

export class ServerClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();
  private deliberateClose = false;
  private reconnecting = false;
  private reconnectFn: (() => void) | null = null;

  constructor(private url: string) {}

  on(type: ServerMessage["type"], handler: Handler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  setReconnectHandler(fn: () => void): void {
    this.reconnectFn = fn;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) { this.ws.onclose = null; this.ws.close(); }
      this.ws = new WebSocket(this.url);
      let settled = false;
      this.ws.onopen = () => {
        settled = true;
        this.ws!.onclose = () => this.handleClose();
        resolve();
      };
      this.ws.onerror = (e) => { if (!settled) { settled = true; reject(e); } };
      this.ws.onmessage = (ev) => this.handleRaw(typeof ev.data === "string" ? ev.data : "");
      this.ws.onclose = () => { if (!settled) { settled = true; reject(new Error("closed")); } };
    });
  }

  private handleClose(): void {
    if (this.deliberateClose || !this.reconnectFn || this.reconnecting) return;
    void this.autoReconnect();
  }

  private async autoReconnect(): Promise<void> {
    this.reconnecting = true;
    const deadline = Date.now() + 28_000;
    while (Date.now() < deadline && !this.deliberateClose) {
      await new Promise<void>((r) => setTimeout(r, 1000));
      if (this.deliberateClose) break;
      // Set a per-attempt timeout that closes the WS, causing the connect
      // promise to reject via onclose — so the loop can advance to the
      // next iteration without Promise.race (which adds extra microtask hops).
      const attemptMs = Math.min(5_000, deadline - Date.now());
      const tid = setTimeout(() => this.ws?.close(), Math.max(attemptMs, 0));
      try {
        await this.connect();
        clearTimeout(tid);
        this.reconnecting = false;
        this.reconnectFn?.();
        return;
      } catch {
        clearTimeout(tid);
        // retry
      }
    }
    this.reconnecting = false;
    if (!this.deliberateClose) {
      this.dispatch({ type: "error", code: "reconnect-failed", message: "Could not reconnect to server." });
    }
  }

  private dispatch(msg: ServerMessage): void {
    for (const h of this.handlers.get(msg.type) ?? []) h(msg);
  }

  handleRaw(raw: string): void {
    let msg: ServerMessage;
    try { msg = parseServerMessage(JSON.parse(raw)); } catch { return; }
    this.dispatch(msg);
  }

  send(msg: ClientMessage): void {
    this.ws?.send(encode(msg));
  }

  close(): void {
    this.deliberateClose = true;
    this.ws?.close();
  }
}
