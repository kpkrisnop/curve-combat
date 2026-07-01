export const HP_MAX = 100;

/**
 * Damage dealt on a target hit in HP Mode.
 * Steeper impact angle = faster bullet = more damage.
 * Formula from spec §3.2 (corrected coefficient 45 to reach cap of 50). Range: [5, 50].
 */
export function computeDamage(impactSlope: number): number {
  return Math.round(Math.min(50, Math.max(5, 5 + 45 * Math.tanh(impactSlope / 2))));
}
