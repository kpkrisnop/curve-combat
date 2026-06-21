// Shared value types for the pure simulation layer.
//
// The engine works ENTIRELY in world coordinates (the same math-plane units the
// render Camera maps to pixels). It has no knowledge of the DOM, Pixi, or the
// math-input library — it only ever receives a compiled `(x) => number` curve.

export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Target {
  id: string;
  pos: Vec2;
  /** Collision + draw radius, in world units. */
  radius: number;
}

export interface Soldier {
  pos: Vec2;
  /** Which way world x marches when firing: +1 toward +x, -1 toward -x. */
  dir: 1 | -1;
}

export interface World {
  soldier: Soldier;
  targets: Target[];
  bounds: Bounds;
}

/** One sampled point of a shot's path, in world coordinates. */
export interface TrajectorySample {
  p: Vec2;
  /** The world-x value that produced this point. */
  x: number;
  /** True when there is a discontinuity BEFORE this point (do not connect to the previous sample). */
  gap: boolean;
}

export type HitKind = "target" | "bounds" | "expired" | "dud";

export interface Hit {
  kind: HitKind;
  /** World point of impact (for "dud", the soldier's position). */
  at: Vec2;
  /** Present when kind === "target". */
  targetId?: string;
  /** Index into the (truncated) sample stream where impact occurred. */
  sampleIndex: number;
}

export interface ShotResult {
  /** Samples in firing order, truncated at the point of impact. */
  samples: TrajectorySample[];
  hit: Hit;
}
