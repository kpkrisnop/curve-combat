import { describe, it, expect } from "vitest";
import { matchWinner, firstShooterNextRound, majorityNeeded } from "./matchLogic";

describe("majorityNeeded", () => {
  it("returns 2 for best-of-3", () => {
    expect(majorityNeeded(3)).toBe(2);
  });
  it("returns 3 for best-of-5", () => {
    expect(majorityNeeded(5)).toBe(3);
  });
});

describe("matchWinner", () => {
  it("returns null when neither player has reached majority", () => {
    expect(matchWinner(1, 0, 3)).toBeNull();
    expect(matchWinner(0, 1, 3)).toBeNull();
    expect(matchWinner(1, 1, 5)).toBeNull();
  });
  it("returns 'red' when red reaches majority in best-of-3", () => {
    expect(matchWinner(2, 0, 3)).toBe("red");
    expect(matchWinner(2, 1, 3)).toBe("red");
  });
  it("returns 'blue' when blue reaches majority in best-of-3", () => {
    expect(matchWinner(0, 2, 3)).toBe("blue");
    expect(matchWinner(1, 2, 3)).toBe("blue");
  });
  it("returns 'red' when red reaches majority in best-of-5", () => {
    expect(matchWinner(3, 2, 5)).toBe("red");
    expect(matchWinner(3, 0, 5)).toBe("red");
  });
  it("returns 'blue' when blue reaches majority in best-of-5", () => {
    expect(matchWinner(2, 3, 5)).toBe("blue");
  });
});

describe("firstShooterNextRound", () => {
  it("returns the opponent of the round loser (loser gets initiative)", () => {
    // loser shoots first — loser = the one who got hit, so we pass the loser
    expect(firstShooterNextRound("red")).toBe("red");
    expect(firstShooterNextRound("blue")).toBe("blue");
  });
});
