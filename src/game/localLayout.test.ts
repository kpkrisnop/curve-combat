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
});
