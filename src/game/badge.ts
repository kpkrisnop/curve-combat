// src/game/badge.ts
//
// Pure logic for the on-map name badge (Task D1+D2, see
// docs/superpowers/specs/2026-07-04-arena-shell-redesign-design.md §7).
// Every soldier dot carries a badge with its name; badges are larger in the
// pre-game lobby and smaller once the match is live, and — only in HP mode —
// additionally show a mini health bar plus the numeric HP value. Kept pure so
// the logic can be unit-tested independently of Pixi (GameRenderer wires this
// into the badge layer; see GameRenderer.drawBadge).

export type BadgePhase = "pregame" | "ingame";
export type MatchMode = "classic" | "hp";
export type BadgeSize = "lg" | "sm";

/** Display text for a player's name badge — trims whitespace, falls back for a blank name. */
export function badgeText(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "Player";
}

/** Badge size: larger in the pre-game lobby, smaller once the match is live. */
export function badgeSize(phase: BadgePhase): BadgeSize {
  return phase === "pregame" ? "lg" : "sm";
}

/** Fraction of HP remaining, clamped to [0, 1]. Never divides by a non-positive max. */
export function hpFraction(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, hp / maxHp));
}

/** The mini HP bar (+ numeric HP) only ever shows in HP mode — never in Classic. */
export function showHpBar(mode: MatchMode): boolean {
  return mode === "hp";
}

/**
 * Whether a single player should render as "active" (glow + aim barrel).
 *
 * H3 fix: in turn-based NvN, activity is a PLAYER identity, not a TEAM one —
 * exactly one player fires at a time, so a teammate sharing the active team
 * must NOT glow just because their team is up. In no-turn mode every live
 * player is simultaneously active. `activePlayerId` may be null (no turn
 * assigned yet / match hasn't started), in which case nobody is active.
 */
export function isPlayerActive(
  playerId: string,
  activePlayerId: string | null,
  noTurnMode: boolean,
): boolean {
  return noTurnMode || playerId === activePlayerId;
}
