# Touch Keypad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native OS keyboard with an always-on in-footer math keypad, so the game is playable on iPad without anything covering the arena.

**Architecture:** `inputmode="none"` (already shipped, `52fecc2`) means no OS keyboard ever opens, on any device — so the keypad is unconditional and there is **no device detection anywhere**. A new pure `Keypad` component renders the keys; `FiringConsole` owns the wiring and routes every key to the active team's registered `MathInput` through the existing `hudInputs` registry — the same mechanism the function chip row already uses. The chip row is absorbed and deleted. The keypad fills the footer, so Quit is evicted to a floating `[✕]` on the map card.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library, MathQuill (`@edtr-io/mathquill`) behind the `src/ui/MathInput.ts` adapter, plain CSS with design tokens.

**Spec:** `docs/superpowers/specs/2026-07-13-touch-keypad-design.md` — read it first.

**Prototype (the frozen layout):** `src/app/hud/PROTOTYPE-keypad.html` — open it in a browser and look at it before writing CSS. Delete it in the final task. *(Shipped: the prototype was deleted in Task 9; the layout now lives in `src/app/hud/hud.css`.)*

## Global Constraints

- **No device detection.** No `matchMedia`, no `pointer:coarse`, no UA sniffing, anywhere in this work. The keypad is present on every device and `inputmode="none"` is unconditional. A previous fix failed on exactly this axis (`90b2d52`, reverted in `229cab8`).
- **The keypad is always open** — not a toggle, not touch-only.
- **Keys must not steal focus.** A `<button>` tap blurs MathQuill's textarea. Every key calls `preventDefault()` on `pointerdown`. This is the top implementation risk: get it wrong and every key visibly breaks the caret.
- **TDD.** Failing test first, colocated `*.test.tsx`, Vitest + Testing Library.
- **`sim/` stays Node-safe.** Nothing in this plan touches it.
- **Full suite is flaky under parallel load** on this cloud-synced filesystem (see CLAUDE.md). Before treating a failure as a regression, re-run that file alone: `npx vitest run <path>`.
- **Verify in a real browser, not just Vitest.** Every bug class in this work (focus, caret, layout, touch targets) is invisible to jsdom.
- Commit after every task.

## File Structure

**Create:**
- `src/app/hud/Keypad.tsx` — pure, prop-driven key grid. Knows nothing about MathQuill, teams, or turns. Emits `onKey(key)`.
- `src/app/hud/Keypad.test.tsx`
- `src/app/hud/keypadKeys.ts` — the key model (the data: which keys exist, what each one does). Separated from the component so the model is testable and the component stays presentational.
- `src/app/hud/RecallPopover.tsx` + test — Task 8, independent of the rest.

**Modify:**
- `src/ui/MathInput.ts` + `src/mathquill.d.ts` — add a `keystroke()` passthrough (arrows, backspace).
- `src/app/hud/hudStore.ts` — add `keystroke` to `HudInputHandle`.
- `src/app/hud/FiringConsole.tsx` — absorb the chip row into the keypad; handle `noTurn`; own the recall popover.
- `src/app/hud/HudBar.tsx` — always render `FiringConsole`; **delete `PlayerPanel`**.
- `src/app/hud/Footer.tsx` — Quit moves out.
- `src/app/arena/ArenaStage.tsx` — Quit moves in (floating `[✕]`).
- `src/app/screens/ConfigPanel.tsx` — disable simultaneous fire for local.
- `src/app/hud/hud.css`, `src/app/theme.css` — the layout.

**Delete:** `PlayerPanel` + `.hud-bar` / `.player-panel` CSS, `CHIP_GROUPS` + `.hud-console__chiprow`, `.footer-quit` CSS, `PROTOTYPE-keypad.html`.

---

### Task 1: `MathInput.keystroke()` — the passthrough for non-text keys

Arrows and Backspace aren't text, so `insertText()` can't express them. MathQuill has `.keystroke("Left" | "Right" | "Backspace")`; our ambient types don't declare it and the adapter doesn't expose it.

**Why arrows are mandatory:** with `supSubsRequireOperand`, the only way *out* of an exponent is Right. Type `x^2` from a key and without an arrow you are stuck inside the superscript forever.

