// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MathField } from "./MathField";
import { HudInputRegistry } from "./hudStore";

function fakeMathInput() {
  const el = document.createElement("span");
  el.className = "mq-input";
  let enterCb: (() => void) | null = null;
  let editCb: (() => void) | null = null;
  let upCb: (() => void) | null = null;
  let downCb: (() => void) | null = null;
  return {
    el,
    getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
    setEnabled: vi.fn(), reflow: vi.fn(), insertText: vi.fn(),
    onEnter: (cb: () => void) => { enterCb = cb; },
    onEdit: (cb: () => void) => { editCb = cb; },
    onUpOutOf: (cb: () => void) => { upCb = cb; },
    onDownOutOf: (cb: () => void) => { downCb = cb; },
    fireEnter: () => enterCb?.(),
    fireEdit: () => editCb?.(),
    fireUpOutOf: () => upCb?.(),
    fireDownOutOf: () => downCb?.(),
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

  it("forwards edit/upOutOf/downOutOf to the optional props when given", () => {
    const registry = new HudInputRegistry();
    const input = fakeMathInput();
    const onEdit = vi.fn();
    const onUpOutOf = vi.fn();
    const onDownOutOf = vi.fn();
    render(
      <MathField
        team="red" registry={registry} onEnter={vi.fn()}
        onEdit={onEdit} onUpOutOf={onUpOutOf} onDownOutOf={onDownOutOf}
        makeInput={() => input}
      />,
    );
    input.fireEdit();
    input.fireUpOutOf();
    input.fireDownOutOf();
    expect(onEdit).toHaveBeenCalled();
    expect(onUpOutOf).toHaveBeenCalled();
    expect(onDownOutOf).toHaveBeenCalled();
  });

  it("does not throw when edit/upOutOf/downOutOf fire and no optional prop was given", () => {
    const registry = new HudInputRegistry();
    const input = fakeMathInput();
    render(<MathField team="red" registry={registry} onEnter={vi.fn()} makeInput={() => input} />);
    expect(() => { input.fireEdit(); input.fireUpOutOf(); input.fireDownOutOf(); }).not.toThrow();
  });
});
