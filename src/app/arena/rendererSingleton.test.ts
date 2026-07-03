// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { acquireRenderer, _resetForTests } from "./rendererSingleton";

function fakeRenderer() {
  const canvas = document.createElement("canvas");
  return {
    initCalls: 0,
    app: { canvas, resizeTo: window as Window | HTMLElement, resize: vi.fn() },
    async init(c: HTMLElement) { this.initCalls++; c.appendChild(canvas); this.app.resizeTo = c; },
  };
}

describe("acquireRenderer", () => {
  beforeEach(() => _resetForTests());

  it("initialises once and reattaches on subsequent containers", async () => {
    const r = fakeRenderer();
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    const a = await acquireRenderer(c1, () => r as never);
    const b = await acquireRenderer(c2, () => r as never);
    expect(a).toBe(b);
    expect(r.initCalls).toBe(1);
    expect(r.app.canvas.parentElement).toBe(c2);   // canvas moved, not re-created
    expect(r.app.resizeTo).toBe(c2);
    expect(r.app.resize).toHaveBeenCalled();
  });
});
