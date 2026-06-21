import { GameRenderer } from "./GameRenderer";
import { GameUI } from "./GameUI";
import { fire } from "../sim/engine";
import { evaluateAll } from "../math/Context";
import type { World } from "../sim/types";

/** A fresh round: soldier on the left, a handful of targets on the right. */
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
