// src/game/GameRenderer.test.ts
//
// M4 fix: badgeLayer/labelLayer children (fresh Text/Graphics created every
// draw) were only ever detached via removeChildren(), never destroy()'d —
// leaking GPU texture/geometry resources over a long match. destroyLayerChildren
// is the pure fix, extracted so it's testable without booting a real Pixi
// Application/WebGL context (GameRenderer itself stays untested — see class
// doc comment for the manual-verification note on drawStatic/drawField).

import { describe, it, expect, vi } from "vitest";
import { destroyLayerChildren } from "./GameRenderer";

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
