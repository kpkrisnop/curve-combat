// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MathInput, setFieldEnabled } from "./MathInput";

// setFieldEnabled is the field-lock mechanism extracted from MathInput.setEnabled
// so it can be tested without a live MathQuill instance. It operates purely on a
// host element + its <textarea>.
function makeField() {
  const el = document.createElement("span");
  el.className = "mq-input";
  const ta = document.createElement("textarea");
  el.appendChild(ta);
  return { el, ta };
}

describe("setFieldEnabled", () => {
  it("locks WITHOUT disabling the textarea (a disabled→enabled cycle permanently breaks MathQuill click-to-focus)", () => {
    const { el, ta } = makeField();
    setFieldEnabled(el, false);
    // The regression guard: the previous mechanism set ta.disabled = true, which
    // left the re-enabled field un-clickable. It must never be disabled.
    expect(ta.disabled).toBe(false);
    expect(el.classList.contains("mq-locked")).toBe(true);
    expect(ta.getAttribute("tabindex")).toBe("-1");
  });

  it("unlocks by fully reversing: no lock class, textarea back in the tab order, never disabled", () => {
    const { el, ta } = makeField();
    setFieldEnabled(el, false);
    setFieldEnabled(el, true);
    expect(ta.disabled).toBe(false);
    expect(el.classList.contains("mq-locked")).toBe(false);
    expect(ta.hasAttribute("tabindex")).toBe(false);
  });
});

// jsdom has no matchMedia; stub it so the field can be asked about the pointer.
function stubPointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: coarse, media: q }));
}
afterEach(() => vi.unstubAllGlobals());

describe("MathInput.focus on touch devices", () => {
  const mount = () => {
    const input = new MathInput("", "e.g. sin(x)");
    document.body.appendChild(input.el);
    return { input, ta: () => input.el.querySelector("textarea")! };
  };

  it("focuses the field on a fine-pointer device (desktop auto-focus must keep working)", () => {
    stubPointer(false);
    const { input, ta } = mount();
    input.focus();
    expect(document.activeElement).toBe(ta());
  });

  it("does NOT focus on a coarse-pointer device (iOS: a pre-focused field never opens the keyboard on tap)", () => {
    stubPointer(true);
    const { input, ta } = mount();
    input.focus();
    expect(document.activeElement).not.toBe(ta());
  });

  it("still focuses on chip insert even on touch — that call is inside the user's tap, so the keyboard opens", () => {
    stubPointer(true);
    const { input, ta } = mount();
    input.insertText("sin(");
    expect(document.activeElement).toBe(ta());
    expect(input.getLatex()).toContain("sin");
  });
});
