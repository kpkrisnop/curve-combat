// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TeamStrip } from "./TeamStrip";
import type { PlayerState } from "../../game/matchState";

afterEach(() => cleanup());

const PLAYERS_2V2: PlayerState[] = [
  { id: "r1", name: "Alice", team: "red",  pos: { x: 1, y: 0 }, hp: 100, alive: true },
  { id: "r2", name: "Bob",   team: "red",  pos: { x: 1, y: 1 }, hp:  50, alive: true },
  { id: "b1", name: "Carol", team: "blue", pos: { x: 9, y: 0 }, hp: 100, alive: true },
  { id: "b2", name: "Dave",  team: "blue", pos: { x: 9, y: 1 }, hp:   0, alive: false },
];

describe("TeamStrip", () => {
  it("renders 4 rows for a 2v2 match", () => {
    render(<TeamStrip players={PLAYERS_2V2} myId={null} activePlayerId={null} />);
    // Each player gets a row; check by name
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Carol")).toBeTruthy();
    expect(screen.getByText("Dave")).toBeTruthy();
  });

  it("dead player row has .is-dead class", () => {
    const { container } = render(<TeamStrip players={PLAYERS_2V2} myId={null} activePlayerId={null} />);
    const rows = container.querySelectorAll(".team-strip__row");
    // Dave (b2) is the only dead player
    const deadRows = Array.from(rows).filter((r) => r.classList.contains("is-dead"));
    expect(deadRows).toHaveLength(1);
    expect(deadRows[0].textContent).toContain("Dave");
  });

  it("active player row has .is-active class", () => {
    const { container } = render(<TeamStrip players={PLAYERS_2V2} myId={null} activePlayerId="r1" />);
    const rows = container.querySelectorAll(".team-strip__row");
    const activeRows = Array.from(rows).filter((r) => r.classList.contains("is-active"));
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].textContent).toContain("Alice");
  });

  it("my row is bolded (has .is-me class)", () => {
    const { container } = render(<TeamStrip players={PLAYERS_2V2} myId="b1" activePlayerId={null} />);
    const rows = container.querySelectorAll(".team-strip__row");
    const myRows = Array.from(rows).filter((r) => r.classList.contains("is-me"));
    expect(myRows).toHaveLength(1);
    expect(myRows[0].textContent).toContain("Carol");
  });

  it("red players grouped on left, blue on right", () => {
    const { container } = render(<TeamStrip players={PLAYERS_2V2} myId={null} activePlayerId={null} />);
    const redSide  = container.querySelector(".team-strip__team--red");
    const blueSide = container.querySelector(".team-strip__team--blue");
    expect(redSide).toBeTruthy();
    expect(blueSide).toBeTruthy();
    expect(redSide!.textContent).toContain("Alice");
    expect(redSide!.textContent).toContain("Bob");
    expect(blueSide!.textContent).toContain("Carol");
    expect(blueSide!.textContent).toContain("Dave");
  });
});
