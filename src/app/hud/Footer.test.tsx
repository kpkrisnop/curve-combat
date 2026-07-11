// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Footer, roomLink } from "./Footer";
import { hudStore, initialHudState } from "./hudStore";

const makeInput = () => {
  const el = document.createElement("span");
  return {
    el, getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
    setEnabled: vi.fn(), insertText: vi.fn(), reflow: vi.fn(), onEnter: vi.fn(),
  };
};

describe("Footer", () => {
  beforeEach(() => hudStore.set(initialHudState()));
  afterEach(() => cleanup());

  it("pregame-local: shows only Start — no waiting/name/switch/copy", () => {
    const onStart = vi.fn();
    render(<Footer mode="pregame-local" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Match/i }));
    expect(onStart).toHaveBeenCalled();
    expect(screen.queryByText(/Waiting for host/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Switch side/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy code/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy link/i })).toBeNull();
  });

  it("pregame-online host: Start visible plus name/switch/copy controls", () => {
    render(<Footer mode="pregame-online" isHost roomCode="ABCD" />);
    expect(screen.getByRole("button", { name: /Start Match/i })).toBeTruthy();
    expect(screen.queryByText(/Waiting for host/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Switch side/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy code/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy link/i })).toBeTruthy();
  });

  it("pregame-online non-host: Start hidden, 'Waiting for host…' shown, name/switch/copy remain", () => {
    render(<Footer mode="pregame-online" isHost={false} roomCode="ABCD" />);
    expect(screen.queryByRole("button", { name: /Start Match/i })).toBeNull();
    expect(screen.getByText(/Waiting for host/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Switch side/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy code/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy link/i })).toBeTruthy();
  });

  it("ingame: centers input + Fire, no Start/waiting/name/switch/copy", () => {
    render(<Footer mode="ingame" makeInput={makeInput} />);
    expect(screen.queryByRole("button", { name: /Start Match/i })).toBeNull();
    expect(screen.queryByText(/Waiting for host/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Switch side/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy code/i })).toBeNull();
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires.length).toBeGreaterThan(0);
    expect(document.querySelector(".footer--ingame")).toBeTruthy();
  });

  it("copy code / copy link write to the clipboard", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Footer mode="pregame-online" isHost roomCode="WXYZ" />);
    fireEvent.click(screen.getByRole("button", { name: /Copy code/i }));
    expect(writeText).toHaveBeenCalledWith("WXYZ");
    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("WXYZ"));
  });

  it("roomLink (L3) preserves a sub-path base instead of hardcoding the bare origin", () => {
    expect(roomLink("ABCD", "https://example.com/graph-war/")).toBe(
      "https://example.com/graph-war/#room=ABCD",
    );
    // Root-path base still works.
    expect(roomLink("ABCD", "https://example.com/")).toBe("https://example.com/#room=ABCD");
    // Defensively strips any pre-existing hash on the base.
    expect(roomLink("ABCD", "https://example.com/app/#old")).toBe(
      "https://example.com/app/#room=ABCD",
    );
  });

  it("copy link uses location.origin + location.pathname (sub-path safe)", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Footer mode="pregame-online" isHost roomCode="WXYZ" />);
    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    expect(writeText).toHaveBeenCalledWith(`${location.origin}${location.pathname}#room=WXYZ`);
  });

  it("name input + switch button call the seam props (dispatch wiring is a later task)", () => {
    const onNameChange = vi.fn();
    const onSwitchSide = vi.fn();
    render(
      <Footer
        mode="pregame-online"
        isHost
        name="Ada"
        onNameChange={onNameChange}
        onSwitchSide={onSwitchSide}
        roomCode="ABCD"
      />,
    );
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Grace" } });
    expect(onNameChange).toHaveBeenCalledWith("Grace");
    fireEvent.click(screen.getByRole("button", { name: /Switch side/i }));
    expect(onSwitchSide).toHaveBeenCalled();
  });

  it("pregame-local renders a Leave button that calls onLeave without confirm", () => {
    const onLeave = vi.fn();
    render(<Footer mode="pregame-local" onStart={vi.fn()} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /leave/i }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("ingame Quit Match confirms before calling onLeave", () => {
    const onLeave = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Footer mode="ingame" onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("ingame Quit Match does nothing if the confirm is dismissed", () => {
    const onLeave = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Footer mode="ingame" onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
    expect(onLeave).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
