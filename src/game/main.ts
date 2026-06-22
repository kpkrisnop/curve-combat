import { GameRenderer } from "./GameRenderer";
import { GameUI } from "./GameUI";
import { fire } from "../sim/engine";
import { evaluateAll } from "../math/Context";
import type { Planet, Vec2, World } from "../sim/types";

const CRATER_RADIUS = 0.8;
const PLAYER_RADIUS = 0.7;
const BOUNDS = { minX: -12, minY: -7, maxX: 12, maxY: 7 };

const RED_POS: Vec2 = { x: -9, y: 0 };
const BLUE_POS: Vec2 = { x: 9, y: 0 };

const PLAYERS = {
  red: { pos: RED_POS, dir: 1 as const },
  blue: { pos: BLUE_POS, dir: -1 as const },
};

function seedPlanets(): Planet[] {
  return [
    { id: "p1", pos: { x: -5, y: 3 }, radius: 1.2, craters: [] },
    { id: "p2", pos: { x: -3, y: -2 }, radius: 1.8, craters: [] },
    { id: "p3", pos: { x: 0, y: 2 }, radius: 1.5, craters: [] },
    { id: "p4", pos: { x: 0, y: -3 }, radius: 1.4, craters: [] },
    { id: "p5", pos: { x: 3, y: 1 }, radius: 2.0, craters: [] },
    { id: "p6", pos: { x: 5, y: -2 }, radius: 1.3, craters: [] },
  ];
}

function buildWorld(activeTurn: "red" | "blue", planets: Planet[]): World {
  const active = PLAYERS[activeTurn];
  const inactiveKey = activeTurn === "red" ? "blue" : "red";
  const inactive = PLAYERS[inactiveKey];
  return {
    soldier: { pos: active.pos, dir: active.dir },
    bounds: BOUNDS,
    targets: [{ id: inactiveKey, pos: inactive.pos, radius: PLAYER_RADIUS }],
    planets,
  };
}

const stage = document.getElementById("game-stage")!;
const renderer = new GameRenderer();
await renderer.init(stage);

const ui = new GameUI();

let activeTurn: "red" | "blue" = "red";
let planets: Planet[] = seedPlanets();
let busy = false;
let gameOver = false;

function refresh(note?: string) {
  ui.setStatus(note);
}

function start() {
  planets = seedPlanets();
  activeTurn = "red";
  gameOver = false;
  busy = false;
  renderer.setWorld(buildWorld(activeTurn, planets), activeTurn, RED_POS, BLUE_POS);
  ui.setTurn(activeTurn);
  ui.hideWin();
  ui.clearInput();
  refresh();
  ui.focus();
}

async function onFire(latex: string) {
  if (busy || gameOver) return;

  const result = evaluateAll([{ id: "shot", latex }]);
  const row = result.get("shot");
  const fn = row?.kind === "curve" ? row.fn : undefined;
  if (!fn) {
    refresh("that isn't a plottable function of x");
    return;
  }

  busy = true;
  ui.setBusy(true);

  const shooter = activeTurn;
  const world = buildWorld(shooter, planets);
  const shot = fire(world, fn);

  await renderer.playShot(shot);

  if (shot.hit.kind === "planet" && shot.hit.planetId) {
    const planet = planets.find((p) => p.id === shot.hit.planetId);
    if (planet) planet.craters.push({ pos: shot.hit.at, radius: CRATER_RADIUS });
  }

  if (shot.hit.kind === "target") {
    gameOver = true;
    busy = false;
    ui.setBusy(false);
    renderer.setWorld(buildWorld(shooter, planets), shooter, RED_POS, BLUE_POS);
    ui.showWin(shooter);
    return;
  }

  // Every shot — including duds — passes the turn.
  activeTurn = shooter === "red" ? "blue" : "red";
  renderer.setWorld(buildWorld(activeTurn, planets), activeTurn, RED_POS, BLUE_POS);
  ui.setTurn(activeTurn);

  busy = false;
  ui.setBusy(false);
  refresh(noteFor(shot.hit.kind));
  ui.focus();
}

function noteFor(kind: string): string {
  switch (kind) {
    case "planet": return "blocked by a planet — carve through or arc around";
    case "bounds": return "flew off the field — try again";
    case "dud": return "undefined at your position — shift your function";
    default: return "adjust and fire again";
  }
}

ui.onFire(onFire);
ui.onReset(start);

start();
