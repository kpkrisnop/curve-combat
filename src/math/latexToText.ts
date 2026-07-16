import { ComputeEngine } from "@cortex-js/compute-engine";

// One shared engine: parsing to a display string binds no symbols, so unlike
// evaluateAll (which needs a fresh engine per call) there is no state to leak.
let ce: ComputeEngine | null = null;

/**
 * Render MathQuill LaTeX as compact, readable ASCII for on-field labels
 * (ADR 0010) — e.g. `\frac{\sin(100x)}{1+\exp(...)}` → `sin(100x) / (e^(...) + 1)`.
 * Reuses the already-bundled Compute Engine; on any parse failure (including the
 * lenient ASCII a beginner may have pasted) it falls back to the raw LaTeX so a
 * label is never blank.
 */
export function latexToText(latex: string): string {
  const trimmed = latex.trim();
  if (trimmed === "") return "";
  try {
    ce ??= new ComputeEngine();
    const s = ce.parse(trimmed).toString();
    return s && s !== "Nothing" ? s : trimmed;
  } catch {
    return trimmed;
  }
}
