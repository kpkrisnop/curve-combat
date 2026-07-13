# In-footer math keypad (touch input)

**Status:** approved — layout frozen by prototype, ready to implement
**Date:** 2026-07-13

## Why

CurveCombat is unplayable on iPad, and every symptom traces to one cause — the
native iOS keyboard:

1. Tapping the equation field often does not open the keyboard at all.
2. When it does open, it covers the footer console, so the player cannot see
   what they are typing until the caret forces a scroll.
3. Dismissing it leaves the page displaced (empty space at the bottom).
4. Even when it behaves, it eats ~45% of the screen, so the player cannot see
   the arena — and you cannot choose a curve without seeing the axes.

Fixes aimed at symptoms failed. A coarse-pointer guard on programmatic `focus()`
(`90b2d52`) had no effect on device and was reverted (`229cab8`). The screen gate
was lowered to 700px (`643a168`) to let portrait iPad through; it helps, but not
enough on its own.

The root cause is that we do not control the keyboard. So we stop using it.

## Prior art — and what actually failed

The codebase *had* an on-screen keyboard and removed it (`50550e1`, 2026-06-21:
*"Swap math input from MathLive to MathQuill; remove virtual keyboard"*). KP
remembers it as clunky and hard to tune.

It was **MathLive's built-in virtual keyboard**, driven by MathLive's keycap DSL:
JSON keycap objects, a `switchKeyboardLayer` layer machine, `performWithFeedback`
commands, four layers including a full QWERTY with shift, and MathLive's own CSS.
It was clunky because we were tuning *someone else's keyboard framework*.

The lesson on the record is **"do not tune a library's keyboard"** — not "an
on-screen keyboard cannot work here." A hand-built keypad is plain `<button>`
elements calling `insertText()`, in our own CSS, with no framework to fight.
That mechanism already exists and ships today: the function chip row in
`FiringConsole.tsx`.

## The precondition (verified)

`inputmode="none"` on MathQuill's hidden textarea (`52fecc2`) is the platform's
own off switch: the field stays focusable and keeps its caret, but the OS opens
no keyboard for it. Physical keys are unaffected, so **no device detection is
needed anywhere in this design**.

**Verified on a real iPad + desktop:** keyboard suppressed on touch, desktop
unaffected.

Consequence: with the native keyboard gone and no keypad yet, **touch devices
currently cannot type at all.** This spec closes that hole.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Keys: digits, `.`, operators, `x`, parens, functions, `←`/`→`, Backspace.** No letters, no QWERTY, no layers. | Needing letters is what forced the QWERTY layer that made the old one clunky. Functions are covered by keys, so arbitrary letter entry is unnecessary. |
| 2 | **Unconditional: keypad on every device; `inputmode="none"` always.** No `matchMedia`, no UA sniff. | Media queries describe the *pointer*, not whether a hardware keyboard exists — an iPad with a Magic Keyboard reports `hover: hover`. Any detection-based design has a lockout failure mode. Desktop keeps using physical keys; the pad is simply also there. |
| 3 | **Backspace is mandatory.** | With the OS keyboard gone, the only existing delete is the `×` Clear button, which nukes the whole equation. A single mistyped character would mean retyping everything on a shot clock. |
| 4 | **Arrows are mandatory.** | With `supSubsRequireOperand`, the only way out of an exponent is Right. Type `x^2` from a chip today and you are stuck inside the superscript. `charsThatBreakOutOfSupSub: "+-=<>"` only papers over this when the next char happens to be an operator. |
| 5 | **The chip row is absorbed into the keypad.** One grid, one component; `hud-console__chiprow` is deleted. | Two button grids in one footer, doing the same job (`insertText` into the same field), is the texture of "clunky" — and the footer is where vertical space is scarcest. The chip row already *is* a keypad; we grow it rather than build a second one. Net deletion of a concept. |
| 6 | **Recall gets its own button and a Discord-slash-style popover** opening upward over the input. It is no longer bound to Up/Down. | "Press ↑ to recall" is a keyboard idiom on a device with no Up key. Recall (tweak your last shot, fire again) is too good to leave unreachable on touch. |
| 7 | **The keypad lives inside the footer card** — sharing its border, background and styling. It never floats, overlays, or slides in over the map. | See success criteria. |

## Success criteria

**The player can see the whole arena while typing and while firing.** Nothing the
game does covers the map or the console.

Transient, player-initiated, self-dismissing UI (the recall popover) *may*
occlude briefly — the player opened it and can close it. The rule outlaws
uninvited occlusion, not deliberate interaction.

This implies the keypad is **always on** and part of the footer's layout, not an
overlay: anything that appears and disappears would resize the map mid-turn.

