// Pure helpers behind the "Format" action. No MathQuill/DOM here so they run in
// Node and stay unit-testable — MathInput does the actual structuring.
//
// Background (verified live in the browser): pasting ASCII math into the
// MathQuill field leaves it FLAT — MathQuill applies only autoOperatorNames
// (`sin`→`\sin`, `exp`→`\exp`), so `/`, `*`, `^`, `sqrt` and parens stay literal
// ASCII. A structured field never contains a literal `/` or `*` (it uses `\frac`
// and `\cdot`), which is what makes both functions below cheap and reliable.

/**
 * True when the field holds raw ASCII that structuring would change — a literal
 * `/` or `*`, or a bare `^` (a real superscript is `^{...}`). Advisory only: it
 * drives the "needs formatting" hint. Format itself is always available.
 */
export function needsFormatting(latex: string): boolean {
  return /[/*]/.test(latex) || /\^(?!\{)/.test(latex);
}

/**
 * Recover the typedText-able ASCII from the field's LaTeX, so it can be replayed
 * key-by-key (MathQuill structures `/`→fraction, `^`→superscript, etc. as it
 * "types"). Deliberately handles only the small token set MathQuill emits for
 * flat/pasted input — the caller guards the result against the compiled curve
 * and discards it if the math changed, so an incomplete recovery is safe, never
 * wrong. ponytail: minimal reverse-map, not a LaTeX parser; the guard is the net.
 */
export function latexToTyped(latex: string): string {
  return latex
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\cdot/g, "*")
    .replace(/\\operatorname\{([^}]*)\}/g, "$1")
    .replace(/\\([a-zA-Z]+)/g, "$1");
}
