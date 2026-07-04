import { describe, it, expect, vi } from "vitest";
import { createStore } from "./store";

describe("createStore", () => {
  it("get returns state; set merges partials and notifies", () => {
    const s = createStore({ a: 1, b: "x" });
    const cb = vi.fn();
    s.subscribe(cb);
    s.set({ a: 2 });
    expect(s.get()).toEqual({ a: 2, b: "x" });
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("set accepts an updater function", () => {
    const s = createStore({ n: 1 });
    s.set((st) => ({ n: st.n + 1 }));
    expect(s.get().n).toBe(2);
  });
  it("unsubscribe stops notifications", () => {
    const s = createStore({ n: 0 });
    const cb = vi.fn();
    const off = s.subscribe(cb);
    off();
    s.set({ n: 1 });
    expect(cb).not.toHaveBeenCalled();
  });
});
