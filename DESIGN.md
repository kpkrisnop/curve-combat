---
name: CurveCombat
description: Luminous HUD instrumentation laid around an opaque pitch-black spacetime arena.
colors:
  pitch-black: "#000000"
  surface: "rgba(12, 14, 18, 0.85)"
  surface-inset: "rgba(7, 9, 12, 0.9)"
  border: "#1d222a"
  border-strong: "#303c48"
  ink-primary: "#cdd9e5"
  ink-muted: "#8499ab"
  ink-faint: "#5e7081"
  accent-ivory: "oklch(0.93 0.008 250)"
  accent-ivory-hover: "oklch(0.99 0.003 250)"
  team-red: "#ff4444"
  team-blue: "#4488ff"
  duel-red: "oklch(0.63 0.235 27)"
  duel-blue: "oklch(0.66 0.19 258)"
  status-warn: "#ffb020"
  status-crit: "#ff4444"
  hp-pink: "#ff6680"
typography:
  display:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 8vw, 6rem)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.06em"
  title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.01em"
  label:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.02em"
  mono-annotation:
    fontFamily: "Martian Mono Variable, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.12em"
  mono-code:
    fontFamily: "Martian Mono Variable, ui-monospace, monospace"
    fontSize: "1.5rem"
    fontWeight: 500
    letterSpacing: "0.5em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  2xl: "16px"
  pill: "20px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "28px"
  space-7: "36px"
components:
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  button-ghost-hover:
    backgroundColor: "oklch(1 0 0 / 0.04)"
  button-primary:
    backgroundColor: "{colors.accent-ivory}"
    textColor: "oklch(0.13 0.01 250)"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-ivory-hover}"
  card-selectable:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  card-selectable-active:
    backgroundColor: "oklch(1 0 0 / 0.06)"
    textColor: "{colors.ink-primary}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  code-input:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.ink-primary}"
    typography: "{typography.mono-code}"
    rounded: "{rounded.lg}"
    padding: "8px 0 8px 0.5em"
    width: "8ch"
  field-label:
    textColor: "{colors.ink-faint}"
    typography: "{typography.mono-annotation}"
---

# Design System: CurveCombat

## 1. Overview

**Creative North Star: "The Instrument Around the Arena"**

CurveCombat is an opaque Pixi arena on pitch black, and every piece of UI is luminous HUD instrumentation laid *around* that arena — never on it. That single move governs the whole app: the landing, the dense config panel, and the in-match HUD are all the same material — precise, technical, faintly dangerous chrome that frames the play surface and gets out of its way. On the surface it reads in-world and cosmic; underneath it holds Linear/Vercel-grade precision in spacing, alignment, and micro-interaction. The landing's one-shot **Ignition Sequence** (title blurs into focus, tagline and actions rise, corner chrome fades in last) is the flagship expression of this instrument voice, not a separate language.

The palette is mostly absence. Pitch black is the field; a cool blue-gray ink ramp carries all text and structure; and color appears only where it *means* something — the two duel/team hues (red vs. blue), one near-white **ivory accent** for "this is selected / important," and a tiny set of status colors for danger. This rejects PRODUCT.md's anti-references directly: no "gamer-RGB / neon-cyberpunk overload" (saturated hue is rationed to team identity and status, never scattered), no "generic admin dashboard" (the config panel is dense but instrument-like, not a SaaS settings form), no "cutesy edu-game" (no mascots or primary-color blocks — the math speaks for itself), and no "glassmorphism-everywhere / sterile flat gray" (blur is reserved for genuinely floating transient overlays, and the base surface is real pitch black, not frosted emptiness).

**Key Characteristics:**
- Pitch-black stage; saturated color rationed to team identity, one ivory accent, and status only
- One accent language app-wide — ivory means "selected / important" on every surface, landing to HUD
- Glow, not shadow — depth reads as light (duel halos, hover blooms, focus rings), not drop shadows
- Instrument voice: quiet at rest, confident on commit; Martian Mono for readouts, Archivo for the few things that shout
- Dense but calm — the config panel packs many controls without adding decoration to carry them

## 2. Colors

Near-monochrome by construction: a pitch-black field, a cool blue-gray ink ramp, and saturated hue rationed to three jobs — team identity, the ivory accent, and status.

