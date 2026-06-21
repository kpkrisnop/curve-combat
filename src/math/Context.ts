import {
  ComputeEngine,
  compile,
  type Expression,
} from "@cortex-js/compute-engine";

export type RowKind = "empty" | "curve" | "assignment" | "function-def" | "error";

export interface RowResult {
  kind: RowKind;
  fn?: (x: number) => number;
  name?: string;
  value?: number;
  error?: string | null;
}

const EMPTY: RowResult = { kind: "empty" };

// What a row is, determined purely from its LaTeX structure. Curve rows keep
// their raw LaTeX so they can be parsed LAST — only after every assignment and
// function definition has been bound into the engine. Parsing a curve before
// its referenced symbols exist boxes them as unknowns that a later assign()
// never reaches (Com­pute Engine canonicalises at parse time).
type Cls =
  | { t: "empty" }
  | { t: "assignment"; name: string; rhs: string }
  | { t: "function-def"; name: string; params: string[]; body: string }
  | { t: "curve"; latex: string }
  | { t: "error"; msg: string };

/**
 * Evaluate all rows together so that constants (a = 10) and user-defined
 * functions (f(x) = 2x) declared in any row are visible when compiling
 * curve expressions in other rows — the same behaviour Desmos uses.
 *
 * A fresh ComputeEngine is created per call so stale state never leaks
 * between evaluation cycles.
 */
export function evaluateAll(
  rows: { id: string; latex: string }[],
): Map<string, RowResult> {
  const ce = new ComputeEngine();
  const out = new Map<string, RowResult>();

  // Pass 1 — classify every row from its LaTeX (no curve parsing yet).
  const classified = rows.map((row) => ({
    id: row.id,
    cls: classifyLatex(row.latex?.trim() ?? ""),
  }));

  // Pass 2 — bind constants and function definitions into the engine, in
  // document order. (Cross-references between definitions resolve only when
  // the dependency appears earlier; full dependency ordering is out of scope.)
  for (const { cls } of classified) {
    if (cls.t === "assignment") {
      try {
        const n = Number(ce.parse(cls.rhs).N().valueOf());
        if (Number.isFinite(n)) ce.assign(cls.name, n);
      } catch { /* ignore unevaluable constants */ }
    } else if (cls.t === "function-def") {
      try {
        const paramList = cls.params.join(", ");
        // CE's documented form for user functions: "x \mapsto body".
        const lambda =
          cls.params.length === 1
            ? `${paramList} \\mapsto ${cls.body}`
            : `\\left(${paramList}\\right) \\mapsto ${cls.body}`;
        ce.assign(cls.name, ce.parse(lambda));
      } catch { /* ignore unparsable function bodies */ }
    }
  }

  // Pass 3 — now that the engine knows every symbol, parse & compile curves.
  for (const { id, cls } of classified) {
    switch (cls.t) {
      case "empty":
        out.set(id, EMPTY);
        break;
      case "assignment": {
        let value: number | undefined;
        try {
          const n = Number(ce.parse(cls.rhs).N().valueOf());
          if (Number.isFinite(n)) value = n;
        } catch { /* leave undefined */ }
        out.set(id, { kind: "assignment", name: cls.name, value });
        break;
      }
      case "function-def":
        out.set(id, { kind: "function-def", name: cls.name });
        break;
      case "curve":
        out.set(id, compileCurve(cls.latex, ce));
        break;
      case "error":
        out.set(id, { kind: "error", error: cls.msg });
        break;
    }
  }

  return out;
}

function classifyLatex(latex: string): Cls {
  if (!latex) return { t: "empty" };

  const eqIdx = latex.indexOf("=");

  // No '=' — a bare expression, plotted as y = expr.
  if (eqIdx < 0) return { t: "curve", latex };

  const lhs = latex.slice(0, eqIdx).trim();
  const rhs = latex.slice(eqIdx + 1).trim();

  // Function definition: f\left(x\right) = body  (MathLive's canonical form).
  // Also accept plain f(x) = body for robustness.
  const funcMatch =
    lhs.match(/^([a-z])\\left\(([\s\S]*?)\\right\)\s*$/) ??
    lhs.match(/^([a-z])\(([^)]*)\)\s*$/);
  if (funcMatch) {
    const params = funcMatch[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (params.length === 0)
      return { t: "error", msg: "Function needs at least one parameter" };
    return { t: "function-def", name: funcMatch[1], params, body: rhs };
  }

  // Single-letter LHS: y = curve, or <letter> = constant.
  const letterMatch = lhs.match(/^([a-zA-Z])\s*$/);
  if (letterMatch) {
    const name = letterMatch[1];
    if (name === "y" || name === "Y") return { t: "curve", latex: rhs };
    // Don't let the user shadow x (the independent variable).
    if (name !== "x" && name !== "X") return { t: "assignment", name, rhs };
  }

  // Anything else (e.g. x^2 = 4) — plot the right-hand side as a curve.
  return { t: "curve", latex: rhs };
}

// Probe points used to detect an all-NaN compiled function, which signals
// unresolved user-defined symbols. Spread across the real line.
const PROBE_XS = [1, -1, 2, Math.PI, -Math.E];

function compileCurve(latex: string, ce: ComputeEngine): RowResult {
  let expr: Expression;
  try {
    expr = ce.parse(latex);
  } catch (err) {
    return { kind: "curve", fn: () => NaN, error: (err as Error)?.message ?? "Invalid expression" };
  }

  // Mid-keystroke input ("sin(", "1/") parses to an invalid node. Bail quietly.
  if (!expr.isValid) return { kind: "curve", fn: () => NaN, error: null };

  // Fast path: compile to native JS. Works for built-in functions and
  // CE-assigned numeric constants — but not for user-defined functions
  // (compile() can't inline a symbol-table lambda; it throws "Unknown
  // operator `f`"). We detect that by probing and fall back to the engine.
  let fastFn: ((x: number) => number) | null = null;
  try {
    const result = compile(expr, { realOnly: true, fallback: false });
    if (typeof result.run === "function") {
      const run = result.run;
      fastFn = (x: number): number => {
        try {
          const r = run({ x });
          return typeof r === "number" && Number.isFinite(r) ? r : NaN;
        } catch {
          return NaN;
        }
      };
    }
  } catch { /* compile() threw — use the slow path below */ }

  if (fastFn && PROBE_XS.some((x) => Number.isFinite(fastFn!(x)))) {
    return { kind: "curve", fn: fastFn, error: null };
  }

  // Slow path: substitute x and numerically evaluate via the engine, so
  // user-defined functions and constants resolve.
  const slowFn = (x: number): number => {
    try {
      const n = Number(expr.subs({ x }).N().valueOf());
      return Number.isFinite(n) ? n : NaN;
    } catch {
      return NaN;
    }
  };
  return { kind: "curve", fn: slowFn, error: null };
}
