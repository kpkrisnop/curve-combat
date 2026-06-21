import { ComputeEngine, compile } from "@cortex-js/compute-engine";

// A single shared engine. The Compute Engine parses the LaTeX that MathLive
// emits directly, so there is no fragile LaTeX -> text translation step.
const ce = new ComputeEngine();

export interface CompiledExpression {
  /** Evaluates the function at x. Returns NaN for undefined / non-real points. */
  fn: (x: number) => number;
  /** Human-readable parse error, or null when the expression is valid. */
  error: string | null;
}

const EMPTY: CompiledExpression = { fn: () => NaN, error: null };

/**
 * Turn a LaTeX string (as produced by MathLive) into a sampleable function
 * y = f(x). The simulation/render layers only ever see the resulting
 * `(x) => number` closure — they never touch LaTeX or the Compute Engine.
 */
export function compileExpression(latex: string): CompiledExpression {
  if (!latex || !latex.trim()) return EMPTY;

  // Allow people to write "y = ..." or "f(x) = ..." out of habit.
  const cleaned = latex
    .replace(/^\s*y\s*=/, "")
    .replace(/^\s*f\s*\\?\(\s*x\s*\\?\)\s*=/, "")
    .trim();
  if (!cleaned) return EMPTY;

  try {
    const expr = ce.parse(cleaned);

    // While the user is mid-keystroke the expression is often incomplete
    // (e.g. "sin(", "1/"). Those parse to nodes containing Error(...) and are
    // not `isValid`. Bail out quietly: don't compile (which logs noisy
    // "Compilation fallback" warnings) and don't flag it as a user error.
    if (!expr.isValid) {
      return { fn: () => NaN, error: null };
    }

    // fallback:false makes compile() throw instead of logging+falling back to
    // interpretation, so any failure surfaces through our own catch quietly.
    const result = compile(expr, { realOnly: true, fallback: false });
    const run = result.run;

    if (typeof run !== "function") {
      return { fn: () => NaN, error: "Could not interpret expression" };
    }

    const fn = (x: number): number => {
      try {
        const r = run({ x });
        return typeof r === "number" && Number.isFinite(r) ? r : NaN;
      } catch {
        return NaN;
      }
    };

    // Smoke-test once so obviously broken input surfaces as an error now.
    fn(0);
    return { fn, error: null };
  } catch (err) {
    return { fn: () => NaN, error: (err as Error)?.message ?? "Invalid expression" };
  }
}
