// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RosterColumns } from "./RosterColumns";

const p = (id: string, name: string, team: "red" | "blue") => ({ id, name, team });

const twoPlayers = [p("r1", "Alice", "red"), p("b1", "Bob", "blue")];

describe("RosterColumns", () => {
  it("renders one row per player in the correct team column", () => {
    render(
      <RosterColumns
        players={twoPlayers}
        myId="r1"
        hostId="r1"
        locked={false}
        onSwitch={vi.fn()}
      />
    );
    // Both names appear
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();

    // Alice is in .is-red column, Bob is in .is-blue column
    const redCol = document.querySelector(".roster-col.is-red")!;
    const blueCol = document.querySelector(".roster-col.is-blue")!;
    expect(redCol.textContent).toContain("Alice");
    expect(blueCol.textContent).toContain("Bob");
  });

  it("my row has is-me class", () => {
    render(
      <RosterColumns
        players={twoPlayers}
        myId="b1"
        hostId="r1"
        locked={false}
        onSwitch={vi.fn()}
      />
    );
    const meRow = document.querySelector(".roster-row.is-me");
    expect(meRow).toBeTruthy();
    expect(meRow!.textContent).toContain("Bob");
  });

  it("host row gets ♛ badge", () => {
    render(
      <RosterColumns
        players={twoPlayers}
        myId="b1"
        hostId="r1"
        locked={false}
        onSwitch={vi.fn()}
      />
    );
    const hostRow = document.querySelector(".roster-row.is-host");
    expect(hostRow).toBeTruthy();
    expect(hostRow!.textContent).toContain("♛");
  });

  it("shows Switch to BLUE button (other team) and calls onSwitch", () => {
    const onSwitch = vi.fn();
    render(
      <RosterColumns
        players={twoPlayers}
        myId="r1"
        hostId="r1"
        locked={false}
        onSwitch={onSwitch}
      />
    );
    // Alice is on red team — should see "Switch to BLUE" in the blue column
    const btn = screen.getByRole("button", { name: /Switch to BLUE/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onSwitch).toHaveBeenCalledWith("blue");
  });

  it("switch button absent when locked", () => {
    render(
      <RosterColumns
        players={twoPlayers}
        myId="r1"
        hostId="r1"
        locked={true}
        onSwitch={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Switch to/i })).toBeNull();
  });

  it("switch button absent when target team already has 5 players", () => {
    const fullBlue = [
      p("r1", "Alice", "red"),
      p("b1", "B1", "blue"),
      p("b2", "B2", "blue"),
      p("b3", "B3", "blue"),
      p("b4", "B4", "blue"),
      p("b5", "B5", "blue"),
    ];
    render(
      <RosterColumns
        players={fullBlue}
        myId="r1"
        hostId="r1"
        locked={false}
        onSwitch={vi.fn()}
      />
    );
    // Alice on red wants to switch to blue but blue is full (5)
    expect(screen.queryByRole("button", { name: /Switch to BLUE/i })).toBeNull();
  });
});
