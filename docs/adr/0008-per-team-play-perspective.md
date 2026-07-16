# Every player plays from the left — the view mirrors per team, the simulation does not

Each viewer sees the arena **from their own team's side, always seated on the left, firing rightward** — the same experience RED has today. For a viewer on the world-right team (BLUE by default), the client reflects the world about the vertical axis (`x → -x`): perspective, the x-axis numbering, planets, craters, and the enemy all mirror. This is a **presentation transform only.** The simulation and the authoritative server stay in a single, un-mirrored world frame; the mirror lives entirely on the viewing client, applied to both the equation it sends in and the field it renders out.

## Why

A fired curve is `y = f(x)` anchored to the shooter (see the curve-anchoring gotcha in `CLAUDE.md` / `trajectory.ts`). Some functions are simply easier to write when you are the one on the left with the enemy off to your right — the classic Graph War framing. Today only RED gets that: RED sits at negative x and fires toward positive x, while BLUE sits at positive x and fires toward negative x, so BLUE has to mentally flip every equation. Mirroring BLUE's view makes **both teams write from the identical frame**, removing the asymmetry without changing the rules of the game.

Crucially, this is a *view* problem, not a *simulation* problem. The physics, collision, crater carving, and win detection must remain deterministic and identical on server and every client (`sim` is Node-safe and authoritative). So the mirror must not touch them. Reflecting about world `x = 0` is the natural choice: the two spawn columns are symmetric about the origin, so BLUE's world position (`+X`) maps exactly onto RED's (`-X`), and the axis numbering stays centered.

## How

For a viewer whose team sits on the world-right:

- **Render:** reflect screen mapping about world `x = 0`. BLUE's own soldier (world `+X`) draws on the left; the enemy, planets, and craters draw mirrored; x-axis labels read as the reflected (view) coordinate.
- **Equation in:** the player types `g(x)` in their **view** frame. Because `x_world = -x_view`, the client substitutes `x → -x` into the parsed function before it reaches the fire path, so the sim receives a plain world-frame `f`. Vertical anchoring (`yOffset`) is unchanged.
- **Trajectory out:** the sim returns a world-frame sample path; the same reflect-on-render step draws it correctly in the view frame.

The simulation, the wire protocol, and the server see none of this — they only ever handle world-frame functions and world-frame results.

## Consequences

- **Perspective is per viewer, not global.**
  - *Online* (turn-based and No-Turn alike): every client renders its own team's perspective, fixed for the whole match. No per-turn flipping; No-Turn needs no special case (each device is one team).
  - *Local hotseat* (one shared screen): the active player alternates, so the **entire view flips horizontally each turn** — always presenting the current shooter on the left. Accepted as the cost of a single consistent rule ("you always play from the left").
  - *Spectators* (no team): canonical **RED-left, un-mirrored**.
  - *Waiting on the opponent* (online turn-based): your view stays in *your* frame even while the opponent aims.
- **The online lobby/waiting-room preview mirrors too.** Perspective is fixed to your team for the *whole* session, not just once the match starts — the pre-game terrain preview is WYSIWYG, showing the arena in the exact frame you will play. A world-right (BLUE) player sees the preview reflected, themselves seated on the left. Consequently, pressing **"Switch side"** flips the preview: switching RED→BLUE mirrors the whole arena about x=0 and recolors your soldier (you stay seated on the left — everyone plays from the left — so your dot does not jump sides; the terrain and colors invert around it). To keep that flip legible, a pure side-switch should **preserve the round-1 seed** so *only* the mirror changes — it must not also reshuffle the layout, or the viewer sees two simultaneous changes and can't read either. (Spectators, having no team, keep the canonical RED-left preview.)
- **The world-frame invariant is load-bearing.** Any new fire-path or state code must stay world-frame; the mirror is a client edge concern. Leaking it into `sim`/`server` would desync clients that mirror differently.
- **Two transform sites, one axis.** Input-substitution (`x → -x`) and render-reflection must use the *same* reflection (about world `x = 0`) or the drawn curve won't pass through the drawn soldier.
- **Equation text for display is frame-agnostic.** The verbatim string a player typed (see ADR 0009 and the F4 on-soldier equation label) is shown as-is; it is not re-mirrored.
- **Prototype first.** The per-turn hotseat flip and the input-substitution phase behavior need to be felt in a real browser before implementation is finalized. This ADR fixes the *direction*, not the animation/UX of the flip itself.