KP has confirmed there is room for the keypad on desktop, iPad portrait, and iPad
landscape.

## Orientation note (revised)

Earlier analysis claimed portrait wastes height and would letterbox the map into a
useless strip. **That was wrong.** The map is `20 × 12` — a 5:3 landscape shape,
fit-to-contain — so it would rather have full *width* than a tall row. With a
permanent keypad in the footer:

- **iPad landscape (1024×768):** map row ≈ 344px tall × 988px wide → arena renders
  ≈ **573 × 344**, letterboxed left and right (height-starved).
- **iPad portrait (768×1024):** map row ≈ 600px tall × 732px wide → arena renders
  ≈ **732 × 439** (width-limited, no waste).

Portrait yields roughly **60% more arena pixels** once the footer is tall. The
700px ungate is therefore not a hack to be reverted — portrait may be the better
orientation for this game. The prototype supports this; confirm on the device
before deciding the 700px gate's fate.

## Architecture

Three touched units; MathQuill stays contained to one file, as designed.

**`src/ui/MathInput.ts`** — the sole MathQuill-aware module. Gains one passthrough:

```ts
/** Send a raw keystroke (arrows, Backspace) — the keypad's non-text keys. */
keystroke(keys: string): void   // → mq.keystroke(...)
```

`MQMathField.keystroke` must be added to `src/mathquill.d.ts` (the ambient types
cover only the API we use; `keystroke` is not there yet). `inputmode="none"` is
already set in the constructor.

**`src/app/hud/Keypad.tsx`** (new) — a pure presentational grid of `<button>`s.
Props: the key model, plus `onKey(key)`. Knows nothing about MathQuill, teams, or
turns. Every key is one of three kinds:

- `insert` — text into the field (`insertText`), the existing chip mechanism
- `keystroke` — arrows, Backspace (`keystroke`)
- `action` — recall (opens the popover), clear

**`src/app/hud/FiringConsole.tsx`** — owns the keypad's wiring, exactly as it owns
the chip row today: routes `onKey` to the active team's registered input via
`hudInputs`, keeps the `waiting || busy` disable rule, and owns the recall popover
state (it already owns `recallRef` / `draftRef` and the `recallStep` logic — the
popover is a new *surface* on existing state, not new state). `CHIP_GROUPS` and
`hud-console__chiprow` are deleted.

**Layout** stays a footer-card concern in `hud.css` / `theme.css`. The
`.arena-shell` grid already grows the footer row (`minmax(--cc-footer-min, auto)`)
and shrinks the map row, so a taller footer needs no grid change — only the
`--cc-footer-min` / `--cc-map-min` floors may need revisiting.

## The layout (frozen by the prototype)

Settled in `src/app/hud/PROTOTYPE-keypad.html` (throwaway; delete once built).
KP's design, corrected in three places and validated at real device sizes.

The footer is a band of **four zones**: **console · numbers · operators ·
functions**.

**Console zone** (flexible width, `min-width: 260px`), top to bottom:
turn line + timer · status line · `y =` + the equation field (full width) ·
nav row (`← → ⌫ Clear ↺ Recall`) · **Fire, spanning the full column width**.
Fire is the primary action and gets its own full-width bar; sharing a row with the
input squeezed both.

**Numbers zone** — calculator order, 3 columns:

```
7 8 9
4 5 6
1 2 3
0 . x
```

`0` is on the bottom row, where every calculator, phone and keyboard puts it —
players reach on muscle memory under a shot clock. **`x` is promoted out of the
digit grid**: large, blue, italic, visually a *variable*. It is the most-typed
symbol in the game and must never be confusable with `×` (KP's sketch had them two
keys apart — a real misfire risk).

**Operators zone** — 2 columns: `+ −` / `× ÷` / `( )` / `^ √`.

**Functions zone** — a scrolling panel. The common twelve
(`sin cos tan √ / ln log x² xⁿ / π e abs 1/a`) sit **above the fold**; scrolling
only ever reaches the exotic tail (`arcsin cosh floor sign …`), all of which
MathQuill already understands via `autoOperatorNames`, so they cost nothing.

The scroll cue is a **fade, no scrollbar** — the `local`-over-`scroll` background
trick already used by `.comp.side-panel` in `theme.css`, which self-cancels at the
true bottom. The panel is `position: absolute` inside its zone so it contributes
**no height**: the console column sets the band's height and the functions scroll
within it. (Getting this wrong is what made the panel silently grow the footer
instead of scrolling.)

**Responsive step — a container query, not a media query.** The footer's own width
decides the arrangement (`container-type: inline-size` on the footer):