### Primary — the Ivory Accent
- **Ivory Accent** (`oklch(0.93 0.008 250)`): the single "this is selected / interactive / important" color across the entire app — the selected config option, the focused field, the room-code readout, the primary button fill, the active roster row. It is the same near-white the landing uses for its one filled button, promoted to the app-wide accent so the whole product speaks one accent language instead of a disconnected third hue.
- **Ivory Accent Hover** (`oklch(0.99 0.003 250)`): the brighter near-white on hover of a filled ivory surface.

### Secondary — Duel & Team
- **Team Red** (`#ff4444`) / **Team Blue** (`#4488ff`): the two teams' identity. Used for the active-turn player-panel border + glow, win banners, seat dots, and the spacetime grid line (blue). Semantic — never repurposed as a neutral UI accent.
- **Duel Red** (`oklch(0.63 0.235 27)`) / **Duel Blue** (`oklch(0.66 0.19 258)`): glow-tuned variants of the team hues for the "GRAPH / WAR" title split, its edge bleeds, and seat-dot halos on pitch black.

### Tertiary — Status
- **Warn Amber** (`#ffb020`): the turn-timer *warning* state (`.hud-timer.warn`). The app's only warm hue, and the only place it appears.
- **Crit Red** (`#ff4444`, = Team Red): the turn-timer *critical* state (`.hud-timer.crit`), pulsing. Reuses the team-red token rather than introducing a new red.
- **HP Pink** (`#ff6680`): the health-readout heart icon (`.team-strip__hp-icon`) — a lighter step of red so a low-HP heart reads distinctly from a red-team label.

### Neutral
- **Pitch Black** (`#000000`): the entire app background. No gradient, no tint. Depth comes from glow and the warped-grid canvas above it, not a lighter surface.
- **Surface** (`rgba(12, 14, 18, 0.85)`): panels, cards, HUD readouts — a translucent near-neutral charcoal (barely cool, chroma trimmed) that sits over the arena. Surfaces stay close to the pitch-black field; the blue-gray coolness is the ink ramp's job, not the backgrounds'.
- **Surface Inset** (`rgba(7, 9, 12, 0.9)`): wells inside a surface — the config control tracks, the room-code field, the fire-row input.
- **Border** (`#1d222a`) / **Border Strong** (`#303c48`): the default hairline and the emphasized/interactive hairline. Every *brighter* border state is a white-alpha wash (`oklch(1 0 0 / 0.4)`), not a colored one.
- **Ink Primary** (`#cdd9e5`) / **Ink Muted** (`#8499ab`) / **Ink Faint** (`#5e7081`): the cool blue-gray text ramp — primary copy, secondary labels, and the single quietest element on a screen. Reserve Ink Faint for one thing per screen.

### Named Rules
**The One Accent Rule.** Ivory (`accent-ivory`) is the *only* "selected / important" color, and it is the same on every surface. If a screen needs a third saturated hue to signal interactivity, that's a bug — the previous cyan accent was removed for exactly this reason.

**The Rationed-Hue Rule.** Saturated color earns its place three ways only: team identity (red/blue), the timer status ladder (amber → red), and the HP heart. Everywhere else is black, ivory, and the blue-gray ink ramp. A fourth job for a saturated color is a design error, not a variant.

## 3. Typography

**Display Font:** Archivo Variable (weights 600–900, `wdth 125` on the hero), with system-ui fallback
**Readout Font:** Martian Mono Variable, with ui-monospace fallback

**Character:** A geometric, extra-wide display sans for the few things that carry weight (the title, headings, button and control labels) against a tight monospace for everything instrumental — eyebrows, HUD chrome, hints, room codes, timers. The pairing reads as "hero headline over HUD readout," and the two are far enough apart on the contrast axis to never blur together.

### Hierarchy
- **Display** (Archivo 900, `clamp(3.5rem, 8vw, 6rem)`, line-height 1, `0.06em`): the "CURVECOMBAT" landing title only. Its letter-spacing settles from `0.11em` on entrance — the one place type geometry animates.
- **Title** (Archivo 800, ~`22–32px`, `0.01em`): win banners, round status, section headings inside overlays.
- **Label** (Archivo 600, `13–15px`, `0.02em`): buttons, config option cards, control copy.
- **Mono Annotation** (Martian Mono 400–500, `9–14px`, `0.06–0.14em`, often uppercase): section eyebrows (`.gw-label`), landing corner chrome, hints, dividers, the room-code label.
- **Mono Code** (Martian Mono 500, `1.5rem`, `0.5em`): the 4-letter room-code entry — the widest tracking in the app, each letter its own slot.
- **Mono Timer / Readout** (Martian Mono, `font-variant-numeric: tabular-nums`, weight up to 800): the turn timer and any numeric readout, so digits don't jitter as they count.

