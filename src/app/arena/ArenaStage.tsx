import { useEffect, useRef } from "react";
import type { GameRenderer } from "../../game/GameRenderer";
import { acquireRenderer } from "./rendererSingleton";

interface Props {
  scale: number;                       // 0.87 in config phase, 1 in play
  onReady: (r: GameRenderer) => void;
  factory?: () => GameRenderer;        // test seam
}

export function ArenaStage({ scale, onReady, factory }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyScaleRef = useRef(scale); // captures the scale at mount for the initial (un-animated) zoom

  useEffect(() => {
    let cancelled = false;
    void acquireRenderer(hostRef.current!, factory).then((r) => {
      if (cancelled) return;
      rendererRef.current = r;
      r.setZoomFactor(readyScaleRef.current); // initial zoom, no animation
      onReadyRef.current(r);
      // Pixi's resizeTo measures the container at init and only re-measures on
      // window resize. When this stage mounts into a screen whose layout settles
      // a frame later, the canvas can keep a stale (collapsed) size — re-measure
      // once the layout has settled so it fills its box.
      requestAnimationFrame(() => { if (!cancelled) r.app.resize?.(); });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate the coordinate-plane zoom whenever the target scale changes.
  useEffect(() => {
    rendererRef.current?.animateZoom(scale);
  }, [scale]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // The map card (this host element) can change size at runtime — footer
    // growth for a tall equation, or the settings panel opening a second grid
    // column — while the window stays fixed, so Pixi's own window-resize
    // listener never fires. Re-measure through the same app.resize() path the
    // mount-time rAF above already uses: it re-measures `resizeTo` and fires
    // the Pixi "resize" event, which GameRenderer.init() already wires to
    // recompute fitContain and redraw grid/boundary/planets/dots.
    const ro = new ResizeObserver(() => {
      rendererRef.current?.app.resize?.();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="arena-frame">
      <div ref={hostRef} className="arena-stage" />
    </div>
  );
}
