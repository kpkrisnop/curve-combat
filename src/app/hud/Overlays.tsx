import { useStore } from "../store";
import { hudStore, hudController } from "./hudStore";

// Standalone top-center round/score readout (arena-shell-redesign D3, spec §9).
// Relocated out of HudBar (was the in-flow `.scoreboard` inside the footer)
// to a standalone element that floats top-center over the map. Rendered only
// while HudOverlays is mounted, which callers (LocalFlow/OnlineFlow) already
// gate to the in-game phase — never shown pre-game.
function RoundStatus() {
  const score = useStore(hudStore, (s) => s.score);
  return (
    <div className="round-status" data-testid="round-status">
      Round {score.round} · Best of {score.totalRounds} — {score.red} : {score.blue}
    </div>
  );
}

function WinBanner() {
  const win = useStore(hudStore, (s) => s.win);
  if (!win) return null;
  return (
    <div className="cc-overlay-center cc-overlay-center--modal">
      <div className="win-banner">
        <h2 className={`w-${win.winner}`}>{win.winner} wins</h2>
        <p>{win.detail}</p>
        <button className="cc-btn cc-btn--primary" onClick={() => hudController.requestReset()}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}

function RoundSplash() {
  const splash = useStore(hudStore, (s) => s.splash);
  if (!splash) return null;
  return (
    <div className="cc-overlay-center">
      {/* splash html is app-generated (LocalGame), never user input */}
      <div className="round-splash" dangerouslySetInnerHTML={{ __html: splash }} />
    </div>
  );
}

function TutorialOverlay() {
  const tutorial = useStore(hudStore, (s) => s.tutorial);
  if (!tutorial) return null;
  return (
    <div className="cc-overlay-center cc-overlay-center--modal">
      <div className="tutorial-box">
        <p>{tutorial.text}</p>
        <div className="tutorial-actions">
          <button className="cc-btn" onClick={() => hudController.tutorialSkip()}>Skip tutorial</button>
          <button className="cc-btn cc-btn--primary" onClick={() => hudController.tutorialNext()}>OK</button>
        </div>
      </div>
    </div>
  );
}

export function HudOverlays() {
  return (<><RoundStatus /><WinBanner /><RoundSplash /><TutorialOverlay /></>);
}
