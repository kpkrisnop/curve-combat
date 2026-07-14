import "./hud.css";
import type { Team } from "./hudStore";
import { FiringConsole } from "./FiringConsole";

/**
 * Every mode — turn-based and simultaneous-fire, local and online — uses the one
 * console. The old dual `PlayerPanel` layout existed only for `noTurn`; local
 * noTurn is now disabled (two players cannot share one keypad) and online noTurn
 * gives each client exactly one field, so there is nothing left for it to do.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HudBar({ makeInput, singleTeam }: { makeInput?: () => any; singleTeam?: Team }) {
  return <FiringConsole makeInput={makeInput} singleTeam={singleTeam} />;
}
