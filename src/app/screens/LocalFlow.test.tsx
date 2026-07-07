// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocalFlow } from "./LocalFlow";
import { arenaDefaults } from "../../game/arenaDefaults";
import { LocalGame } from "../../game/LocalGame";
import type { MatchConfig } from "../../game/matchLogic";

const fakeRenderer = {
  setMap: vi.fn(),
  getEffectiveBounds: vi.fn(() => ({ xMin: -10, xMax: 10, yMin: -8, yMax: 8 })),
  setWorld: vi.fn(),
  setNoTurnMode: vi.fn(),
  playShot: vi.fn(() => Promise.resolve()),
  showFloatingDamage: vi.fn(),
};

vi.mock("../arena/ArenaStage", () => ({
  ArenaStage: ({ onReady }: { onReady: (r: typeof fakeRenderer) => void }) => {
    onReady(fakeRenderer);
    return <div data-testid="arena-stage" />;
  },
}));

const { map, scatter } = arenaDefaults();
const initial: MatchConfig = {
  mode: "classic", rounds: 3, noTurn: false, turnSeconds: 60,
  role: "local", teamSize: 1, map, scatter,
};

describe("LocalFlow arena shell", () => {
  it("renders a CSS-grid shell with a map card and a full-width footer holding Start", () => {
    render(<LocalFlow initial={initial} />);
    const shell = document.querySelector(".local-flow");
    expect(shell).toBeTruthy();
    expect(shell!.className).toContain("arena-shell");
    expect(document.querySelector(".comp.map-card")).toBeTruthy();
    expect(document.querySelector(".comp.footer")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start Match/i })).toBeTruthy();
  });

  it("gear toggles the settings panel as a second grid column, without moving the gear", () => {
    render(<LocalFlow initial={initial} />);
    const shell = document.querySelector(".local-flow") as HTMLElement;
    const gear = screen.getByRole("button", { name: /settings/i });
    const gearClassBefore = gear.className;

    // Settings open by default (parity with today's always-visible drawer).
    expect(document.querySelector(".comp.side-panel")).toBeTruthy();
    expect(shell.className).toContain("arena-shell--open");

    fireEvent.click(gear);
    expect(document.querySelector(".comp.side-panel")).toBeNull();
    expect(shell.className).not.toContain("arena-shell--open");
    // Gear itself carries the exact same classes open or closed (fixed position).
    expect(gear.className).toBe(gearClassBefore);

    fireEvent.click(gear);
    expect(document.querySelector(".comp.side-panel")).toBeTruthy();
  });

  it("does not render the top-center round-status element before the match starts (config phase)", () => {
    render(<LocalFlow initial={initial} />);
    expect(screen.queryByTestId("round-status")).toBeNull();
  });

  it("disposes the LocalGame when the screen unmounts by any path other than Back to Lobby", () => {
    const disposeSpy = vi.spyOn(LocalGame.prototype, "dispose");
    const { unmount } = render(<LocalFlow initial={initial} />);
    unmount();
    expect(disposeSpy).toHaveBeenCalled();
    disposeSpy.mockRestore();
  });

  it("pregame Leave navigates back to landing", () => {
    location.hash = "#game";
    render(<LocalFlow initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /^leave$/i }));
    expect(location.hash === "" || location.hash === "#").toBe(true);
  });
});
