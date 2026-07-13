// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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

describe("software-keyboard suppression", () => {
  it("marks MathQuill's textarea inputmode=none, so no OS keyboard opens for it", () => {
    const input = new MathInput();
    expect(input.el.querySelector("textarea")?.getAttribute("inputmode")).toBe("none");
  });
});

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
