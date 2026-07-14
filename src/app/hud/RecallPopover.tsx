// Recall, Discord-slash-menu style: opens UPWARD over the input, newest shot
// first, tap to load it, tap-away or Escape to dismiss.
//
// This is the one thing allowed to cover the console: it is transient,
// player-initiated and self-dismissing — the sanctioned exception to the rule
// that the game never hides the arena or the console from you.
import { useEffect, useRef } from "react";

// History holds raw MathQuill LaTeX (`\sin\left(x\right)`), which is unreadable
// in a list. Strip it back to the way the player typed it.
//
// ponytail: display-only, not a parser — the real latex still goes to the engine
// untouched. If a shot ever renders wrong here, mount a MathQuill StaticMath per
// row instead (browser-only, so it'd need mocking in the jsdom tests).
// \frac/\sqrt groups can themselves contain braces (an exponent like `^{2}`),
// so a single `[^{}]*` can't match them — it stops at the first inner `}`.
// This group tolerates one level of nesting, and running the replace to a
// fixed point (below) lets deeper nesting resolve from the inside out.
const G = String.raw`((?:[^{}]|\{[^{}]*\})*)`;
const FRAC = new RegExp(String.raw`\\frac\{${G}\}\{${G}\}`, "g");
const SQRT = new RegExp(String.raw`\\sqrt\{${G}\}`, "g");

export function prettyLatex(latex: string): string {
  let s = latex
    .replace(/\\left|\\right/g, "")
    .replace(/\\operatorname\{([^{}]*)\}/g, "$1");

  for (let i = 0; i < 8; i++) {
    const next = s.replace(FRAC, "($1)/($2)").replace(SQRT, "√($1)");
    if (next === s) break;
    s = next;
  }

  return s
    .replace(/\\cdot/g, "·")
    .replace(/\\pi/g, "π")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/[{}]/g, "")
    // MathQuill emits a space purely to terminate a command (`\cdot x`) — it is
    // never meaningful in an equation, so drop all of it.
    .replace(/\s+/g, "");
}

interface Props {
  /** Newest first (hudStore.history[team] is already in this order). */
  history: string[];
  onPick: (latex: string) => void;
  onDismiss: () => void;
}

export function RecallPopover({ history, onPick, onDismiss }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    // Tap-away. Listening on pointerdown (not click) so it dismisses on the same
    // gesture every other key in this UI reacts to — the contains() guard is what
    // keeps a tap on an ITEM from being dismissed out from under its own click.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onDismiss]);

  return (
    <div className="recall" ref={ref} role="listbox" aria-label="Recall a past shot">
      {history.length === 0 ? (
        <div className="recall__empty">No shots yet this match</div>
      ) : (
        history.map((latex, i) => (
          <button
            key={`${i}-${latex}`}
            type="button"
            role="option"
            aria-selected={false}
            className="recall__item"
            // Same reason as every keypad key: a button tap would steal focus from
            // MathQuill's hidden textarea and drop the caret.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onPick(latex)}
          >
            <span className="recall__eq">{prettyLatex(latex)}</span>
            {i === 0 && <span className="recall__tag">last shot</span>}
          </button>
        ))
      )}
    </div>
  );
}
