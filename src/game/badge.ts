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
