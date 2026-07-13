// Minimal ambient types for the slice of MathQuill we actually use.
// MathQuill (@edtr-io/mathquill 0.11) ships no types; this covers our surface
// and nothing more, so strict mode catches mistakes at our call sites.

interface MQMathField {
  /** Get the field's LaTeX. */
  latex(): string;
  /** Set the field's LaTeX. */
  latex(value: string): void;
  focus(): MQMathField;
  blur(): MQMathField;
  /** The DOM element MathQuill rendered into. */
  el(): HTMLElement;
  /** Write LaTeX at the cursor. */
  write(latex: string): MQMathField;
  /** Type raw chars/LaTeX at the cursor, same as user keystrokes (chip insertion). */
  typedText(text: string): MQMathField;
  /** Send a raw keystroke ("Left", "Right", "Backspace") — the keypad's non-text keys. */
  keystroke(keys: string): MQMathField;
  /** Type a command at the cursor (e.g. "\\sqrt"). */
  cmd(latex: string): MQMathField;
  /** Recompute layout — call after the element is attached / resized. */
  reflow?(): void;
}

interface MQHandlers {
  edit?: (mathField: MQMathField) => void;
  enter?: (mathField: MQMathField) => void;
  moveOutOf?: (dir: number, mathField: MQMathField) => void;
  deleteOutOf?: (dir: number, mathField: MQMathField) => void;
  upOutOf?: (mathField: MQMathField) => void;
  downOutOf?: (mathField: MQMathField) => void;
}

interface MQConfig {
  spaceBehavesLikeTab?: boolean;
  supSubsRequireOperand?: boolean;
  charsThatBreakOutOfSupSub?: string;
  restrictMismatchedBrackets?: boolean;
  autoSubscriptNumerals?: boolean;
  autoCommands?: string;
  autoOperatorNames?: string;
  handlers?: MQHandlers;
}

interface MQInterface {
  MathField(el: HTMLElement, config?: MQConfig): MQMathField;
  StaticMath(el: HTMLElement, config?: MQConfig): MQMathField;
  config(config: MQConfig): void;
}

interface MQStatic {
  getInterface(version: number): MQInterface;
}

interface Window {
  MathQuill: MQStatic;
}

// Side-effect imports: the build attaches `window.MathQuill`; the CSS is
// handled by Vite's `*.css` module declaration (see vite-env.d.ts).
declare module "@edtr-io/mathquill/build/mathquill.js";
