// Thin adapter around a MathQuill editable field. This is the ONLY module that
// knows MathQuill exists — the HUD (and anything else) talks to this clean
// interface, so swapping the input library again is a one-file change.
//
// Import order is load-bearing: the jQuery shim must run before the MathQuill
// build evaluates. Static imports evaluate top-to-bottom, so this is correct.
import "./jquery-global";
import "@edtr-io/mathquill/build/mathquill.js";
import "@edtr-io/mathquill/build/mathquill.css";
import { latexToTyped } from "./latexFormat";

const MQ = window.MathQuill.getInterface(2);

// Desmos-feel configuration. Since the on-screen keyboard is gone, the
// autoCommands / autoOperatorNames lists are also the discoverability surface:
// typing "sqrt" -> √, "pi" -> π, "sin" -> upright sin, etc.
const CONFIG: MQConfig = {
  spaceBehavesLikeTab: true,
  supSubsRequireOperand: true,
  charsThatBreakOutOfSupSub: "+-=<>",
  restrictMismatchedBrackets: true,
  autoSubscriptNumerals: true,
  autoCommands: "pi tau theta sqrt nthroot",
  autoOperatorNames:
    "sin cos tan sec csc cot " +
    "arcsin arccos arctan arccsc arcsec arccot " +
    "sinh cosh tanh ln log exp abs floor ceil round sign",
};

/**
 * Lock/unlock a MathQuill field's host element WITHOUT touching
 * `textarea.disabled`. A disabled→enabled cycle permanently breaks MathQuill's
 * click-to-focus: the field reads enabled but clicking it won't focus it, so the
 * player can't type (only programmatic focus still works). Instead we blur, drop
 * the textarea out of the tab order, and kill pointer events via `.mq-locked` —
 * none of which corrupt MathQuill's focus model, so unlocking restores full
 * click-to-focus. Exported for unit testing (no live MathQuill needed).
 */
export function setFieldEnabled(el: HTMLElement, enabled: boolean): void {
  const ta = el.querySelector<HTMLTextAreaElement>("textarea");
  if (enabled) {
    el.classList.remove("mq-locked");
    ta?.removeAttribute("tabindex");
  } else {
    ta?.blur();
    ta?.setAttribute("tabindex", "-1");
    el.classList.add("mq-locked");
  }
}

export class MathInput {
  /** The element to insert into the DOM. */
  readonly el: HTMLSpanElement;

  private mq: MQMathField;
  private editCb: (() => void) | null = null;
  private enterCb: (() => void) | null = null;
  private upOutCb: (() => void) | null = null;
  private downOutCb: (() => void) | null = null;
  private placeholderEl: HTMLSpanElement | null = null;

  constructor(initialLatex = "", placeholder = "") {
    this.el = document.createElement("span");
    this.el.className = "mq-input";

    this.mq = MQ.MathField(this.el, {
      ...CONFIG,
      handlers: {
        // editCb is still null during the initial latex() set below, so seeding
        // a value doesn't trigger a premature recompute.
        edit: () => {
          this.editCb?.();
          this.syncPlaceholder();
        },
        enter: () => this.enterCb?.(),
        // Fire only when the cursor is at the field's top/bottom level with
        // nowhere higher/lower to go — inside a fraction/exponent, Up/Down
        // still navigate the math. Consumers use this for equation recall.
        upOutOf: () => this.upOutCb?.(),
        downOutOf: () => this.downOutCb?.(),
      },
    });

    // SPIKE (custom-keypad): suppress the software keyboard on touch devices.
    // MathQuill types into a hidden textarea; `inputmode="none"` tells the OS
    // "this field is focusable and takes a caret, but do NOT open a keyboard for
    // it" — physical keys are unaffected, so desktop typing is untouched and no
    // device detection is needed. On iPad the native keyboard is the direct
    // cause of every symptom we have (it doesn't reliably open, it covers the
    // console, and it displaces the page when dismissed); this is the platform's
    // own off switch for it, and the precondition for our own on-screen keypad.
    this.el.querySelector("textarea")?.setAttribute("inputmode", "none");

    // A faux placeholder overlay (MathQuill has no native placeholder): shown
    // only while the field is empty, hidden the moment any content is typed.
    if (placeholder) {
      this.placeholderEl = document.createElement("span");
      this.placeholderEl.className = "mq-placeholder";
      this.placeholderEl.textContent = placeholder;
      this.el.appendChild(this.placeholderEl);
    }

    if (initialLatex) this.mq.latex(initialLatex);
    this.syncPlaceholder();
  }

  /** Show the placeholder only when the field is empty. */
  private syncPlaceholder(): void {
    if (!this.placeholderEl) return;
    this.placeholderEl.style.display = this.mq.latex().trim() === "" ? "" : "none";
  }

  getLatex(): string {
    return this.mq.latex();
  }

  setLatex(value: string): void {
    this.mq.latex(value);
    this.syncPlaceholder();
  }

  focus(): void {
    this.mq.focus();
  }

  setEnabled(enabled: boolean): void {
    setFieldEnabled(this.el, enabled);
  }

  /** Type raw chars at the cursor, as if the user had typed them (function chips). */
  insertText(text: string): void {
    this.mq.typedText(text);
    this.mq.focus();
    this.syncPlaceholder();
  }

  /**
   * Send a non-text key (arrows, Backspace). `insertText` can't express these:
   * they move or delete rather than typing. Refocuses for the same reason
   * insertText does — the key that triggered this was a <button>, and the tap
   * blurred the field.
   */
  keystroke(keys: string): void {
    this.mq.keystroke(keys);
    this.mq.focus();
    this.syncPlaceholder();
  }

  /**
   * Re-run the current input through MathQuill's own typing so flat pasted ASCII
   * (`sin(100x)/(1+exp(...))`) becomes structured LaTeX (real fractions,
   * superscripts, upright function names) — the same result the player would get
   * typing it key-by-key on the keypad. Returns { before, after } so the caller
   * can guard the change against the compiled curve and revert with setLatex if
   * typing mis-grouped the math (bare `a/b-c`, `sqrt(...)`). Callers wrap this in
   * their programmatic-edit flag: typedText fires the edit handler.
   */
  reformat(): { before: string; after: string } {
    const before = this.mq.latex();
    this.mq.latex("");
    this.mq.typedText(latexToTyped(before));
    this.syncPlaceholder();
    return { before, after: this.mq.latex() };
  }

  /** Recompute layout — call once after el is attached to the DOM. */
  reflow(): void {
    this.mq.reflow?.();
  }

  onEdit(cb: () => void): void {
    this.editCb = cb;
  }

  onEnter(cb: () => void): void {
    this.enterCb = cb;
  }

  /** Up pressed with the cursor already at the top level (nowhere higher to go). */
  onUpOutOf(cb: () => void): void {
    this.upOutCb = cb;
  }

  /** Down pressed with the cursor already at the bottom level. */
  onDownOutOf(cb: () => void): void {
    this.downOutCb = cb;
  }
}
