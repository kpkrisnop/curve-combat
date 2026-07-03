import { describe, it, expect } from "vitest";
import { parseRoute } from "./routes";

describe("parseRoute", () => {
  it("empty or unknown hash → landing", () => {
    expect(parseRoute("").screen).toBe("landing");
    expect(parseRoute("#nonsense").screen).toBe("landing");
  });
  it("#local → local config", () => {
    expect(parseRoute("#local").screen).toBe("local");
  });
  it("#game hash → game with parsed config", () => {
    const r = parseRoute("#game?mode=hp&rounds=5&noTurn=false");
    expect(r.screen).toBe("game");
    if (r.screen === "game") {
      expect(r.config.mode).toBe("hp");
      expect(r.config.rounds).toBe(5);
    }
  });
  it("#room=wolf → room, code uppercased", () => {
    const r = parseRoute("#room=wolf");
    expect(r).toEqual({ screen: "room", code: "WOLF" });
  });
  it("#room= with empty code → landing", () => {
    expect(parseRoute("#room=").screen).toBe("landing");
  });
});