### Fixed scale, not fluid (product surfaces)
Outside the landing hero, type uses the fixed `--gw-fs-*` px scale (`9 / 11 / 13 / 15 / 22 / 32 / 48`), not `clamp()`. Users view product UI at consistent DPI; a fluid heading that shrinks inside a 340px config panel looks worse, not better. `clamp()` is reserved for the landing hero.

### Named Rules
**The One Animated Word Rule.** Only the landing display title's letter-spacing moves. Every other element enters via opacity/position; type geometry elsewhere stays static.

## 4. Elevation

The app is flat black with no structural drop shadows on its base surfaces. Depth reads as **light, not shadow**: the title's two-layer ignition halo, the ivory glow on a selected/active surface (`0 0 20px oklch(1 0 0 / 0.22)`), the team-color glow on the active-turn player panel, a soft white bloom on a primary button's hover, and a white focus ring on every interactive element. Drop shadows would imply one surface floating over another; the base UI doesn't do that.

### Shadow / Glow Vocabulary
- **Ignition glow** (`text-shadow: 0 0 16px [hue]/0.28, 0 0 56px [hue]/0.18`): behind each half of the landing title, in that half's duel hue.
- **Accent glow** (`0 0 20px oklch(1 0 0 / 0.22)`): the ivory bloom on a selected/active surface (config-flash, active card).
- **Team glow** (`0 0 24px rgba(team, 0.35)`): the active-turn player panel's red/blue halo — the one place a full box-shadow is a *state* signal, not decoration.
- **Primary hover bloom** (`0 8px 32px oklch(1 0 0 / 0.09)`): appears only on a primary button's hover.
- **Focus ring** (`outline: 2px solid oklch(0.9 0.01 250 / 0.9)`, 2–3px offset): every interactive element, keyboard-only.

### Named Rules
**The Glow-Not-Shadow Rule.** To make something feel important, give it light — never a drop shadow.

**The Blur-Is-For-Floating-Things Rule.** `backdrop-filter: blur()` is allowed *only* on genuinely floating transient overlays (win banner, round splash, reconnect overlay, tutorial box, the translucent surface panels). It is never a decorative default — that's the "glassmorphism-everywhere" failure PRODUCT.md names.

## 5. Components

The reusable layer plus the two flagship surfaces (landing, config panel). The in-match HUD and arena shell are *composing surfaces* built from these primitives, described here at a high level rather than spec'd control-by-control.

> **Config controls note:** the selector / slider / stepper / checkbox specs below are the current target system, captured in `.impeccable/design-system.html`. The app is mid-migration — `theme.css` still ships the older `.cfg-opt` card selector and native `accent-color` slider/checkbox. Build new work to the specs here; the pre-ship polish pass brings `theme.css` in line.

### Buttons
Quiet instrumentation, confident on commit — controls read as HUD toggles at rest; only the one primary action commits to a solid fill.
- **Shape:** rounded (10px, `{rounded.lg}`).
- **Ghost (default):** transparent, `1px solid border-strong`, ink-primary text. Hover brightens the border to `oklch(1 0 0 / 0.4)` with a faint `oklch(1 0 0 / 0.04)` wash and a 1px lift; active settles to `scale(0.98)`. Expo-out easing, 150ms.
- **Primary:** solid ivory fill, near-black text, no border. Hover → brighter ivory + hover bloom. One per screen.
- **Danger:** ghost shape with a team-red border + red glow, for destructive/leave actions.

### Selector (segmented)
- **Style:** a `surface-inset` track with 2px padding, options as equal flex segments. The active segment gets ivory text, a white-alpha wash, and a `inset 0 0 0 1px oklch(1 0 0 / 0.2)` hairline ring. Optional two-line variant with a `small` sublabel.
- **State:** one active at a time; hover brightens an inactive option's text to ink-primary.

### Slider
- **Style:** a thin 2px track; the filled portion is ivory, the remainder `border-strong`. One circular thumb (16px, pitch-black fill, 2px ivory ring).
- **Focus / hover:** a soft `oklch(1 0 0 / 0.10)` bloom ring around the thumb. No numeric readout by design — the live terrain morph is the feedback.

