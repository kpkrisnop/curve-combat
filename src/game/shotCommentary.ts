// Human-readable one-liner describing how a shot ended, for the HUD status line.
// Pure and side-effect-free: both LocalGame and NetworkGame feed it the same
// ShotResult the renderer just played back, so local and online read identically.

import type { ShotResult } from "../sim/types";
import type { Team } from "./matchState";

const OTHER: Record<Team, Team> = { red: "blue", blue: "red" };

/**
 * `damage` is only meaningful for a "target" hit in HP mode; pass it there and
 * omit it everywhere else. A falsy damage is treated as "no damage to report"
 * rather than printing a bare "0 dmg".
 */
export function shotCommentary(shot: ShotResult, firer: Team, damage?: number): string {
  const self = firer.toUpperCase();
  const victim = OTHER[firer].toUpperCase();
  switch (shot.hit.kind) {
    case "target":
      return damage ? `Direct hit on ${victim} — ${damage} dmg` : `Direct hit on ${victim}`;
    case "planet":
      return `${self} hit a planet`;
    case "bounds":
      return `${self}'s shot flew off the map`;
    case "expired":
      return `${self}'s shot fizzled out`;
    case "dud":
      return `${self}'s shot was a dud`;
  }
}
