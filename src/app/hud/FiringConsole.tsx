// The in-game footer console — the ONE console every mode uses. Replaced the
// always-both-visible dual `PlayerPanel` layout: one team-colored console whose
// visible field swaps with the turn.
//
// `noTurn` (simultaneous fire) also lives here now. It has no "whose turn" —
// local noTurn is disabled (two players cannot share one keypad) and online
// noTurn gives each client exactly one field (`singleTeam`). So `turn` is
// meaningless for routing there (the server never sets it: NetworkGame only
// calls setTurn when there IS an active player), and everything that means
// "the team this console types into" routes through `active` instead.
//
// Both teams' MathQuill fields stay mounted at all times (local hotseat) so
// each is simply its own memory across swaps — there is nothing to marshal.
// For online (`singleTeam` set) only one field ever mounts; the other side
// is represented by a locked placeholder while it's not your turn.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { hudStore, hudController, hudInputs, type Team } from "./hudStore";
import { MathField } from "./MathField";
import { TimerBadge } from "./TimerBadge";
import { Keypad, NAV_KEYS } from "./Keypad";
import { RecallPopover } from "./RecallPopover";
import type { KeyAction } from "./keypadKeys";

// Shown only while a shot is actually in flight — flavour that's earned by an
// event, never idle decoration. (A permanently-jokey status line would train
// players to ignore it, and then they'd miss the errors it also carries.)
const FLAVOUR = ["FIRE IN THE HOLE!", "PEW PEW!", "SHOT AWAY!", "INCOMING!", "LET 'ER RIP!"];

// The resting fallback before anyone has fired this round, so the line is never
// blank. Rotates per turn so it doesn't read as frozen.
const TIPS = [
  "Tip: ↺ Recall reloads a past shot — tweak it and fire again",
  "Tip: sin(x) arcs like a wave; x² dives like a mortar",
  "Tip: planets block shots — curve around them",
  "Tip: a steeper impact angle hits harder in HP mode",
  "Tip: Clear wipes the field; Recall brings a shot back",
];

