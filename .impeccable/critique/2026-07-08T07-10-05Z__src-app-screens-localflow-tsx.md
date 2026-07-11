---
target: src/app/screens/LocalFlow.tsx
total_score: 28
p0_count: 0
p1_count: 1
timestamp: 2026-07-08T07-10-05Z
slug: src-app-screens-localflow-tsx
---
Method: dual-agent (A: design review · B: detector/browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live arena preview updates instantly on every slider drag, but is-active state isn't exposed to assistive tech (no `aria-pressed`), and slider values aren't printed anywhere |
| 2 | Match System / Real World | 3 | "Best of 3/5", "Reroll", "seed" read naturally; "spawn band X", "spawn edge gap", "field margin" are raw internal parameter names with zero explanation |
| 3 | User Control and Freedom | 2 | Reroll only reseeds planet placement, never the 13 slider values — no "reset arena to defaults" once a player has dragged several sliders |
| 4 | Consistency and Standards | 3 | `.gw-label` (a short-eyebrow primitive, correctly used for "Game Mode"/"Rounds") is also applied to a full 46-char sentence elsewhere on the same screen; `.gw-card`/`.cfg-opt` lack the `:focus-visible` treatment every other interactive element on the screen gets |
| 5 | Error Prevention | 3 | All 13 sliders + turn-timer stepper are hard-clamped; no invalid state is reachable |
| 6 | Recognition Rather Than Recall | 3 | Cluster labels + live-morphing preview help, but no numeric readout means comparing two slider states requires recall, not recognition |
| 7 | Flexibility and Efficiency | 3 | Native range inputs support keyboard nudging; gear collapses the whole panel; no shortcuts for repeat use |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained palette/typography, but Reroll/seed/mirror-spawn toggle sit below the fold at 1440×900 with no scroll affordance |
| 9 | Error Recovery | 3 | Mostly N/A — errors are structurally prevented, so nothing actively fails, but nothing actively helps if a resulting arena looks broken/empty either |
| 10 | Help and Documentation | 2 | One hint line + one tagline; no tooltips explaining "gap min/max" or "spawn separation" geometrically |
| **Total** | | **28/40** | **Good — solid structural bones, undercut by thin a11y coverage (no `aria-pressed`, no focus-visible on pickers) and a couple of narrow primitive-misuse spots** |

## Anti-Patterns Verdict

**LLM assessment (Assessment A):** No, this doesn't read as AI slop. It's a specific, opinionated system — Archivo Variable + Martian Mono pairing instead of a generic Inter/system-ui default, one scoped accent token instead of ad-hoc hex values, a 4px spacing scale, and copy with actual voice ("Arena — the map behind you is the real round 1"). It avoids all four named anti-references (no gamer-RGB neon, no flat-gray admin-CRUD look, no cutesy edu-game tone, no glassmorphism). Reads as a built system, not a template fill.

**Deterministic scan (Assessment B):** The static CLI scan (`detect.mjs` over the three `.tsx` files) came back clean — 0 findings, exit 0. That's expected: several real issues here live in computed CSS (resolved px sizes, computed text-transform), which a source-pattern scanner can't see. The **browser-injected** detector (script-injected into the live page, per the critique protocol) caught two real ones the static scan and the LLM review both missed:
- **`tiny-text`**: a `<small>` in the Turn Timer hint renders at **9px** — traced to `.cfg-timer small` in `theme.css` consuming the `--gw-fs-2xs: 9px` token from `foundation.css`. Two sibling `<small>` elements elsewhere on the same screen render at 10.83px and weren't flagged — only the 9px one crossed the threshold.
- **`all-caps-body`**: the Arena section's caption — `<p className="gw-label">Arena — the map behind you is the real round 1</p>` — is 46 characters of uppercase, tracked text. `.gw-label` is a legitimate shared "eyebrow" primitive (correctly used elsewhere for "Game Mode", 9 chars, and "Rounds", 6 chars), but applying it to a full sentence is a misuse of that primitive, not a token problem.
- A third finding, **`flat-type-hierarchy`** (body/heading sizes measured at 13px/13.3px/16px/24px, a 1.8:1 max:min ratio), surfaced only once the panel was collapsed and the two element-level findings above weren't competing for attention. Assessment B flagged this as a legitimate measurement, not a false positive.

**Visual overlays:** Assessment B confirmed script injection worked (mutation preflight passed) and captured screenshots with the detector's orange annotation boxes sitting directly on the flagged Turn Timer hint and Arena caption. The live-detector server has since been stopped as required, so there's no persistent overlay tab left open in your browser right now — the above is reported from the captured evidence, not a tab you can still look at.

**False positives:** None identified by Assessment B. Both element-level findings trace to concrete, real render values, not scanner noise.

**One correction from my own synthesis pass:** Assessment A flagged `--gw-accent` and `--gw-blue` as the identical hex value (both `#4488ff` in `foundation.css`), reading as a live color collision with the BLUE team chip. I checked this against the actual rendered page rather than taking either agent's word for it: `getComputedStyle` on the live page shows `--gw-accent` resolves to `oklch(0.78 0.13 195)` (cyan) and `--gw-blue`/`--gw-hero-blue` resolve to `#4488ff`/`oklch(0.66 0.19 258)` (blue) — visibly distinct hues (195 vs 258), and the active Game Mode/Rounds border renders cyan, not blue. `theme.css` redeclares `--gw-accent` at `:root` and, loading after `foundation.css`, wins the cascade. So this is **not** a live bug — Assessment A's read of the source file didn't account for the later override. It is worth a cleanup pass regardless: `foundation.css` still carries a stale, unused `--gw-accent: #4488ff` definition that no longer takes effect anywhere, which is confusing to read and one dropped import away from silently regressing. Downgraded to a minor cleanup item below, not a priority issue.

## Overall Impression

The structural bones here are genuinely good — the fixed-label-column slider grid, the cluster grouping (Field/Planets/Spawns), and the "arena morph is the feedback" bet are deliberate, on-brand decisions, not defaults. The real gaps are narrower than they first looked: this screen's biggest miss is accessibility plumbing (no `aria-pressed`, no `:focus-visible` on the pickers, an unnamed fieldset group) rather than anything visual, plus two small primitive-misuse spots (a short eyebrow-label class stretched over a full sentence, a hint text rendering at 9px). None of this is a structural redesign — all of it is narrow, concrete fixes.

## What's Working

1. **The fixed 118px label column in `.cfg-slider`** (`grid-template-columns: 118px minmax(0,1fr)`) is what keeps 13 sliders reading as a legible table instead of a dense wall — confirmed in the scrolled screenshot, every label from "map width" to "spawn min separation" lines up on a hard edge.
2. **The "no numeric readout, arena-morph-is-the-feedback" bet** (per the code's own ADR-0003 comment) is a genuinely on-brand execution of "the Pixi arena is the star, the UI is chrome" — watching planet count or map width reshape the actual spawn zones behind the panel isn't decoration, it *is* the settings UI.
3. **Team identity is never color-only** — the seat chips pair a colored dot with text ("P1 · RED") and fixed left/right position, so color-blind players aren't locked out of reading whose seat is whose.

## Priority Issues

**[P1] Game Mode / Rounds selection state is invisible to assistive tech; the settings `<fieldset>` has no `<legend>`.** Confirmed in the accessibility tree: the group exposes with no accessible name, and neither button sets `aria-pressed`. A screen-reader user tabbing through gets zero indication of which mode or round-count is currently selected. **Fix:** add `aria-pressed={value.mode === 'classic'}` (and the Rounds equivalent) in `ConfigPanel.tsx`, plus a visually-hidden `<legend>` on the fieldset. **Command:** `/impeccable harden`

**[P2] A turn-timer hint renders at 9px** (`.cfg-timer small`, consuming the `--gw-fs-2xs` token). Below comfortable reading size regardless of color contrast — this is a different bug from the contrast fix already applied to this screen. **Fix:** bump this specific hint to at least `--gw-fs-xs` (11px), or audit whether `--gw-fs-2xs` should exist as a body-text-eligible token at all. **Command:** `/impeccable typeset`

**[P2] The Arena section's caption is styled with `.gw-label`, a primitive meant for short eyebrow text (2-9 chars elsewhere), applied here to a 46-character full sentence.** Reads as a formatting mismatch once you notice it's the same class as "Game Mode"/"Rounds". **Fix:** give the Arena caption its own style (regular case, not tracked-and-uppercased), reserve `.gw-label` for genuinely short section headers. **Command:** `/impeccable typeset`

**[P2] No `:focus-visible` styling on `.gw-card`/`.cfg-opt`.** `.gear`, `.gw-btn`, and `.footer-name-input` all get the deliberate accent-colored focus ring; the Game Mode and Rounds picker buttons fall back to the bare browser default. Inconsistent with the rest of the panel's focus treatment. **Fix:** add `.gw-card:focus-visible { outline: 2px solid oklch(0.9 0.01 250 / 0.9); outline-offset: 2px; }` matching the existing pattern. **Command:** `/impeccable harden`

## Persona Red Flags

**Alex (Power User):** Reroll only reseeds planet placement (`onReroll` calls `applyPreview(config, s)` with the *same* config) — it never resets the 13 sliders. Combined with no numeric readout, dialing in an exact repeatable value ("planet count exactly 15, gapMax exactly 2.0") is trial-and-error by pixel position, not by number. There's no quick "back to sane defaults" once several sliders have been dragged.

**Jordan (First-Timer):** "spawn band X", "spawn edge gap", "field margin", "spawn clearance" are exposed with zero explanation beyond a slider and a live arena morph. A first-time player has no vocabulary for what these mean. Reroll, the seed, and the spawn-mirror toggle sit below the fold at a standard 1440×900 viewport with no visible cue beyond the scrollbar — a first-timer who never scrolls may never discover the map can be regenerated.

**Sam (Accessibility-Dependent User):** In the captured accessibility tree, the settings `<fieldset>` exposes as an unnamed `group`, and the Game Mode/Rounds buttons expose only their static label text — with no `aria-pressed`, a screen-reader user cannot determine which mode or round-count is currently active. A low-vision user relying on screen magnification loses sight of the live arena-morph feedback while zoomed into a slider, and since no number is printed on the slider itself, they lose their only other source of precise state.

## Minor Observations

- The turn-timer's 120s upper clamp is enforced in code but never communicated in the UI — a user mashing "+" hits an unexplained wall.
- "No-Turn Mode (simultaneous fire)" sits as an unlabeled orphan row between the Rounds picker and the Turn Timer; every other section gets a label or cluster header, this toggle doesn't.
- Page-level type-scale measurement (across whatever's currently rendered): sizes 13px/13.3px/16px/24px, a 1.8:1 max:min ratio — a fairly flat hierarchy worth a look if `/impeccable typeset` gets scoped here.
- Assessment B observed that clicking the gear icon appeared to trigger a full page reload/remount (injected debug state was wiped) rather than the pure `setSettingsOpen` toggle the source implies. This wasn't confirmed as a root cause — it may be an artifact of the injected script itself — but it's worth a quick manual check, since a real reload would silently reset the live seed/preview state.
- No config recap near "Start Match" (e.g., "Classic VS · Best of 3 · 60s") — a one-line summary right before the commit action would reduce last-second doubt for a casual/social audience.
- `foundation.css` still defines `--gw-accent: #4488ff`, a value `theme.css` overrides at `:root` and which no longer takes effect anywhere live. Harmless today, but a stale duplicate definition of a token this load-bearing is worth deleting so a future import-order change can't silently reintroduce the accent/team-blue collision it was written to prevent.

## Questions to Consider

- Is the "arena-morph-is-the-feedback, no numbers" bet actually validated for all three clusters equally, or only really proven out for Field (whole-rectangle resize is obvious) while Planets/Spawns (13 small circles) quietly ask more of the player than the design intends?
- Given the panel already requires scrolling at 900px height, would collapsible per-cluster accordions reduce the "13 controls at once" load — or is a static, always-visible dense list the better trade for a "friends casually playing" audience who'll set it once and rarely return?
