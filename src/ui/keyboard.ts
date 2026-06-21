// A Desmos-style virtual keyboard for MathLive.
//
// Desmos keeps the main keyboard intentionally small and hides everything else
// behind two buttons:
//   - "functions" opens a scrollable, categorised catalogue of functions.
//   - "ABC" opens a full QWERTY alphabetic keyboard (with shift).
//
// We reproduce that with a single custom layout that has several layers:
//   main      - numbers, operators, common keys
//   functions - a markup layer rendered as a scrolling catalogue (see below)
//   lower      - qwerty letters (lowercase)
//   upper      - qwerty letters (uppercase), reached via the shift key
// Layers switch via keycaps carrying a `layer` property (rows) or a
// `data-command='["switchKeyboardLayer", "<id>"]'` attribute (markup).

type Keycap = Record<string, unknown>;

const SEP: Keycap = { class: "separator w5" };
const ACTION = "action";

/* ------------------------------------------------------------------ main --- */

const main = {
  id: "main",
  rows: [
    [
      { latex: "x" },
      { latex: "y" },
      { class: "small", latex: "a^2", insert: "#@^{2}", tooltip: "square" },
      { class: "small", latex: "a^b", insert: "#@^{#?}", tooltip: "power" },
      SEP,
      "7",
      "8",
      "9",
      { label: "÷", insert: "\\frac{#@}{#?}", tooltip: "fraction" },
      SEP,
      { class: ACTION, label: "functions", command: ["switchKeyboardLayer", "functions"], width: 2 },
    ],
    [
      { latex: "(" },
      { latex: ")" },
      { latex: "<" },
      { latex: ">" },
      SEP,
      "4",
      "5",
      "6",
      { latex: "\\times" },
      SEP,
      { class: ACTION, command: ["performWithFeedback", "moveToPreviousChar"], label: "◀" },
      { class: ACTION, command: ["performWithFeedback", "moveToNextChar"], label: "▶" },
    ],
    [
      { latex: "|a|", insert: "\\left|#?\\right|", tooltip: "absolute value" },
      { latex: "," },
      { latex: "\\le" },
      { latex: "\\ge" },
      SEP,
      "1",
      "2",
      "3",
      { latex: "-" },
      SEP,
      { class: ACTION, command: ["performWithFeedback", "deleteBackward"], label: "⌫", width: 2 },
    ],
    [
      { class: ACTION, label: "ABC", command: ["switchKeyboardLayer", "lower"] },
      { latex: "\\sqrt{#0}", insert: "\\sqrt{#?}", tooltip: "square root" },
      { latex: "\\pi" },
      { latex: "e" },
      SEP,
      "0",
      ".",
      { latex: "=" },
      { latex: "+" },
      SEP,
      { class: ACTION, label: "↵", width: 2, command: ["performWithFeedback", "hideVirtualKeyboard"] },
    ],
  ],
};

/* ------------------------------------------------------ functions catalogue --- */

// [labelHTML, latexToInsert]
type Fn = [string, string];

const CATALOG: { title: string; items: Fn[] }[] = [
  {
    title: "Trigonometry",
    items: [
      ["sin", "\\sin\\left(#?\\right)"],
      ["cos", "\\cos\\left(#?\\right)"],
      ["tan", "\\tan\\left(#?\\right)"],
      ["csc", "\\csc\\left(#?\\right)"],
      ["sec", "\\sec\\left(#?\\right)"],
      ["cot", "\\cot\\left(#?\\right)"],
    ],
  },
  {
    title: "Inverse Trigonometry",
    items: [
      ["sin<sup>-1</sup>", "\\sin^{-1}\\left(#?\\right)"],
      ["cos<sup>-1</sup>", "\\cos^{-1}\\left(#?\\right)"],
      ["tan<sup>-1</sup>", "\\tan^{-1}\\left(#?\\right)"],
      ["csc<sup>-1</sup>", "\\csc^{-1}\\left(#?\\right)"],
      ["sec<sup>-1</sup>", "\\sec^{-1}\\left(#?\\right)"],
      ["cot<sup>-1</sup>", "\\cot^{-1}\\left(#?\\right)"],
    ],
  },
  {
    title: "Hyperbolic",
    items: [
      ["sinh", "\\sinh\\left(#?\\right)"],
      ["cosh", "\\cosh\\left(#?\\right)"],
      ["tanh", "\\tanh\\left(#?\\right)"],
    ],
  },
  {
    title: "Exponents & Logarithms",
    items: [
      ["e<sup>x</sup>", "e^{#?}"],
      ["a<sup>b</sup>", "#@^{#?}"],
      ["ln", "\\ln\\left(#?\\right)"],
      ["log", "\\log\\left(#?\\right)"],
      ["log<sub>b</sub>", "\\log_{#?}\\left(#?\\right)"],
      ["√", "\\sqrt{#?}"],
      ["ⁿ√", "\\sqrt[#?]{#?}"],
      ["|a|", "\\left|#?\\right|"],
    ],
  },
  {
    title: "Number Theory",
    items: [
      ["floor", "\\lfloor#?\\rfloor"],
      ["ceil", "\\lceil#?\\rceil"],
      ["round", "\\operatorname{round}\\left(#?\\right)"],
      ["sign", "\\operatorname{sign}\\left(#?\\right)"],
    ],
  },
  {
    title: "Constants",
    items: [
      ["π", "\\pi"],
      ["e", "e"],
      ["τ", "\\tau"],
    ],
  },
];

