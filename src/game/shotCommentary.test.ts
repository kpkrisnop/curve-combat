import { describe, it, expect } from "vitest";
import { shotCommentary } from "./shotCommentary";
import type { ShotResult, HitKind } from "../sim/types";

/** Minimal ShotResult — only `hit.kind` matters to the commentary. */
function shot(kind: HitKind): ShotResult {
  return {
    samples: [],
    hit: { kind, at: { x: 0, y: 0 }, sampleIndex: 0 },
    impactSlope: 0,
  };
}

describe("shotCommentary", () => {
  it("names the victim on a direct hit (classic mode — no damage)", () => {
    expect(shotCommentary(shot("target"), "red")).toBe("Direct hit on BLUE");
    expect(shotCommentary(shot("target"), "blue")).toBe("Direct hit on RED");
  });

  it("appends damage on a direct hit in HP mode", () => {
    expect(shotCommentary(shot("target"), "red", 12)).toBe("Direct hit on BLUE — 12 dmg");
  });

  it("ignores a zero/undefined damage rather than printing '0 dmg'", () => {
    expect(shotCommentary(shot("target"), "red", 0)).toBe("Direct hit on BLUE");
    expect(shotCommentary(shot("target"), "red", undefined)).toBe("Direct hit on BLUE");
  });

  it("describes every miss kind, attributed to the firer", () => {
    expect(shotCommentary(shot("planet"), "red")).toBe("RED hit a planet");
    expect(shotCommentary(shot("bounds"), "blue")).toBe("BLUE's shot flew off the map");
    expect(shotCommentary(shot("expired"), "red")).toBe("RED's shot fizzled out");
    expect(shotCommentary(shot("dud"), "blue")).toBe("BLUE's shot was a dud");
  });

  it("never returns an empty string for any hit kind (the line must never blank out)", () => {
    const kinds: HitKind[] = ["target", "planet", "bounds", "expired", "dud"];
    for (const k of kinds) {
      expect(shotCommentary(shot(k), "red")).not.toBe("");
    }
  });
});
