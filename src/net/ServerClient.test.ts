import { it, expect, vi, describe, beforeEach, afterEach } from "vitest";
import { ServerClient } from "./ServerClient";
import { encode } from "./protocol";

// ── existing test ─────────────────────────────────────────────────────────────
it("dispatches parsed server messages to type handlers", () => {
  const c = new ServerClient("ws://x");
  const got = vi.fn();
  c.on("joined", got);
  (c as any).handleRaw(encode({ type: "joined", playerId: "p1", ownerId: "p1", token: "tok-x" }));
  expect(got).toHaveBeenCalledWith({ type: "joined", playerId: "p1", ownerId: "p1", token: "tok-x" });
});

// ── MockWS for auto-reconnect tests ─────────────────────────────────────────
class MockWS {
  static instances: MockWS[] = [];
  onopen: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];
  readyState = 1; // OPEN
  constructor(public url: string) { MockWS.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  triggerOpen() { this.readyState = 1; this.onopen?.(); }
  triggerError(e: Event = new Event("error")) { this.onerror?.(e); }
}

describe("ServerClient auto-reconnect", () => {
  beforeEach(() => {
    MockWS.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWS);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("auto-reconnect fires on unexpected close and calls reconnectFn after WS opens", async () => {
    const c = new ServerClient("ws://test");
    const reconnectFn = vi.fn();
    c.setReconnectHandler(reconnectFn);

    // Connect
    const connectP = c.connect();
    MockWS.instances[0].triggerOpen();
    await connectP;

    // Simulate unexpected close (not deliberate)
    MockWS.instances[0].close();

    // Advance 1s to trigger first retry
    await vi.advanceTimersByTimeAsync(1100);

    // Second WS instance should exist; trigger its open
    expect(MockWS.instances.length).toBeGreaterThan(1);
    MockWS.instances[MockWS.instances.length - 1].triggerOpen();
    await Promise.resolve();

    expect(reconnectFn).toHaveBeenCalledOnce();
  });

  it("deliberate close does NOT trigger auto-reconnect", async () => {
    const c = new ServerClient("ws://test");
    const reconnectFn = vi.fn();
    c.setReconnectHandler(reconnectFn);

    const connectP = c.connect();
    MockWS.instances[0].triggerOpen();
    await connectP;

    c.close(); // deliberate

    await vi.advanceTimersByTimeAsync(5000);
    expect(MockWS.instances.length).toBe(1); // no new connection
    expect(reconnectFn).not.toHaveBeenCalled();
  });

  it("emits error event after 28s without successful reconnect", async () => {
    const c = new ServerClient("ws://test");
    c.setReconnectHandler(vi.fn());
    const errHandler = vi.fn();
    c.on("error", errHandler);

    const connectP = c.connect();
    MockWS.instances[0].triggerOpen();
    await connectP;

    MockWS.instances[0].close(); // unexpected drop

    // All retries fail (no triggerOpen called)
    await vi.advanceTimersByTimeAsync(28_001);

    // Flush any remaining microtasks
    await Promise.resolve();

    expect(errHandler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", code: "reconnect-failed" })
    );
  });
});
