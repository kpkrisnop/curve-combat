# The fired equation shows on the shooter's soldier — and the typed string rides the wire to do it online

On firing, the shooter's **typed equation** appears above their soldier's name badge (above the HP bar in HP mode) for **5 seconds**, in every mode. It is the verbatim string the player typed, shown as plain text. Because the authoritative server never otherwise sees or rebroadcasts a display equation, this feature adds one **display-only** field to the wire: the typed, view-frame LaTeX travels client → server → all clients alongside the existing world-frame fire.

## Why

New players learn by watching what others write. Locally the typed string is in hand (`LocalGame.onFire`), but online the only equation on the wire is the mirror-substituted `worldLatex` inside `fireIntent` (client → server); the server rebroadcasts **no** equation — `shotPlayback` is `{firerId, shot, duration}`, `matchState` is geometry + HP. So a viewing client can draw the opponent's *curve* but has never received their *text*. The feature's whole point — an opponent, on another device, seeing what you wrote — is exactly the case the current topology can't serve.

We chose to close it (Option A) rather than ship a local-only version (Option B) that builds all the machinery yet skips the one case the feature exists for.

## Decisions

- **Placement.** A plain-text line above the name badge (above the HP bar in HP mode) on the shooter's own soldier. Pixi badges aren't LaTeX, so it's the raw typed string.
- **Duration.** 5 seconds from firing, then it clears on its own.
- **Refire clears first.** If the same player fires again while their badge equation is still showing, the previous one is replaced immediately and the timer resets — the old 5s timeout is cancelled so it can't wipe the new label early.
- **Keyed by player, not team.** The transient is keyed by `firerId` (NvN-correct: same-team soldiers fire separately), matching `shotPlayback.firerId` and the per-player badge draw.
- **Config toggle, default on.** A new `showFiredEquation` match setting, threaded through the same gates every match option uses (MatchConfig, URL hash, protocol `configureRoom` + `lobbyState`, server relay, lobby store, ConfigPanel, both flows, the renderer's `setWorld` opts). Absent → on, so old links/clients keep the feature.
- **Option A wire shape.** `fireIntent` gains an optional `displayLatex` (the verbatim, **view-frame** string — never `worldLatex`); `shotPlayback` gains an optional `latex` (that string, echoed). The server reads `msg.displayLatex` in the `fireIntent` handler and includes it in the `shotPlayback` broadcast — the match engine and simulation are untouched.

## How the display string stays honest under the mirror (ADR 0008)

The equation shown is always what the shooter *typed*, in their own view frame — it is **never** re-mirrored. A BLUE (world-right) shooter types in their mirrored frame; `worldLatex = mirrorLatex(typed)` goes to the sim, but `displayLatex = typed` goes to the badge. Echoing `worldLatex` instead would show every opponent an `x → -x` mangling rather than the real text, so display carries its own untouched field. This is the concrete realisation of ADR 0008's "equation text for display is frame-agnostic."

## Consequences

- **Uniform record path.** Every client (including the shooter) receives `shotPlayback`, so online recording lives entirely in that one handler via `shotPlayback.latex`; local play records in `LocalGame.onFire` from the in-process typed string. One renderer method, `recordEquation(playerId, text)`, backs both.
- **Rendered as readable ASCII.** Pixi badges aren't LaTeX, so the label isn't the raw MathQuill string — `src/math/latexToText.ts` runs it through the already-bundled Compute Engine (`ce.parse(latex).toString()`), turning `\frac{\sin(100x)}{1+\exp(...)}` into `sin(100x) / (e^(...) + 1)`, and falls back to the raw string if it can't parse. The conversion happens on each display client (the wire still carries verbatim LaTeX, keeping ADR 0008's frame-agnostic contract).
- **Renderer transient + animation.** A `firedEquations: Map(playerId → {text, firedAt})` drives the label; `drawBadge` computes it from `performance.now() − firedAt` each draw — a type-on reveal over ~`len × 28ms` (capped), a 5s hold, then a ~900ms fade-out ("settling dust"). A single Pixi **ticker** callback (`eqTick`, added the same way as `playShot`) redraws only during the reveal and fade phases and self-removes when no label is live; the static hold costs nothing. Refiring just overwrites the entry with a fresh `firedAt`, so the reveal restarts and no stale expiry can wipe the new label — there is no per-player timeout to leak.
- **Animation is client-only.** The reveal/fade never touches the server, the protocol, or shot timing — the bullet fires on its own authoritative schedule (an earlier proposal to hold the bullet until the reveal finished was rejected as needless coupling of network timing to a cosmetic).
- **Lockstep cost.** `protocol.ts` changes on both client and server — the ordinary discipline this codebase already runs on (Conventions in `CLAUDE.md`). The sim and server authority model are unaffected; `displayLatex` is inert data the server only relays.
- **No security/authority change.** The display string is never evaluated and never enters `resolveFire`; a malformed or oversized `displayLatex` can at worst render odd badge text, so it stays a bounded, optional string.