const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FiringConsole({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  const turn = useStore(hudStore, (s) => s.turn);
  const noTurn = useStore(hudStore, (s) => s.noTurn);
  const status = useStore(hudStore, (s) => s.status);
  const statusTone = useStore(hudStore, (s) => s.statusTone);
  const history = useStore(hudStore, (s) => s.history);

  // The team this console types into — every input/fire/enable path routes
  // through this. Online: always me. Local: whoever's turn it is.
  const active: Team = singleTeam ?? turn;
  const busy = useStore(hudStore, (s) => s.busy[active]);

  const teams: Team[] = singleTeam ? [singleTeam] : ["red", "blue"];
  // In simultaneous fire you can always fire, so you are never waiting on anyone.
  const waiting = !noTurn && singleTeam !== undefined && turn !== singleTeam;
  // Whose name/dot the console shows. While waiting that's the opponent (== turn);
  // otherwise it's the team you're typing for.
  const displayed: Team = waiting ? turn : active;

  const [live, setLive] = useState<Record<Team, string>>({ red: "", blue: "" });
  // Recall pointer for whichever team is currently being navigated. idx -1 =
  // live draft; 0 = most recent shot.
  const recallRef = useRef<{ team: Team | null; idx: number }>({ team: null, idx: -1 });
  // The draft a team had typed before entering recall — restored when they
  // walk back down to it, so recall never destroys unfired work.
  const draftRef = useRef<Record<Team, string>>({ red: "", blue: "" });
  const programmaticRef = useRef(false); // true while WE set latex, so onEdit ignores it
  // Recall popover: the Recall key opens it, the input row renders it (upward).
  const [recallOpen, setRecallOpen] = useState(false);
  // Firing via Enter (keydown, no pointerdown) skips the tap-away handler, so a
  // popover left open would otherwise just hide during the shot and reappear
  // once busy clears — showing the next team's history under the old team's
  // key. Close it on any turn/busy transition instead of relying on tap-away.
  useEffect(() => setRecallOpen(false), [active, busy]);

  // Enable only the field this console types into. No .focus() here: nothing
  // opens an OS keyboard any more (inputmode="none"), so a focus call buys
  // nothing and re-introduces the caret/scroll fights of the reverted 90b2d52.
  useEffect(() => {
    teams.forEach((t) => hudInputs.get(t)?.setEnabled(t === active && !busy && !waiting));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `teams` is stable per singleTeam identity
    // ponytail: !waiting locks the field on the opponent's turn (formerly relied on CSS display:none)
  }, [active, busy, waiting, singleTeam]);

  const recallStep = (team: Team, dir: -1 | 1) => {
    const hist = hudStore.get().history[team];
    const cur = recallRef.current.team === team ? recallRef.current.idx : -1;
    let idx: number;
    if (dir < 0) {
      if (cur >= hist.length - 1) return; // nothing older (also covers empty history)
      if (cur === -1) draftRef.current[team] = hudInputs.get(team)?.getLatex() ?? "";
      idx = cur + 1;
    } else {
      if (cur < 0) return; // already on the draft — never blank it
      idx = cur - 1;
    }
    recallRef.current = { team, idx };
    const val = idx === -1 ? draftRef.current[team] : hist[idx];
    programmaticRef.current = true;
    hudInputs.get(team)?.setLatex(val);
    programmaticRef.current = false;
    setLive((l) => ({ ...l, [team]: val }));
  };

  const onEdit = (team: Team) => {
    if (programmaticRef.current) return;
    recallRef.current = { team: null, idx: -1 }; // user typed -> leave recall
    setLive((l) => ({ ...l, [team]: hudInputs.get(team)?.getLatex() ?? "" }));
  };

  // One router for every key. `insertChip` used to do this for the chip row;
  // the keypad is that row grown up, so it is the same mechanism.
  const onKey = (a: KeyAction) => {
    if (waiting || busy) return;
    const input = hudInputs.get(active);
    if (!input) return;
    if (a.kind === "insert") input.insertText(a.text);
    else if (a.kind === "keystroke") input.keystroke(a.keys);
    else if (a.name === "clear") {
      programmaticRef.current = true;
      input.setLatex("");
      programmaticRef.current = false;
    } else if (a.name === "recall") {
      setRecallOpen(true);
    }
    recallRef.current = { team: null, idx: -1 };
    setLive((l) => ({ ...l, [active]: hudInputs.get(active)?.getLatex() ?? "" }));
  };

  const canFire = !waiting && !busy && live[active].trim() !== "";
  const label = displayed.toUpperCase();

  // ── The status line ──────────────────────────────────────────────────────
  // One channel, in priority order: whatever the game last said (an error, a
  // warning, or the running shot commentary) > a shot in flight > a tip. It is
  // never blank, and never *usually* decorative — so a real error still reads
  // as a real error.
  const [flavour, setFlavour] = useState(FLAVOUR[0]);
  useEffect(() => { if (busy) setFlavour(pick(FLAVOUR)); }, [busy]);

  const [tip, setTip] = useState(() => pick(TIPS));
  useEffect(() => { setTip(pick(TIPS)); }, [turn]);

  const [statusText, statusKind] = status
    ? [status, statusTone]
    : busy
      ? [flavour, "flavour" as const]
      : [tip, "tip" as const];

  return (
    <div className="hud-console">
      {/* The console column. The Keypad's three zones are its siblings — four
          zones side by side (hud.css), so the band reads left to right:
          console · numbers · operators · functions. */}
      <div className="hud-console__col">
        <div className="hud-console__turnline">
          <span className="hud-console__turn" aria-live="polite">
            <span className={`hud-console__dot is-${displayed}`} aria-hidden="true" />
            {waiting ? `${label} IS AIMING…` : `${label} TO FIRE`}
          </span>
          <TimerBadge />
        </div>

        {/* Rendered even while waiting: a disconnect/forfeit warning is news you
            need on the opponent's turn too, not just your own. */}
        <div className={`hud-status is-${statusKind}`} aria-live="polite">{statusText}</div>

        <div className={`hud-console__inputrow ${waiting ? "is-locked" : ""}`}>
          {/* Anchored to the input row, opens upward over it. Killed if the turn
              or a shot takes the console away under it. */}
          {recallOpen && !waiting && !busy && (
            <RecallPopover
              history={history[active]}
              onPick={(latex) => {
                programmaticRef.current = true;
                hudInputs.get(active)?.setLatex(latex);
                programmaticRef.current = false;
                // A pick is a fresh starting point, not a position in the history
                // walk: reset the arrow-key cursor so ↑ still steps from the top
                // (and ↓ can't blank the field into a stale draft).
                recallRef.current = { team: null, idx: -1 };
                setLive((l) => ({ ...l, [active]: latex }));
                setRecallOpen(false);
              }}
              onDismiss={() => setRecallOpen(false)}
            />
          )}
          <span className="hud-prompt">y =</span>
          <div className="hud-console__fields">
            {teams.map((t) => (
              <div
                key={t}
                // In singleTeam (online) mode, while waiting on the opponent's turn,
                // the locked placeholder below takes over the "hud-console-field"
                // slot visually — this wrapper stays mounted (so the MathField
                // instance and its registry entry never unmount) but drops the
                // shared class so it doesn't also count as a visible field.
                className={
                  singleTeam && waiting
                    ? "hud-console-field--hidden"
                    : `hud-console-field ${t === active && !waiting ? "" : "hud-console-field--hidden"}`
                }
              >
                <MathField
                  team={t}
                  registry={hudInputs}
                  makeInput={makeInput}
                  placeholder="e.g. sin(x)"
                  onEnter={() => hudController.requestFire(t)}
                  onEdit={() => onEdit(t)}
                  onUpOutOf={() => recallStep(t, -1)}
                  onDownOutOf={() => recallStep(t, 1)}
                />
              </div>
            ))}
            {waiting && (
              <span className="hud-console-field hud-console-field--locked">
                opponent is choosing a curve…
              </span>
            )}
          </div>
        </div>

        <div className="hud-console__nav">
          {NAV_KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              className="keypad__key is-util"
              disabled={waiting || busy}
              // See Keypad's Key: a button tap would steal focus from MathQuill's
              // hidden textarea and drop the caret.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onKey(k.action)}
            >
              {k.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="cc-btn cc-btn--primary hud-console__fire"
          disabled={!canFire}
          onClick={() => hudController.requestFire(active)}
        >
          {busy ? "Firing…" : "Fire"}
          <span className="hud-console__fire-key" aria-hidden="true">↵</span>
        </button>
      </div>

      <Keypad disabled={waiting || busy} onKey={onKey} />
    </div>
  );
}
