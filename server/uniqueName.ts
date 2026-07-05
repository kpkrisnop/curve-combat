// server/uniqueName.ts
const MAX_LEN = 24;

/**
 * Disambiguates `desired` against a room-scoped list of already-taken names
 * (case-insensitive, trim-insensitive) by appending a numeric suffix — " 2",
 * " 3", etc — until it no longer collides. If the desired name isn't taken,
 * it's returned as-is (trimmed). If appending a suffix would exceed MAX_LEN,
 * the base is truncated first so the final result still fits.
 *
 * Pure and side-effect free: callers decide what counts as "taken" (e.g.
 * other players' names, spectator names, excluding the caller's own current
 * name for self-rename no-ops).
 */
export function uniqueName(desired: string, takenNames: string[]): string {
  const base = desired.trim().slice(0, MAX_LEN);
  const taken = new Set(takenNames.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;

  let n = 2;
  for (;;) {
    const suffix = ` ${n}`;
    const truncatedBase = base.length + suffix.length > MAX_LEN
      ? base.slice(0, MAX_LEN - suffix.length)
      : base;
    const candidate = `${truncatedBase}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
    n++;
  }
}
