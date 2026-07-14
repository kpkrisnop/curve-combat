# Product

## Register

product

## Users

Friends playing casually and socially — desktop/landscape only (~≥1024px; phone-gated).
Two teams fire mathematical function curves across a planet-scattered arena to hit
each other. Players arrive in two contexts:

- **Local hotseat** — two people on one machine, passing control turn to turn.
- **Quick online rooms** — a host creates a room, shares a 4-letter code/link, friends
  drop in as players or spectators (NvN, two teams).

The job to be done: get into a match with friends fast, read the state of the duel at a
glance (whose turn, timer, score, HP), type a function, and fire. Low-stakes and social —
nobody is grinding ranked. The math is the fun, not a barrier.

## Product Purpose

CurveCombat is a browser game where you aim by *writing a curve*. Success is a match that
starts in seconds, stays legible in the heat of a turn, and feels like a shipped, high-craft
product rather than a hobby prototype. The design target is **premium and polished** — a
refined pitch-black theme with precise spacing and confident restraint around an opaque Pixi arena.

## Brand Personality

**Cosmic, sleek, electric.** Dark, luminous, a little dangerous — spacetime-arena energy
carried by an in-world HUD feel, but held to Linear/Vercel-grade precision underneath. Voice
is confident and economical: short labels, no exclamation-point hype, the cleverness of the
math left to speak for itself. Style-forward within a premium frame, never loud for its own
sake.

## Anti-references

- **Gamer-RGB / neon-cyberpunk overload** — rainbow gradients, glow on everything, Discord-nitro
  maximalism. Electric ≠ garish.
- **Generic admin dashboard** (Bootstrap/Material CRUD look) — the config panel is dense, but it
  must not read as a settings form in a SaaS console.
- **Cutesy edu-game** — rounded cartoon mascots, primary-color blocks, "math is fun!" childishness.
  The audience is adults playing for fun, not a classroom.
- **Glassmorphism-everywhere / sterile flat gray** — the two failure modes of "premium dark." Blur
  and glass only where purposeful; the surface should feel intentional, not empty.

## Design Principles

1. **The arena is the star.** The play surface is an opaque Pixi canvas; UI is chrome laid
   *around* it, never *on* it. Every panel earns its screen space against the map.
2. **Dense, but calm.** The config panel (13 sliders, toggles, mode/round pickers) is the
   densest surface in the app. Premium here means legible hierarchy and order — not more
   decoration on a busy form.
3. **State legible at a glance.** A duel lives or dies on instant readouts: whose turn, timer
   (normal/warn/crit), score, HP, connection health. Design the transient/state-gated layer as
   a first-class concern, not an afterthought.
4. **In-world without sacrificing usability.** Luminous, technical, HUD-like on the surface;
   Linear-grade precision in spacing, alignment, and micro-interaction underneath. Mood never
   costs a mis-tap.
5. **Friends pile in fast.** Landing → room → play is the critical path. Approachable defaults,
   nothing gatekept, copy-code/copy-link one click away. Onboarding is invisible.

## Accessibility & Inclusion

- **Target: WCAG AA.** Body text ≥4.5:1, large text/controls ≥3:1, against the dark surfaces.
- **Never encode state in color alone.** Red vs. blue teams and turn/timer states must also read
  via label, position, icon, or shape — critical for color-blind players in a two-team game.
- **Honor `prefers-reduced-motion`.** The spacetime backdrop, countdown, camera zoom, and toast
  motion need a reduced/crossfade alternative.
- Desktop/landscape only by design (phone-gated ~≥1024px); the small-screen gate is an
  intentional constraint, not an unhandled state.
