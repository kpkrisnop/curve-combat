import type { Planet } from "../../sim/types";
import type { MapConfig } from "../../game/matchLogic";

/** Fraction of the field covered by planet "meat" (craters ignored — none at spawn). */
export function coverage(planets: Planet[], map: MapConfig): number {
  const field = map.width * map.height;
  if (field <= 0) return 0;
  const meat = planets.reduce((a, p) => a + Math.PI * p.radius * p.radius, 0);
  return meat / field;
}