### Stepper
- **Style:** an inline `surface-inset` group, `[− | value | +]`, with 1px `border` dividers between the buttons and the editable value. The value is a real number input (spinners stripped) and clamps to range on change; optional unit suffix.
- **State:** buttons brighten to ink-primary + white-alpha wash on hover; the whole group's border brightens to `oklch(1 0 0 / 0.4)` on focus-within.

### Checkbox / Toggle
- **Style:** an 18px `surface-inset` box, 5px radius, `border` hairline, with an SVG check. Checked fills ivory with a near-black check; the inline label brightens from ink-muted to ink-primary.
- **State:** hover brightens the box border; focus shows the white ring.

### Cards / Panels
- **Panel** (`.gw-panel` / `.comp`): `surface` background, `border` hairline, `2xl`/`xl` radius, `backdrop-filter: blur()` where it floats over the arena. No drop shadow at rest.
- **Selectable card** (config option): `surface-inset`, `border`, `lg` radius; active state is an ivory border + white-alpha wash + ink-primary text.

### Inputs / Fields
- **Room-code input:** `surface-inset`, `border-strong` hairline, `lg` radius, Mono Code type, uppercase-forced, 4-char. Focus brightens the border to `oklch(1 0 0 / 0.45)` plus a soft `0 0 0 3px oklch(1 0 0 / 0.07)` ring.
- **Math input (HUD):** the fired-function field (MathQuill) inside the fire row — `surface` well, `border` hairline, `sm` radius; its selection highlight uses the ivory accent.

### Field Label
The eyebrow that names a block control — Mono Annotation, uppercase, tracked, ink-faint. Sits above selectors/sliders/steppers; checkboxes carry their label inline instead.

### Signature — HUD Corner Chrome (landing)
Four fixed viewport-corner readouts (`SPACETIME ARENA` / `DESKTOP · 2 TEAMS` / `f : ℝ → ℝ` / `TURN-BASED · LOCAL + ONLINE`), Mono Annotation, ink-muted, non-interactive. Fades in last in the ignition sequence so it never competes with the title.

### Signature — Turn-Timer States
The canonical home of the status colors, and a worked example of PRODUCT.md's "never encode state in color alone": the timer reads **normal** (ink), **warn** (amber `#ffb020`), then **crit** (team-red, *pulsing*). The pulse — not just the color — carries the critical state, so it survives for color-blind players.

### Composing Surfaces (high level)
The **in-match HUD** (player panels with the math input + fire + timer, team strip, roster) and the **arena shell** (the grid-of-cards: map / side panel / footer) are assembled from the primitives above. Active-turn identity is a team-color border + glow; everything else is the ivory/ink/blur vocabulary already defined.

## 6. Do's and Don'ts

### Do:
- **Do** keep the app background pitch black (`#000000`) — no near-black tints, no warm/cool drift.
- **Do** use ivory (`accent-ivory`) as the one "selected / important" accent on every surface, landing to HUD.
- **Do** ration saturated color to the three sanctioned jobs — team identity, the timer status ladder, the HP heart — and nothing else.
- **Do** convey depth with glow (halos, hover blooms, focus rings), never a drop shadow on a base card or panel.
- **Do** pair a non-color signal with every status color (the timer *pulses* at crit; teams read by position/label too), per WCAG AA and PRODUCT.md's "never encode state in color alone."
- **Do** keep the primary action to one filled ivory button per screen; every sibling stays ghost/outline.
- **Do** run the ignition entrance once per mount and honor `prefers-reduced-motion` with an instant/opacity-only fallback.

### Don't:
- **Don't** reintroduce the retired cyan accent, or any third saturated hue, to signal interactivity — ivory carries that job app-wide now.
- **Don't** introduce "gamer-RGB / neon-cyberpunk overload" — rainbow gradients or glow beyond the title and the sanctioned status/team hues. Electric ≠ garish.
- **Don't** let the config panel read as a "generic admin dashboard" / SaaS settings form — density is carried by hierarchy and the instrument voice, not by boxing every row.
- **Don't** reach for glassmorphism as a default; `backdrop-filter` is only for genuinely floating transient overlays, never decoration on the base surface.
- **Don't** add "cutesy edu-game" touches — mascots, primary-color blocks, "math is fun!" framing. The audience is adults; the math speaks for itself.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe on any element.
- **Don't** let the landing title overflow at the `clamp(3.5rem, 8vw, 6rem)` ceiling — test copy at the 1024px phone-gate breakpoint.