- **Wide (desktop, iPad landscape)** — all four zones side by side; functions are a
  216px, 4-column side column.
- **Narrow (iPad portrait, ≤ 820px footer)** — four zones side by side starve the
  equation field, so the **function panel wraps to its own full-width row beneath
  the band and spreads to 8 columns**. The input gets its width back.

A media query would read the *viewport*; the footer's width is what actually
constrains this (the side panel can be open), so the container query is both more
correct and testable in a scaled frame.

**Quit moves out of the footer.** The keypad fills it, so `.footer-quit`
(`Footer.tsx`, absolutely positioned into the footer's top-left) is evicted and
becomes a **floating `[✕]` in the map card's top-right corner**. Top-centre is
taken by the round/score readout; RED spawns left, so the right corner is the
least likely to sit over anything. **The two-step confirm is retained** — a
one-tap quit floating over the play area on a touchscreen would end matches by
stray palm. This is a deliberate, narrow exception to "nothing is hidden": 40px,
in a corner, and in landscape it lands in the letterbox margin and covers nothing.

## Scope: two separate pieces

Per KP, this ships as **two independent changes**, not one:

1. **The keypad** (this spec's core) — prototyped, layout frozen above.
2. **Recall as a popover** — no prototype needed; implement directly. The recall
   *button* is part of the keypad's nav row, but the popover is its own change and
   can land before or after.

**Recall popover.** Tapping `↺ Recall` opens a list **upward, over the input**, in
the spirit of Discord's `/` command menu: most recent shot first, tap to load it
into the field, tap-away or Esc to dismiss. It is transient, player-initiated and
self-dismissing, which is the sanctioned exception to "nothing is hidden."

It replaces the Up/Down key binding (`onUpOutOf` / `onDownOutOf` in
`FiringConsole.tsx`), which is a keyboard idiom that means nothing on a device with
no arrow keys — and the `↑ recall · ↵ fire` hint text goes with it. **Desktop keeps
Up/Down** as an accelerator; the popover is the discoverable surface, not a
replacement for the shortcut.

The state already exists (`recallRef`, `draftRef`, `recallStep`, and
`hudStore.history[team]`) — the popover is a new *view* of it, not new state.

## Resolved (KP, after the prototype)

1. **The keypad is always open, on every device — including desktop.** Not a
   toggle, not touch-only. Consistency: one footer, one layout, one thing to learn.
   This also keeps Decision 2's no-detection property intact end to end.
2. **The 700px gate stays.** Portrait iPad remains ungated.
3. **`--cc-footer-min` / `--cc-map-min` keep their current values** for now; adjust
   only if the real footer proves them wrong.

## Risks

- **Caret visibility — VERIFIED on device.** With `inputmode="none"` shipped
  (`52fecc2`), KP confirms the MathQuill caret is visible in the field on iPad.
  This was the one risk that could have invalidated the whole approach; it held.
- **Buttons stealing focus.** A `<button>` tap blurs the textarea. The chip row
  survives this because `insertText()` re-focuses. Keypad keys must do the same (or
  `preventDefault` on pointerdown) or the caret will jump or vanish on every key.
  **This is now the top implementation risk** — it is the one thing that can still
  make every key feel broken on touch.
- **The prototype is not the app.** It has no MathQuill, no Pixi canvas, and its
  arena is an SVG mock. Sizes it reports are geometry, not proof; the real footer
  carries a live MathQuill field whose height we have not measured.
- **The window of unplayability.** `inputmode="none"` is on `main` now, so touch
  devices cannot type until the keypad lands. Keep that window short.

## Testing

Per repo convention: TDD, colocated `*.test.tsx`, Testing Library.

- `Keypad` is pure and prop-driven — test that each key kind emits the right
  `onKey`, and that keys disable while `waiting || busy`.
- `FiringConsole` already has a `makeInput` test seam injecting a fake input; use
  it to assert routing (insert / keystroke / recall) reaches the active team's
  field and no other.
- `MathInput.keystroke` is a one-line passthrough; the existing
  `inputmode="none"` test covers the suppression.
- Quit: assert the two-step confirm survives the move to the map card — a
  single-tap quit is the failure mode that matters.
- Recall popover: assert it lists `hudStore.history[team]` newest-first, loads the
  picked entry into the active field, and that dismissing restores the draft
  (`draftRef`) rather than destroying unfired work.
- **Everything that actually matters here is invisible to Vitest** — caret
  behavior, touch targets, whether the arena is legible with the footer tall.
  Verify on the device, per CLAUDE.md's standing warning that this codebase's real
  bug classes are the ones the unit suite misses.
