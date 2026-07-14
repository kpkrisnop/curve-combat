# Design Brief — Landing Screen Redesign

Shaped via `/impeccable shape landing screen` (2026-07-07). Confirmed by KP. Hand to
`/impeccable craft landing screen` or freeform `/impeccable` to build. Reads with
`PRODUCT.md` (register: product; landing is the brand-leaning accent surface).

## 1. Feature Summary

The front door of CurveCombat: a one-fold, straight-to-play landing over the animated
spacetime canvas. It must establish "cosmic, sleek, electric" in the first second, then
get friends into a match with zero friction — Play Locally in one click, an online room
in three.

## 2. Primary User Action

Pick a path: **Play Locally** or **Play Online** (→ create room / enter 4-letter code).
Everything else is atmosphere in service of that choice.

## 3. Design Direction

- **Color strategy: Committed — the red-vs-blue duel IS the brand story.** Split title
  stays the anchor. Tuned OKLCH team reds/blues with a restrained ignition glow (not raw
  `#ff4444`/`#4488ff` + heavy bloom), plus very low-intensity red/blue radial field bleeds
  from the left and right screen edges (~3–5% opacity) — the two sides of the arena.
  Neutral electric accent stays out of the hero.
- **Scene sentence:** two friends at a desk at night, screen as the only light source,
  about to start a duel — pitch-black is forced; the landing must feel continuous with
  the arena behind it.
- **Anchor references:** Vercel pure-black surface discipline (crisp hairlines, no
  decorative gradients) · mission-control / Elite Dangerous HUD chrome (quiet technical
  corner readouts) · the game's own arena (spacetime grid + team colors are inherited
  identity).

**Typography (the biggest single upgrade).** Brand-voice words: *plotted, luminous,
precise*.

- Display + UI: **Archivo (variable, width axis)** — title wide/expanded at black weight,
  ALL-CAPS `CURVECOMBAT`, letter-spacing slightly open; regular weights for landing UI text.
  One family, committed weight/width contrast.
- **One technical mono** (e.g. Martian Mono) *only* where content is literally code/math:
  room codes, the tagline's equation fragment, corner readouts. Register-earned.
- Self-hosted via `@fontsource`. No reflex-reject fonts (no Inter/Space Grotesk/IBM Plex…).

## 4. Scope

Production-ready, direct to React: `LandingScreen.tsx` + `RoomCodeInput.tsx` + landing
CSS. `SpacetimeBackground` canvas untouched. PhoneGate out of scope. Interactive, shipped
quality, polish-until-it-ships. Impeccable owns this surface; the CD/screens.html track
covers others.

## 5. Layout Strategy

Monument-centered composition retained, with a real system around it:

- **Center column:** title → tagline → actions; deliberate vertical rhythm (title
  dominant, tagline tight to it, breathing room before actions). Title clamp-scaled,
  ceiling ~6rem.
- **Tagline as plotted annotation:** mono, math-phrased — candidate:
  `y = f(x) · fire curves, hit your opponent`.
- **HUD corner chrome:** four quiet corner elements (version tag, `DESKTOP · 2 TEAMS`
  spec line, live coordinate/tick readout) — tiny mono, faint, never competing with
  center. The instrument-not-poster layer.
- **Edge field bleeds:** red left, blue right (see Color above).
- **Online panel:** smooth inline expansion below the buttons that does NOT reflow the
  title block (space reserved / transform-based). Create Room and the code input as two
  equal peers ("start one" vs "join one"), not a button next to an orphan input.

## 6. Key States

| State | What the user sees |
|---|---|
| Default | Title, tagline, two actions; canvas animating behind |
| Online panel open (`#online` deep-link or toggle) | Panel expanded, code input auto-focused, Play Online shows expanded state |
| Code entry | 4 slots filling as typed; auto-submit on 4th; uppercase-forced |
| Hover / focus-visible | Distinct keyboard-first focus rings (AA); confident primary hover |
| Reduced motion | Entrance = simple fade; no glow pulsing |
| Entrance (first load) | One orchestrated reveal: glow "ignition" on title → tagline → actions, ~800ms total, expo-out; content visible by default (never gate visibility on the animation) |

## 7. Interaction Model

Play Locally → `#local` immediately. Play Online toggles the panel (keep
`aria-expanded`); Create Room → `#room=CODE`; 4th letter in code input auto-navigates.
Keyboard path: Play Locally → Play Online → (panel) Create Room → code input; Escape
closes the panel. Feedback instant — no spinners on this screen.

## 8. Content Requirements

- Title: `CURVECOMBAT` (red/blue split retained)
- Tagline: mono equation-flavored one-liner (final copy at build)
- Buttons: `Play Locally` (drop the `▶` glyph), `Play Online`, `Create Room`
- Code input: 4-slot placeholder + accessible label ("Room code")
- Corner chrome copy: version, spec line — short, factual, mono
- No new imagery — `SpacetimeBackground` IS the hero imagery

## 9. Recommended References (for the build)

impeccable `typeset.md` (display type system is the core upgrade), `animate.md`
(entrance orchestration + panel expansion), `delight.md` (corner chrome, glow ignition).

## 10. Open Questions

None — defaults asserted.
