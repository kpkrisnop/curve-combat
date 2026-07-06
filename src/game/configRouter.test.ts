import { describe, it, expect } from "vitest";
import { parseConfigFromHash, configToHash } from "./configRouter";
import type { MatchConfig } from "./matchLogic";
import { arenaDefaults } from "./arenaDefaults";

const DEFAULT: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, turnSeconds: 60, role: "local", ...arenaDefaults() };
const ARENA_HASH = "&w=20&h=12&rmn=0.5&rmx=2&gmn=0.5&gmx=2&sc=1.5&fm=1&mp=15&ts=1&eg=1&bx=3&ym=1.5&sp=2&sm=1";

describe("configToHash", () => {
  it("encodes classic 3-round default config with arena fields", () => {
    expect(configToHash(DEFAULT)).toBe("#game?mode=classic&rounds=3&noTurn=false&tt=60" + ARENA_HASH);
  });

  it("encodes 5-round no-turn config", () => {
    const cfg: MatchConfig = { mode: "classic", rounds: 5, noTurn: true, role: "local", ...arenaDefaults() };
    expect(configToHash(cfg)).toBe("#game?mode=classic&rounds=5&noTurn=true&tt=60" + ARENA_HASH);
  });
});

describe("parseConfigFromHash", () => {
  it("round-trips the default config", () => {
    expect(parseConfigFromHash(configToHash(DEFAULT))).toEqual(DEFAULT);
  });

  it("parses custom arena fields", () => {
    const hash = "#game?mode=hp&rounds=5&noTurn=true&w=30&h=18&rmn=1&rmx=3&gmn=1&gmx=4&sc=2.5&fm=1&mp=8&ts=3&eg=2&bx=4&ym=2&sp=3";
    expect(parseConfigFromHash(hash)).toEqual({
      mode: "hp",
      rounds: 5,
      noTurn: true,
      turnSeconds: 60,
      role: "local",
      map: { width: 30, height: 18 },
      scatter: {
        rMin: 1, rMax: 3, gapMin: 1, gapMax: 4, spawnClearance: 2.5, fieldMargin: 1, maxPlanets: 8,
        spawnEdgeGap: 2, spawnBandX: 4, spawnYMargin: 2, spawnSeparation: 3, spawnMirror: true,
      },
      teamSize: 3,
    });
  });

  it("round-trips the 4 new spawn-zone params", () => {
    const cfg: MatchConfig = {
      ...DEFAULT,
      scatter: { ...DEFAULT.scatter, spawnEdgeGap: 2.5, spawnBandX: 5, spawnYMargin: 0.8, spawnSeparation: 3.2 },
    };
    expect(parseConfigFromHash(configToHash(cfg))).toEqual(cfg);
  });

  it("parses mode=hp correctly", () => {
    expect(parseConfigFromHash("#game?mode=hp&rounds=3&noTurn=false").mode).toBe("hp");
  });

  it("falls back to arena defaults when arena fields are missing", () => {
    expect(parseConfigFromHash("#game?mode=classic&rounds=3&noTurn=false")).toEqual(DEFAULT);
  });

  it("returns default config for empty / non-game hashes", () => {
    expect(parseConfigFromHash("")).toEqual(DEFAULT);
    expect(parseConfigFromHash("#")).toEqual(DEFAULT);
    expect(parseConfigFromHash("#lobby")).toEqual(DEFAULT);
  });

  it("falls back to default for invalid rounds value", () => {
    expect(parseConfigFromHash("#game?mode=classic&rounds=7&noTurn=false").rounds).toBe(3);
  });

  it("clamps out-of-range and non-numeric arena fields", () => {
    const hash = "#game?mode=classic&rounds=3&noTurn=false&w=9999&h=abc&mp=-4&ts=99";
    const cfg = parseConfigFromHash(hash);
    expect(cfg.map.width).toBeLessThanOrEqual(60);
    expect(cfg.map.height).toBe(12);
    expect(cfg.scatter.maxPlanets).toBeGreaterThanOrEqual(1);
    expect(cfg.teamSize).toBe(5);
  });

  it("configToHash and parseConfigFromHash are inverse operations", () => {
    const original: MatchConfig = {
      mode: "classic",
      rounds: 5,
      noTurn: false,
      turnSeconds: 45,
      role: "local",
      map: { width: 28, height: 16 },
      scatter: {
        rMin: 0.5, rMax: 2.5, gapMin: 0.2, gapMax: 3, spawnClearance: 1.5, fieldMargin: 0.8, maxPlanets: 10,
        spawnEdgeGap: 1.2, spawnBandX: 2.8, spawnYMargin: 1.1, spawnSeparation: 1.8, spawnMirror: false,
      },
      teamSize: 2,
    };
    expect(parseConfigFromHash(configToHash(original))).toEqual(original);
  });
});
