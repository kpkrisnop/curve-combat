// src/app/hud/IngameQuit.tsx
//
// The ingame Quit, evicted from the footer (the keypad fills it now) and
// floated into the MAP CARD's top-right corner. Rendered by LocalFlow /
// OnlineFlow as a sibling of <ArenaStage> inside `.comp.map-card`, which is
// already `position: relative` (the `.comp` primitive).
//
// Still two-step, deliberately: it now floats over the play area, and a stray
// palm on a touchscreen must not end a match.

import { useState } from "react";

export function IngameQuit({ onLeave }: { onLeave?: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="arena-quit">
      {confirming ? (
        <span className="arena-quit__confirm">
          <span className="arena-quit__q">Quit match?</span>
          <button type="button" className="cc-btn cc-btn--danger arena-quit__yes" onClick={onLeave}>Quit</button>
          <button type="button" className="cc-btn arena-quit__no" onClick={() => setConfirming(false)}>Stay</button>
        </span>
      ) : (
        <button
          type="button"
          className="arena-quit__btn"
          aria-label="Quit match"
          title="Quit match"
          onClick={() => setConfirming(true)}
        >
          ✕
        </button>
      )}
    </div>
  );
}
