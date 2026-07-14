// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { IngameQuit } from "./IngameQuit";

describe("IngameQuit", () => {
  afterEach(() => cleanup());

  // The load-bearing one: the quit now floats over the play area, so a single
  // stray tap must never end the match. If the confirm step is ever removed,
  // this fails.
  it("a single tap never quits — it only opens the confirm", () => {
    const onLeave = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<IngameQuit onLeave={onLeave} />);

    fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
    expect(onLeave).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled(); // inline confirm, not window.confirm
    expect(screen.getByText(/quit match\?/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^quit$/i }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("Stay dismisses the confirm without quitting", () => {
    const onLeave = vi.fn();
    render(<IngameQuit onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
    fireEvent.click(screen.getByRole("button", { name: /^stay$/i }));
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^stay$/i })).toBeNull();
    expect(screen.queryByText(/quit match\?/i)).toBeNull();
  });
});
