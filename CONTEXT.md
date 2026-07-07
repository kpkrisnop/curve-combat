# Graph War

A browser game where a player fires by typing a mathematical function; the
projectile travels along the resulting curve through a world of targets and
destructible terrain.

## Language

**Team**:
One of exactly two sides — **RED** and **BLUE** — on opposite sides of the field. A Team has one or more **Players**. Local hot-seat is always one Player per Team; online Teams may have any size (NvN, online only).
_Avoid_: side, faction

**Player**:
A single contestant belonging to one **Team**, owning exactly one **Soldier** on the field. Plays hot-seat on a shared keyboard (1v1 only) or online from their own device. A Player takes the **Soldier** role when firing and the **Target** role toward opponents.
_Avoid_: user, unit

**Match**:
A full contest between the two Teams: best-of-N **Rounds** (3 or 5). The first Team to win a majority of Rounds wins the Match.
_Avoid_: game (ambiguous — could mean one Round or the whole Match), session

**Round**:
One play-through from a fresh field to a single winner. In Classic VS a Round ends on the first direct hit; in HP Mode it ends when a Player's HP reaches zero. The Round loser shoots first in the next Round.
_Avoid_: level, stage

**Turn**:
Within a Round, one Player's opportunity to fire a single **Shot**. In turn-based play the two Teams alternate Turns; **No-Turn Mode** has no Turns (both fire freely).
_Avoid_: move, go

**Turn Timer**:
The countdown bounding a single **Turn** (default 60 seconds; Host-configurable, 15-second minimum). If it expires before the Player fires, that Player's Turn is skipped and passes to the opponent. Online it is server-owned; the client only displays it. Does not apply in No-Turn Mode.
_Avoid_: clock, countdown, deadline

**No-Turn Mode**:
A Match option where both Teams fire simultaneously with no **Turn** alternation and no **Turn Timer** — a real-time free-for-all rather than a taking-turns duel.
_Avoid_: simultaneous mode, freeplay

**Room**:
A server-side rendezvous for one online Match, identified by a 4-letter human-readable code (e.g. `WOLF`). Created by the **Host**; joined by **Guests** via typed code or shared URL.
_Avoid_: lobby (the Lobby is the pre-game screen, not the rendezvous), session

**Host**:
The Player who creates a **Room**, controls the match configuration, and starts the Match. Canonical UI/docs term; the server internally calls this the room's owner.
_Avoid_: owner (code-internal only), creator, admin

**Guest**:
Any Player who joins an existing **Room** (one or more per Room). Sees the Host's match configuration read-only and waits for the Host to start.
_Avoid_: joiner, client (that's a network term)

**Spectator**:
A non-playing viewer in a **Room** beyond the two Player seats. Watches the Match read-only; cannot fire or affect play.
_Avoid_: observer, viewer

**Soldier**:
The *role* a Player occupies on its own turn: the shooter. Fires one **Shot** from its world position toward the opponent. (Also how the pure engine names the firing unit.)
_Avoid_: cannon

**Shot**:
A single fired curve, evaluated in world coordinates and anchored vertically to pass through the **Soldier**. Travels until it hits something or leaves the field.
_Avoid_: projectile (the projectile is the moving dot that renders a Shot), bullet

**Target**:
The *role* a Player occupies on the opponent's turn: the thing that can be hit. A single direct hit eliminates it and the shooter wins. (Also how the engine names a hittable circle.)
_Avoid_: enemy, dummy

**Planet**:
A destructible circular body of solid "meat," placed around the map in varying sizes. A Shot is blocked by a Planet's solid meat; hitting it carves a **Crater** rather than destroying it outright. Planets are terrain — they do not count toward the win condition.
_Avoid_: obstacle (implies static/indestructible), asteroid, rock

**Crater**:
A circular bite of empty space carved out of a **Planet**, centered on a Shot's impact point. A Planet's solid region is *inside its circle AND outside every one of its Craters*. Craters are permanent and accumulate.
_Avoid_: hole, dent

**Meat**:
The remaining solid area of a **Planet** (its circle minus the union of its Craters). A Shot collides only with meat. Detached islands of meat remain solid; a Planet is fully destroyed only when Craters have removed all of it.
_Avoid_: mass, body

## Flagged ambiguities

- **"Obstacle"** — earlier used loosely for "a circle that blocks shots." Resolved to **Planet** (destructible terrain), not a static blocker.
- **Solid vs. connected** — a point is solid purely by geometry (in-circle, out-of-all-craters). There is **no connectivity rule**: stranded/detached meat is still solid and still collides.

## Example dialogue

> **Dev:** If a Shot flies into a Crater, does it stop?
> **Designer:** No — a Crater is empty space. The Shot keeps going and stops only when it reaches Meat behind the Crater.
> **Dev:** And if it hits Meat, the Planet shrinks?
> **Designer:** It carves a new Crater at that point. Enough Craters and the Planet is gone — but if you punch a tunnel through and break off a chunk, that chunk stays floating and still blocks shots.
> **Dev:** Does destroying a Planet help you win?
> **Designer:** No. You win by clearing Targets. Planets are just terrain in the way.
