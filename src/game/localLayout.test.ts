import { describe, it, expect } from "vitest";
import { buildLocalLayout } from "./localLayout";
import { boundsFromMap } from "../sim/planetScatter";
import { arenaDefaults } from "./arenaDefaults";
import type { MatchConfig } from "./matchLogic";

const cfg: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local", ...arenaDefaults() };

describe("buildLocalLayout seeding", () => {
  it("same seed → identical planets; different seed → different planets", () => {
    const bounds = boundsFromMap(cfg.map);
    const a = buildLocalLayout(bounds, cfg, 1234);
    const b = buildLocalLayout(bounds, cfg, 1234);
    const c = buildLocalLayout(bounds, cfg, 99);
    expect(a.planets).toEqual(b.planets);
    expect(JSON.stringify(a.planets)).not.toEqual(JSON.stringify(c.planets));
  });

  it("same seed → identical spawns; different seed → different spawns (reroll moves players)", () => {
    const bounds = boundsFromMap(cfg.map);
    const a = buildLocalLayout(bounds, cfg, 1234);
    const b = buildLocalLayout(bounds, cfg, 1234);
    const c = buildLocalLayout(bounds, cfg, 99);

    const posOf = (layout: typeof a, id: string) => layout.players.find((p) => p.id === id)!.pos;

    expect(posOf(a, "r1")).toEqual(posOf(b, "r1"));
    expect(posOf(a, "b1")).toEqual(posOf(b, "b1"));
    expect(
      posOf(a, "r1").x !== posOf(c, "r1").x || posOf(a, "r1").y !== posOf(c, "r1").y,
    ).toBe(true);
  });

  it("red always spawns at x<0 and blue at x>0, mirrored", () => {
    const bounds = boundsFromMap(cfg.map);
    const layout = buildLocalLayout(bounds, cfg, 4242);
    const red = layout.players.find((p) => p.id === "r1")!;
    const blue = layout.players.find((p) => p.id === "b1")!;
    expect(red.pos.x).toBeLessThan(0);
    expect(blue.pos.x).toBeGreaterThan(0);
    expect(blue.pos.x).toBeCloseTo(-red.pos.x, 9);
    expect(blue.pos.y).toBeCloseTo(red.pos.y, 9);
  });
});
