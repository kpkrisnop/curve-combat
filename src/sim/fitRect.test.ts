import { describe, it, expect } from "vitest";
import { fitContain } from "./fitRect";

describe("fitContain", () => {
  it("scales to fit width when the canvas is relatively narrow", () => {
    // 24x14 into 240x200: min(10, 14.28) = 10 → width-bound, letterbox top/bottom
    const t = fitContain({ width: 24, height: 14 }, 240, 200);
    expect(t.scale).toBeCloseTo(10);
    expect(t.offsetX).toBeCloseTo(0);
    expect(t.offsetY).toBeCloseTo((200 - 140) / 2);
  });
  it("scales to fit height when the canvas is relatively wide", () => {
    // 24x14 into 480x140: min(20, 10) = 10 → height-bound, pillarbox left/right
    const t = fitContain({ width: 24, height: 14 }, 480, 140);
    expect(t.scale).toBeCloseTo(10);
    expect(t.offsetY).toBeCloseTo(0);
    expect(t.offsetX).toBeCloseTo((480 - 240) / 2);
  });
});
