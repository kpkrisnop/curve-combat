# CurveCombat

A browser game where two teams fire mathematical function curves across a planet-scattered arena to hit each other. React + TypeScript + Vite client, Pixi.js canvas rendering, and an authoritative WebSocket server for online play. Supports local hotseat and online NvN (two teams). Desktop and tablet, either orientation; phones are gated out (~<700px).

## Layout

- `src/sim/` — Pure, deterministic simulation and geometry (physics, collision, arena generation, fit/transform math). No DOM, no framework, seeded RNG. Must import and run identically in Node and the browser — keep it side-effect-free.
- `src/math/` — Expression parsing/evaluation for the fired functions.
- `src/game/` — Match/game orchestration: bridges `sim` to the UI (rounds, turns, HP, config, layout). Framework-light.
- `src/graph/` + the Pixi renderer — Canvas rendering (camera, arena, curves).
- `src/net/` — Client networking: the wire protocol (Zod schemas) and the client-side networked game.
- `src/app/` — The React app: screens, the arena stage, and the HUD. UI shell and routing.
- `src/design/` — Design tokens / CSS custom properties.
- `src/ui/` — Math-input helpers (MathQuill-based; browser-only).
- `server/` — Authoritative WebSocket server: rooms and the match engine. **The server is the source of truth for online matches.**
- `docs/` — `adr/` (accepted decisions), `superpowers/specs` + `superpowers/plans` (design specs and implementation plans).
- `CONTEXT.md` (root) — the domain glossary. Canonical vocabulary (Team, Player, Match, Round, Turn, Turn Timer, Planet, Crater, …) with the words to avoid. Use these terms in code and discussion; extend it when new domain concepts are pinned down.

## Commands

- Install: `npm install`
- Client dev server: `npm run dev` (Vite, port 5173)
- Game server: `npm run server` (WebSocket, port 3001)
- Tests: `npm test` (Vitest); one file: `npx vitest run <path>`
- Typecheck + build: `npm run build` (`tsc --noEmit` + Vite)
- **Server typecheck is separate:** root `tsc` does not cover `server/`. After any server change also run `npx tsc -p server/tsconfig.json`.

## Conventions

- TDD. Tests are colocated `*.test.ts(x)` (Vitest + Testing Library). Write the failing test first.
- Wire messages are Zod discriminated unions defined in one protocol module; client and server must stay in sync — change both sides together.
- `sim` stays Node-safe and deterministic (no DOM, seeded RNG) so the server and every client compute the same result. Don't leak browser APIs into it.
- Single source of truth for shared quantities: derive the world/play bounds from the shared map-config helper so server collision and client rendering agree — never hardcode a parallel copy.
- Online is server-authoritative: match phase, turns, and state come from server messages; the client renders them and does not self-advance authoritative state.
- Record notable decisions in `docs/adr/`; write a spec/plan under `docs/superpowers/` before large changes.

## Gotchas

- This checkout often lives on a slow (cloud-synced) filesystem, which makes Vitest's per-file environment setup slow. The **full suite is flaky under parallel load** — timing-sensitive React and countdown tests time out when many run at once but pass in isolation. Before treating a failure as a regression, re-run that file alone. The server integration tests (real countdown delays) are the most sensitive.
- Keep the client protocol and server handlers in lockstep (see Conventions).
- The HUD (`hudStore` / `hudController` in `src/app/hud/`) is an app-wide singleton shared by both local and online play. Screens own its lifecycle — reset HUD state on entry and dispose their game instance on unmount — or timers, intervals, and stale state bleed between modes.
- **A fired curve is anchored to the shooter**, not to world coordinates (`trajectory.ts`: `yOffset = sy - fn(sx)`) — the curve is translated so it always passes through the soldier. So firing a *constant* draws a flat line at the shooter's own y and the constant's value is irrelevant; such a shot connects only when both soldiers share a y (i.e. `spawnMirror`, which is **off** by default — the two sides roll independently). Tests that need a guaranteed hit must ask for `spawnMirror: true` rather than assume it.
- The math field sets `inputmode="none"` — no OS keyboard EVER opens, on any device. The in-footer `Keypad` (`src/app/hud/Keypad.tsx`) is the only way to type on touch, and every key must `preventDefault()` on `pointerdown` or the tap steals focus from MathQuill's hidden textarea and drops the caret. Never add device detection around any of this — it has been tried and reverted; media queries describe the *pointer*, not whether a hardware keyboard exists (an iPad with a Magic Keyboard reports `hover: hover`).
- Much of the surface is UI, animation, networking, and turn/round lifecycle: the bug classes here (focus, leaked intervals, render timing, reconnect/turn state) are ones the unit suite misses. Reproduce and verify in a real browser, not just Vitest.
- `.superpowers/` (gitignored) holds a subagent-workflow progress ledger when that workflow is in use.
