import type { MapConfig } from "../game/matchLogic";
import type { Bounds, Vec2 } from "./types";
import { boundsFromMap } from "./planetScatter";

export interface FitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface RectPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Uniformly scale a logical map rect to fit inside a canvas (contain / letterbox). */
export function fitContain(map: MapConfig, canvasW: number, canvasH: number): FitTransform {
  const scale = Math.min(canvasW / map.width, canvasH / map.height);
  return {
    scale,
    offsetX: (canvasW - map.width * scale) / 2,
    offsetY: (canvasH - map.height * scale) / 2,
  };
}

/** Map a world-coord point into canvas pixels via a `fitContain` transform + its bounds. */
function worldToScreen(t: FitTransform, b: Bounds, p: Vec2): Vec2 {
  return {
    x: t.offsetX + (p.x - b.minX) * t.scale,
    y: t.offsetY + (b.maxY - p.y) * t.scale,
  };
}

/**
 * Pure geometry for the drawn play-boundary rectangle: maps the sim's own
 * `boundsFromMap(map)` corners through `fitContain(map, canvasW, canvasH)`.
 * This MUST stay the single source of truth for where the boundary is drawn —
 * never hardcode a separate rect. `detectCollision` (src/sim/collision.ts)
 * collides against the exact same `bounds`.
 */
export function boundaryRectPx(map: MapConfig, canvasW: number, canvasH: number): RectPx {
  const t = fitContain(map, canvasW, canvasH);
  const b = boundsFromMap(map);
  const topLeft = worldToScreen(t, b, { x: b.minX, y: b.maxY });
  const bottomRight = worldToScreen(t, b, { x: b.maxX, y: b.minY });
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: bottomRight.x - topLeft.x,
    h: bottomRight.y - topLeft.y,
  };
}
