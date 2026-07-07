// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { ArenaStage } from "./ArenaStage";
import { _resetForTests } from "./rendererSingleton";
import type { GameRenderer } from "../../game/GameRenderer";

function fakeRenderer() {
  const canvas = document.createElement("canvas");
  return {
    app: { canvas, resizeTo: window as Window | HTMLElement, resize: vi.fn() },
    setZoomFactor: vi.fn(),
    animateZoom: vi.fn(),
    async init(c: HTMLElement) {
      c.appendChild(canvas);
      this.app.resizeTo = c;
    },
  };
}

// Minimal fake ResizeObserver — jsdom has none. Captures the callback so the
// test can simulate a map-card size change and records observe/disconnect
// calls so we can assert cleanup on unmount.
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

describe("ArenaStage resize reflow", () => {
  beforeEach(() => {
    _resetForTests();
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    // Make the mount-time rAF re-measure synchronous so we can assert on it.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("observes the host element and drives renderer.app.resize() on size change", async () => {
    const r = fakeRenderer();
    const onReady = vi.fn();

    await act(async () => {
      render(
        <ArenaStage scale={1} onReady={onReady} factory={() => r as unknown as GameRenderer} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onReady).toHaveBeenCalledWith(r);
    // The one-shot mount rAF already called resize() once.
    const callsAfterMount = r.app.resize.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    expect(FakeResizeObserver.instances.length).toBe(1);
    const ro = FakeResizeObserver.instances[0];
    expect(ro.observed.length).toBe(1);

    // Simulate the map-card growing/shrinking (footer growth, panel open, etc.)
    act(() => {
      ro.callback([] as unknown as ResizeObserverEntry[], ro as unknown as ResizeObserver);
    });

    expect(r.app.resize.mock.calls.length).toBe(callsAfterMount + 1);
  });

  it("disconnects the observer on unmount", async () => {
    const r = fakeRenderer();

    let unmount!: () => void;
    await act(async () => {
      const result = render(
        <ArenaStage scale={1} onReady={vi.fn()} factory={() => r as unknown as GameRenderer} />,
      );
      unmount = result.unmount;
      await Promise.resolve();
      await Promise.resolve();
    });

    const ro = FakeResizeObserver.instances[0];
    expect(ro.disconnected).toBe(false);
    unmount();
    expect(ro.disconnected).toBe(true);
  });

  it("sets the initial zoom factor on ready and animates on scale change", async () => {
    const setZoomFactor = vi.fn();
    const animateZoom = vi.fn();
    const r = {
      app: { resize: vi.fn() },
      setZoomFactor,
      animateZoom,
      async init() {},
    } as any;
    const { rerender } = render(<ArenaStage scale={0.87} onReady={vi.fn()} factory={() => r} />);
    await waitFor(() => expect(setZoomFactor).toHaveBeenCalledWith(0.87));
    rerender(<ArenaStage scale={1} onReady={vi.fn()} factory={() => r} />);
    await waitFor(() => expect(animateZoom).toHaveBeenCalledWith(1));
  });
});
