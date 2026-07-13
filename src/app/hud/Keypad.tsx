// The on-screen math keypad. Pure and prop-driven: it knows nothing about
// MathQuill, teams, or turns — it renders keys and emits what was pressed.
// FiringConsole owns the routing.
//
// Replaces the native OS keyboard entirely (MathInput sets inputmode="none", so
// no keyboard opens on any device). It is therefore ALWAYS present — there is no
// touch/desktop fork and no device detection.
import { NUM_KEYS, OP_KEYS, NAV_KEYS, FN_KEYS, type KeyAction, type KeyDef } from "./keypadKeys";

interface Props {
  /** Not your turn, or a shot is in flight. */
  disabled: boolean;
  onKey: (action: KeyAction) => void;
}

function Key({ def, disabled, onKey }: { def: KeyDef; disabled: boolean; onKey: Props["onKey"] }) {
  return (
    <button
      type="button"
      className={`keypad__key ${def.className ?? ""}`}
      disabled={disabled}
      // A <button> tap steals focus from MathQuill's textarea, which drops the
      // caret. Suppressing the default pointerdown keeps focus in the field, so
      // the caret never blinks out from under the player.
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onKey(def.action)}
    >
      {def.label}
    </button>
  );
}

export function Keypad({ disabled, onKey }: Props) {
  const render = (defs: KeyDef[]) =>
    defs.map((d) => <Key key={d.label} def={d} disabled={disabled} onKey={onKey} />);

  return (
    <>
      <div className="keypad__zone keypad__nums">{render(NUM_KEYS)}</div>
      <div className="keypad__zone keypad__ops">{render(OP_KEYS)}</div>
      {/* The common twelve sit above the fold; the fade means "more below".
          See hud.css — the panel is absolutely positioned so it contributes no
          height, or it would grow the footer instead of scrolling. */}
      <div className="keypad__zone keypad__fnzone">
        <div className="keypad__fnpanel">
          <div className="keypad__fns">{render(FN_KEYS)}</div>
        </div>
      </div>
    </>
  );
}

export { NAV_KEYS };
