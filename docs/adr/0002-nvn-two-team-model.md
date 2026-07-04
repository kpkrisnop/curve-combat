# Team model: exactly two teams (RED/BLUE), open NvN size, online only

Decision D2 (`docs/multiplayer-arch/B-decisions.md`) made the server team-generic but left the player-facing team model undefined. For the frontend redesign (2026-07-03) we committed to: **exactly two teams** (RED vs BLUE — the color identity, field sides, and duel scoreboard survive), **open NvN team sizes** with one Soldier and one input panel per Player, **online only** — local hot-seat remains strictly 1v1 with the dual-panel layout. Waiting-room seating is auto-place-onto-smaller-team with self-service switching; Start enables when both teams have ≥1 Player.

**Considered options**: 2v2 cap (rejected — UI would need list-based rosters anyway), one shared Soldier per team (rejected — not really team play), N teams / free-for-all (rejected — destroys the RED/BLUE visual identity and field-side semantics).

**Consequences**

- Rosters, scoreboards, and the online HUD must be list-based, never two hard-coded slots. Online, a client renders only its own input panel plus a compact team status strip.
- Players need display names (nickname on create/join, localStorage-persisted) — the 1v1 game never had them.
- This supersedes two Group 5-era assumptions: rooms are no longer host+one-guest, and match settings are **editable by the Host until the match starts** (guests see live read-only updates with change highlights), superseding "settings locked once guest joins".
- HP and elimination are per-Player; a team loses the round when all its Players are eliminated.