function buildCatalog(): string {
  const sections = CATALOG.map(
    (sec) => `
      <div class="gw-cat-section">${sec.title}</div>
      <div class="gw-cat-grid">
        ${sec.items
          .map(([label, insert]) => `<div class="fnbutton" data-insert="${insert}">${label}</div>`)
          .join("")}
      </div>`,
  ).join("");

  return `
    <div class="gw-cat">
      <div class="gw-cat-bar">
        <div class="MLK__keycap action gw-cat-back" data-command='["switchKeyboardLayer", "main"]'>‹ Back</div>
        <span class="gw-cat-title">Functions</span>
        <div class="MLK__keycap action gw-cat-back" data-command='["switchKeyboardLayer", "lower"]'>ABC</div>
      </div>
      <div class="gw-cat-body">${sections}</div>
    </div>`;
}

const functions = { id: "functions", markup: buildCatalog() };

/* ----------------------------------------------------------- alphabetic --- */

const lettersLower = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const row = (s: string): Keycap[] => s.split("").map((c) => ({ latex: c }));

// The bottom symbol row, shared between the upper and lower letter layers.
const symbolRow: Keycap[] = [
  { class: ACTION, label: "123", command: ["switchKeyboardLayer", "main"], width: 1.5 },
  { class: "small", latex: "a^b", insert: "#@^{#?}" },
  { latex: "!" },
  { latex: "[\\,]", insert: "\\left[#?\\right]" },
  { latex: "\\lbrace\\rbrace", insert: "\\lbrace#?\\rbrace" },
  { latex: ":" },
  { latex: "," },
  { class: ACTION, label: "↵", width: 1.5, command: ["performWithFeedback", "hideVirtualKeyboard"] },
];

const lower = {
  id: "lower",
  rows: [
    [...row(lettersLower[0])],
    [...row(lettersLower[1]), { latex: "\\theta" }],
    [
      { class: "shift", label: "⇧", command: ["switchKeyboardLayer", "upper"], width: 1.5 },
      ...row(lettersLower[2]),
      { class: ACTION, command: ["performWithFeedback", "deleteBackward"], label: "⌫", width: 1.5 },
    ],
    symbolRow,
  ],
};

const upper = {
  id: "upper",
  rows: [
    [...row(lettersLower[0].toUpperCase())],
    [...row(lettersLower[1].toUpperCase()), { latex: "\\tau" }],
    [
      { class: "shift", label: "⇧", command: ["switchKeyboardLayer", "lower"], width: 1.5 },
      ...row(lettersLower[2].toUpperCase()),
      { class: ACTION, command: ["performWithFeedback", "deleteBackward"], label: "⌫", width: 1.5 },
    ],
    symbolRow,
  ],
};

export function installDesmosKeyboard(): void {
  const vk = (globalThis as unknown as { mathVirtualKeyboard: { layouts: unknown } })
    .mathVirtualKeyboard;
  vk.layouts = [
    {
      label: "Graph War",
      displayEditToolbar: false,
      layers: [main, functions, lower, upper],
    },
  ];
}
