// PROTOTYPE — throwaway. Question: in the redesigned in-game footer, a SINGLE
// visible math input swaps color/ownership between the two teams each turn. Does
// each team's equation survive the swap without manual marshalling?
//
// Answer this prototype demonstrates: keep TWO MathQuill instances mounted (one
// per team), show only the active one (display:none hides the other — which also
// stops the idle player copying the live equation). Because each field is its own
// DOM instance, there is NOTHING to pass on swap: each field simply IS that team's
// memory. The "PROTOTYPE INSPECTOR" strip proves both equations persist independently.
//
// Also included so the feel is real: prominent timer, function-chip helper,
// equation recall, Fire promoted to the ivory primary, inline quit-confirm, and
// the online "opponent is aiming" locked state.

import { Fragment, useEffect, useRef, useState } from "react";
import { MathInput } from "../../../ui/MathInput";

type Team = "red" | "blue";
type Mode = "local" | "online";
type Phase = "active" | "firing" | "waiting"; // waiting = online, opponent's turn

const OTHER: Record<Team, Team> = { red: "blue", blue: "red" };
const TURN_SECONDS = 25;

// Chip -> characters typed into the field. Leverages MathQuill's autoCommands /
// autoOperatorNames (sin/cos/sqrt/pi/ln/log become proper notation as they're
// "typed"). Grouped (trig / logs / powers-roots / constants / structural) so a
// 25s timer doesn't force scanning a flat wall of undifferentiated buttons.
const CHIP_GROUPS: { label: string; type: string }[][] = [
  [{ label: "sin", type: "sin(" }, { label: "cos", type: "cos(" }, { label: "tan", type: "tan(" }],
  // "log_" leaves the cursor inside the subscript for the base — same raw-
  // insertion-point pattern as the "xⁿ" chip below leaving the cursor in a
  // superscript; the player arrows out before typing the argument.
  [{ label: "ln", type: "ln(" }, { label: "logₐ", type: "log_" }],
  [{ label: "√", type: "sqrt" }, { label: "x²", type: "x^2" }, { label: "xⁿ", type: "^" }],
  [{ label: "π", type: "pi" }, { label: "e", type: "e" }],
  [{ label: "( )", type: "(" }, { label: "abs", type: "abs(" }],
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function FooterProto() {
  const [mode, setMode] = useState<Mode>("local");
  const [active, setActive] = useState<Team>("red");
  const [phase, setPhase] = useState<Phase>("active");
  const [timer, setTimer] = useState(TURN_SECONDS);
  const [quitConfirm, setQuitConfirm] = useState(false);

  // Live mirror of each field's latex — for the inspector + Fire-disabled logic.
  const [live, setLive] = useState<Record<Team, string>>({ red: "", blue: "" });
  const [history, setHistory] = useState<Record<Team, string[]>>({ red: [], blue: [] });

  const inputsRef = useRef<Record<Team, MathInput> | null>(null);
  const hostRef = useRef<Record<Team, HTMLSpanElement | null>>({ red: null, blue: null });
  const historyRef = useRef(history);
  historyRef.current = history;
  // Recall pointer for the active team. idx -1 = live draft; 0 = most recent shot.
  const recallRef = useRef<{ team: Team | null; idx: number }>({ team: null, idx: -1 });
  // The draft a team had typed before entering recall — restored when they walk
  // back down to it, so recall never destroys unfired work.
  const draftRef = useRef<Record<Team, string>>({ red: "", blue: "" });
  const programmaticRef = useRef(false); // true while WE set latex, so onEdit ignores it
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ── Create both MathQuill fields once; keep them mounted for the whole life ──
  useEffect(() => {
    const make = (team: Team): MathInput => {
      const input = new MathInput("", "e.g. sin(x)");
      hostRef.current[team]!.appendChild(input.el);
      input.reflow();
      input.onEnter(() => fireRef.current());
      input.onEdit(() => {
        if (programmaticRef.current) return;
        recallRef.current = { team: null, idx: -1 }; // user typed -> leave recall
        setLive((l) => ({ ...l, [team]: input.getLatex() }));
      });
      // Recall fires only when the cursor is already at the top/bottom level —
      // MathQuill keeps Up/Down for in-math navigation everywhere else.
      input.onUpOutOf(() => recallStepRef.current(team, -1));
      input.onDownOutOf(() => recallStepRef.current(team, 1));
      return input;
    };
    inputsRef.current = { red: make("red"), blue: make("blue") };
    return () => {
      const inp = inputsRef.current;
      if (inp) (["red", "blue"] as Team[]).forEach((t) => inp[t].el.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // ── Enable only the active field; reflow + focus it when it becomes visible ──
  useEffect(() => {
    const inp = inputsRef.current;
    if (!inp) return;
    const typeable = phase === "active";
    (["red", "blue"] as Team[]).forEach((t) => inp[t].setEnabled(typeable && t === active));
    if (typeable) {
      inp[active].reflow();
      inp[active].focus();
    }
  }, [active, phase]);

  // ── Turn timer — runs only while it's someone's live turn ──
  useEffect(() => {
    if (phase !== "active") return;
    setTimer(TURN_SECONDS);
    const id = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(id);
          // Timeout: hand the turn over (no shot fired).
          if (modeRef.current === "local") setActive((a) => OTHER[a]);
          else setPhase("waiting");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [active, phase]);

  // ── Fire (kept in a ref so MathQuill's onEnter always calls the latest) ──
  const fireRef = useRef<() => void>(() => {});
  fireRef.current = () => {
    if (phase !== "active") return;
    const inp = inputsRef.current!;
    const latex = inp[active].getLatex();
    if (!latex.trim()) return;
    setHistory((h) => ({ ...h, [active]: [latex, ...h[active]].slice(0, 8) }));
    recallRef.current = { team: null, idx: -1 };
    // Brief "firing" lock for realism (projectile in flight), then hand over.
    setPhase("firing");
    setTimeout(() => {
      if (modeRef.current === "local") {
        setActive((a) => OTHER[a]);
        setPhase("active");
      } else {
        setPhase("waiting"); // opponent's turn
      }
    }, 600);
  };

  // ── Function chips: type into the active field via MathQuill's own interface ──
  const insertChip = (chars: string) => {
    if (phase !== "active") return;
    const input = inputsRef.current![active];
    // MathInput hides `mq`; reach it directly — throwaway prototype.
    const mq = (input as unknown as { mq: { typedText(s: string): void; focus(): void } }).mq;
    mq.typedText(chars);
    mq.focus();
    recallRef.current = { team: null, idx: -1 };
    setLive((l) => ({ ...l, [active]: input.getLatex() }));
  };

  // ── Equation recall (↑ older / ↓ newer) — driven by MathQuill's upOutOf /
  //    downOutOf (wired in make() above), which fire ONLY when the cursor is at
  //    the field's top/bottom with nowhere higher/lower to go. Kept in a ref so
  //    the mount-time handlers always call the latest, reading fresh history. ──
  const recallStepRef = useRef<(team: Team, dir: -1 | 1) => void>(() => {});
  recallStepRef.current = (team, dir) => {
    const hist = historyRef.current[team];
    const cur = recallRef.current.team === team ? recallRef.current.idx : -1;
    let idx: number;
    if (dir < 0) {
      // OLDER (↑): block if there's nothing older to show (covers empty history,
      // where hist.length-1 === -1 === cur).
      if (cur >= hist.length - 1) return;
      // First step out of the live draft — remember it so ↓ can bring it back.
      if (cur === -1) draftRef.current[team] = inputsRef.current![team].getLatex();
      idx = cur + 1;
    } else {
      // NEWER (↓): block when we're already on the draft — THIS is the guard that
      // stops an over-eager ↓ from wiping unfired work.
      if (cur < 0) return;
      idx = cur - 1; // may return to -1 = back to the saved draft
    }
    recallRef.current = { team, idx };
    const val = idx === -1 ? draftRef.current[team] : hist[idx];
    programmaticRef.current = true;
    inputsRef.current![team].setLatex(val);
    programmaticRef.current = false;
    setLive((l) => ({ ...l, [team]: val }));
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setActive("red");
    setPhase("active");
    setQuitConfirm(false);
  };

  const canFire = phase === "active" && live[active].trim() !== "";
  const timerCls = timer <= 5 ? "crit" : timer <= 10 ? "warn" : "";
  const waiting = phase === "waiting";
  const opponent = OTHER[active];

  return (
    <div className="pf-stage">
      {/* Faux arena backdrop so the footer's blur + context read truthfully. */}
      <div className="pf-arena">
        <span className="pf-arena__tag">ARENA · prototype backdrop</span>
      </div>

      {/* ── THE FOOTER ─────────────────────────────────────────────────────── */}
      {/* Team class follows whoever the glow should represent right now: the
          active player normally, the opponent while waiting on them — so the
          waiting state keeps a faint reminder of whose turn it actually is
          instead of going fully neutral. */}
      <div className={`comp footer footer--ingame pf-footer is-${waiting ? opponent : active} ${waiting ? "is-waiting" : ""}`}>
        {/* Quit — de-emphasized, tucked to the corner; inline confirm (no window.confirm) */}
        <div className="pf-quit">
          {quitConfirm ? (
            <span className="pf-quit__confirm">
              <span className="pf-quit__q">Quit match?</span>
              <button className="gw-btn gw-btn--danger pf-quit__yes" onClick={() => switchMode(mode)}>Quit</button>
              <button className="gw-btn pf-quit__no" onClick={() => setQuitConfirm(false)}>Stay</button>
            </span>
          ) : (
            <button className="gw-btn pf-quit__btn" onClick={() => setQuitConfirm(true)}>Quit</button>
          )}
        </div>

        {/* The firing console */}
        <div className="pf-console">
          {/* Turn identity + prominent timer */}
          <div className="pf-turnline">
            <span className="pf-turn" aria-live="polite">
              <span className={`pf-dot is-${waiting ? opponent : active}`} aria-hidden="true" />
              {waiting
                ? `${opponent.toUpperCase()} IS AIMING…`
                : `${active.toUpperCase()} TO FIRE`}
            </span>
            <span className={`pf-timer ${timerCls}`}>{fmt(timer)}</span>
          </div>

          {/* Input row — both fields mounted; inactive one hidden (not unmounted) */}
          <div className={`pf-inputrow ${waiting ? "is-locked" : ""}`}>
            <span className="pf-prompt">y =</span>
            <div className="pf-fields">
              {(["red", "blue"] as Team[]).map((t) => (
                <span
                  key={t}
                  className={`pf-field ${t === active && !waiting ? "" : "pf-field--hidden"}`}
                  ref={(el) => { hostRef.current[t] = el; }}
                />
              ))}
              {waiting && <span className="pf-field pf-field--locked">opponent is choosing a curve…</span>}
            </div>
            {!waiting && (
              <button
                className="pf-clear"
                title="Clear"
                aria-label="Clear equation"
                disabled={!live[active].trim()}
                onClick={() => {
                  programmaticRef.current = true;
                  inputsRef.current![active].setLatex("");
                  programmaticRef.current = false;
                  setLive((l) => ({ ...l, [active]: "" }));
                  inputsRef.current![active].focus();
                }}
              >×</button>
            )}
            <button
              className="gw-btn gw-btn--primary pf-fire"
              disabled={!canFire}
              onClick={() => fireRef.current()}
            >
              {phase === "firing" ? "Firing…" : "Fire"}
              <span className="pf-fire__key" aria-hidden="true">↵</span>
            </button>
          </div>

          {/* Function chips + hint */}
          <div className="pf-chiprow">
            <div className="pf-chips">
              {CHIP_GROUPS.map((group, gi) => (
                <div className="pf-chip-group" key={gi}>
                  {group.map((c) => (
                    <button key={c.label} className="pf-chip" disabled={waiting} onClick={() => insertChip(c.type)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <span className="pf-hint">↑ recall · ↵ fire</span>
          </div>
        </div>

        {/* Online-only: proto affordance to simulate the opponent handing the turn back */}
        {mode === "online" && waiting && (
          <button className="gw-btn pf-oppfire" onClick={() => setPhase("active")}>
            Opponent fires →
          </button>
        )}
      </div>

      {/* ── PROTOTYPE INSPECTOR — surfaces the state the question is about ──── */}
      <div className="pf-inspector">
        <div className="pf-inspector__head">
          <span className="pf-inspector__title">PROTOTYPE INSPECTOR</span>
          <span className="pf-modeswitch">
            <button className={mode === "local" ? "is-on" : ""} onClick={() => switchMode("local")}>Local hotseat</button>
            <button className={mode === "online" ? "is-on" : ""} onClick={() => switchMode("online")}>Online (you = RED)</button>
          </span>
        </div>
        <div className="pf-inspector__grid">
          <span className="pf-k">phase</span><span className="pf-v">{phase}</span>
          <span className="pf-k">active team</span><span className={`pf-v is-${active}`}>{active}</span>
          {(["red", "blue"] as Team[]).map((t) => (
            <Fragment key={t}>
              <span className={`pf-k is-${t} ${t === active ? "is-live" : ""}`}>{t} field</span>
              <span className="pf-v">
                <code>{live[t] || "∅"}</code>
                <span className="pf-histline">history: [{history[t].join(", ") || "—"}]</span>
              </span>
            </Fragment>
          ))}
        </div>
        <p className="pf-inspector__note">
          Type an equation as RED, Fire (or let the timer time out), then Fire again as BLUE and swap back.
          Each field keeps its own value across swaps — the two MathQuill instances never exchange state.
        </p>
      </div>
    </div>
  );
}
