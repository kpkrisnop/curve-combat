// src/game/localLayout.ts
import type { Bounds, Planet } from "../sim/types";
import type { RoundLayout, PlayerState } from "./matchState";

/** The hand-authored planet field (Decision D4 will later swap this for a seeded scatter). */
function seedPlanets(): Planet[] {
  return [
    { id: "p1", pos: { x: -5, y: 3 }, radius: 1.2, craters: [] },
    { id: "p2", pos: { x: -3, y: -2 }, radius: 1.8, craters: [] },
    { id: "p3", pos: { x: 0, y: 2 }, radius: 1.5, craters: [] },
    { id: "p4", pos: { x: 0, y: -3 }, radius: 1.4, craters: [] },
    { id: "p5", pos: { x: 3, y: 1 }, radius: 2.0, craters: [] },
    { id: "p6", pos: { x: 5, y: -2 }, radius: 1.3, craters: [] },
  ];
}

/** Local hot-seat layout: one player per team at random vertical positions near each edge. */
export function buildLocalLayout(b: Bounds): RoundLayout {
  const yLo = b.minY + 1;
  const yHi = b.maxY - 1;
  const xEdge = Math.abs(b.minX) - 0.3;
  const xInner = Math.min(11, xEdge);
  const xRange = Math.max(0, xEdge - xInner);
  const ry = yLo + Math.random() * (yHi - yLo);
  const by = yLo + Math.random() * (yHi - yLo);
  const players: PlayerState[] = [
    { id: "r1", name: "RED", team: "red", pos: { x: -(xInner + Math.random() * xRange), y: ry }, hp: 100, alive: true },
    { id: "b1", name: "BLUE", team: "blue", pos: { x: xInner + Math.random() * xRange, y: by }, hp: 100, alive: true },
  ];
  return { players, planets: seedPlanets() };
}
