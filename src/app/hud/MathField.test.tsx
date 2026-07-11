// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MathField } from "./MathField";
import { HudInputRegistry } from "./hudStore";

function fakeMathInput() {
  const el = document.createElement("span");
  el.className = "mq-input";
  let enterCb: (() => void) | null = null;
  return {
    el,
    getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
    setEnabled: vi.fn(), insertText: vi.fn(), reflow: vi.fn(),
    onEnter: (cb: () => void) => { enterCb = cb; },
    fireEnter: () => enterCb?.(),
  };
}

describe("MathField", () => {
  it("registers on mount, unregisters on unmount, forwards Enter", () => {
    const registry = new HudInputRegistry();
    const input = fakeMathInput();
    const onEnter = vi.fn();
    const { container, unmount } = render(
      <MathField team="red" registry={registry} onEnter={onEnter} makeInput={() => input} />,
    );
    expect(container.querySelector(".mq-input")).toBe(input.el);
    expect(registry.get("red")).toBeTruthy();
    input.fireEnter();
    expect(onEnter).toHaveBeenCalled();
    unmount();
    expect(registry.get("red")).toBeUndefined();
  });
});
