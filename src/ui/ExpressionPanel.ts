import { MathfieldElement } from "mathlive";
import { evaluateAll, type RowKind } from "../math/Context";
import type { PlotItem } from "../graph/GraphRenderer";

// Desmos-ish palette.
const COLORS = [0xc74440, 0x2d70b3, 0x388c46, 0xfa7e19, 0x6042a6, 0x000000];

let nextId = 0;

interface Row {
  id: string;
  el: HTMLElement;
  field: MathfieldElement;
  numberEl: HTMLElement;
  swatchEl: HTMLButtonElement;
  badgeEl: HTMLSpanElement;
  color: number;
  visible: boolean;
  kind: RowKind;
  fn: (x: number) => number;
}

/**
 * The left-hand list of MathLive expression rows, styled to feel like Desmos.
 *
 * All rows are evaluated together on every change so that constants
 * (a = 10) and user-defined functions (f(x) = 2x) declared in any row
 * are visible to curve expressions in other rows.
 */
export class ExpressionPanel {
  private rows: Row[] = [];

  constructor(
    private container: HTMLElement,
    private onChange: (plots: PlotItem[]) => void,
  ) {}

  addRow(initial = "") {
    const id = String(nextId++);
    const color = COLORS[this.rows.length % COLORS.length];

    const rowEl = document.createElement("div");
    rowEl.className = "expr-row";

    const numberEl = document.createElement("div");
    numberEl.className = "expr-num";

    // Coloured dot — shown for curve rows.
    const swatchEl = document.createElement("button");
    swatchEl.className = "swatch";
    swatchEl.style.background = toCss(color);
    swatchEl.title = "Show / hide";

    // Text badge ("=" / "ƒ") — shown for non-curve rows instead of the swatch.
    const badgeEl = document.createElement("span");
    badgeEl.className = "row-badge";
    badgeEl.hidden = true;

    const field = new MathfieldElement();
    field.className = "mf";
    field.mathVirtualKeyboardPolicy = "manual";
    field.value = initial;

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = "Remove";

    rowEl.append(numberEl, swatchEl, badgeEl, field, remove);
    this.container.append(rowEl);

    const rowObj: Row = {
      id,
      el: rowEl,
      field,
      numberEl,
      swatchEl,
      badgeEl,
      color,
      visible: true,
      kind: "empty",
      fn: () => NaN,
    };

    field.addEventListener("input", () => this.recomputeAll());

    // Enter creates a new expression row (Desmos behaviour). Capture the
    // keydown before MathLive consumes it.
    field.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          this.addRow();
        }
      },
      true,
    );

    swatchEl.addEventListener("click", () => {
      rowObj.visible = !rowObj.visible;
      swatchEl.classList.toggle("off", !rowObj.visible);
      this.emit();
    });

    remove.addEventListener("click", () => {
      this.rows = this.rows.filter((r) => r !== rowObj);
      rowEl.remove();
      this.renumber();
      this.recomputeAll();
    });

    this.rows.push(rowObj);
    this.renumber();
    this.recomputeAll();
    field.focus();
  }

  /** Focus the last row's field (used when summoning the virtual keyboard). */
  focusLast() {
    const last = this.rows[this.rows.length - 1];
    if (last) last.field.focus();
  }

  private recomputeAll() {
    const input = this.rows.map((r) => ({ id: r.id, latex: r.field.value }));
    const results = evaluateAll(input);

    for (const row of this.rows) {
      const result = results.get(row.id);
      if (!result) continue;

      row.kind = result.kind;

      const isCurve = result.kind === "curve";

      // Swap between the coloured swatch (curves) and the text badge (definitions).
      row.swatchEl.hidden = !isCurve;
      row.badgeEl.hidden = isCurve || result.kind === "empty" || result.kind === "error";

      if (result.kind === "assignment") {
        row.badgeEl.textContent = "=";
        row.badgeEl.title =
          result.name != null
            ? `${result.name} = ${result.value ?? "?"}`
            : "constant";
      } else if (result.kind === "function-def") {
        row.badgeEl.textContent = "ƒ";
        row.badgeEl.title = result.name ? `function: ${result.name}` : "function";
      }

      if (isCurve) {
        row.fn = result.fn ?? (() => NaN);
        row.el.classList.toggle("has-error", Boolean(result.error));
      } else {
        row.fn = () => NaN;
        row.el.classList.remove("has-error");
      }
    }

    this.emit();
  }

  private renumber() {
    this.rows.forEach((r, i) => {
      r.numberEl.textContent = String(i + 1);
    });
  }

  private emit() {
    const plots: PlotItem[] = this.rows
      .filter((r) => r.kind === "curve" && r.visible)
      .map((r) => ({ fn: r.fn, color: r.color, visible: true }));
    this.onChange(plots);
  }
}

function toCss(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}
