// Thin adapter around a MathQuill editable field. This is the ONLY module that
// knows MathQuill exists — ExpressionPanel (and anything else) talks to this
// clean interface, so swapping the input library again is a one-file change.
//
// Import order is load-bearing: the jQuery shim must run before the MathQuill
// build evaluates. Static imports evaluate top-to-bottom, so this is correct.
import "./jquery-global";
import "@edtr-io/mathquill/build/mathquill.js";
import "@edtr-io/mathquill/build/mathquill.css";

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
      },
    });

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
}
