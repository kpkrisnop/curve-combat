# Quitting a live Match removes one Player and continues; the Match ends only when a Team is emptied

A Player who quits a live Match (explicit "Quit Match", or a full disconnect once the reconnect grace expires) is **removed from the roster** — their Soldier leaves the field and they do not respawn in later Rounds. The Match keeps going; the opposing Team is declared Match winner **only when a Team is left with zero Players**. This supersedes the previous behavior, where any in-match departure tore down the whole Room with an "Opponent timed out — room closed" error and nobody won.

## Why

- **Anti-exploit.** If "Quit Match" only removed you but closing the tab killed everyone's game, the polite button would be the sucker's option — a rage-quitter would just close the tab. Routing both the explicit quit and the grace-expired disconnect through the *same* removal path closes that gap: leaving never grants you the power to nuke an in-progress Match for the survivors.
- **It's the engine's natural shape, not a fight against it.** The turn queue already skips non-alive players (`nextActive` + `isAlive` in `src/game/turnQueue.ts`); a Round is already won by wiping a Team (`players.filter(team).every(!alive)` in `src/game/resolveFire.ts`) — "Team has no Players" is the same predicate; and `layout()` seats only the Players present, so a 2v2 that loses a Player genuinely respawns as 1v2 with the spare spawn column unused. 1v1 falls out for free: removing the sole Player empties that Team → opponent wins immediately.

## Consequences

- A new `forfeit` wire message + server handler is required (removal + turn advance + team-wipe/`matchWinner` check), distinct from the reconnect/grace path. Client and server protocol change together (see project Conventions).
- Grace-expiry stops tearing down the Room; it calls the same removal path. A transient drop that reconnects within grace is **not** a Forfeit — the Player keeps their seat.
- Local hot-seat has no roster to remove from and no remote opponent to award, so "Quit Match" there is cosmetic: confirm, then return to the landing screen with no winner declared.
