# Footer prototype — throwaway

**Run:** `npm run dev` → open http://localhost:5173/proto-footer.html

## Question
The redesigned in-game footer uses a **single visible math input that swaps
colour/ownership between the two teams each turn**. Concern (KP): "when the
colour swaps, the game has to remember each player's equation and swap everything
at the same time (pass equations, current equation)." Does that swap work, and is
it safe?

## Approach under test
**Two MathQuill instances stay mounted** — one per team — and only the active
team's is shown (`display:none` on the other). This also satisfies the second
requirement: the idle player can't read/copy the live equation, because the other
field is hidden while it's not their turn.

## Verdict (browser-verified 2026-07-11)
- Per-team equation survives the swap untouched? → **YES.** Typed `sin(x)·3` as RED,
  swapped to BLUE (BLUE field empty, RED's value + history intact), swapped back,
  RED still `sin(x)·3`. Confirmed again live: RED holding `ghj` while BLUE holds `√x`,
  separate histories, zero cross-contamination. The two persistent instances need no
  marshalling — the concern is dissolved by the architecture, not merely handled.
- Idle player can't read the live equation? → **YES**, hidden field is `display:none`.
- Direction (single input + swap vs two panels) → **single-input+swap validated.**

## Findings for the real build (not blockers — the prototype's job was to catch these)
1. **Own the timer/turns in the game layer, not the component.** This proto drives the
   countdown + turn handoff with a local `setInterval` + a 600ms fire `setTimeout`.
   Under machine-gun clicks those raced (extra fires, apparent "resets"). In the app:
   online is already server-authoritative; local should let `LocalGame`/`hudController`
   own the countdown and turn advance. The Footer just renders + calls `requestFire`.
   That deletes the whole race class. Keep only the *presentation* swap here.
2. **Fire can double-fire under very fast double-clicks** — the `phase!=='active'` guard
   reads a stale closure, and React state is async, so two clicks in one tick both pass.
   Saw `[ghj, ghj]` land in one history. Fix: a synchronous `firingRef` latch, or disable
   the button in the same event. (Moot once the game layer owns fire, per #1.)
3. **Recall (↑/↓) — RESOLVED via MathQuill's own `upOutOf`/`downOutOf` handlers.**
   Added `onUpOutOf`/`onDownOutOf` to `src/ui/MathInput.ts` (same pattern as
   `onEnter`/`onEdit`; the real build needs these too). They fire ONLY when the cursor
   is at the field's top/bottom level with nowhere higher/lower to go — so inside a
   fraction/exponent, Up/Down still navigate the math. No key interception, no
   empty-field hack. Verified live: from an empty field, ↑ walked `x²` → (escape the
   exponent) → `2x`; ↓ walks back toward the draft. Nuance: recalling a *structured*
   equation lands the caret inside its structure, so the next ↑ steps out of that
   structure before recalling the older shot — which is exactly the "only if nowhere
   higher to go" contract, and reads as correct.

These are exactly the "leaked intervals / render-timing / turn-state" classes CLAUDE.md
says the unit suite misses — surfaced only because this ran in a real browser.

## /impeccable critique + polish pass (2026-07-11)
Ran a dual-agent critique (`.impeccable/critique/2026-07-11T13-25-39Z__src-app-hud-proto-footerproto-tsx.md`,
score 30/40, 0 P0 / 2 P1 / 3 P2). All 5 findings fixed and browser-verified:

1. **[P1] Magenta focus-ring leak** — `color-mix(in oklch, var(--gw-red) …, var(--gw-border*))`
   swung through the hue wheel's shortest arc (red ~25° → cool border ~250°) and rendered
   magenta (~333°) instead of red; confirmed via `getComputedStyle`. Fixed by mixing
   `in srgb` instead (per-channel, no hue rotation) on both the footer border and the
   focused-field ring, for both teams.
2. **[P1] No `aria-live` on the turn label** — added `aria-live="polite"` to `.pf-turn`.
3. **[P2] Ungrouped 10-chip row** — regrouped into trig / powers-roots / constants /
   structural clusters (proximity via gap, no new elements) so scanning under the timer
   doesn't mean reading 10 flat buttons.
4. **[P2] Chips had no `:focus-visible`** — fell back to the browser's native blue
   outline. Added the app's standard ivory focus ring; verified via real Tab focus
   (`element.matches(':focus-visible')` + computed outline color).
5. **[P2] Waiting-state emotional flatness** — `.is-waiting` used to zero out all border
   color/glow. Now carries a faint idle glow in the *opponent's* color (footer's team
   class follows whoever should currently glow, not just `active`), so the anxious
   "watching for your turn" moment isn't fully neutral.

## Follow-up polish round (2026-07-11, same day)
1. **Footer padding** — was cramped (`space-4 space-5`), bumped to `space-5 space-6`;
   Quit and the online "Opponent fires →" test affordance repositioned to match
   (both now anchor at `top: space-4`, symmetric top-left/top-right corners).
2. **Tall-equation question — "what happens when the equation gets very tall, and
   should the arena shrink to make room?"** KP's proposed answer (shrink the arena,
   keep its context intact, let the footer grow) is exactly what the flex layout
   already does by construction: `.pf-stage` is a column flex, `.pf-arena` is
   `flex:1`, `.pf-footer` is `flex:none` sized by content — so a taller footer
   naturally eats the arena's space. Confirmed live with a 15-deep nested-fraction
   stress test. Two things were still missing, now added:
   - **`.pf-arena { min-height: 180px }`** — a floor so the arena can shrink for a
     tall equation but never vanish to 0, satisfying "context inside stays intact."
     Real-app equivalent: `.arena-shell`'s `grid-template-rows` currently has
     `minmax(0, 1fr)` for the MAP row (`theme.css`) — that `0` should become a
     real floor (e.g. `minmax(var(--gw-map-min, 200px), 1fr)`) when this folds in.
   - **`.pf-field { max-height: 220px; overflow-y: auto }`** — bounds one
     pathological equation (deeply nested fractions, huge matrices) from consuming
     the *entire* footer/screen; past the cap it scrolls internally instead, using
     the same thin-scrollbar treatment as `.comp.side-panel`. Verified: the field
     clips at 220px and scrolls; chips/Fire/timer stay visible below it; the arena
     never dropped below its floor.
3. **Added `ln` and `logₐ` chips** (new "logs" group, between trig and roots/powers).
   `ln(` mirrors the existing `sin(`/`cos(`/`abs(` pattern. `logₐ` types `log_`,
   leaving the cursor in the subscript for the base — the same raw-insertion-point
   convention the `xⁿ` chip already uses for superscripts (type `^`, arrow out,
   keep typing). Both `ln` and `log` were already in `MathInput.ts`'s
   `autoOperatorNames`, so no parser change was needed.

## Key finding (the answer to the concern)
With two persistent instances there is **nothing to marshal** on swap — each field
*is* its team's memory. No "pass equations / current equation" step exists, so the
race KP worried about can't happen. The only shared thing that swaps is which field
is visible + which is enabled (both driven off one `active` state var).

If we'd instead used ONE instance and saved/loaded latex on every swap, that IS the
race-prone design the concern describes — avoided here on purpose.

## When answered
Fold the validated decision into the real footer (`src/app/hud/Footer.tsx` +
`HudBar.tsx`), then delete `_proto/` and `proto-footer.html`.
