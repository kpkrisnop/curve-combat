// The keypad's data. Separated from the component so the model is testable and
// the component stays purely presentational.
//
// Layout recorded in docs/superpowers/specs/2026-07-13-touch-keypad-design.md
// (frozen by a throwaway HTML prototype, since deleted).

export type KeyAction =
  | { kind: "insert"; text: string }
  | { kind: "keystroke"; keys: string }
  | { kind: "action"; name: "clear" | "recall" };

export interface KeyDef {
  /** What the player sees. Also the accessible name. */
  label: string;
  action: KeyAction;
  className?: string;
}

const ins = (label: string, text = label): KeyDef => ({ label, action: { kind: "insert", text } });

/** Calculator order — 0 on the BOTTOM row, where every keypad on earth puts it.
 *  `x` is the most-typed symbol in the game and gets its own styling: it must
 *  never be mistaken for `×`. */
export const NUM_KEYS: KeyDef[] = [
  ins("7"), ins("8"), ins("9"),
  ins("4"), ins("5"), ins("6"),
  ins("1"), ins("2"), ins("3"),
  ins("0"), ins("."), { label: "x", action: { kind: "insert", text: "x" }, className: "is-var" },
];

/** MathQuill turns "*" into ×  and "/" into a fraction — the same chars a
 *  desktop player types, so the keypad and the keyboard produce identical LaTeX. */
export const OP_KEYS: KeyDef[] = [
  ins("+"), ins("−", "-"),
  ins("×", "*"), ins("÷", "/"),
  ins("("), ins(")"),
  ins("^"), ins("√", "sqrt"),
];

export const NAV_KEYS: KeyDef[] = [
  { label: "←", action: { kind: "keystroke", keys: "Left" } },
  { label: "→", action: { kind: "keystroke", keys: "Right" } },
  { label: "Backspace", action: { kind: "keystroke", keys: "Backspace" } },
  { label: "Clear", action: { kind: "action", name: "clear" } },
  { label: "Recall", action: { kind: "action", name: "recall" } },
];

/** The common twelve come FIRST — they must clear the panel's fold. Everything
 *  after them is the exotic tail you scroll to. Every name here is one MathQuill
 *  already knows via autoOperatorNames (see src/ui/MathInput.ts CONFIG). */
export const FN_KEYS: KeyDef[] = [
  ins("sin", "sin("), ins("cos", "cos("), ins("tan", "tan("), ins("√", "sqrt"),
  ins("ln", "ln("), ins("log", "log_"), ins("x²", "x^2"), ins("xⁿ", "^"),
  ins("π", "pi"), ins("e", "e"), ins("abs", "abs("), ins("1/a", "1/"),
  ins("arcsin", "arcsin("), ins("arccos", "arccos("), ins("arctan", "arctan("),
  ins("sinh", "sinh("), ins("cosh", "cosh("), ins("tanh", "tanh("),
  ins("exp", "exp("), ins("floor", "floor("), ins("ceil", "ceil("),
  ins("round", "round("), ins("sign", "sign("), ins("cot", "cot("),
];
