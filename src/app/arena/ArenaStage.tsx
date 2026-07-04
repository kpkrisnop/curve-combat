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
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    void acquireRenderer(hostRef.current!, factory).then((r) => {
      if (cancelled) return;
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

  return (
    <div className="arena-frame">
      <div
        ref={hostRef}
        className="arena-stage"
        style={{ transform: `scale(${scale})`, transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
    </div>
  );
}
