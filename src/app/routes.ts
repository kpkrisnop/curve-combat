import { useSyncExternalStore } from "react";
import { parseConfigFromHash } from "../game/configRouter";
import type { MatchConfig } from "../game/matchLogic";

export type Route =
  | { screen: "landing"; onlinePanelOpen?: boolean }
  | { screen: "local" }
  | { screen: "game"; config: MatchConfig }
  | { screen: "room"; code: string };

export function parseRoute(hash: string): Route {
  if (hash.startsWith("#room=")) {
    const code = hash.slice("#room=".length).trim().toUpperCase();
    return code ? { screen: "room", code } : { screen: "landing" };
  }
  if (hash === "#game" || hash.startsWith("#game?")) return { screen: "game", config: parseConfigFromHash(hash) };
  if (hash === "#local") return { screen: "local" };
  // The standalone online-choice page is gone; #online now reopens the
  // landing page with its inline Create/Join panel expanded.
  if (hash === "#online") return { screen: "landing", onlinePanelOpen: true };
  return { screen: "landing" };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
  };
}

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  return parseRoute(hash);
}
