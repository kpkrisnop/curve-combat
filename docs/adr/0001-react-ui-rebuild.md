# UI chrome is rebuilt in React; engine, sim, and net stay vanilla TS

The original UI (lobby, HUD, overlays) was hand-rolled DOM in vanilla TS, and Group 5's plans were written against that. For the frontend redesign (2026-07-03) we decided to rebuild the UI layer in **React** while leaving `src/sim`, `src/engine`, the canvas renderer, and `src/net` untouched — React owns only the chrome around the canvas. React was chosen over Svelte/Preact chiefly because it keeps the React Native / iPad idea (see `docs/multiplayer-arch/README.md`) plausible and has the deepest ecosystem; the cost is a second paradigm in a deliberately plain-TS repo.

**Consequences**

- Hash routing (`/#game?room=WOLF`) is retained — screen switching is React state, no router library, no host rewrite rules.
- MathQuill and the game canvas mount imperatively inside React via refs; they are not React-managed.
- The redesign targets desktop + iPad landscape (≥1024px); phones get a "use a bigger screen" gate.
