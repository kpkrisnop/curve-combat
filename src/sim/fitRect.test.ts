import { describe, it, expect } from "vitest";
import { fitContain, boundaryRectPx } from "./fitRect";
import { boundsFromMap } from "./planetScatter";

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

describe("boundaryRectPx", () => {
  it("maps the sim's world bounds (boundsFromMap) through fitContain — width-bound canvas", () => {
    const map = { width: 24, height: 14 };
    const t = fitContain(map, 240, 200);
    const b = boundsFromMap(map);

    const rect = boundaryRectPx(map, 240, 200);

    // Top-left corner = (minX, maxY) mapped through the transform.
    expect(rect.x).toBeCloseTo(t.offsetX + (b.minX - b.minX) * t.scale);
    expect(rect.y).toBeCloseTo(t.offsetY + (b.maxY - b.maxY) * t.scale);
    // Full extent equals the scaled map size (bounds width/height == map width/height).
    expect(rect.w).toBeCloseTo((b.maxX - b.minX) * t.scale);
    expect(rect.h).toBeCloseTo((b.maxY - b.minY) * t.scale);
    expect(rect.w).toBeCloseTo(map.width * t.scale);
    expect(rect.h).toBeCloseTo(map.height * t.scale);
    // Sanity: rect sits inside the canvas (letterboxed top/bottom in this case).
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeGreaterThan(0);
  });

  it("maps the sim's world bounds through fitContain — height-bound canvas", () => {
    const map = { width: 24, height: 14 };
    const t = fitContain(map, 480, 140);
    const b = boundsFromMap(map);

    const rect = boundaryRectPx(map, 480, 140);

    expect(rect.w).toBeCloseTo((b.maxX - b.minX) * t.scale);
    expect(rect.h).toBeCloseTo((b.maxY - b.minY) * t.scale);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBeCloseTo(0);
  });
});
