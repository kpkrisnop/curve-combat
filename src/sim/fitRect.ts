import type { MapConfig } from "../game/matchLogic";

export interface FitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
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

