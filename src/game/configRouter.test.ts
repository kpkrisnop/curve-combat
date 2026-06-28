import { describe, it, expect } from "vitest";
import { parseConfigFromHash, configToHash } from "./configRouter";
import type { MatchConfig } from "./matchLogic";

const DEFAULT: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };

describe("configToHash", () => {
  it("encodes classic 3-round config", () => {
    expect(configToHash(DEFAULT)).toBe("#game?mode=classic&rounds=3&noTurn=false");
  });

  it("encodes classic 5-round no-turn config", () => {
    const cfg: MatchConfig = { mode: "classic", rounds: 5, noTurn: true, role: "local" };
    expect(configToHash(cfg)).toBe("#game?mode=classic&rounds=5&noTurn=true");
  });
});

describe("parseConfigFromHash", () => {
  it("parses a well-formed hash back to config", () => {
    const hash = "#game?mode=classic&rounds=3&noTurn=false";
    expect(parseConfigFromHash(hash)).toEqual(DEFAULT);
  });

  it("parses a 5-round no-turn hash", () => {
    const hash = "#game?mode=classic&rounds=5&noTurn=true";
    expect(parseConfigFromHash(hash)).toEqual(
      { mode: "classic", rounds: 5, noTurn: true, role: "local" }
    );
  });

  it("returns default config for empty hash", () => {
    expect(parseConfigFromHash("")).toEqual(DEFAULT);
    expect(parseConfigFromHash("#")).toEqual(DEFAULT);
  });

  it("returns default config for non-game hash", () => {
    expect(parseConfigFromHash("#lobby")).toEqual(DEFAULT);
  });

  it("falls back to default for invalid rounds value", () => {
    const hash = "#game?mode=classic&rounds=7&noTurn=false";
    expect(parseConfigFromHash(hash).rounds).toBe(3);
  });

  it("configToHash and parseConfigFromHash are inverse operations", () => {
    const original: MatchConfig = { mode: "classic", rounds: 5, noTurn: false, role: "local" };
    expect(parseConfigFromHash(configToHash(original))).toEqual(original);
  });
});
