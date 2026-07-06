# Shot playback paces the projectile by arc length, on a fixed x-based duration, with a bang→travel speed curve

The shot-flight animation in `GameRenderer.playShot` used to advance the projectile head by **sample index** (`headF = progress * (samples.length - 1)`). But the trajectory is sampled by curvature (`sampleTrajectory` in `src/sim/trajectory.ts`) — dense in curvy/steep regions, sparse in flat ones — so equal index steps cover unequal on-screen distance. The bullet visibly crawled through curves and raced across flats (Issue 5).

The head is now driven by cumulative **Euclidean arc length** (`cumulativeArcLength` / `pointAtLength` in `src/sim/playback.ts`), so on-screen speed is constant regardless of how the path was sampled. Three sub-decisions, validated against the stress case `y = 5·sin(50x)/(1+e^-x)` (arc length ≈ 63× its x-length) in a throwaway Canvas prototype:

1. **Step type — constant arc-length speed** (not constant `dx/dt`). `dx/dt`-constant still surges on steep regions because on-screen speed depends on `dy` too, and it doesn't generalize to non-monotonic/parametric paths.
2. **Duration — "same time"**: total flight time is still `max(MIN_SHOT_MS, xLength / X_VELOCITY_WORLD * 1000)` (unchanged). The alternative ("same speed" — pin instantaneous arc-speed to `X_VELOCITY_WORLD`) produced a 156-second flight for the stress curve. "Same time" keeps flights bounded; the accepted tradeoff is that arc-speed scales up for wiggly shots.
3. **Deceleration — bang→travel** (`bangTravelProgress`): `v(u) = (c−b)·e^(−a·u) + b`, position = its normalized integral so `progress(1) = 1` exactly. Locked params **a = 1, c = 3** (b = 1 baseline). The bullet leaves at 3× cruise speed and settles — only the ratio `c/b` shapes the curve; the absolute speed scale is owned entirely by decision #2.

**Consequences**

- New pure, unit-tested module `src/sim/playback.ts` (Node-safe, no Pixi); the renderer only wires it into the ticker. `MIN_SHOT_MS`, `BANG_DECAY_RATE`, `BANG_SPEED_MULTIPLIER` live in `GameRenderer.ts`.
- Gap segments contribute **zero** arc length — the head jumps a discontinuity instantly, matching the trail's pen-lift.
- HP-mode damage is untouched: `impactSlope` is computed at fire-time from sample geometry (`src/sim/engine.ts`), before playback; none of the above changes it.
- Known accepted caveat: for extreme high-frequency functions, "same time" + the `c=3` bang phase can briefly read as a blur at the very start of the shot. Not treated as a blocker; future levers are blending duration toward arc length for extreme ratios, or capping peak instantaneous speed.
