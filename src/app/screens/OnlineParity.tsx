import { useEffect, useRef } from "react";
import { ArenaStage } from "../arena/ArenaStage";
import { HudBar } from "../hud/HudBar";
import { HudOverlays } from "../hud/Overlays";
import { hudController } from "../hud/hudStore";
import { NetworkGame } from "../../net/NetworkGame";
import { ServerClient } from "../../net/ServerClient";
import type { GameRenderer } from "../../game/GameRenderer";

const WS_URL: string = (import.meta.env["VITE_WS_URL"] as string | undefined) ?? "ws://localhost:3001";

export function OnlineParity({ code }: { code: string }) {
  const startedRef = useRef(false);

  useEffect(() => {
    hudController.onReset(() => { location.hash = ""; });
  }, []);

  const onReady = (renderer: GameRenderer) => {
    if (startedRef.current) return;
    startedRef.current = true;
    const name = prompt("Enter your name:", "Player") ?? "Player";
    const net = new NetworkGame(new ServerClient(WS_URL), renderer, hudController);
    void net.start(code, name);
  };

  return (
    <div className="gw-layer" style={{ position: "absolute", inset: 0 }}>
      <ArenaStage scale={1} onReady={onReady} />
      <HudBar />
      <HudOverlays />
    </div>
  );
}
