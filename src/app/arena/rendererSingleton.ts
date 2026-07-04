import { GameRenderer } from "../../game/GameRenderer";

let initPromise: Promise<GameRenderer> | null = null;

/**
 * One renderer per session (ADR-0003): the config screen and the game screen
 * share the same Pixi canvas so the config→game transition is a CSS transform,
 * never a re-init. Re-acquiring with a new container moves the canvas.
 */
export async function acquireRenderer(
  container: HTMLElement,
  factory: () => GameRenderer = () => new GameRenderer(),
): Promise<GameRenderer> {
  if (!initPromise) {
    const r = factory();
    initPromise = r.init(container).then(() => r);
    return initPromise;
  }
  const r = await initPromise;
  if (r.app.canvas.parentElement !== container) {
    container.appendChild(r.app.canvas);
    r.app.resizeTo = container;
    r.app.resize();
  }
  return r;
}

/** Test-only. */
export function _resetForTests(): void {
  initPromise = null;
}
