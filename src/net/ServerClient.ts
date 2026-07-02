import { parseServerMessage, encode, type ClientMessage, type ServerMessage } from "./protocol";

type Handler = (msg: ServerMessage) => void;

export class ServerClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();

  constructor(private url: string) {}

  on(type: ServerMessage["type"], handler: Handler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) this.ws.close();
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (ev) => this.handleRaw(typeof ev.data === "string" ? ev.data : "");
    });
  }

  private handleRaw(raw: string): void {
    let msg: ServerMessage;
    try { msg = parseServerMessage(JSON.parse(raw)); } catch { return; }
    for (const h of this.handlers.get(msg.type) ?? []) h(msg);
  }

  send(msg: ClientMessage): void {
    this.ws?.send(encode(msg));
  }

  close(): void { this.ws?.close(); }
}
