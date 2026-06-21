import "./styles.css";
import { MathfieldElement } from "mathlive";
import { GraphRenderer } from "./graph/GraphRenderer";
import { ExpressionPanel } from "./ui/ExpressionPanel";
import { installDesmosKeyboard } from "./ui/keyboard";

// Serve MathLive's math fonts from /public so glyphs render crisply, and
// disable keypress sounds (avoids 404s for the optional sound assets).
MathfieldElement.fontsDirectory = "/mathlive/fonts";
MathfieldElement.soundsDirectory = null;

// Replace MathLive's busy default keyboard with a trimmed Desmos-style one.
installDesmosKeyboard();

const stage = document.getElementById("stage")!;
const list = document.getElementById("expr-list")!;
const addBtn = document.getElementById("add-expr")!;
const kbToggle = document.getElementById("kb-toggle")!;

const renderer = new GraphRenderer();
await renderer.init(stage);

const panel = new ExpressionPanel(list, (plots) => renderer.setPlots(plots));
addBtn.addEventListener("click", () => panel.addRow());

// A single keyboard toggle lives at the bottom of the sidebar (Desmos-style),
// instead of an icon inside every expression row.
const vk = (globalThis as unknown as { mathVirtualKeyboard: { visible: boolean; show(): void; hide(): void } })
  .mathVirtualKeyboard;
kbToggle.addEventListener("click", () => {
  if (vk.visible) {
    vk.hide();
  } else {
    panel.focusLast();
    vk.show();
  }
});

// Seed with a couple of expressions so the canvas isn't empty on first load.
panel.addRow("\\sin(x)");
panel.addRow("\\frac{x^2}{8}-3");
