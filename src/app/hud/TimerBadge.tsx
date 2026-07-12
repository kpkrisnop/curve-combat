import { useStore } from "../store";
import { hudStore } from "./hudStore";

export function TimerBadge() {
  const timer = useStore(hudStore, (s) => s.timer);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  if (timer === null || noTurn) return null;
  const cls = timer <= 5 ? "hud-timer crit" : timer <= 10 ? "hud-timer warn" : "hud-timer";
  return <span className={cls}>{timer}s</span>;
}
