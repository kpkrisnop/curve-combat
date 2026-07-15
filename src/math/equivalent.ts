import { evaluateAll } from "./Context";

// Sample points for the equivalence check. Spread across the real line and
// deliberately non-integer/irrational so we probe generic behaviour rather than
// landing only on nice roots. Avoid obvious singularities.
const SAMPLE_XS = [-3.3, -1.7, -0.5, 0.42, 1.1, 2.6, 5.25, 8.9];
const REL_TOL = 1e-9;

function compileCurve(latex: string): (x: number) => number {
  const res = evaluateAll([{ id: "probe", latex }]).get("probe");
  return res?.fn ?? (() => NaN);
}

/**
 * Do two curve expressions compute the same y = f(x)? Used to guard "Format":
 * we only swap the field to the structured LaTeX when it fires the identical
 * shot, so restructuring can never silently change the math (e.g. typedText
 * turning `x/2-1` into `x/(2-1)`). Same NaN pattern counts as equal — an
 * expression that was undefined stays undefined.
 */
export function curvesEquivalent(a: string, b: string): boolean {
  const fa = compileCurve(a);
  const fb = compileCurve(b);
  return SAMPLE_XS.every((x) => {
    const ya = fa(x);
    const yb = fb(x);
    const na = Number.isNaN(ya);
    const nb = Number.isNaN(yb);
    if (na || nb) return na && nb; // both undefined here, or reject
    return Math.abs(ya - yb) <= REL_TOL * Math.max(1, Math.abs(ya), Math.abs(yb));
  });
}
