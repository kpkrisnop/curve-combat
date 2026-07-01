# Graph War

A browser game where a player fires by typing a mathematical function; the
projectile travels along the resulting curve through a world of targets and
destructible terrain.

## Language

**Player**:
One of exactly two contestants — **RED** and **BLUE** — on opposite sides of the field, played hot-seat on one keyboard. A Player takes the **Soldier** role on its own turn and the **Target** role on the opponent's. A single direct **Shot** hit on the opposing Player wins the game.
_Avoid_: user, team, unit

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
