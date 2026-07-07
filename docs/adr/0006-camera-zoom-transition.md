# The pre-game→play transition zooms the coordinate plane, not the canvas element

ADR-0003 specified the waiting-room→match transition as a CSS `transform: scale()` on the canvas element (`0.87 → 1`). That physically shrinks the canvas in the waiting room, leaving blank frame edges around it. We are replacing that: the canvas now stays pinned to the full `.arena-frame` at all times, and the **coordinate plane** zooms instead — `cam.scale = fitContain(map) × factor`, with `factor` `0.87` pre-game (the arena occupies ~87% of the frame, the surrounding ~13% is live grid rather than dead space) animating to `1.0` at match start (arena fits the frame).

## Why

The waiting room should read as one continuous world you're zoomed out over, not a shrunken card floating in a blank frame. Zooming the plane keeps the grid filling the frame throughout, so the transition is a camera pull-in rather than an element resize.

## Consequences

- The `transform` / `transform-origin` on `.arena-stage` are removed. `ArenaStage`'s `scale` prop becomes a **camera-zoom factor**, not a CSS transform.
- Nothing animates `cam.scale` for free anymore (the browser was tweening the CSS transform on the GPU). The **renderer owns a `requestAnimationFrame` tween** of `cam.scale`, redrawing each frame. Defining it as `fitContain × factor` keeps a mid-tween window resize correctly fitted.
- Per-frame redraw cost is dominated by planet render-to-texture re-rasterization (keyed on `cam.scale`). Acceptable for a once-per-match, ~900ms animation on the desktop-only target. **Build the simple full-redraw version first.** If it hitches, the fallback is to scale the existing planet sprites during the tween and re-rasterize once at the end — or drop the zoom entirely for a plain screen-wipe transition.
- The shared-renderer / synchronized-countdown core of ADR-0003 is unchanged; only the zoom mechanism differs.
