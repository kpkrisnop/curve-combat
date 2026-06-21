// A read-only reference of what you can type, replacing the old on-screen
// keyboard. Each entry shows the trigger text and the result it produces, so
// the discoverability the catalogue keyboard used to provide now lives here.
// Entries are plain text / unicode — no StaticMath rendering needed.
//
// The trigger lists mirror MathInput's autoCommands / autoOperatorNames.

interface CatEntry {
  /** What the user types. */
  type: string;
  /** What it renders to (unicode / shorthand). */
  result: string;
}

interface CatSection {
  title: string;
  entries: CatEntry[];
}

const SECTIONS: CatSection[] = [
  {
    title: "Trigonometry",
    entries: [
      { type: "sin", result: "sin( )" },
      { type: "cos", result: "cos( )" },
      { type: "tan", result: "tan( )" },
      { type: "csc", result: "csc( )" },
      { type: "sec", result: "sec( )" },
      { type: "cot", result: "cot( )" },
    ],
  },
  {
    title: "Inverse Trigonometry",
    entries: [
      { type: "arcsin", result: "sin⁻¹( )" },
      { type: "arccos", result: "cos⁻¹( )" },
      { type: "arctan", result: "tan⁻¹( )" },
    ],
  },
  {
    title: "Hyperbolic",
    entries: [
      { type: "sinh", result: "sinh( )" },
      { type: "cosh", result: "cosh( )" },
      { type: "tanh", result: "tanh( )" },
    ],
  },
  {
    title: "Exponents & Logarithms",
    entries: [
      { type: "^", result: "xⁿ" },
      { type: "sqrt", result: "√ ‾" },
      { type: "nthroot", result: "ⁿ√ ‾" },
      { type: "ln", result: "ln( )" },
      { type: "log", result: "log( )" },
      { type: "exp", result: "exp( )" },
      { type: "e", result: "e" },
    ],
  },
  {
    title: "Number Theory",
    entries: [
      { type: "floor", result: "⌊ ⌋" },
      { type: "ceil", result: "⌈ ⌉" },
      { type: "round", result: "round( )" },
      { type: "sign", result: "sign( )" },
      { type: "|", result: "|x|" },
    ],
  },
  {
    title: "Constants",
    entries: [
      { type: "pi", result: "π" },
      { type: "tau", result: "τ" },
      { type: "theta", result: "θ" },
    ],
  },
];

export class CommandCatalogue {
  /** The panel element; insert into the DOM and toggle with the methods below. */
  readonly el: HTMLElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "cmd-cat";
    this.el.innerHTML = this.build();
  }

  toggle(): void {
    this.el.classList.toggle("open");
  }

  hide(): void {
    this.el.classList.remove("open");
  }

  get isOpen(): boolean {
    return this.el.classList.contains("open");
  }

  private build(): string {
    const sections = SECTIONS.map(
      (sec) => `
        <div class="cmd-section">${sec.title}</div>
        ${sec.entries
          .map(
            (e) => `
          <div class="cmd-row">
            <span class="cmd-type">${escapeHtml(e.type)}</span>
            <span class="cmd-arrow">→</span>
            <span class="cmd-res">${escapeHtml(e.result)}</span>
          </div>`,
          )
          .join("")}`,
    ).join("");

    return `
      <div class="cmd-cat-bar">
        <span class="cmd-cat-title">Type to insert</span>
      </div>
      <div class="cmd-cat-body">${sections}</div>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