**Files:**
- Modify: `src/mathquill.d.ts`
- Modify: `src/ui/MathInput.ts`
- Modify: `src/app/hud/hudStore.ts` (the `HudInputHandle` interface)
- Test: `src/ui/MathInput.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MathInput.keystroke(keys: string): void`, and `HudInputHandle.keystroke(keys: string): void`. Task 3 calls this for `←`, `→`, `⌫`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/MathInput.test.ts`:

```ts
describe("MathInput.keystroke", () => {
  it("sends Backspace to the field, deleting one character (not the whole equation)", () => {
    const input = new MathInput();
    document.body.appendChild(input.el);
    input.insertText("12");
    input.keystroke("Backspace");
    expect(input.getLatex()).toBe("1");
  });

  it("Right escapes a superscript, so typing continues at the top level", () => {
    const input = new MathInput();
    document.body.appendChild(input.el);
    input.insertText("x^2");      // cursor is INSIDE the superscript
    input.keystroke("Right");     // the only way out
    input.insertText("+1");
    expect(input.getLatex()).toContain("+1");
    expect(input.getLatex()).not.toMatch(/\^\{2\+1\}/); // the +1 must NOT be in the exponent
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/ui/MathInput.test.ts`
Expected: FAIL — `input.keystroke is not a function`.

- [ ] **Step 3: Declare `keystroke` on the ambient type**

In `src/mathquill.d.ts`, inside `interface MQMathField`, after `typedText`:

```ts
  /** Send a raw keystroke ("Left", "Right", "Backspace") — the keypad's non-text keys. */
  keystroke(keys: string): MQMathField;
```

- [ ] **Step 4: Add the adapter method**

In `src/ui/MathInput.ts`, after `insertText()`:

```ts
  /**
   * Send a non-text key (arrows, Backspace). `insertText` can't express these:
   * they move or delete rather than typing. Refocuses for the same reason
   * insertText does — the key that triggered this was a <button>, and the tap
   * blurred the field.
   */
  keystroke(keys: string): void {
    this.mq.keystroke(keys);
    this.mq.focus();
    this.syncPlaceholder();
  }
```

- [ ] **Step 5: Widen the handle interface**

In `src/app/hud/hudStore.ts`, in `interface HudInputHandle`, after `insertText`:

```ts
  /** Send a non-text key: "Left", "Right", "Backspace" (keypad nav keys). */
  keystroke(chars: string): void;
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx vitest run src/ui/MathInput.test.ts && npx tsc --noEmit`
Expected: PASS, and typecheck clean.

If `tsc` now fails in `FiringConsole.test.tsx` or `MathField.test.tsx` because their fake inputs don't implement `keystroke`, add `keystroke: vi.fn()` (or `keystroke() {}`) to those fakes. That is the correct fix — the fakes must satisfy the interface.

- [ ] **Step 7: Commit**

```bash
git add src/mathquill.d.ts src/ui/MathInput.ts src/ui/MathInput.test.ts src/app/hud/hudStore.ts
git commit -m "feat(input): MathInput.keystroke() for the keypad's arrows and backspace"
```

---

### Task 2: The key model + the `Keypad` component

**Files:**
- Create: `src/app/hud/keypadKeys.ts`
- Create: `src/app/hud/Keypad.tsx`
- Create: `src/app/hud/Keypad.test.tsx`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  ```ts
  type KeyAction =
    | { kind: "insert"; text: string }        // typed into the field
    | { kind: "keystroke"; keys: string }     // Left / Right / Backspace
    | { kind: "action"; name: "clear" | "recall" };
  interface KeyDef { label: string; action: KeyAction; className?: string; }
  const NUM_KEYS: KeyDef[]; const OP_KEYS: KeyDef[]; const NAV_KEYS: KeyDef[];
  const FN_KEYS: KeyDef[];  // common 12 first, then the exotic tail
  function Keypad(props: { disabled: boolean; onKey: (a: KeyAction) => void }): JSX.Element;
  ```
  Task 3 consumes `Keypad` and `KeyAction`.

  **`Keypad` renders three zones only: numbers, operators, functions.** The nav
  keys (`NAV_KEYS`: arrows, Backspace, Clear, Recall) live in the *console
  column* next to Fire — `FiringConsole` renders them (Task 3). `keypadKeys.ts`
  owns the data for both; `Keypad` is not their renderer. There is no `fire` key
  action: Fire is a real button that calls `hudController.requestFire`.

- [ ] **Step 1: Write the failing test**

Create `src/app/hud/Keypad.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Keypad } from "./Keypad";

describe("Keypad", () => {
  it("emits an insert action for a digit", async () => {
    const onKey = vi.fn();
    render(<Keypad disabled={false} onKey={onKey} />);
    await userEvent.click(screen.getByRole("button", { name: "7" }));
    expect(onKey).toHaveBeenCalledWith({ kind: "insert", text: "7" });
  });

  it("emits the LaTeX text, not the label, for a function key", async () => {
    const onKey = vi.fn();
    render(<Keypad disabled={false} onKey={onKey} />);
    await userEvent.click(screen.getByRole("button", { name: "sin" }));
    expect(onKey).toHaveBeenCalledWith({ kind: "insert", text: "sin(" });
  });

  it("emits `x` as a variable, never as a multiply sign", async () => {
    const onKey = vi.fn();
    render(<Keypad disabled={false} onKey={onKey} />);
    await userEvent.click(screen.getByRole("button", { name: "x" }));
    expect(onKey).toHaveBeenCalledWith({ kind: "insert", text: "x" });
  });

  it("disables every key while disabled (not your turn / shot in flight)", () => {
    render(<Keypad disabled onKey={vi.fn()} />);
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("prevents default on pointerdown so a key tap never blurs the math field", () => {
    render(<Keypad disabled={false} onKey={vi.fn()} />);
    const ev = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "7" }).dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/app/hud/Keypad.test.tsx`
Expected: FAIL — cannot resolve `./Keypad`.

- [ ] **Step 3: Write the key model**

Create `src/app/hud/keypadKeys.ts`:

```ts
// The keypad's data. Separated from the component so the model is testable and
// the component stays purely presentational.
//
// Layout frozen in the prototype (src/app/hud/PROTOTYPE-keypad.html) and
// recorded in docs/superpowers/specs/2026-07-13-touch-keypad-design.md.

export type KeyAction =
  | { kind: "insert"; text: string }
  | { kind: "keystroke"; keys: string }
  | { kind: "action"; name: "clear" | "recall" };

export interface KeyDef {
  /** What the player sees. Also the accessible name. */
  label: string;
  action: KeyAction;
  className?: string;
}

const ins = (label: string, text = label): KeyDef => ({ label, action: { kind: "insert", text } });

/** Calculator order — 0 on the BOTTOM row, where every keypad on earth puts it.
 *  `x` is the most-typed symbol in the game and gets its own styling: it must
 *  never be mistaken for `×`. */
export const NUM_KEYS: KeyDef[] = [
  ins("7"), ins("8"), ins("9"),
  ins("4"), ins("5"), ins("6"),
  ins("1"), ins("2"), ins("3"),
  ins("0"), ins("."), { label: "x", action: { kind: "insert", text: "x" }, className: "is-var" },
];

/** MathQuill turns "*" into ×  and "/" into a fraction — the same chars a
 *  desktop player types, so the keypad and the keyboard produce identical LaTeX. */
export const OP_KEYS: KeyDef[] = [
  ins("+"), ins("−", "-"),
  ins("×", "*"), ins("÷", "/"),
  ins("("), ins(")"),
  ins("^"), ins("√", "sqrt"),
];

export const NAV_KEYS: KeyDef[] = [
  { label: "←", action: { kind: "keystroke", keys: "Left" } },
  { label: "→", action: { kind: "keystroke", keys: "Right" } },
  { label: "Backspace", action: { kind: "keystroke", keys: "Backspace" } },
  { label: "Clear", action: { kind: "action", name: "clear" } },
  { label: "Recall", action: { kind: "action", name: "recall" } },
];

/** The common twelve come FIRST — they must clear the panel's fold. Everything
 *  after them is the exotic tail you scroll to. Every name here is one MathQuill
 *  already knows via autoOperatorNames (see src/ui/MathInput.ts CONFIG). */
export const FN_KEYS: KeyDef[] = [
  ins("sin", "sin("), ins("cos", "cos("), ins("tan", "tan("), ins("√", "sqrt"),
  ins("ln", "ln("), ins("log", "log_"), ins("x²", "x^2"), ins("xⁿ", "^"),
  ins("π", "pi"), ins("e", "e"), ins("abs", "abs("), ins("1/a", "/"),
  ins("arcsin", "arcsin("), ins("arccos", "arccos("), ins("arctan", "arctan("),
  ins("sinh", "sinh("), ins("cosh", "cosh("), ins("tanh", "tanh("),
  ins("exp", "exp("), ins("floor", "floor("), ins("ceil", "ceil("),
  ins("round", "round("), ins("sign", "sign("), ins("cot", "cot("),
];
```

- [ ] **Step 4: Write the component**

Create `src/app/hud/Keypad.tsx`:

```tsx
// The on-screen math keypad. Pure and prop-driven: it knows nothing about
// MathQuill, teams, or turns — it renders keys and emits what was pressed.
// FiringConsole owns the routing.
//
// Replaces the native OS keyboard entirely (MathInput sets inputmode="none", so
// no keyboard opens on any device). It is therefore ALWAYS present — there is no
// touch/desktop fork and no device detection.
import { NUM_KEYS, OP_KEYS, NAV_KEYS, FN_KEYS, type KeyAction, type KeyDef } from "./keypadKeys";

interface Props {
  /** Not your turn, or a shot is in flight. */
  disabled: boolean;
  onKey: (action: KeyAction) => void;
}

function Key({ def, disabled, onKey }: { def: KeyDef; disabled: boolean; onKey: Props["onKey"] }) {
  return (
    <button
      type="button"
      className={`keypad__key ${def.className ?? ""}`}
      disabled={disabled}
      // A <button> tap steals focus from MathQuill's textarea, which drops the
      // caret. Suppressing the default pointerdown keeps focus in the field, so
      // the caret never blinks out from under the player.
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onKey(def.action)}
    >
      {def.label}
    </button>
  );
}

export function Keypad({ disabled, onKey }: Props) {
  const render = (defs: KeyDef[]) =>
    defs.map((d) => <Key key={d.label} def={d} disabled={disabled} onKey={onKey} />);

  return (
    <>
      <div className="keypad__zone keypad__nums">{render(NUM_KEYS)}</div>
      <div className="keypad__zone keypad__ops">{render(OP_KEYS)}</div>
      {/* The common twelve sit above the fold; the fade means "more below".
          See hud.css — the panel is absolutely positioned so it contributes no
          height, or it would grow the footer instead of scrolling. */}
      <div className="keypad__zone keypad__fnzone">
        <div className="keypad__fnpanel">
          <div className="keypad__fns">{render(FN_KEYS)}</div>
        </div>
      </div>
    </>
  );
}

export { NAV_KEYS };
```

Note: `NAV_KEYS` is rendered by `FiringConsole` (it lives in the console column next to Fire, not in the key grid) — re-exported here so Task 3 has one import site.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/app/hud/Keypad.test.tsx`
Expected: PASS (5 tests).

The tests find buttons by accessible name, which is the label. `NAV_KEYS` therefore uses the label `"Backspace"`, not `"⌫"` — if you want the glyph visually, style it in CSS (`.keypad__key` can use a `::before`), but do NOT sacrifice the accessible name. Same for `"Recall"` (not `"↺ Recall"`).

- [ ] **Step 6: Commit**

```bash
git add src/app/hud/keypadKeys.ts src/app/hud/Keypad.tsx src/app/hud/Keypad.test.tsx
git commit -m "feat(hud): Keypad component + key model"
```

---

### Task 3: Wire the keypad into FiringConsole; delete the chip row

**Files:**
- Modify: `src/app/hud/FiringConsole.tsx`
- Test: `src/app/hud/FiringConsole.test.tsx`

**Interfaces:**
- Consumes: `Keypad`, `NAV_KEYS`, `KeyAction` (Task 2); `HudInputHandle.keystroke` (Task 1).
- Produces: a `FiringConsole` whose footer contains the keypad and no chip row.

- [ ] **Step 1: Write the failing test**

Add to `src/app/hud/FiringConsole.test.tsx` (follow the existing `makeInput` fake-injection pattern in that file — read it first):

```tsx
it("routes a digit key into the ACTIVE team's field only", async () => {
  const red = fakeInput();   // use the file's existing fake factory
  const blue = fakeInput();
  renderConsole({ turn: "red", inputs: { red, blue } });
  await userEvent.click(screen.getByRole("button", { name: "7" }));
  expect(red.insertText).toHaveBeenCalledWith("7");
  expect(blue.insertText).not.toHaveBeenCalled();
});

it("routes backspace as a keystroke, not as text", async () => {
  const red = fakeInput();
  renderConsole({ turn: "red", inputs: { red } });
  await userEvent.click(screen.getByRole("button", { name: "Backspace" }));
  expect(red.keystroke).toHaveBeenCalledWith("Backspace");
  expect(red.insertText).not.toHaveBeenCalled();
});

it("Clear empties the field", async () => {
  const red = fakeInput();
  renderConsole({ turn: "red", inputs: { red } });
  await userEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(red.setLatex).toHaveBeenCalledWith("");
});

it("renders no function chip row — the keypad absorbed it", () => {
  renderConsole({ turn: "red" });
  expect(document.querySelector(".hud-console__chiprow")).toBeNull();
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/app/hud/FiringConsole.test.tsx`
Expected: FAIL — no button named "7".

- [ ] **Step 3: Replace the chip row with the keypad**

In `src/app/hud/FiringConsole.tsx`:

Delete the entire `CHIP_GROUPS` constant and the whole `<div className="hud-console__chiprow">…</div>` block (including the `↑ recall · ↵ fire` hint span — the arrow idiom is dead; recall is a button now).

Add the import:

```tsx
import { Keypad, NAV_KEYS } from "./Keypad";
import type { KeyAction } from "./keypadKeys";
```

Replace `insertChip` with a single router — every key routes through here:

```tsx
  // One router for every key. `insertChip` used to do this for the chip row;
  // the keypad is that row grown up, so it is the same mechanism.
  const onKey = (a: KeyAction) => {
    if (waiting || busy) return;
    const input = hudInputs.get(turn);
    if (!input) return;
    if (a.kind === "insert") input.insertText(a.text);
    else if (a.kind === "keystroke") input.keystroke(a.keys);
    else if (a.name === "clear") {
      programmaticRef.current = true;
      input.setLatex("");
      programmaticRef.current = false;
    } else if (a.name === "recall") {
      setRecallOpen(true);   // Task 8 renders the popover; until then this is inert
    }
    recallRef.current = { team: null, idx: -1 };
    setLive((l) => ({ ...l, [turn]: hudInputs.get(turn)?.getLatex() ?? "" }));
  };
```

Add the popover state (used in Task 8; declared here so `onKey` compiles):

```tsx
  const [recallOpen, setRecallOpen] = useState(false);
```

In the JSX, the input row keeps the field, and Fire moves to its own full-width row beneath the nav row (per the frozen layout). Replace the chip row with:

```tsx
      <div className="hud-console__nav">
        {NAV_KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            className="keypad__key is-util"
            disabled={waiting || busy}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onKey(k.action)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="cc-btn cc-btn--primary hud-console__fire"
        disabled={!canFire}
        onClick={() => hudController.requestFire(turn)}
      >
        {busy ? "Firing…" : "Fire"}
        <span className="hud-console__fire-key" aria-hidden="true">↵</span>
      </button>

      <Keypad disabled={waiting || busy} onKey={onKey} />
```

Remove the old inline Fire button from the input row and the old `hud-console__clear` `×` button (Clear is a nav key now).

Keep `onUpOutOf` / `onDownOutOf` on `MathField` — desktop keeps Up/Down as an accelerator (spec: "the popover is the discoverable surface, not a replacement for the shortcut").

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/app/hud/FiringConsole.test.tsx && npx tsc --noEmit`
Expected: PASS. Some existing tests in this file may assert the chip row or the inline Fire button — update them; they are testing the old design, and the spec says it goes.

- [ ] **Step 5: Commit**

```bash
git add src/app/hud/FiringConsole.tsx src/app/hud/FiringConsole.test.tsx
git commit -m "feat(hud): keypad replaces the chip row in the firing console"
```

---

### Task 4: Every mode uses the new console — delete `PlayerPanel`

`noTurn` (simultaneous fire) is the one mode that never used `FiringConsole` — `HudBar` renders a dual `PlayerPanel` instead. That mode is currently **untypeable on touch** (no OS keyboard, no keypad), and a single keypad cannot serve two simultaneously-live fields.

KP's decision resolves it by deletion, not by solving it:
- **Local:** simultaneous fire is disabled (Task 5), so local is always turn-based.
- **Online:** each client owns exactly one team (`singleTeam`), so there is always exactly one field to route keys into — `FiringConsole` works as-is.

`PlayerPanel` therefore has no callers left.

**Files:**
- Modify: `src/app/hud/HudBar.tsx`
- Modify: `src/app/hud/FiringConsole.tsx` (noTurn: nobody is ever "waiting")
- Test: `src/app/hud/HudBar.test.tsx`, `src/app/hud/FiringConsole.test.tsx`

**Interfaces:**
- Consumes: Task 3's `FiringConsole`.
- Produces: `HudBar` that always renders `FiringConsole`.

- [ ] **Step 1: Write the failing test**

In `src/app/hud/HudBar.test.tsx`:

```tsx
it("renders the firing console even in noTurn mode (no dual panel any more)", () => {
  hudStore.set({ noTurn: true });
  render(<HudBar singleTeam="red" makeInput={makeFake} />);
  expect(document.querySelector(".hud-console")).not.toBeNull();
  expect(document.querySelector(".player-panel")).toBeNull();
});
```

In `src/app/hud/FiringConsole.test.tsx`:

```tsx
it("in noTurn mode the field is never locked — there is no 'waiting for opponent'", () => {
  hudStore.set({ noTurn: true, turn: "blue" });   // NOT my turn, but noTurn
  renderConsole({ singleTeam: "red" });
  expect(screen.getByRole("button", { name: "7" })).toBeEnabled();
  expect(screen.queryByText(/is aiming/i)).toBeNull();
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npx vitest run src/app/hud/HudBar.test.tsx src/app/hud/FiringConsole.test.tsx`
Expected: FAIL — `.player-panel` still rendered; keypad disabled in noTurn.

- [ ] **Step 3: Make `waiting` noTurn-aware in FiringConsole**

In `src/app/hud/FiringConsole.tsx`, read `noTurn` from the store and fold it into `waiting`:

```tsx
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  // In simultaneous-fire there is no "whose turn" — you can always fire, so you
  // are never waiting on anyone.
  const waiting = !noTurn && singleTeam !== undefined && turn !== singleTeam;
```

In noTurn, `turn` is meaningless for routing. Route to the player's own team:

```tsx
  // The team this console types into. Online: always me. Local: whoever's turn it is.
  const active: Team = singleTeam ?? turn;
```

Then replace every `hudInputs.get(turn)` in `onKey`, `requestFire`, Clear and `live[turn]` with `active`. Also change the enable effect:

```tsx
  useEffect(() => {
    teams.forEach((t) => hudInputs.get(t)?.setEnabled(t === active && !busy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, busy, waiting, singleTeam]);
```

**Do not** call `.focus()` here. It is pointless now (no OS keyboard opens) and it is what the reverted `90b2d52` was fighting.

- [ ] **Step 4: Delete `PlayerPanel`**

Rewrite `src/app/hud/HudBar.tsx` to:

```tsx
import "./hud.css";
import type { Team } from "./hudStore";
import { FiringConsole } from "./FiringConsole";

/**
 * Every mode — turn-based and simultaneous-fire, local and online — uses the one
 * console. The old dual `PlayerPanel` layout existed only for noTurn; local
 * noTurn is now disabled (two players cannot share one keypad) and online noTurn
 * gives each client exactly one field, so there is nothing left for it to do.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HudBar({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  return <FiringConsole makeInput={makeInput} singleTeam={singleTeam} />;
}
```

Delete the now-unused imports (`useEffect`, `useStore`, `hudStore`, `hudController`, `hudInputs`, `MathField`, `TimerBadge`).

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/app/hud && npx tsc --noEmit`
Expected: PASS. Tests that assert `.player-panel` / `.hud-bar` are testing deleted UI — delete those tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/hud
git commit -m "refactor(hud): one console for every mode; delete the dual PlayerPanel"
```

---

### Task 5: Disable simultaneous fire for local play

Two people cannot share one keypad on one iPad. Local hotseat + simultaneous fire is now an impossible combination, so the option is **disabled (visible, not removed)** in the local config — online keeps it.

**Files:**
- Modify: `src/app/screens/ConfigPanel.tsx` (the `noTurn` `<Check>` at ~line 130)
- Test: `src/app/screens/ConfigPanel.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ConfigPanel` accepts `simultaneousDisabled?: boolean`.

- [ ] **Step 1: Write the failing test**

```tsx
it("disables simultaneous fire for local play, with a reason", () => {
  render(<ConfigPanel value={cfg} onChange={vi.fn()} simultaneousDisabled />);
  expect(screen.getByRole("checkbox", { name: /simultaneous/i })).toBeDisabled();
  expect(screen.getByText(/one keypad/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/app/screens/ConfigPanel.test.tsx`
Expected: FAIL — checkbox is enabled.

- [ ] **Step 3: Implement**

Add `simultaneousDisabled?: boolean` to the props, pass `disabled={simultaneousDisabled}` to the `<Check>` for `noTurn`, and render the reason beside it when disabled:

```tsx
{simultaneousDisabled && (
  <small className="cfg-hint">not available on one device — both players would share one keypad</small>
)}
```

Then in `src/app/screens/LocalFlow.tsx`, pass `simultaneousDisabled` where it renders `ConfigPanel`. Leave `OnlineFlow.tsx` alone.

Also force the value off for local, so an old persisted config can't smuggle `noTurn: true` into a local match — find where LocalFlow builds its config and coerce `noTurn: false`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/app/screens && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/screens
git commit -m "feat(config): disable simultaneous fire for local play"
```

---

### Task 6: The layout — four zones, container query, Fire full-width

Build exactly what `src/app/hud/PROTOTYPE-keypad.html` shows. **Open it in a browser and copy from it.** Do not invent a layout here.

**Files:**
- Modify: `src/app/hud/hud.css`
- Test: none automatable (jsdom does no layout) — verify in a browser, both orientations.

- [ ] **Step 1: Delete the chip-row CSS**

Remove `.hud-console__chiprow`, `.hud-console__chips`, `.hud-console-chip-group`, `.hud-console-chip`, `.hud-console__hint` from `hud.css`. Also remove `.hud-console__clear`.

- [ ] **Step 2: Write the console/keypad layout**

Append to `hud.css` (values lifted from the prototype):

```css
/* ── The keypad footer (touch-keypad, 2026-07-13) ─────────────────────────
   Four zones side by side: console · numbers · operators · functions.
   The keypad replaced the native OS keyboard (MathInput sets inputmode="none"),
   so it is always present on every device — there is no touch/desktop fork. */
.hud-console {
  width: 100%; max-width: none;          /* was 720px — the band uses the full width */
  display: flex; flex-wrap: wrap; gap: var(--cc-space-3) var(--cc-space-4);
  align-items: stretch;
  container-type: inline-size;           /* the FOOTER's width drives the responsive step */
}
.hud-console__col { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: var(--cc-space-2); }

/* Fire spans the console column, under the nav row: it is the primary action,
   and sharing a row with the input squeezed both. */
.hud-console__fire { width: 100%; justify-content: center; }
.hud-console__nav { display: grid; grid-auto-flow: column; gap: 6px; }

.keypad__key {
  min-height: 46px; min-width: 44px;     /* Apple HIG touch minimum */
  display: grid; place-items: center;
  background: rgba(255, 255, 255, 0.04); border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-md); color: var(--cc-text);
  font-family: var(--cc-font-mono); font-size: var(--cc-fs-md); cursor: pointer;
  transition: background var(--cc-transition);
}
.keypad__key:active:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
.keypad__key:disabled { opacity: 0.4; cursor: default; }
.keypad__key.is-util { background: rgba(255, 255, 255, 0.02); color: var(--cc-text-muted); font-size: var(--cc-fs-sm); }
/* The variable — the most-typed symbol in the game, and NOT a multiply sign. */
.keypad__key.is-var {
  color: var(--cc-blue); border-color: color-mix(in srgb, var(--cc-blue) 45%, var(--cc-border));
  background: color-mix(in srgb, var(--cc-blue) 10%, transparent);
  font-style: italic; font-weight: 700; font-size: var(--cc-fs-lg);
}

.keypad__zone { display: grid; gap: 6px; align-content: start; }
.keypad__nums { grid-template-columns: repeat(3, 1fr); }
.keypad__ops  { grid-template-columns: repeat(2, 1fr); }
.keypad__fns  { display: grid; gap: 6px; grid-template-columns: repeat(4, 1fr); }

/* The function panel is position:absolute inside its zone, so it contributes NO
   height — the console column sets the band's height and the functions scroll
   inside it. Without this the panel grows the footer and never scrolls at all. */
.keypad__fnzone { position: relative; flex: 0 0 216px; min-height: 132px; }
.keypad__fnpanel {
  position: absolute; inset: 0; overflow-y: auto; scrollbar-width: none;
  /* Fade, not a scrollbar. Same local-over-scroll trick as .comp.side-panel:
     the `local` cover scrolls with the content and cancels the `scroll` shadow
     exactly at the true bottom, so the cue is honest. rgb(10,12,15) is
     --cc-surface pre-composited over --cc-bg. */
  background:
    linear-gradient(rgba(10, 12, 15, 0), rgb(10, 12, 15) 70%) 0 100% / 100% 26px local no-repeat,
    linear-gradient(rgba(10, 12, 15, 0), rgba(10, 12, 15, 0.96)) 0 100% / 100% 34px scroll no-repeat;
}
.keypad__fnpanel::-webkit-scrollbar { display: none; }

/* NARROW (iPad portrait): four zones side by side starve the equation field, so
   the functions wrap to their own full-width row and spread to 8 columns.
   MUST come after .keypad__fns — equal specificity, source order decides. */
@container (max-width: 820px) {
  .keypad__fnzone { flex: 1 0 100%; min-height: 104px; }
  .keypad__fns { grid-template-columns: repeat(8, 1fr); }
}
```

- [ ] **Step 3: Wrap the console column in the JSX**

In `FiringConsole.tsx`, wrap the turnline + status + input row + nav row + Fire in `<div className="hud-console__col">…</div>` so the four zones sit side by side (the `Keypad`'s three zones are its siblings).

- [ ] **Step 4: Verify in a real browser — BOTH orientations**

Run: `npm run dev`, open `http://localhost:5173`, start a local match, and resize the window to ~768px wide and ~1024px wide.

Check, and do not skip any of these — jsdom cannot test one of them:
- The keypad renders in four zones; at narrow widths the functions wrap to a full-width 8-column row.
- **Tapping a key does NOT make the caret disappear** (this is the `preventDefault` on pointerdown doing its job — if the caret vanishes, that's the bug).
- The twelve common functions (`sin`…`1/a`) are all visible without scrolling; the fade shows more below.
- `x` is visibly blue/italic and not confusable with `×`.
- Backspace deletes one character; `x^2` then `→` then `+1` puts the `+1` OUTSIDE the exponent.
- The arena is still visible and its axis numbers still readable.

- [ ] **Step 5: Commit**

```bash
git add src/app/hud/hud.css src/app/hud/FiringConsole.tsx
git commit -m "feat(hud): the four-zone keypad footer layout"
```

---

### Task 7: Evict Quit to a floating `[✕]` on the map card

The keypad fills the footer, so `.footer-quit` (absolutely positioned into the footer's top-left) has nowhere to live.

**The two-step confirm MUST survive.** A one-tap quit floating over the play area on a touchscreen ends matches by stray palm.

**Files:**
- Modify: `src/app/hud/Footer.tsx` (remove `.footer-quit`; `IngameFooter` keeps `onLeave` and passes it on, or drops it — see below)
- Modify: `src/app/arena/ArenaStage.tsx` (render the floating quit over the map card)
- Modify: `src/app/theme.css` (replace `.footer-quit*` rules with `.arena-quit*`)
- Test: `src/app/arena/ArenaStage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("quits only after confirming — a single tap must never end the match", async () => {
  const onLeave = vi.fn();
  render(<ArenaStage onLeave={onLeave} />);   // match the file's existing render helper
  await userEvent.click(screen.getByRole("button", { name: /quit match/i }));
  expect(onLeave).not.toHaveBeenCalled();     // first tap only opens the confirm
  await userEvent.click(screen.getByRole("button", { name: "Quit" }));
  expect(onLeave).toHaveBeenCalledOnce();
});

it("Stay dismisses the confirm without quitting", async () => {
  const onLeave = vi.fn();
  render(<ArenaStage onLeave={onLeave} />);
  await userEvent.click(screen.getByRole("button", { name: /quit match/i }));
  await userEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(onLeave).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Stay" })).toBeNull();
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/app/arena/ArenaStage.test.tsx`
Expected: FAIL — no "Quit match" button in the arena.

- [ ] **Step 3: Move the markup**

Cut the `<div className="footer-quit">…</div>` block out of `IngameFooter` in `Footer.tsx` (with its `quitConfirm` state) and render it in `ArenaStage.tsx`, inside the map card, as:

```tsx
<div className="arena-quit">
  {quitConfirm ? (
    <span className="arena-quit__confirm">
      <span className="arena-quit__q">Quit match?</span>
      <button type="button" className="cc-btn cc-btn--danger arena-quit__yes" onClick={onLeave}>Quit</button>
      <button type="button" className="cc-btn arena-quit__no" onClick={() => setQuitConfirm(false)}>Stay</button>
    </span>
  ) : (
    <button
      type="button"
      className="arena-quit__btn"
      aria-label="Quit match"
      title="Quit match"
      onClick={() => setQuitConfirm(true)}
    >
      ✕
    </button>
  )}
</div>
```

`ArenaStage` needs the `onLeave` prop threaded to it from wherever `Footer`'s `onLeave` comes from today (`OnlineFlow.tsx:368` and the local equivalent). Follow the existing prop.

- [ ] **Step 4: Move the CSS**

In `theme.css`, replace the `.footer-quit*` block (~line 340) with:

```css
/* ── Ingame Quit — evicted from the footer (the keypad fills it now), floated
   into the map card's top-right. Top-CENTRE is the round/score readout; RED
   spawns left, so the right corner sits over the least. Two-step by design: a
   stray palm on a touchscreen must not end the match. */
.arena-quit { position: absolute; top: var(--cc-space-3); right: var(--cc-space-3); z-index: 5; }
.arena-quit__btn {
  width: 40px; height: 40px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--cc-surface) 70%, transparent);
  border: 1px solid var(--cc-border); border-radius: var(--cc-radius-md);
  color: var(--cc-text-muted); font-size: var(--cc-fs-md); cursor: pointer;
  transition: color var(--cc-transition), border-color var(--cc-transition);
}
.arena-quit__btn:hover { color: var(--cc-text); border-color: var(--cc-border-strong); }
.arena-quit__confirm {
  display: inline-flex; align-items: center; gap: var(--cc-space-2);
  background: var(--cc-surface-2); border: 1px solid var(--cc-border-strong);
  border-radius: var(--cc-radius-md); padding: 6px 8px;
}
.arena-quit__q { font-size: var(--cc-fs-xs); color: var(--cc-text-muted); }
.arena-quit__yes, .arena-quit__no { padding: 6px 12px; font-size: var(--cc-fs-xs); }
```

The map card must be `position: relative` for this to anchor (check `.comp.map-card` in `theme.css` — add it if absent).

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/app && npx tsc --noEmit`
Expected: PASS. Update any Footer test asserting the old quit button.

- [ ] **Step 6: Verify in a browser** — the `✕` is top-right of the map, one tap opens the confirm, "Stay" dismisses it, and it does not cover a soldier or the round/score readout.

- [ ] **Step 7: Commit**

```bash
git add src/app
git commit -m "feat(hud): float Quit onto the map card, keeping its confirm step"
```

---

### Task 8: Recall as a popover (independent change)

The `↺ Recall` key exists from Task 3 but is inert. This makes it real.

`Up`/`Down` stay bound on desktop as an accelerator — the popover is the *discoverable* surface, not a replacement for the shortcut. The `↑ recall · ↵ fire` hint text is already gone (Task 3).

All the state already exists: `hudStore.history[team]` (newest first, capped at 8), plus `recallRef` / `draftRef` / `recallStep` in `FiringConsole`. The popover is a new *view* of it, not new state.

**Files:**
- Create: `src/app/hud/RecallPopover.tsx`, `src/app/hud/RecallPopover.test.tsx`
- Modify: `src/app/hud/FiringConsole.tsx` (render it when `recallOpen`)
- Modify: `src/app/hud/hud.css`

**Interfaces:**
- Consumes: `recallOpen` / `setRecallOpen` (Task 3).
- Produces: `RecallPopover({ history, onPick, onDismiss })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecallPopover } from "./RecallPopover";

describe("RecallPopover", () => {
  it("lists past shots newest first", () => {
    render(<RecallPopover history={["sin(x)", "x^2"]} onPick={vi.fn()} onDismiss={vi.fn()} />);
    const items = screen.getAllByRole("option");
    expect(items[0]).toHaveTextContent("sin(x)");
    expect(items[1]).toHaveTextContent("x^2");
  });

  it("picking an entry returns its latex", async () => {
    const onPick = vi.fn();
    render(<RecallPopover history={["sin(x)"]} onPick={onPick} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole("option", { name: /sin\(x\)/ }));
    expect(onPick).toHaveBeenCalledWith("sin(x)");
  });

  it("Escape dismisses without picking", async () => {
    const onDismiss = vi.fn();
    const onPick = vi.fn();
    render(<RecallPopover history={["sin(x)"]} onPick={onPick} onDismiss={onDismiss} />);
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("says so when there is nothing to recall", () => {
    render(<RecallPopover history={[]} onPick={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/no shots yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/app/hud/RecallPopover.test.tsx`
Expected: FAIL — cannot resolve `./RecallPopover`.

- [ ] **Step 3: Implement the popover**

Create `src/app/hud/RecallPopover.tsx`:

```tsx
// Recall, Discord-slash-menu style: opens UPWARD over the input, newest shot
// first, tap to load it, tap-away or Escape to dismiss.
//
// This is the one thing allowed to cover the console: it is transient,
// player-initiated and self-dismissing — the sanctioned exception to the rule
// that the game never hides the arena or the console from you.
import { useEffect, useRef } from "react";

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
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onPick(latex)}
          >
            <span className="recall__eq">{latex}</span>
            {i === 0 && <span className="recall__tag">last shot</span>}
          </button>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into FiringConsole**

Render it inside the console column (which must be `position: relative`), and load the pick into the field:

```tsx
{recallOpen && (
  <RecallPopover
    history={hudStore.get().history[active]}
    onPick={(latex) => {
      programmaticRef.current = true;
      hudInputs.get(active)?.setLatex(latex);
      programmaticRef.current = false;
      setLive((l) => ({ ...l, [active]: latex }));
      setRecallOpen(false);
    }}
    onDismiss={() => setRecallOpen(false)}
  />
)}
```

- [ ] **Step 5: Style it (opens upward)**

Append to `hud.css`:

```css
/* Opens UPWARD over the input — transient, player-initiated, self-dismissing. */
.recall {
  position: absolute; bottom: calc(100% + 8px); left: 0; right: 0; z-index: 20;
  max-height: 240px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px; padding: 6px;
  background: var(--cc-surface-2); border: 1px solid var(--cc-border-strong);
  border-radius: var(--cc-radius-lg); backdrop-filter: blur(14px);
}
.recall__item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--cc-space-3);
  padding: 10px 12px; min-height: 44px; text-align: left;
  background: transparent; border: 0; border-radius: var(--cc-radius-sm);
  color: var(--cc-text); font-family: var(--cc-font-mono); font-size: var(--cc-fs-sm); cursor: pointer;
}
.recall__item:hover { background: rgba(255, 255, 255, 0.06); }
.recall__tag { font-family: var(--cc-font-tech); font-size: var(--cc-fs-2xs); color: var(--cc-text-faint); }
.recall__empty { padding: 12px; color: var(--cc-text-faint); font-size: var(--cc-fs-sm); }
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx vitest run src/app/hud && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Verify in a browser** — fire a shot, tap Recall, the list opens upward over the input, tapping an entry loads it, tapping away dismisses it.

- [ ] **Step 8: Commit**

```bash
git add src/app/hud
git commit -m "feat(hud): recall as a popover, replacing the up-arrow idiom"
```

---

### Task 9: Delete the prototype, close the spec

- [ ] **Step 1: Delete the prototype**

```bash
git rm src/app/hud/PROTOTYPE-keypad.html
```

- [ ] **Step 2: Mark the spec shipped**

In `docs/superpowers/specs/2026-07-13-touch-keypad-design.md`, change the status line to:

```markdown
**Status:** shipped
```

- [ ] **Step 3: Update CLAUDE.md**

The Gotchas section describes the HUD; add one line, since this is the kind of thing the next session will otherwise get wrong:

```markdown
- The math field sets `inputmode="none"` — no OS keyboard EVER opens, on any device. The in-footer `Keypad` is the only way to type on touch. Never add device detection around it (a coarse-pointer guard was tried and reverted: `90b2d52` / `229cab8`).
```

- [ ] **Step 4: Full suite + build**

Run: `npm test` then `npm run build`
Expected: pass. Per CLAUDE.md, re-run any failing file alone before believing it — the suite is flaky under parallel load on this filesystem.

- [ ] **Step 5: Verify on the real iPad**

Push to `main` (that is how the device gets a server), then on the iPad:
- Tap the field — caret appears, **no OS keyboard**.
- Type an equation entirely on the keypad. Fire it.
- Backspace deletes one character. `x^2` → `→` → `+1` lands outside the exponent.
- Recall opens upward and loads a past shot.
- Quit needs two taps.
- The arena and its axis numbers are visible **the whole time**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(keypad): delete the prototype; mark the spec shipped"
```
