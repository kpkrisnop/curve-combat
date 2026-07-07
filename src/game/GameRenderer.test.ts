// src/game/GameRenderer.test.ts
//
// M4 fix: badgeLayer/labelLayer children (fresh Text/Graphics created every
// draw) were only ever detached via removeChildren(), never destroy()'d —
// leaking GPU texture/geometry resources over a long match. destroyLayerChildren
// is the pure fix, extracted so it's testable without booting a real Pixi
// Application/WebGL context (GameRenderer itself stays untested — see class
// doc comment for the manual-verification note on drawStatic/drawField).

import { describe, it, expect, vi } from "vitest";
import {
  destroyLayerChildren,
  dashRanges,
  circlePoint,
  rectPerimeterPoint,
  zoomedCamScale,
  easeInOutCubic,
} from "./GameRenderer";

describe("destroyLayerChildren", () => {
  it("destroys every child returned by removeChildren()", () => {
    const destroyA = vi.fn();
    const destroyB = vi.fn();
    const layer = {
      removeChildren: () => [{ destroy: destroyA }, { destroy: destroyB }],
    };

    destroyLayerChildren(layer);

    expect(destroyA).toHaveBeenCalledTimes(1);
    expect(destroyB).toHaveBeenCalledTimes(1);
  });

  it("destroys with children:true, texture:true, textureSource:false", () => {
    const destroy = vi.fn();
    const layer = { removeChildren: () => [{ destroy }] };

    destroyLayerChildren(layer);

    expect(destroy).toHaveBeenCalledWith({
      children: true,
      texture: true,
      textureSource: false,
    });
  });

  it("is a no-op when the layer has no children", () => {
    const layer = { removeChildren: () => [] };
    expect(() => destroyLayerChildren(layer)).not.toThrow();
  });
});

// Task S3: pre-game margin guides. Pixi v8's Graphics has no native
// line-dash support, so dashed circles/rects are hand-drawn as many short
// moveTo/lineTo segments — these pure helpers compute that geometry and are
// tested directly, without booting a real Pixi Application (see the class
// doc comment on why GameRenderer itself stays untested).
describe("dashRanges", () => {
  it("splits a contour into alternating dash/gap ranges starting at 0", () => {
    expect(dashRanges(20, 5, 5)).toEqual([[0, 5], [10, 15]]);
  });

  it("truncates the final dash at the contour length", () => {
    expect(dashRanges(12, 5, 5)).toEqual([[0, 5], [10, 12]]);
  });

  it("returns nothing for a non-positive length or dash", () => {
    expect(dashRanges(0, 5, 5)).toEqual([]);
    expect(dashRanges(20, 0, 5)).toEqual([]);
    expect(dashRanges(-4, 5, 5)).toEqual([]);
  });

  it("packs solid (gap 0) when dash covers the whole period", () => {
    expect(dashRanges(10, 5, 0)).toEqual([[0, 5], [5, 10]]);
  });
});

describe("circlePoint", () => {
  it("places t=0 at the rightmost point (angle 0)", () => {
    const p = circlePoint(10, 20, 5, 0);
    expect(p.x).toBeCloseTo(15, 9);
    expect(p.y).toBeCloseTo(20, 9);
  });

  it("advances by arc length: a quarter circumference reaches the bottom (angle π/2)", () => {
    const r = 5;
    const p = circlePoint(0, 0, r, (Math.PI / 2) * r);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(r, 9);
  });

  it("a full circumference returns to the start", () => {
    const r = 3;
    const p = circlePoint(1, 2, r, 2 * Math.PI * r);
    expect(p.x).toBeCloseTo(1 + r, 9);
    expect(p.y).toBeCloseTo(2, 9);
  });
});

describe("rectPerimeterPoint", () => {
  const x = 10, y = 20, w = 30, h = 10;

  it("t=0 is the top-left corner", () => {
    expect(rectPerimeterPoint(x, y, w, h, 0)).toEqual({ x, y });
  });

  it("walks right along the top edge first", () => {
    expect(rectPerimeterPoint(x, y, w, h, 15)).toEqual({ x: x + 15, y });
  });

  it("then down the right edge", () => {
    expect(rectPerimeterPoint(x, y, w, h, w + 4)).toEqual({ x: x + w, y: y + 4 });
  });

  it("then left along the bottom edge", () => {
    expect(rectPerimeterPoint(x, y, w, h, w + h + 4)).toEqual({ x: x + w - 4, y: y + h });
  });

  it("then up the left edge, closing the loop", () => {
    expect(rectPerimeterPoint(x, y, w, h, w + h + w + 4)).toEqual({ x, y: y + h - 4 });
  });

  it("wraps t modulo the perimeter", () => {
    const perimeter = 2 * (w + h);
    expect(rectPerimeterPoint(x, y, w, h, perimeter + 15)).toEqual(rectPerimeterPoint(x, y, w, h, 15));
  });
});

describe("zoomedCamScale", () => {
  it("is fitContain scale times the factor", () => {
    const map = { width: 20, height: 12 };
    const full = zoomedCamScale(map, 800, 600, 1);
    expect(zoomedCamScale(map, 800, 600, 0.87)).toBeCloseTo(full * 0.87, 6);
  });
});

describe("easeInOutCubic", () => {
  it("pins endpoints and midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });
});
