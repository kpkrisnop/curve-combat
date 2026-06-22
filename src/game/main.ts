import { GameRenderer } from "./GameRenderer";
import { GameUI } from "./GameUI";
import { fire } from "../sim/engine";
import { evaluateAll } from "../math/Context";
import type { World } from "../sim/types";

/** Fixed crater size carved into a planet on each hit (world units). */
const CRATER_RADIUS = 0.8;

/**
 * A fresh round: soldier on the left, targets on the right, and hand-placed
 * destructible planets in the way (kept clear of the muzzle and not overlapping
 * targets — see architecture-decisions.md §10).
 */
function seedWorld(): World {
  return {
    soldier: { pos: { x: -9, y: 0 }, dir: 1 },
    bounds: { minX: -12, minY: -7, maxX: 12, maxY: 7 },
    targets: [
      { id: "t1", pos: { x: 0, y: 0 }, radius: 0.4 },
      { id: "t2", pos: { x: 3, y: 2.5 }, radius: 0.4 },
      { id: "t3", pos: { x: 6, y: -2 }, radius: 0.4 },
      { id: "t4", pos: { x: 9, y: 3 }, radius: 0.4 },
    ],
    planets: [
      { id: "p1", pos: { x: -2, y: -1.5 }, radius: 1.6, craters: [] },
      { id: "p2", pos: { x: 4.5, y: 0 }, radius: 2, craters: [] },
      { id: "p3", pos: { x: 8.5, y: -1 }, radius: 1.2, craters: [] },
    ],
  };
}

const stage = document.getElementById("game-stage")!;
const renderer = new GameRenderer();
await renderer.init(stage);

const ui = new GameUI();

let world = seedWorld();
let shots = 0;
let busy = false;

function refresh(note?: string) {
  ui.setStatus(shots, world.targets.length, note);
}

function start() {
  world = seedWorld();
  shots = 0;
  renderer.setWorld(world);
  ui.hideWin();
  ui.clearInput();
  refresh();
  ui.focus();
}

async function onFire(latex: string) {
  if (busy || world.targets.length === 0) return;

  const result = evaluateAll([{ id: "shot", latex }]);
  const row = result.get("shot");
  const fn = row?.kind === "curve" ? row.fn : undefined;
  if (!fn) {
    refresh("that isn't a plottable function of x");
    return;
  }

  busy = true;
  ui.setBusy(true);

  const shot = fire(world, fn);
  if (shot.hit.kind !== "dud") shots++;

  await renderer.playShot(shot);

  if (shot.hit.kind === "target" && shot.hit.targetId) {
    world.targets = world.targets.filter((t) => t.id !== shot.hit.targetId);
    renderer.setWorld(world);
  } else if (shot.hit.kind === "planet" && shot.hit.planetId) {
    // Carve a crater into the struck planet (the engine stays pure — the world
    // update lives here, mirroring how a destroyed target is removed).
    const planet = world.planets.find((p) => p.id === shot.hit.planetId);
    if (planet) planet.craters.push({ pos: shot.hit.at, radius: CRATER_RADIUS });
    renderer.setWorld(world);
  }

  busy = false;
  ui.setBusy(false);

  if (world.targets.length === 0) {
    ui.showWin(shots);
  } else {
    refresh(noteFor(shot.hit.kind));
    ui.focus();
  }
}

function noteFor(kind: string): string {
  switch (kind) {
    case "target":
      return "hit! keep going";
    case "planet":
      return "blocked by a planet — carve through or arc around";
    case "bounds":
      return "flew off the field — try again";
    case "dud":
      return "undefined at the soldier — shift your function";
    default:
      return "missed — adjust and fire again";
  }
}

ui.onFire(onFire);
ui.onReset(start);

start();
