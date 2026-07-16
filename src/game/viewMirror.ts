// src/game/viewMirror.ts
//
// "Always play from the left" (ADR 0008). A viewer whose team sits on the
// world-RIGHT plays the arena reflected about world x=0, so both teams write
// their equations from the identical left-seated frame. This is a CLIENT edge
// concern: `sim` and the authoritative server only ever see world-frame
// functions and results — the mirror never reaches them.
//
// The reflection is applied at exactly two sites, which MUST use the same axis
// (world x=0) or the drawn curve won't pass through the drawn soldier:
//   1. Equation in  — mirrorLatex(): substitute x → -x into the typed function
//      before it enters the fire path (local resolveFire OR the online wire).
//   2. Render out    — Camera.mirror: reflect world→screen about x=0.

import { ComputeEngine } from "@cortex-js/compute-engine";
import type { Team } from "./matchState";

/**
 * Does a viewer on `team` see the arena mirrored? True for the world-right team
 * (BLUE, which spawns at +x and fires leftward); false for RED (already seated
 * on the left) and for spectators (null → canonical RED-left). The team→side
 * mapping is fixed across the codebase (left column → red, right column → blue;
 * see planetScatter/arenaPreview and trajectory's `dir`).
 */
export function mirroredForTeam(team: Team | null | undefined): boolean {
  return team === "blue";
}

// One engine reused across shots: mirrorLatex only parses + substitutes (never
// assign()s), so no user state accumulates — unlike Context.evaluateAll, which
// binds symbols and therefore needs a fresh engine each call.
let engine: ComputeEngine | null = null;
function ce(): ComputeEngine {
  return (engine ??= new ComputeEngine());
}

/**
 * Reflect a view-frame function into the world frame: return latex for `g(-x)`
 * given latex for `g(x)`. Because `x_world = -x_view`, a mirrored player who
 * types `g` in their own frame fires the world-frame function `g(-x)`.
 *
 * Substitution is done on the parsed expression (not the raw string): a
 * text-level `x → -x` would corrupt bare multi-letter identifiers that contain
 * an x (e.g. lenient `exp`, ADR 0009). If the latex can't be parsed, it is
 * returned untouched — the downstream compile rejects a bad function anyway.
 */
export function mirrorLatex(latex: string): string {
  try {
    const expr = ce().parse(latex);
    const reflected = expr.subs({ x: ce().parse("-x") });
    const out = reflected.latex;
    return typeof out === "string" && out.length > 0 ? out : latex;
  } catch {
    return latex;
  }
}
