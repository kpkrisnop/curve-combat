import "./styles.css";
import { GraphRenderer } from "./graph/GraphRenderer";
import { ExpressionPanel } from "./ui/ExpressionPanel";
import { CommandCatalogue } from "./ui/CommandCatalogue";

const stage = document.getElementById("stage")!;
const list = document.getElementById("expr-list")!;
const addBtn = document.getElementById("add-expr")!;
const cmdToggle = document.getElementById("cmd-toggle")!;
const sidebar = document.getElementById("sidebar")!;

const renderer = new GraphRenderer();
await renderer.init(stage);

const panel = new ExpressionPanel(list, (plots) => renderer.setPlots(plots));
addBtn.addEventListener("click", () => panel.addRow());

// The footer button opens a read-only catalogue of typeable commands
// (functions, constants) — the discoverability replacement for the old
// on-screen keyboard. Input itself comes entirely from typing into MathQuill.
const catalogue = new CommandCatalogue();
sidebar.appendChild(catalogue.el);
cmdToggle.addEventListener("click", () => catalogue.toggle());

// Seed with a couple of expressions so the canvas isn't empty on first load.
panel.addRow("\\sin(x)");
panel.addRow("\\frac{x^2}{8}-3");
