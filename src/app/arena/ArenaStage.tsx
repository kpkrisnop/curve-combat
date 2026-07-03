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
      if (!cancelled) onReadyRef.current(r);
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
