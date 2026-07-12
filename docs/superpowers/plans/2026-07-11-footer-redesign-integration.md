# Footer Redesign Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the validated, `/impeccable`-critiqued in-game footer prototype (`src/app/hud/_proto/FooterProto.tsx` + `footer-proto.css`) into the real production HUD (`Footer.tsx`, `HudBar.tsx`, `hud.css`, `theme.css`), then delete the prototype.

**Architecture:** The turn-based duel gets a new single-team-swapping "firing console" (`FiringConsole.tsx`) that replaces the always-both-visible dual panel layout. The pre-existing `noTurn` (simultaneous-fire) mode is **out of scope** and keeps its current dual-panel rendering untouched — `HudBar` branches on `noTurn` to choose between the old layout and the new one. Turn/timer ownership already lives correctly in the game layer (`LocalGame`/`NetworkGame` via `GameUiPort`) — the prototype's own hand-rolled timer was a stand-in for not having a real game object, not evidence of a production bug. Equation recall history lives in `hudStore` (survives the existing HUD-reset lifecycle); the recall walk-pointer and draft-before-recall are component-local refs, exactly like the prototype.

**Tech Stack:** React 18 (function components + hooks), Vitest + Testing Library, MathQuill via the existing `src/ui/MathInput.ts` wrapper, plain-object store (`src/app/store.ts`'s `createStore`).

## Global Constraints

- TDD: write the failing test first for every behavioral change (CLAUDE.md convention already used by every file this plan touches).
- `sim`/`game` layer stays untouched except where explicitly noted (none in this plan — `GameUiPort` itself is not modified).
- Never encode team/turn state in color alone — every team-color signal here already carries a paired label or dot, per PRODUCT.md; preserve that pairing in all new markup.
- `color-mix()` for team-tinted borders must use `in srgb`, never `in oklch` — mixing a warm hue (red, ~25°) against the app's cool neutral border (~250°) rotates through magenta in OKLCH's polar interpolation. (Discovered and fixed during the prototype's `/impeccable critique` pass; author it correctly the first time here.)
- Respect `prefers-reduced-motion` for any new animation (none of the CSS in this plan adds new keyframes, but existing ones like `pf-pulse`/`gw-pulse` patterns must not regress).
- Full Vitest suite is flaky under parallel load on this checkout (slow cloud-synced filesystem) — re-run any failing file alone before treating it as a real regression (CLAUDE.md gotcha).
- This surface (turn/timer/focus state) is exactly the class of bug the unit suite misses — manual browser verification is required before Task 7's final commit, not optional.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/hud/hudStore.ts` (modify) | Add per-team equation `history` to `HudState`; `HudController.pushHistory`; extend `HudInputHandle` with `insertText`. |
| `src/mathquill.d.ts` (modify) | Declare `typedText` on the ambient `MQMathField` interface. |
| `src/ui/MathInput.ts` (modify) | Add `insertText(text)` method (chip insertion). |
| `src/app/hud/MathField.tsx` (modify) | New optional `onEdit`/`onUpOutOf`/`onDownOutOf` props, wired the same way `onEnter` already is; extend `MathInputLike`. |
| `src/design/foundation.css` (modify) | New `--gw-map-min` token (arena min-height floor). |
| `src/app/theme.css` (modify) | `.comp.footer` padding fix; `.arena-shell` map-row floor; new `.footer-quit*` (inline quit-confirm) rules. |
| `src/app/hud/hud.css` (modify) | New `.hud-console*` rules: turn line, bounded/scrollable field, grouped chips, team-tinted card glow (srgb mix). |
| `src/app/hud/TimerBadge.tsx` (new) | Extracted verbatim from `HudBar.tsx`'s current inline `TimerBadge` — shared by the untouched `PlayerPanel` (noTurn) path and the new `FiringConsole`, so there is exactly one timer-color-threshold implementation instead of two. |
| `src/app/hud/FiringConsole.tsx` (new) | The redesigned turn-based single-swapping console: turn line + timer, one live field (of up to two mounted), clear, Fire, grouped chips, recall. |
| `src/app/hud/HudBar.tsx` (modify) | Branch on `noTurn`: existing dual `PlayerPanel` layout unchanged (now importing the shared `TimerBadge`), or delegate to `FiringConsole`. |
| `src/app/hud/Footer.tsx` (modify) | ingame branch: outer card gets the team-glow class (reads `hudStore`); Quit becomes an inline confirm (no `window.confirm`). |
| `src/app/hud/_proto/` + `proto-footer.html` (delete, Task 7) | Prototype retired once folded in. |

---

### Task 1: Equation history in `hudStore`

**Files:**
- Modify: `src/app/hud/hudStore.ts`
- Test: `src/app/hud/hudStore.test.ts`

**Interfaces:**
- Produces: `HudState.history: { red: string[]; blue: string[] }` (newest first, capped at 8). `HudController.pushHistory(team: Team, latex: string): void`. `requestFire` now calls `pushHistory` before invoking the fire callback.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/hud/hudStore.test.ts` (inside the existing `describe("HudController", ...)` block, after the `"requestFire is blocked when the player is busy"` test):

```ts
  it("requestFire pushes the fired latex onto that team's history, newest first", () => {
    const cb = vi.fn();
    hud.onFire(cb);
    inputs.register("red", fakeInput("x"));
    hud.setTurn("red");
    hud.requestFire("red");
    expect(store.get().history.red).toEqual(["x"]);
    expect(store.get().history.blue).toEqual([]);
  });

  it("history caps at 8 entries per team, dropping the oldest", () => {
    hud.setNoTurnMode(true); // let the same team fire repeatedly without turn-gating
    for (let i = 0; i < 9; i++) {
      inputs.register("red", fakeInput(`shot${i}`));
      hud.requestFire("red");
    }
    expect(store.get().history.red).toHaveLength(8);
    expect(store.get().history.red[0]).toBe("shot8"); // newest first
    expect(store.get().history.red).not.toContain("shot0"); // oldest dropped
  });

  it("does not push to history when requestFire is gated (wrong turn / busy / empty)", () => {
    inputs.register("red", fakeInput("x"));
    hud.setTurn("blue"); // red can't fire
    hud.requestFire("red");
    expect(store.get().history.red).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/hud/hudStore.test.ts`
Expected: FAIL — `store.get().history` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Implement**

In `src/app/hud/hudStore.ts`, add `history` to `HudState` (after `tutorial`):

```ts
export interface HudState {
  turn: Team;
  noTurn: boolean;
  busy: { red: boolean; blue: boolean };
  score: { red: number; blue: number; round: number; totalRounds: number };
  status: string;
  timer: number | null;
  win: { winner: Team; detail: string } | null;
  splash: string | null;
  tutorial: { text: string } | null;
  /** Per-team fired-equation history, newest first, capped at HudController.HISTORY_MAX. Client-local — never sent over the wire. */
  history: { red: string[]; blue: string[] };
}
```

Add the default to `initialHudState()` (after `tutorial: null,`):

```ts
    history: { red: [], blue: [] },
```

Extend `HudInputHandle` (add after `setEnabled`):

```ts
export interface HudInputHandle {
  getLatex(): string;
  setLatex(v: string): void;
  focus(): void;
  setEnabled(e: boolean): void;
  /** Type raw chars/LaTeX at the cursor (function chips). */
  insertText(chars: string): void;
}
```

In `HudController`, add the cap constant and `pushHistory`, and call it from `requestFire`:

```ts
export class HudController implements GameUiPort {
  private static readonly HISTORY_MAX = 8;
  private fireCb: ((player: Team, latex: string) => void) | null = null;
  private resetCb: (() => void) | null = null;
  private tutNext: (() => void) | null = null;
  private tutSkip: (() => void) | null = null;

  constructor(private store: Store<HudState>, private inputs: HudInputRegistry) {}

  // ── React-side entry points ──────────────────────────────────────────────
  requestFire(team: Team): void {
    const s = this.store.get();
    if (!s.noTurn && team !== s.turn) return;
    if (s.busy[team]) return;
    const latex = this.inputs.get(team)?.getLatex().trim();
    if (!latex) return;
    this.pushHistory(team, latex);
    this.fireCb?.(team, latex);
  }
  pushHistory(team: Team, latex: string): void {
    this.store.set((s) => ({
      history: { ...s.history, [team]: [latex, ...s.history[team]].slice(0, HudController.HISTORY_MAX) },
    }));
  }
```

(Leave every other method in `HudController` untouched — only `requestFire`'s body changes, from its existing `if (latex) this.fireCb?.(team, latex);` to the `if (!latex) return;` / `pushHistory` / `fireCb` sequence above.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/hud/hudStore.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones and the pre-existing ones — the `insertText` addition to `HudInputHandle` doesn't affect this file's fakes since `hudStore.test.ts`'s local `fakeInput()` already returns an object without `insertText`, and nothing in this file registers that fake into a `Map<Team, HudInputHandle>` typed slot in a way TypeScript checks structurally against the interface at test-authoring time — `HudInputRegistry.register` is typed as `(team: Team, h: HudInputHandle) => void`, so if `fakeInput()`'s return type is missing `insertText`, `tsc` WILL flag it. Fix `fakeInput` in this file too, in this same step:)

```ts
function fakeInput(latex = "x") {
  return { getLatex: () => latex, setLatex: vi.fn(), focus: vi.fn(), setEnabled: vi.fn(), insertText: vi.fn() };
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (confirms every other `HudInputHandle`-shaped fake across the codebase; Task 2 handles the ones in `Footer.test.tsx`/`HudBar.test.tsx`/`MathField.test.tsx` since those also need the `MathInputLike` additions).

- [ ] **Step 6: Commit**

```bash
git add src/app/hud/hudStore.ts src/app/hud/hudStore.test.ts
git commit -m "feat(hud): add per-team fired-equation history to hudStore"
```

---

### Task 2: MathQuill chip-insert + recall plumbing (`MathInput`, `MathField`)

**Files:**
- Modify: `src/mathquill.d.ts`
- Modify: `src/ui/MathInput.ts`
- Modify: `src/app/hud/MathField.tsx`
- Test: `src/app/hud/MathField.test.tsx`

**Interfaces:**
- Consumes: `HudInputHandle.insertText` (Task 1).
- Produces: `MathInput.insertText(text: string): void`. `MathField` gains optional props `onEdit?: () => void`, `onUpOutOf?: () => void`, `onDownOutOf?: () => void` (in addition to the existing required `onEnter`). `MathInputLike` interface gains `insertText`, `onEdit`, `onUpOutOf`, `onDownOutOf` (all required on the interface — the real `MathInput` always implements them; every test fake providing a `makeInput` must too).

- [ ] **Step 1: Write the failing test**

Replace `src/app/hud/MathField.test.tsx` in full:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MathField } from "./MathField";
import { HudInputRegistry } from "./hudStore";

function fakeMathInput() {
  const el = document.createElement("span");
  el.className = "mq-input";
  let enterCb: (() => void) | null = null;
  let editCb: (() => void) | null = null;
  let upCb: (() => void) | null = null;
  let downCb: (() => void) | null = null;
  return {
    el,
    getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
    setEnabled: vi.fn(), reflow: vi.fn(), insertText: vi.fn(),
    onEnter: (cb: () => void) => { enterCb = cb; },
    onEdit: (cb: () => void) => { editCb = cb; },
    onUpOutOf: (cb: () => void) => { upCb = cb; },
    onDownOutOf: (cb: () => void) => { downCb = cb; },
    fireEnter: () => enterCb?.(),
    fireEdit: () => editCb?.(),
    fireUpOutOf: () => upCb?.(),
    fireDownOutOf: () => downCb?.(),
  };
}

describe("MathField", () => {
  it("registers on mount, unregisters on unmount, forwards Enter", () => {
    const registry = new HudInputRegistry();
    const input = fakeMathInput();
    const onEnter = vi.fn();
    const { container, unmount } = render(
      <MathField team="red" registry={registry} onEnter={onEnter} makeInput={() => input} />,
    );
    expect(container.querySelector(".mq-input")).toBe(input.el);
    expect(registry.get("red")).toBeTruthy();
    input.fireEnter();
    expect(onEnter).toHaveBeenCalled();
    unmount();
    expect(registry.get("red")).toBeUndefined();
  });

  it("forwards edit/upOutOf/downOutOf to the optional props when given", () => {
    const registry = new HudInputRegistry();
    const input = fakeMathInput();
    const onEdit = vi.fn();
    const onUpOutOf = vi.fn();
    const onDownOutOf = vi.fn();
    render(
      <MathField
        team="red" registry={registry} onEnter={vi.fn()}
        onEdit={onEdit} onUpOutOf={onUpOutOf} onDownOutOf={onDownOutOf}
        makeInput={() => input}
      />,
    );
    input.fireEdit();
    input.fireUpOutOf();
    input.fireDownOutOf();
    expect(onEdit).toHaveBeenCalled();
    expect(onUpOutOf).toHaveBeenCalled();
    expect(onDownOutOf).toHaveBeenCalled();
  });

  it("does not throw when edit/upOutOf/downOutOf fire and no optional prop was given", () => {
    const registry = new HudInputRegistry();
    const input = fakeMathInput();
    render(<MathField team="red" registry={registry} onEnter={vi.fn()} makeInput={() => input} />);
    expect(() => { input.fireEdit(); input.fireUpOutOf(); input.fireDownOutOf(); }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/hud/MathField.test.tsx`
Expected: FAIL — `input.onEdit is not a function` (MathField's effect doesn't call it yet; also `fakeMathInput` is a local test fixture with the new shape, but `MathField`'s own `MathInputLike` interface doesn't declare `onEdit`/`onUpOutOf`/`onDownOutOf`/`insertText` yet, so this is also a type error before it's a runtime error).

- [ ] **Step 3: Implement**

Add `typedText` to the ambient `MQMathField` interface in `src/mathquill.d.ts` (insert after the existing `cmd` line):

```ts
  /** Type raw chars/LaTeX at the cursor, same as user keystrokes (chip insertion). */
  typedText(text: string): MQMathField;
```

In `src/ui/MathInput.ts`, add `insertText` after the existing `setLatex` method:

```ts
  /** Type raw chars at the cursor, as if the user had typed them (function chips). */
  insertText(text: string): void {
    this.mq.typedText(text);
    this.mq.focus();
    this.syncPlaceholder();
  }
```

Replace `src/app/hud/MathField.tsx` in full:

```tsx
import { useEffect, useRef } from "react";
import { MathInput } from "../../ui/MathInput";
import type { HudInputRegistry, Team } from "./hudStore";

interface MathInputLike {
  el: HTMLElement;
  getLatex(): string;
  setLatex(v: string): void;
  focus(): void;
  setEnabled(e: boolean): void;
  reflow(): void;
  insertText(chars: string): void;
  onEnter(cb: () => void): void;
  onEdit(cb: () => void): void;
  onUpOutOf(cb: () => void): void;
  onDownOutOf(cb: () => void): void;
}

interface Props {
  team: Team;
  registry: HudInputRegistry;
  onEnter: () => void;
  /** Fires on every content change, including programmatic ones (recall, chip insert). */
  onEdit?: () => void;
  /** Cursor at the top level with nowhere higher to go (equation recall — "older"). */
  onUpOutOf?: () => void;
  /** Cursor at the bottom level with nowhere lower to go (equation recall — "newer"). */
  onDownOutOf?: () => void;
  placeholder?: string;
  /** Test seam: inject a fake instead of a real MathQuill field. */
  makeInput?: () => MathInputLike;
}

export function MathField({
  team, registry, onEnter, onEdit, onUpOutOf, onDownOutOf,
  placeholder = "type a function in x", makeInput,
}: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onUpOutOfRef = useRef(onUpOutOf);
  onUpOutOfRef.current = onUpOutOf;
  const onDownOutOfRef = useRef(onDownOutOf);
  onDownOutOfRef.current = onDownOutOf;

  useEffect(() => {
    const input: MathInputLike = makeInput ? makeInput() : new MathInput("", placeholder);
    hostRef.current!.appendChild(input.el);
    input.reflow();
    input.onEnter(() => onEnterRef.current());
    input.onEdit(() => onEditRef.current?.());
    input.onUpOutOf(() => onUpOutOfRef.current?.());
    input.onDownOutOf(() => onDownOutOfRef.current?.());
    registry.register(team, input);
    return () => {
      registry.unregister(team);
      input.el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- makeInput and placeholder are mount-only by design
  }, [team, registry]);

  return <span ref={hostRef} className="hud-input" />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/hud/MathField.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `Footer.test.tsx` and `HudBar.test.tsx` — their local `makeInput`/`fakeInput` fixtures are missing `insertText`/`onEdit`/`onUpOutOf`/`onDownOutOf`. Fix both now (this is mechanical, not a design change, and later tasks depend on these files compiling):

In `src/app/hud/Footer.test.tsx`, replace the `makeInput` fixture:

```ts
const makeInput = () => {
  const el = document.createElement("span");
  return {
    el, getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
    setEnabled: vi.fn(), reflow: vi.fn(), insertText: vi.fn(),
    onEnter: vi.fn(), onEdit: vi.fn(), onUpOutOf: vi.fn(), onDownOutOf: vi.fn(),
  };
};
```

In `src/app/hud/HudBar.test.tsx`, replace both fixtures:

```ts
const fakeInput = (latex: string) => ({
  getLatex: () => latex, setLatex: vi.fn(), focus: vi.fn(), setEnabled: vi.fn(), insertText: vi.fn(),
});

// HudBar renders MathFields with a test factory via prop
const makeInput = () => {
  const el = document.createElement("span");
  return {
    el, getLatex: () => "x", setLatex: vi.fn(), focus: vi.fn(),
    setEnabled: vi.fn(), reflow: vi.fn(), insertText: vi.fn(),
    onEnter: vi.fn(), onEdit: vi.fn(), onUpOutOf: vi.fn(), onDownOutOf: vi.fn(),
  };
};
```

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full affected test set**

Run: `npx vitest run src/app/hud/MathField.test.tsx src/app/hud/Footer.test.tsx src/app/hud/HudBar.test.tsx src/app/hud/hudStore.test.ts`
Expected: PASS (Footer/HudBar test *behavior* is unchanged in this task — only their fixtures grew new no-op fields).

- [ ] **Step 7: Commit**

```bash
git add src/mathquill.d.ts src/ui/MathInput.ts src/app/hud/MathField.tsx src/app/hud/MathField.test.tsx src/app/hud/Footer.test.tsx src/app/hud/HudBar.test.tsx
git commit -m "feat(hud): wire chip-insert + recall hooks through MathField"
```

---

### Task 3: CSS — footer padding, arena min-height floor, new console/chip/quit styles

**Files:**
- Modify: `src/design/foundation.css`
- Modify: `src/app/theme.css`
- Modify: `src/app/hud/hud.css`

**Interfaces:**
- Produces: `--gw-map-min` token; `.comp.footer` roomier padding (affects both pregame and ingame footer — same shared rule, intentional per DESIGN.md spacing consistency); `.footer-quit*` classes; `.hud-console*` classes (consumed by Task 4's `FiringConsole`).
- Consumes: nothing new.

This task is pure CSS — no colocated test file exists for stylesheets in this repo. Verify by eyeballing computed styles after Task 4 renders something that uses these classes (do not skip; CLAUDE.md flags this exact class of bug — CSS specificity conflicts — as one Vitest can't catch, and the earlier prototype work hit a real specificity bug here that only `getComputedStyle` caught).

- [ ] **Step 1: Add the map min-height token**

In `src/design/foundation.css`, add after the existing `--gw-footer-min: 78px;` (line 87):

```css
  /* Floor for the MAP grid row (arena-shell) — the row can shrink to make
     room for a tall footer (deeply nested equation), but must never reach 0;
     the board is the one thing that has to stay legible regardless of what's
     being typed below it. */
  --gw-map-min: 200px;
```

- [ ] **Step 2: Fix the arena-shell map row floor**

In `src/app/theme.css` line 247, change:

```css
  grid-template-rows: minmax(0, 1fr) minmax(var(--gw-footer-min), auto);
```

to:

```css
  grid-template-rows: minmax(var(--gw-map-min), 1fr) minmax(var(--gw-footer-min), auto);
```

- [ ] **Step 3: Fix `.comp.footer` padding**

In `src/app/theme.css` lines 307-312, change:

```css
.comp.footer {
  grid-column: 1 / -1; grid-row: 2 / 3;
  display: flex; align-items: center; gap: var(--gw-space-3);
  backdrop-filter: blur(14px);
  padding: 0 var(--gw-space-4);
}
```

to:

```css
.comp.footer {
  grid-column: 1 / -1; grid-row: 2 / 3;
  display: flex; align-items: center; gap: var(--gw-space-3);
  backdrop-filter: blur(14px);
  padding: var(--gw-space-5) var(--gw-space-6);
}
```

- [ ] **Step 4: Add the inline quit-confirm styles**

In `src/app/theme.css`, add immediately after the existing `.footer-name-input:focus-visible { ... }` block (the one ending just before the `/* Room-code badge */` comment, ~line 333):

```css

/* ── Ingame Quit — quiet card-level utility, pinned to the top-left corner of
   the footer card, absolutely positioned (removed from the flex flow, so
   `.footer--ingame`'s justify-content:center centers only the console) — and
   an inline confirm instead of a native window.confirm, which breaks the
   pitch-black premium frame. */
.footer-quit { position: absolute; left: var(--gw-space-5); top: var(--gw-space-4); }
.footer-quit__btn {
  border-color: transparent; color: var(--gw-text-faint);
  padding: 8px 14px; font-size: var(--gw-fs-xs);
}
.footer-quit__btn:hover:not(:disabled) { color: var(--gw-text); border-color: var(--gw-border-strong); background: transparent; }
.footer-quit__confirm { display: inline-flex; align-items: center; gap: var(--gw-space-2); }
.footer-quit__q { font-size: var(--gw-fs-xs); color: var(--gw-text-muted); }
.footer-quit__yes, .footer-quit__no { padding: 6px 12px; font-size: var(--gw-fs-xs); }
```

- [ ] **Step 5: Add the FiringConsole styles**

Add to the end of `src/app/hud/hud.css`:

```css

/* ── FiringConsole (redesigned turn-based footer, arena-shell-redesign
   follow-up) — a single team-swapping console replacing the always-both-
   visible dual panel for turn-based play. `noTurn` mode is unaffected and
   keeps the `.hud-bar`/`.player-panel` layout above, unchanged. */

/* The whole footer CARD glows with whoever's turn it is — set by Footer.tsx
   on `.comp.footer` itself (not on `.hud-console`), so the full card edge
   lights up exactly like the dual-panel's per-side border already does.
   Mixed `in srgb`, not `in oklch`: OKLCH interpolates hue around the polar
   wheel, and red (~25°) vs this border's cool blue-gray (~250°) are far
   enough apart that the browser swings through magenta on the way. */
.comp.footer.is-red   { border-color: color-mix(in srgb, var(--gw-red) 45%, var(--gw-border)); box-shadow: 0 0 40px -8px rgba(255, 68, 68, 0.28); }
.comp.footer.is-blue  { border-color: color-mix(in srgb, var(--gw-blue) 45%, var(--gw-border)); box-shadow: 0 0 40px -8px rgba(68, 136, 255, 0.28); }
/* Waiting (online, not your turn): a dimmer version of the opponent's glow —
   reassurance during the anxious "watching for your turn" moment, without
   competing with the full-strength glow that means "act now". */
.comp.footer.is-waiting.is-red  { border-color: color-mix(in srgb, var(--gw-red) 22%, var(--gw-border)); box-shadow: 0 0 24px -10px rgba(255, 68, 68, 0.18); }
.comp.footer.is-waiting.is-blue { border-color: color-mix(in srgb, var(--gw-blue) 22%, var(--gw-border)); box-shadow: 0 0 24px -10px rgba(68, 136, 255, 0.18); }
.comp.footer { transition: border-color 220ms var(--gw-ease-out-expo, ease), box-shadow 220ms var(--gw-ease-out-expo, ease); }
@media (prefers-reduced-motion: reduce) { .comp.footer { transition: none; } }

.hud-console { width: 100%; max-width: 720px; display: flex; flex-direction: column; gap: var(--gw-space-3); }

.hud-console__turnline { display: flex; align-items: center; justify-content: space-between; }
.hud-console__turn {
  display: inline-flex; align-items: center; gap: var(--gw-space-2);
  font-family: var(--gw-font-tech); font-size: var(--gw-fs-xs);
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--gw-text-muted);
}
.hud-console__dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.hud-console__dot.is-red  { background: var(--gw-red);  box-shadow: 0 0 8px var(--gw-red); }
.hud-console__dot.is-blue { background: var(--gw-blue); box-shadow: 0 0 8px var(--gw-blue); }

.hud-console__inputrow { display: flex; align-items: center; gap: var(--gw-space-2); }
.hud-console__inputrow.is-locked { opacity: 0.6; }
.hud-console__fields { position: relative; flex: 1; min-width: 0; display: flex; }
.hud-console-field {
  flex: 1; min-width: 0;
  background: var(--gw-surface); border: 1px solid var(--gw-border);
  border-radius: var(--gw-radius-sm);
  padding: 8px 12px; font-size: 18px;
  transition: border-color 150ms var(--gw-ease-out-expo, ease);
  /* A deeply nested equation (stacked fractions, etc.) would otherwise grow
     the footer without bound. Cap it and let the field scroll internally
     past that point instead — the arena-shell's own map-row floor (Step 2)
     is the second half of this guarantee. */
  max-height: 220px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--gw-border-strong) transparent;
}
.hud-console-field::-webkit-scrollbar { width: 8px; }
.hud-console-field::-webkit-scrollbar-track { background: transparent; }
.hud-console-field::-webkit-scrollbar-thumb { background: var(--gw-border-strong); border-radius: 4px; }
.hud-console-field--hidden { display: none; }
.hud-console-field--locked {
  color: var(--gw-text-faint); font-family: var(--gw-font-tech);
  font-size: var(--gw-fs-sm); display: flex; align-items: center;
}
.comp.footer.is-red  .hud-console-field:focus-within { border-color: color-mix(in srgb, var(--gw-red) 60%, var(--gw-border-strong)); }
.comp.footer.is-blue .hud-console-field:focus-within { border-color: color-mix(in srgb, var(--gw-blue) 60%, var(--gw-border-strong)); }

.hud-console__clear {
  flex: none; width: 30px; height: 30px; border-radius: var(--gw-radius-sm);
  border: 1px solid var(--gw-border); background: transparent;
  color: var(--gw-text-muted); font-size: 18px; line-height: 1; cursor: pointer;
  transition: color 150ms, border-color 150ms;
}
.hud-console__clear:hover:not(:disabled) { color: var(--gw-text); border-color: var(--gw-border-strong); }
.hud-console__clear:disabled { opacity: 0.3; cursor: default; }

.hud-console__fire { flex: none; padding: 10px 22px; }
.hud-console__fire-key {
  font-family: var(--gw-font-tech); font-size: var(--gw-fs-2xs);
  opacity: 0.55; margin-left: 2px;
  border: 1px solid currentColor; border-radius: var(--gw-radius-sm); padding: 0 4px; line-height: 1.4;
}

.hud-console__chiprow { display: flex; align-items: center; justify-content: space-between; gap: var(--gw-space-3); }
.hud-console__chips { display: flex; flex-wrap: wrap; gap: var(--gw-space-3); }
.hud-console-chip-group { display: flex; flex-wrap: wrap; gap: 6px; }
.hud-console-chip {
  font-family: var(--gw-font-tech); font-size: var(--gw-fs-xs);
  color: var(--gw-text-muted); background: var(--gw-surface-2);
  border: 1px solid var(--gw-border); border-radius: var(--gw-radius-sm);
  padding: 4px 9px; cursor: pointer;
  transition: color 120ms, border-color 120ms, background 120ms;
}
.hud-console-chip:hover:not(:disabled) { color: var(--gw-text); border-color: var(--gw-border-strong); background: oklch(1 0 0 / 0.04); }
.hud-console-chip:active:not(:disabled) { transform: scale(0.94); }
.hud-console-chip:disabled { opacity: 0.35; cursor: default; }
.hud-console-chip:focus-visible { outline: 2px solid oklch(0.9 0.01 250 / 0.9); outline-offset: 2px; }
.hud-console__hint {
  flex: none; font-family: var(--gw-font-tech); font-size: var(--gw-fs-2xs);
  letter-spacing: 0.1em; color: var(--gw-text-faint); white-space: nowrap;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/design/foundation.css src/app/theme.css src/app/hud/hud.css
git commit -m "style(hud): footer padding, arena min-height floor, FiringConsole/quit styles"
```

---

### Task 4: `FiringConsole` component (+ extract shared `TimerBadge`)

**Files:**
- Create: `src/app/hud/TimerBadge.tsx`
- Create: `src/app/hud/FiringConsole.tsx`
- Test: `src/app/hud/FiringConsole.test.tsx`

**Interfaces:**
- Consumes: `hudStore`/`hudController`/`hudInputs` (`src/app/hud/hudStore.ts`), `MathField` (Task 2), the CSS classes from Task 3.
- Produces: `export function TimerBadge(): JSX.Element | null` (extracted verbatim from `HudBar.tsx`'s current inline version — same `timer === null || noTurn` guard and the same `hud-timer`/`warn`/`crit` class thresholds, just importable). `export function FiringConsole({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }): JSX.Element` — the exact same prop shape `HudBar` already forwards today, so Task 5's integration is a straight swap. Task 5's rewrite of `HudBar.tsx` imports this same `TimerBadge` instead of keeping its own copy.

- [ ] **Step 1: Write the failing tests**

Create `src/app/hud/FiringConsole.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { FiringConsole } from "./FiringConsole";
import { hudStore, hudController, hudInputs, initialHudState } from "./hudStore";

function makeTrackedInput() {
  let latex = "";
  let enterCb: (() => void) | null = null;
  let editCb: (() => void) | null = null;
  let upCb: (() => void) | null = null;
  let downCb: (() => void) | null = null;
  const el = document.createElement("span");
  return {
    el,
    getLatex: () => latex,
    setLatex: vi.fn((v: string) => { latex = v; editCb?.(); }),
    focus: vi.fn(),
    setEnabled: vi.fn(),
    reflow: vi.fn(),
    insertText: vi.fn((chars: string) => { latex += chars; editCb?.(); }),
    onEnter: (cb: () => void) => { enterCb = cb; },
    onEdit: (cb: () => void) => { editCb = cb; },
    onUpOutOf: (cb: () => void) => { upCb = cb; },
    onDownOutOf: (cb: () => void) => { downCb = cb; },
    fireEnter: () => enterCb?.(),
    fireUpOutOf: () => upCb?.(),
    fireDownOutOf: () => downCb?.(),
    typeLatex: (v: string) => { latex = v; editCb?.(); },
  };
}

describe("FiringConsole", () => {
  let inputs: ReturnType<typeof makeTrackedInput>[];
  const makeInput = () => { const i = makeTrackedInput(); inputs.push(i); return i; };

  beforeEach(() => {
    hudStore.set(initialHudState());
    inputs = [];
  });
  afterEach(() => cleanup());

  it("local (no singleTeam): mounts both teams' fields, shows only the active one", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    const fields = document.querySelectorAll(".hud-console-field");
    expect(fields).toHaveLength(2);
    expect(fields[0].classList.contains("hud-console-field--hidden")).toBe(false); // red first-registered
    expect(fields[1].classList.contains("hud-console-field--hidden")).toBe(true);
    act(() => hudController.setTurn("blue"));
    expect(fields[0].classList.contains("hud-console-field--hidden")).toBe(true);
    expect(fields[1].classList.contains("hud-console-field--hidden")).toBe(false);
  });

  it("turn line shows the active team and swaps the team-dot class", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    expect(screen.getByText(/RED TO FIRE/i)).toBeTruthy();
    expect(document.querySelector(".hud-console__dot.is-red")).toBeTruthy();
    act(() => hudController.setTurn("blue"));
    expect(screen.getByText(/BLUE TO FIRE/i)).toBeTruthy();
    expect(document.querySelector(".hud-console__dot.is-blue")).toBeTruthy();
  });

  it("turn label has aria-live=polite so screen readers hear the swap", () => {
    render(<FiringConsole makeInput={makeInput} />);
    expect(document.querySelector(".hud-console__turn")?.getAttribute("aria-live")).toBe("polite");
  });

  it("singleTeam='blue': mounts exactly one field; shows locked placeholder when it's not blue's turn", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} singleTeam="blue" />);
    expect(document.querySelectorAll(".hud-console-field")).toHaveLength(1);
    expect(document.querySelector(".hud-console-field--locked")).toBeTruthy();
    expect(screen.getByText(/opponent is choosing a curve/i)).toBeTruthy();
    act(() => hudController.setTurn("blue"));
    expect(document.querySelector(".hud-console-field--locked")).toBeNull();
  });

  it("Fire is disabled until the active field has content, then fires with that latex", () => {
    const cb = vi.fn();
    hudController.onFire(cb);
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    const fire = screen.getByRole("button", { name: /Fire/i });
    expect((fire as HTMLButtonElement).disabled).toBe(true);
    act(() => inputs[0].typeLatex("\\sin(x)"));
    expect((fire as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(fire);
    expect(cb).toHaveBeenCalledWith("red", "\\sin(x)");
  });

  it("Clear empties the active field and refocuses it", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    act(() => inputs[0].typeLatex("x^2"));
    fireEvent.click(screen.getByRole("button", { name: /clear equation/i }));
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("");
    expect(inputs[0].focus).toHaveBeenCalled();
  });

  it("clicking a chip inserts its text into the active team's field", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    fireEvent.click(screen.getByRole("button", { name: "sin" }));
    expect(inputs[0].insertText).toHaveBeenCalledWith("sin(");
    fireEvent.click(screen.getByRole("button", { name: "logₐ" }));
    expect(inputs[0].insertText).toHaveBeenCalledWith("log_");
  });

  it("recall: upOutOf walks older shots, downOutOf walks back to the live draft without blanking it", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    inputs[0].typeLatex("2x");
    act(() => hudController.pushHistory("red", "2x"));
    inputs[0].typeLatex("x^2");
    act(() => hudController.pushHistory("red", "x^2")); // history: [x^2, 2x]
    act(() => inputs[0].typeLatex("draft"));

    act(() => inputs[0].fireUpOutOf()); // -> x^2 (newest)
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("x^2");
    act(() => inputs[0].fireUpOutOf()); // -> 2x (older)
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("2x");
    act(() => inputs[0].fireUpOutOf()); // nothing older — no-op, still 2x
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("2x");

    act(() => inputs[0].fireDownOutOf()); // -> x^2
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("x^2");
    act(() => inputs[0].fireDownOutOf()); // -> back to the saved draft, NOT blanked
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("draft");
    act(() => inputs[0].fireDownOutOf()); // already on draft — no-op, must stay "draft"
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("draft");
  });

  it("recall is scoped per team", () => {
    act(() => hudController.setTurn("red"));
    render(<FiringConsole makeInput={makeInput} />);
    act(() => hudController.pushHistory("red", "redshot"));
    act(() => hudController.pushHistory("blue", "blueshot"));
    act(() => inputs[0].fireUpOutOf());
    expect(inputs[0].setLatex).toHaveBeenLastCalledWith("redshot");
    act(() => hudController.setTurn("blue"));
    act(() => inputs[1].fireUpOutOf());
    expect(inputs[1].setLatex).toHaveBeenLastCalledWith("blueshot");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/hud/FiringConsole.test.tsx`
Expected: FAIL — `Cannot find module './FiringConsole'`.

- [ ] **Step 3: Implement**

Create `src/app/hud/TimerBadge.tsx` — extracted verbatim from `HudBar.tsx`'s current inline `TimerBadge` (lines 7-13 today), unchanged logic, now importable from both the untouched `PlayerPanel` (noTurn) path and this task's new `FiringConsole`:

```tsx
import { useStore } from "../store";
import { hudStore } from "./hudStore";

export function TimerBadge() {
  const timer = useStore(hudStore, (s) => s.timer);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  if (timer === null || noTurn) return null;
  const cls = timer <= 5 ? "hud-timer crit" : timer <= 10 ? "hud-timer warn" : "hud-timer";
  return <span className={cls}>{timer}s</span>;
}
```

Create `src/app/hud/FiringConsole.tsx`:

```tsx
// The redesigned turn-based in-game footer console (arena-shell-redesign
// follow-up). Replaces the always-both-visible dual `PlayerPanel` layout for
// turn-based play: one team-colored console whose visible field swaps with
// the turn. `noTurn` (simultaneous-fire) mode is unaffected — HudBar renders
// the original dual layout for that mode; this component is never mounted
// then.
//
// Both teams' MathQuill fields stay mounted at all times (local hotseat) so
// each is simply its own memory across swaps — there is nothing to marshal.
// For online (`singleTeam` set) only one field ever mounts; the other side
// is represented by a locked placeholder while it's not your turn.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { hudStore, hudController, hudInputs, type Team } from "./hudStore";
import { MathField } from "./MathField";
import { TimerBadge } from "./TimerBadge";

const CHIP_GROUPS: { label: string; type: string }[][] = [
  [{ label: "sin", type: "sin(" }, { label: "cos", type: "cos(" }, { label: "tan", type: "tan(" }],
  // "log_" leaves the cursor inside the subscript for the base — the same
  // raw-insertion-point pattern the "xⁿ" chip uses for superscripts (type
  // "^", arrow out, keep typing).
  [{ label: "ln", type: "ln(" }, { label: "logₐ", type: "log_" }],
  [{ label: "√", type: "sqrt" }, { label: "x²", type: "x^2" }, { label: "xⁿ", type: "^" }],
  [{ label: "π", type: "pi" }, { label: "e", type: "e" }],
  [{ label: "( )", type: "(" }, { label: "abs", type: "abs(" }],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FiringConsole({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  const turn = useStore(hudStore, (s) => s.turn);
  const busy = useStore(hudStore, (s) => s.busy[turn]);
  const status = useStore(hudStore, (s) => s.status);

  const teams: Team[] = singleTeam ? [singleTeam] : ["red", "blue"];
  const waiting = singleTeam !== undefined && turn !== singleTeam;
  const displayed: Team = waiting ? OTHER(singleTeam!) : turn;

  const [live, setLive] = useState<Record<Team, string>>({ red: "", blue: "" });
  // Recall pointer for whichever team is currently being navigated. idx -1 =
  // live draft; 0 = most recent shot.
  const recallRef = useRef<{ team: Team | null; idx: number }>({ team: null, idx: -1 });
  // The draft a team had typed before entering recall — restored when they
  // walk back down to it, so recall never destroys unfired work.
  const draftRef = useRef<Record<Team, string>>({ red: "", blue: "" });
  const programmaticRef = useRef(false); // true while WE set latex, so onEdit ignores it

  // Enable only the displayed field; refocus it whenever the turn changes.
  useEffect(() => {
    teams.forEach((t) => hudInputs.get(t)?.setEnabled(t === turn && !busy));
    if (turn === displayed && !waiting) hudInputs.get(turn)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `teams` is stable per singleTeam identity
  }, [turn, busy, waiting, displayed, singleTeam]);

  const recallStep = (team: Team, dir: -1 | 1) => {
    const hist = hudStore.get().history[team];
    const cur = recallRef.current.team === team ? recallRef.current.idx : -1;
    let idx: number;
    if (dir < 0) {
      if (cur >= hist.length - 1) return; // nothing older (also covers empty history)
      if (cur === -1) draftRef.current[team] = hudInputs.get(team)?.getLatex() ?? "";
      idx = cur + 1;
    } else {
      if (cur < 0) return; // already on the draft — never blank it
      idx = cur - 1;
    }
    recallRef.current = { team, idx };
    const val = idx === -1 ? draftRef.current[team] : hist[idx];
    programmaticRef.current = true;
    hudInputs.get(team)?.setLatex(val);
    programmaticRef.current = false;
    setLive((l) => ({ ...l, [team]: val }));
  };

  const onEdit = (team: Team) => {
    if (programmaticRef.current) return;
    recallRef.current = { team: null, idx: -1 }; // user typed -> leave recall
    setLive((l) => ({ ...l, [team]: hudInputs.get(team)?.getLatex() ?? "" }));
  };

  const insertChip = (chars: string) => {
    if (waiting || busy) return;
    hudInputs.get(turn)?.insertText(chars);
    recallRef.current = { team: null, idx: -1 };
    setLive((l) => ({ ...l, [turn]: hudInputs.get(turn)?.getLatex() ?? "" }));
  };

  const canFire = !waiting && !busy && live[turn].trim() !== "";
  const label = turn.toUpperCase();

  return (
    <div className="hud-console">
      <div className="hud-console__turnline">
        <span className="hud-console__turn" aria-live="polite">
          <span className={`hud-console__dot is-${displayed}`} aria-hidden="true" />
          {waiting ? `${label} IS AIMING…` : `${label} TO FIRE`}
        </span>
        <TimerBadge />
      </div>

      <div className={`hud-console__inputrow ${waiting ? "is-locked" : ""}`}>
        <span className="hud-prompt">y =</span>
        <div className="hud-console__fields">
          {teams.map((t) => (
            <div
              key={t}
              className={`hud-console-field ${t === turn && !waiting ? "" : "hud-console-field--hidden"}`}
            >
              <MathField
                team={t}
                registry={hudInputs}
                makeInput={makeInput}
                onEnter={() => hudController.requestFire(t)}
                onEdit={() => onEdit(t)}
                onUpOutOf={() => recallStep(t, -1)}
                onDownOutOf={() => recallStep(t, 1)}
              />
            </div>
          ))}
          {waiting && (
            <span className="hud-console-field hud-console-field--locked">
              opponent is choosing a curve…
            </span>
          )}
        </div>
        {!waiting && (
          <button
            type="button"
            className="hud-console__clear"
            title="Clear"
            aria-label="Clear equation"
            disabled={!live[turn].trim()}
            onClick={() => {
              programmaticRef.current = true;
              hudInputs.get(turn)?.setLatex("");
              programmaticRef.current = false;
              setLive((l) => ({ ...l, [turn]: "" }));
              hudInputs.get(turn)?.focus();
            }}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="gw-btn gw-btn--primary hud-console__fire"
          disabled={!canFire}
          onClick={() => hudController.requestFire(turn)}
        >
          {busy ? "Firing…" : "Fire"}
          <span className="hud-console__fire-key" aria-hidden="true">↵</span>
        </button>
      </div>

      <div className="hud-status">{!waiting ? status : ""}</div>

      <div className="hud-console__chiprow">
        <div className="hud-console__chips">
          {CHIP_GROUPS.map((group, gi) => (
            <div className="hud-console-chip-group" key={gi}>
              {group.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className="hud-console-chip"
                  disabled={waiting || busy}
                  onClick={() => insertChip(c.type)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <span className="hud-console__hint">↑ recall · ↵ fire</span>
      </div>
    </div>
  );
}

function OTHER(t: Team): Team {
  return t === "red" ? "blue" : "red";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/hud/FiringConsole.test.tsx`
Expected: PASS (all tests). If the recall or Fire-disabled tests fail because `live` didn't update: confirm the `makeTrackedInput` fixture's `setLatex`/`insertText` fakes call `editCb?.()` synchronously (as written above) — `FiringConsole`'s `onEdit` handler is what updates `live`, mirroring exactly how the real `MathInput` fires its own `edit` handler on programmatic `.latex()` calls.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/hud/TimerBadge.tsx src/app/hud/FiringConsole.tsx src/app/hud/FiringConsole.test.tsx
git commit -m "feat(hud): add FiringConsole, the redesigned turn-based footer console"
```

---

### Task 5: `HudBar` branches on `noTurn`

**Files:**
- Modify: `src/app/hud/HudBar.tsx`
- Test: `src/app/hud/HudBar.test.tsx`

**Interfaces:**
- Consumes: `FiringConsole` and the shared `TimerBadge` (both Task 4).
- Produces: `HudBar`'s public signature (`{ makeInput, singleTeam }`) is unchanged — `Footer.tsx` needs no changes to how it calls `<HudBar>`.

- [ ] **Step 1: Write the failing tests**

In `src/app/hud/HudBar.test.tsx`, the existing test **`"singleTeam unset renders both panels (dual layout unchanged)"`** (in the `describe("HudBar — singleTeam prop", ...)` block) encodes the OLD always-both-panels-visible behavior for turn-based play, which this task replaces. Replace that one test, and add new turn-based-routing coverage. Apply this diff (replace the named test; add the two new ones directly after it, inside the same `describe` block):

Remove:
```ts
  it("singleTeam unset renders both panels (dual layout unchanged)", () => {
    render(<HudBar makeInput={makeInput} />);
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(2);
    expect(document.querySelector(".player-panel.is-red")).toBeTruthy();
    expect(document.querySelector(".player-panel.is-blue")).toBeTruthy();
  });
```

Add in its place:
```ts
  it("turn-based (noTurn false, the default), singleTeam unset: renders the single-console FiringConsole, not the old dual panels", () => {
    render(<HudBar makeInput={makeInput} />);
    expect(document.querySelector(".hud-console")).toBeTruthy();
    expect(document.querySelector(".player-panel")).toBeNull();
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(1); // one visible Fire button, not one per side
  });

  it("noTurn mode still renders the original always-both-visible dual panel layout, unaffected by the redesign", () => {
    act(() => hudController.setNoTurnMode(true));
    render(<HudBar makeInput={makeInput} />);
    expect(document.querySelector(".player-panel.is-red")).toBeTruthy();
    expect(document.querySelector(".player-panel.is-blue")).toBeTruthy();
    expect(document.querySelector(".hud-console")).toBeNull();
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(2);
  });
```

Also update the two tests just above it, **`"singleTeam='blue' renders exactly one Fire button and it belongs to blue"`** and **`"singleTeam='red' renders exactly one Fire button for red"`**, since `.player-panel.is-blue`/`.is-red` no longer exists for turn-based singleTeam (that's now `FiringConsole`'s single mounted `.hud-console-field`, not a `.player-panel`). Replace both:

```ts
  it("singleTeam='blue' renders exactly one Fire button and mounts only blue's field", () => {
    act(() => hudController.setTurn("blue"));
    render(<HudBar makeInput={makeInput} singleTeam="blue" />);
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(1);
    expect(document.querySelectorAll(".hud-console-field")).toHaveLength(1);
  });

  it("singleTeam='red' renders exactly one Fire button and mounts only red's field", () => {
    act(() => hudController.setTurn("red"));
    render(<HudBar makeInput={makeInput} singleTeam="red" />);
    const fires = screen.getAllByRole("button", { name: "Fire" });
    expect(fires).toHaveLength(1);
    expect(document.querySelectorAll(".hud-console-field")).toHaveLength(1);
  });
```

The two `hud-bar--single`/dual-modifier-class tests (**`"singleTeam mode adds the hud-bar--single modifier..."`** and **`"dual (local) layout does NOT get the single-column modifier"`**) test a CSS hook (`.hud-bar--single`) that belonged to the OLD two-column-grid layout. Since `FiringConsole` never uses a two-column grid (it's always one console), delete both of those tests — there is nothing left for them to assert once `.hud-bar`'s grid layout is retired for the turn-based path. (`.hud-bar`/`.hud-bar--single` remain defined in `hud.css` for the `noTurn` dual-panel path only; no test regresses by removing coverage of a modifier that no longer applies to the redesigned path.)

Also update the top-level `describe("HudBar", ...)` block's four existing tests that assume the dual-panel is what's rendered by default (`"disables the inactive side's Fire button..."`, `"locks the inactive side's math input..."`, `"shows the timer only on the active panel..."`, `"fire click routes through controller gating"`) — these all call `hudController.setTurn(...)` and expect **two** Fire buttons / two tracked inputs, which is still correct behavior, just now delivered by `FiringConsole` mounting both fields rather than two `PlayerPanel`s. Read each assertion carefully: they assert on `screen.getAllByRole("button", { name: "Fire" })[0]`/`[1]` (index-based), which no longer holds — `FiringConsole` renders exactly **one visible** Fire button (for whichever team's turn it is), not one per side. Update all four:

```ts
  it("disables Fire until the active team's field has content, and Fire always targets the current turn", () => {
    const trackedMakeInput = () => { const m = makeInput(); return m; };
    render(<HudBar makeInput={trackedMakeInput} />);
    act(() => hudController.setTurn("red"));
    expect(screen.getAllByRole("button", { name: "Fire" })).toHaveLength(1);
  });

  it("locks the inactive side's math input (hidden, not just disabled Fire)", () => {
    const mocks: ReturnType<typeof makeInput>[] = [];
    const trackedMakeInput = () => { const m = makeInput(); mocks.push(m); return m; };
    render(<HudBar makeInput={trackedMakeInput} />);
    act(() => hudController.setTurn("red"));
    const [redInput, blueInput] = mocks;
    expect(redInput.setEnabled).toHaveBeenLastCalledWith(true);
    expect(blueInput.setEnabled).toHaveBeenLastCalledWith(false);
    act(() => hudController.setTurn("blue"));
    expect(redInput.setEnabled).toHaveBeenLastCalledWith(false);
    expect(blueInput.setEnabled).toHaveBeenLastCalledWith(true);
  });

  it("shows the timer on the console", () => {
    render(<HudBar makeInput={makeInput} />);
    act(() => hudController.setTurn("red"));
    act(() => hudController.setTimer(42));
    expect(screen.getByText("42s")).toBeTruthy();
  });

  it("fire click routes through controller gating", () => {
    const cb = vi.fn();
    hudController.onFire(cb);
    render(<HudBar makeInput={makeInput} />);
    hudInputs.register("red", fakeInput("\\tan(x)"));
    act(() => hudController.setTurn("red"));
    fireEvent.click(screen.getByRole("button", { name: "Fire" }));
    expect(cb).toHaveBeenCalledWith("red", "\\tan(x)");
  });
```

(Note: the old `"shows the timer only on the active panel and hides it in no-turn"` test's no-turn assertion doesn't apply to `FiringConsole` — that path is never rendered when `noTurn` is true; the new `"noTurn mode still renders the original..."` test above already covers the noTurn branch.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/hud/HudBar.test.tsx`
Expected: FAIL — `HudBar` still renders the old dual layout unconditionally (no `.hud-console` in the DOM yet).

- [ ] **Step 3: Implement**

Replace `src/app/hud/HudBar.tsx` in full:

```tsx
import { useEffect } from "react";
import "./hud.css";
import { useStore } from "../store";
import { hudStore, hudController, hudInputs, type Team } from "./hudStore";
import { MathField } from "./MathField";
import { TimerBadge } from "./TimerBadge";
import { FiringConsole } from "./FiringConsole";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PlayerPanel({ team, makeInput }: { team: Team; makeInput?: () => any }) {
  const turn = useStore(hudStore, (s) => s.turn);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  const busy = useStore(hudStore, (s) => s.busy[team]);
  const status = useStore(hudStore, (s) => s.status);
  const active = noTurn || turn === team;
  const canFire = active && !busy;
  useEffect(() => {
    hudInputs.get(team)?.setEnabled(canFire);
  }, [team, canFire]);
  return (
    <div className={`player-panel is-${team} ${active ? "is-active" : "is-inactive"}`}>
      <div className="fire-row">
        <span className="hud-prompt">y =</span>
        <MathField team={team} registry={hudInputs} makeInput={makeInput}
          onEnter={() => hudController.requestFire(team)} />
        {turn === team && <TimerBadge />}
        <button className="gw-btn" disabled={!canFire}
          onClick={() => hudController.requestFire(team)}>Fire</button>
      </div>
      <div className="hud-status">{turn === team ? status : ""}</div>
    </div>
  );
}

/**
 * `noTurn` (simultaneous-fire) mode keeps the original always-both-visible
 * dual layout — there's no "whose turn" concept to swap a single console on.
 * Turn-based play (the default) delegates to the redesigned FiringConsole.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HudBar({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  const noTurn = useStore(hudStore, (s) => s.noTurn);

  if (!noTurn) {
    return <FiringConsole makeInput={makeInput} singleTeam={singleTeam} />;
  }

  return (
    <div className={singleTeam ? "hud-bar hud-bar--single" : "hud-bar"}>
      {singleTeam ? (
        <PlayerPanel team={singleTeam} makeInput={makeInput} />
      ) : (
        <>
          <PlayerPanel team="red" makeInput={makeInput} />
          <PlayerPanel team="blue" makeInput={makeInput} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/hud/HudBar.test.tsx`
Expected: PASS (all tests, including the `HudOverlays` describe block at the bottom of the same file, which this task doesn't touch and must remain green).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/hud/HudBar.tsx src/app/hud/HudBar.test.tsx
git commit -m "feat(hud): HudBar delegates to FiringConsole for turn-based play"
```

---

### Task 6: `Footer` — team-glow card + inline quit confirm

**Files:**
- Modify: `src/app/hud/Footer.tsx`
- Test: `src/app/hud/Footer.test.tsx`

**Interfaces:**
- Consumes: `hudStore` (reads `turn`/`noTurn` to compute the outer card's team-glow classes).
- Produces: no public prop changes — `Footer`'s existing `FooterProps` interface is untouched; `mode="ingame"` internals change only.

- [ ] **Step 1: Write the failing tests**

In `src/app/hud/Footer.test.tsx`, replace the two `window.confirm`-based tests:

```ts
  it("ingame Quit Match confirms before calling onLeave", () => {
    const onLeave = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Footer mode="ingame" onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("ingame Quit Match does nothing if the confirm is dismissed", () => {
    const onLeave = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Footer mode="ingame" onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /quit match/i }));
    expect(onLeave).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
```

with:

```ts
  it("ingame Quit shows an inline confirm (no native window.confirm) and calls onLeave on Quit", () => {
    const onLeave = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<Footer mode="ingame" onLeave={onLeave} makeInput={makeInput} />);
    fireEvent.click(screen.getByRole("button", { name: /^quit$/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/quit match\?/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^quit$/i }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("ingame Quit inline confirm: Stay dismisses without calling onLeave", () => {
    const onLeave = vi.fn();
    render(<Footer mode="ingame" onLeave={onLeave} makeInput={makeInput} />);
    fireEvent.click(screen.getByRole("button", { name: /^quit$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^stay$/i }));
    expect(onLeave).not.toHaveBeenCalled();
    expect(screen.queryByText(/quit match\?/i)).toBeNull();
  });

  it("ingame footer card carries the active team's glow class, reading turn from hudStore", () => {
    render(<Footer mode="ingame" makeInput={makeInput} />);
    act(() => hudController.setTurn("blue"));
    expect(document.querySelector(".footer--ingame.is-blue")).toBeTruthy();
    act(() => hudController.setTurn("red"));
    expect(document.querySelector(".footer--ingame.is-red")).toBeTruthy();
  });

  it("ingame footer card has no team-glow class in noTurn mode", () => {
    act(() => hudController.setNoTurnMode(true));
    render(<Footer mode="ingame" makeInput={makeInput} />);
    expect(document.querySelector(".footer--ingame.is-red")).toBeNull();
    expect(document.querySelector(".footer--ingame.is-blue")).toBeNull();
  });
```

Add the needed imports at the top of the file (`act` from Testing Library, `hudController` from `./hudStore`):

```ts
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { Footer, roomLink } from "./Footer";
import { hudStore, hudController, initialHudState } from "./hudStore";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/hud/Footer.test.tsx`
Expected: FAIL — `window.confirm` is still called; no `.is-red`/`.is-blue` class exists on `.footer--ingame`; no "Quit" (as opposed to "Quit Match") button/inline confirm text exists yet.

- [ ] **Step 3: Implement**

In `src/app/hud/Footer.tsx`:

Add imports (after the existing `import type { Team } from "./hudStore";`):

```ts
import { useStore } from "../store";
import { hudStore } from "./hudStore";
```

Replace the `mode === "ingame"` branch (currently lines 79-89) with:

```tsx
  if (props.mode === "ingame") {
    return <IngameFooter onLeave={props.onLeave} makeInput={props.makeInput} singleTeam={props.singleTeam} />;
  }
```

Add a new `IngameFooter` component in the same file, right below the `Footer` function (after its closing brace, before `export`-level statements end — i.e. append this new function to the file):

```tsx
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function IngameFooter({ onLeave, makeInput, singleTeam }: { onLeave?: () => void; makeInput?: () => any; singleTeam?: Team }) {
  const [quitConfirm, setQuitConfirm] = useState(false);
  const turn = useStore(hudStore, (s) => s.turn);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  const waiting = singleTeam !== undefined && turn !== singleTeam;
  const glowTeam: Team = waiting ? (singleTeam === "red" ? "blue" : "red") : turn;
  const teamClass = noTurn ? "" : `is-${glowTeam}`;
  const waitingClass = !noTurn && waiting ? "is-waiting" : "";

  return (
    <div className={`comp footer footer--ingame ${teamClass} ${waitingClass}`} data-testid="arena-footer">
      <div className="footer-quit">
        {quitConfirm ? (
          <span className="footer-quit__confirm">
            <span className="footer-quit__q">Quit match?</span>
            <button type="button" className="gw-btn gw-btn--danger footer-quit__yes" onClick={onLeave}>Quit</button>
            <button type="button" className="gw-btn footer-quit__no" onClick={() => setQuitConfirm(false)}>Stay</button>
          </span>
        ) : (
          <button type="button" className="gw-btn footer-quit__btn" onClick={() => setQuitConfirm(true)}>Quit</button>
        )}
      </div>
      <HudBar makeInput={makeInput} singleTeam={singleTeam} />
    </div>
  );
}
```

Add the `useState` import (the file already imports `useEffect, useRef, useState` — no change needed there, `useState` is already imported).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/hud/Footer.test.tsx`
Expected: PASS (all tests, including the earlier-in-this-plan `"ingame: centers input + Fire, no Start/waiting/name/switch/copy"` test, which still passes since it only checks for the ABSENCE of pregame-only controls and the presence of `.footer--ingame` + at least one Fire button — both still true).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/hud/Footer.tsx src/app/hud/Footer.test.tsx
git commit -m "feat(hud): ingame footer card glows with the active team, inline quit confirm"
```

---

### Task 7: Retire the prototype, full verification, final commit

**Files:**
- Delete: `src/app/hud/_proto/` (entire directory), `proto-footer.html`
- No new test file — this task is verification, not new behavior.

- [ ] **Step 1: Run the full suite twice**

Run: `npx vitest run`
Then run again: `npx vitest run`
Expected: PASS both times. Per CLAUDE.md, this checkout's full suite is flaky under parallel load on a slow cloud-synced filesystem — if any file fails, re-run that file alone (`npx vitest run <path>`) before treating it as a real regression. If a file still fails in isolation, stop and fix it before continuing.

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: `tsc --noEmit` and the Vite build both succeed with no errors.

- [ ] **Step 3: Server typecheck (unaffected, but CLAUDE.md requires it after any change)**

Run: `npx tsc -p server/tsconfig.json`
Expected: no errors (this plan touches no `server/` files, but this is the project's standing convention after any change).

- [ ] **Step 4: Manual browser verification (required — this exact class of bug is what CLAUDE.md flags Vitest as missing)**

Run: `npm run dev` (and `npm run server` in another terminal for the online checks). In a real browser:

1. **Local hotseat, turn-based**: start a local match. Confirm: the footer shows one console; the turn line reads `RED TO FIRE`; typing an equation enables Fire; firing swaps to `BLUE TO FIRE` with an empty field; firing again returns to red with **red's original equation gone** (fired) but the swap itself introduces no lag/flash; Up-arrow recalls the last-fired equation for whichever team is active; Down-arrow at the draft boundary does not blank the field (this was the specific bug fixed earlier in the prototype's history — confirm it didn't regress in the port).
2. **Local hotseat, no-turn mode**: start a local match with the "no timer" config option enabled. Confirm the OLD dual-panel layout still renders exactly as before (both panels visible, no console, no chips) — this path must look completely unchanged.
3. **Online**: host a room, join as a second player/tab. Confirm: your own console; when it's not your turn, the field shows the "opponent is choosing a curve…" locked placeholder and the footer card carries a dimmer glow in the opponent's color; when your turn arrives, the glow strengthens and the field unlocks.
4. **Tall equation**: type a deeply nested equation (e.g. repeatedly select the end and type `/` to nest fractions). Confirm the field caps its height and scrolls internally, the arena above never disappears, and the chip row / Fire button stay visible below the field.
5. **Chips**: click a chip from each group (including `ln`/`logₐ`) and confirm it inserts correctly into the active field.
6. **Focus ring**: Tab to a chip and confirm the ivory focus ring appears (not the browser's native blue outline).
7. **Quit**: click Quit, confirm the inline "Quit match? [Quit] [Stay]" appears (no native browser dialog), Stay dismisses it, Quit calls the leave flow.

If any check fails, fix it before proceeding — do not defer a failed manual check to "later."

- [ ] **Step 5: Delete the prototype**

```bash
rm -rf src/app/hud/_proto/ proto-footer.html
```

- [ ] **Step 6: Final verification after deletion**

Run: `npx vitest run` (confirm nothing referenced the deleted prototype — it never should have, since it was a standalone route)
Run: `npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/hud/_proto proto-footer.html
git commit -m "$(cat <<'EOF'
chore(hud): retire the footer prototype now that it's folded into production

The redesigned turn-based footer (single-swapping console, grouped chips,
equation recall, inline quit confirm, team-glow card) is now live in
Footer.tsx/HudBar.tsx/FiringConsole.tsx. noTurn mode keeps its original
dual-panel layout, untouched.
EOF
)"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Scope boundary, restated:** `noTurn` (simultaneous-fire) mode is explicitly out of scope. If a task's diff starts touching `PlayerPanel`'s own rendering logic or `.player-panel`/`.hud-bar` CSS, stop — that's scope creep into a mode the prototype never modeled or validated.
- **Type consistency check already done:** `HudInputHandle.insertText` (Task 1) ↔ `MathInputLike.insertText` (Task 2) ↔ `MathInput.insertText` (Task 2) all share the exact signature `(text: string) => void` / `insertText(chars: string): void` — verified consistent above. `onEdit`/`onUpOutOf`/`onDownOutOf` are declared on `MathInputLike` (required) but exposed as optional props on `MathField` (Task 2) — this asymmetry is intentional, not a bug: every real/fake *input instance* always implements the full handler surface, but not every *caller* of `MathField` cares about every callback.
- **`FiringConsole`'s prop signature intentionally mirrors `HudBar`'s current one** (`{ makeInput, singleTeam }`) so Task 5's `HudBar` can delegate with zero adaptation.
