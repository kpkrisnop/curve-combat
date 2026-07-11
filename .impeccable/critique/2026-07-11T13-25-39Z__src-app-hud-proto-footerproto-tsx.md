---
target: src/app/hud/_proto/FooterProto.tsx (in-game footer prototype)
total_score: 30
p0_count: 0
p1_count: 2
timestamp: 2026-07-11T13-25-39Z
slug: src-app-hud-proto-footerproto-tsx
---
Method: dual-agent (A: ab7e5de0571d5aec1 · B: afba0e2d6fdcb920f)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Turn/timer/phase all legible; the waiting-state timer visually freezes with no explanation |
| 2 | Match System / Real World | 4 | `y =`, math notation, familiar metaphor throughout |
| 3 | User Control and Freedom | 4 | Inline quit confirm (Stay/Quit), Clear button, recall doubles as undo |
| 4 | Consistency and Standards | 2 | Focus-ring mix diverges from the app's own ivory focus spec; produces a real color leak (below) |
| 5 | Error Prevention | 3 | Recall guard protects unfired drafts; a known double-fire race is tracked in NOTES.md, not re-litigated here |
| 6 | Recognition Rather Than Recall | 3 | Chips + persistent "↑ recall · ↵ fire" hint; 10 flat chips slow scanning |
| 7 | Flexibility and Efficiency | 4 | Keyboard (type + Enter), chips, and recall each serve a different skill level |
| 8 | Aesthetic and Minimalist Design | 2 | Chip row un-chunked; the color leak breaks "near-monochrome by construction" |
| 9 | Error Recovery | 2 | No visible path for an invalid/unparseable equation once fired (out of footer's scope, but currently unaddressed) |
| 10 | Help and Documentation | 3 | Placeholder + hint text carry enough micro-help for a low-stakes social game |
| **Total** | | **30/40** | **Good — solid foundation, address weak areas** |

## Anti-Patterns Verdict

**LLM assessment (Assessment A):** Borderline, leaning "no." The vocabulary — buttons, panel, mono/display type pairing, glow-not-shadow — is disciplined and matches DESIGN.md. No gradients, no mascots, no invented affordances. But it isn't clean: one verified color-system defect and an ungrouped chip row are exactly the "fine at a glance, falls apart on inspection" gap between prototype and shipped.

**Deterministic scan (Assessment B):** `detect.mjs --json src/app/hud/_proto` → **exit 0, zero findings** across all three prototype files. Re-run with `--no-config` and per-file — still clean. The detector was sanity-checked against a synthetic fixture with known violations (Inter font, gradient bg, undocumented hex, bounce easing) and correctly caught all 5 — confirming this is a genuine clean scan, not a broken tool. No false positives to adjudicate; there was nothing to flag.

**Where the two assessments diverge — and why that's expected:** the deterministic scanner is a static-analysis tool; it checks literal values (hex colors, font names, easing curves) against DESIGN.md, not rendered/computed styles. The magenta focus-ring leak below only exists *after* the browser resolves `color-mix()` in OKLCH — there is no literal "wrong" value in the source for a static scanner to catch. This is a textbook case of an issue only live-DOM inspection surfaces, and exactly why Assessment A verified it with `getComputedStyle` rather than reading the CSS at face value.

**Visual overlays:** injection did not succeed — not a bug in this run, but an architectural mismatch. `detect.mjs` is a Node-only CLI (imports `node:fs`, `node:path`) with no browser-runnable counterpart to inject into a live page; no `detect.js` exists anywhere in the skill. Assessment B confirmed this by inspecting the module tree rather than forcing a broken injection. No user-visible overlay is available for this run; the CLI JSON above is the full deterministic evidence.

## Overall Impression

The footer's *architecture* is sound and its resting vocabulary is disciplined — this doesn't read as templated AI output. But it's a prototype, and it shows in exactly the way prototypes should: one real rendering bug that only surfaces in the browser (not in the source), and a chip row that was added for function but never organized for scanning under time pressure. Both are cheap to fix before this becomes production code. The single biggest opportunity: the color leak sits on the *one element every player looks at every single turn* — fixing it is disproportionately high-leverage for the size of the fix.

## What's Working

1. **Turn identity via three simultaneous signals** — colored dot + text label + card border/glow, verified live in both local and online modes. Correctly executes PRODUCT.md's "never encode state in color alone," and would hold up for a color-blind player (unlike the input-ring bug, which is a rendering defect, not a signal-redundancy failure).
2. **Fire's disabled state renders neutral gray, not dimmed ivory** — confirmed in the empty-field screenshot. Keeps the One Accent Rule intact even when the primary action is off, rather than the common AI-slop move of just lowering opacity on the accent color.
3. **The two-persistent-MathQuill architecture** (validated in the prior prototype round) held up under fresh live testing: RED/BLUE equations and histories never cross-contaminate across swaps — a whole race-condition class eliminated by construction, not by careful state marshalling.

## Priority Issues

**[P1] RED's active-input focus ring renders magenta, not red.**
- **Why it matters:** `color-mix(in oklch, var(--gw-red) 60%, var(--gw-border-strong))` interpolates hue via the shortest arc; red (~25°) and the cool blue-gray border (~250°) are far enough apart that the browser swings through magenta (~333°) instead of back through warm tones. Verified via `getComputedStyle`: RED's ring computes to `oklch(0.517 0.165 333)` (magenta) while BLUE's equivalent mix correctly lands at hue ~258° (blue) — BLUE only works because both its endpoints already sit on the cool side. This is the one visual channel every player checks every turn to confirm "yes, this is my color," and it visually lies for RED specifically. A fourth uncontrolled hue on the app's single most-watched element is exactly what DESIGN.md's Rationed-Hue Rule exists to prevent.
- **Fix:** stop OKLCH-mixing a warm hue against a cool neutral. Either mix in `srgb`/`hsl` instead, or apply `var(--gw-red)`/`var(--gw-blue)` directly at reduced alpha rather than blending toward `border-strong`.
- **Suggested command:** `/impeccable polish`

**[P1] No `aria-live` on the turn/phase label.**
- **Why it matters:** sighted players get the glow + label swap the instant it becomes their turn; screen-reader users get nothing proactive. Given PRODUCT.md's explicit WCAG AA commitment, and that this is a *timed* turn — missing the announcement costs a screen-reader-dependent player real clock time every single turn, not just a convenience gap.
- **Fix:** add `aria-live="polite"` to `.pf-turn` (or the turn-line container) so the turn change is announced without user action.
- **Suggested command:** `/impeccable polish`

**[P2] Ungrouped 10-chip row.**
- **Why it matters:** under a 25-second timer, scanning a flat row of 10 near-identical buttons to find `x²` costs time a duel doesn't have. Fails the cognitive-load checklist's chunking (≤4/group) and grouping criteria — trig, powers/roots, constants, and structural symbols get no visual separation.
- **Fix:** cluster into 3–4 visually separated groups, consistent with the "dense but calm" precedent the config panel already sets.
- **Suggested command:** `/impeccable layout`

**[P2] Chips have no custom `:focus-visible` style.**
- **Why it matters:** confirmed via `getComputedStyle` — tabbing to `.pf-chip` falls back to the browser's native blue outline (`rgb(0,95,204)`), not the app's documented ivory focus ring. That's a literal fourth-hue leak *and* a keyboard-accessibility gap on every chip.
- **Fix:** add the standard ivory focus-visible treatment to `.pf-chip`; audit siblings for the same gap.
- **Suggested command:** `/impeccable polish`

**[P2] Waiting-state emotional flatness.**
- **Why it matters:** `.pf-footer.is-waiting` zeroes out border color and glow entirely, killing all ambient life exactly when a player is anxiously watching for their turn — the one moment DESIGN.md's "reassurance at high-stakes moments" principle isn't met.
- **Fix:** keep a faint idle glow in the opponent's color, or a slow, reduced-motion-respecting breathing pulse.
- **Suggested command:** `/impeccable animate`

## Persona Red Flags

**Alex (Power User):** Enter-to-fire, recall, and chips all serve fast play well — but the magenta ring and missing chip focus states read as "not actually finished" under fast repeated turns, undercutting the "shipped, high-craft" bar this persona holds the product to.

**Jordan (First-Timer):** the 10-chip flat row is the likely stumble point — nothing visually chunked to scan under time pressure, and the "↑ recall" affordance is text-only, easy to miss while nervously working through a first turn.

**Sam (Accessibility):** turn-identity redundancy (dot + label + glow) is genuinely good — but the chip focus-ring gap and the missing `aria-live` on turn changes are real, fixable misses against the project's own stated WCAG AA target.

## Minor Observations

- The "Opponent fires →" prototype-only test affordance sits inside the *real* footer card rather than the dashed inspector panel — easy to mistake for shipped UI on a quick skim. Prototype-hygiene note, not a component defect.
- Placeholder copy ("e.g. sin(x)") is a nice minimal onboarding cue at zero cost.
- Quit's red danger-border and RED team's red turn-glow can appear in the same card simultaneously — sanctioned reuse per DESIGN.md's status rules, and spatial separation + labels keep it unambiguous, but worth a second glance during polish.
- Deterministic scan was clean across the board — every priority issue above was caught by live browser inspection, not static analysis. Worth remembering that a clean `detect.mjs` run doesn't mean "no visual bugs," only "no literal-value violations."

## Questions to Consider

- If the magenta leak comes from a generic OKLCH `color-mix` pattern, is the same technique already live anywhere in shipped `theme.css` (team-strip borders, other focus states) — is this prototype catching a pre-existing bug rather than introducing a new one?
- Once the game layer owns the timer/turn swap (per NOTES.md finding #1), should the "Firing…" lock become a server/game-driven state too, for online parity, rather than staying purely presentational?
- Would contextual chip filtering (hide trig chips once inside an exponent, etc.) solve the chunking problem via progressive disclosure without sacrificing power-user speed?
