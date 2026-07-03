# The waiting room renders the real round-1 arena; match start is a synchronized countdown + zoom

Instead of a config form with an "example layout" preview, the waiting room's centerpiece is the actual game renderer showing the actual round-1 terrain at ~85–90% scale. To make this true, the server generates the **round-1 seed at room creation** (regenerating on arena-param change or host-triggered reroll) and broadcasts it in `lobbyState` — an early delivery of what D4 already mandates (per-round server-authoritative seeds), not a change to it. On Start the server broadcasts `matchStarting { startAt }`; every client (players and spectators) shows a synchronized 3-2-1 while the container zooms from squished to full scale.

**Consequences**

- `lobbyState` carries the round-1 arena seed + params; that is *why* a "lobby" message contains terrain data.
- Waiting room and game screen share one renderer instance — the transition is a CSS transform, no re-init, and the renderer warm-starts before the match.
- Arena parameters have **no numeric readouts** anywhere; the Host adjusts sliders in a collapsible config drawer that never obscures the arena, and the live terrain morph is the feedback (this is also how guests perceive config changes). Non-arena config (mode, rounds, No-Turn, timer) lives in a slim strip.
- The Host's "Reroll terrain" button is server-mediated (new seed dealt and broadcast); the seed string itself stays hidden online. Supersedes ADR-0002's "seed row + Reroll hidden online" in favor of "seed hidden, reroll action exposed."
- The config UI is **one shared React component** used by the local config screen and the online waiting room; the local path gets the identical arena-centerpiece layout, countdown, and zoom.
- Config locks when the countdown begins; the countdown is not cancelable; joiners during the countdown become Spectators.
- Rosters sit at the left/right edges where the HUD panels will appear and morph into them at match start.
