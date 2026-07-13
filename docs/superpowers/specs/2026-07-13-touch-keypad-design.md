# In-footer math keypad (touch input)

**Status:** design approved, prototype pending
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
orientation for this game. The prototype decides.

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

## Deferred to the prototype

Design questions that only a real device can answer. **On a branch, in the real
app, deployed to the real server** — a standalone mockup cannot answer any of them,
because it has no MathQuill, no footer grid, and no arena competing for space.

1. Key layout: grid vs rows vs matrix; where digits, operators, functions and
   navigation sit relative to each other.
2. The recall popover's exact form and dismissal.
3. Whether the always-on keypad is right on **desktop**, where it is never needed.
   (Decision 2 says it is present; the prototype may argue for shrinking it there.)
4. Final orientation call for iPad — and therefore whether the 700px gate stays.
5. Whether `--cc-footer-min` / `--cc-map-min` need new values.

## Risks

- **Caret visibility.** `inputmode="none"` keeps the field focusable, but we have
  not confirmed on-device that the MathQuill caret is *visible and correctly
  placed* on tap. If it is not, the player cannot see where a key will land, and
  we need our own caret treatment before any of this is playable. **Check first in
  the prototype.**
- **Buttons stealing focus.** A `<button>` tap blurs the textarea. The chip row
  survives this because `insertText()` re-focuses. Keypad keys must do the same
  (or `preventDefault` on pointerdown) or the caret will jump/vanish on every key.
- **Touch target size.** Keys must be large enough to hit on glass while the
  footer stays short enough to leave the arena visible. These pull against each
  other; this is the main thing the prototype is arbitrating.
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
- **Everything that actually matters here is invisible to Vitest** — caret
  behavior, touch targets, whether the arena is legible with the footer tall.
  Verify on the device, per CLAUDE.md's standing warning that this codebase's real
  bug classes are the ones the unit suite misses.
