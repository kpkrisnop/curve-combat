import { GameRenderer } from "./GameRenderer";
import { GameUI } from "./GameUI";
import { fire } from "../sim/engine";
import { evaluateAll } from "../math/Context";
import type { Bounds, Planet, Vec2, World } from "../sim/types";
import { matchWinner, firstShooterNextRound, type MatchConfig } from "./matchLogic";

const CRATER_RADIUS = 0.8;
const PLAYER_RADIUS = 0.1;

const MATCH_CONFIG: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };

let redPlayerPos: Vec2 = { x: -9, y: 0 };
let bluePlayerPos: Vec2 = { x: 9, y: 0 };

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
  if (activeTurn === "red") {
    return {
      soldier: { pos: redPlayerPos, dir: 1 },
      bounds: renderer.getEffectiveBounds(),
      targets: [{ id: "blue", pos: bluePlayerPos, radius: PLAYER_RADIUS }],
      planets,
    };
  } else {
    return {
      soldier: { pos: bluePlayerPos, dir: -1 },
      bounds: renderer.getEffectiveBounds(),
      targets: [{ id: "red", pos: redPlayerPos, radius: PLAYER_RADIUS }],
      planets,
    };
  }
}

// Place RED in the left outer strip (x < -11) and BLUE in the right (x > 11),
// both with random y. Falls back gracefully if canvas is narrower than ±11.
function placePlayersRandomly(b: Bounds) {
  const yLo = b.minY + 1;
  const yHi = b.maxY - 1;
  const xEdge = Math.abs(b.minX) - 0.3;
  const xInner = Math.min(11, xEdge);
  const xRange = Math.max(0, xEdge - xInner);

  redPlayerPos = {
    x: -(xInner + Math.random() * xRange),
    y: yLo + Math.random() * (yHi - yLo),
  };
  bluePlayerPos = {
    x: xInner + Math.random() * xRange,
    y: yLo + Math.random() * (yHi - yLo),
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

let redScore = 0;
let blueScore = 0;
let currentRound = 1;

function refresh(note?: string) {
  ui.setStatus(note);
}

function start() {
  planets = seedPlanets();
  activeTurn = "red";
  gameOver = false;
  busy = false;
  redScore = 0;
  blueScore = 0;
  currentRound = 1;
  placePlayersRandomly(renderer.getEffectiveBounds());
  renderer.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
  ui.resetInputs();
  ui.setTurn(activeTurn, "");
  ui.hideWin();
  ui.hideSplash();
  ui.updateScoreboard(redScore, blueScore, currentRound, MATCH_CONFIG.rounds);
  refresh();
  ui.focus();
}

function nextRound(roundLoser: "red" | "blue") {
  // Award the round to the survivor
  if (roundLoser === "red") blueScore++;
  else redScore++;

  // Check if the match is over
  const winner = matchWinner(redScore, blueScore, MATCH_CONFIG.rounds);
  if (winner) {
    gameOver = true;
    busy = false;
    ui.setBusy(false);
    ui.showWin(winner);
    return;
  }

  // Start the next round after a 2-second splash
  currentRound++;
  const loserLabel = roundLoser === "red" ? "RED" : "BLUE";
  const winnerLabel = roundLoser === "red" ? "BLUE" : "RED";
  const splashHtml =
    `Round ${currentRound} of ${MATCH_CONFIG.rounds}<br>` +
    `<span style="color:${roundLoser === "red" ? "#4488ff" : "#ff4444"}">${winnerLabel} wins the round!</span><br>` +
    `<small style="color:#5e7081">${loserLabel} shoots first</small>`;

  ui.showSplash(splashHtml);

  window.setTimeout(() => {
    ui.hideSplash();
    planets = seedPlanets();
    activeTurn = firstShooterNextRound(roundLoser);
    gameOver = false;
    busy = false;
    placePlayersRandomly(renderer.getEffectiveBounds());
    renderer.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
    ui.resetInputs();
    ui.setTurn(activeTurn, "");
    ui.updateScoreboard(redScore, blueScore, currentRound, MATCH_CONFIG.rounds);
    refresh();
    ui.focus();
  }, 2000);
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
    // The target that was hit is the opponent — so the shooter wins the round,
    // and the hit player (the loser) shoots first next round.
    const roundLoser = shooter === "red" ? "blue" : "red";
    renderer.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
    nextRound(roundLoser);
    return;
  }

  activeTurn = shooter === "red" ? "blue" : "red";
  renderer.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
  ui.setTurn(activeTurn, latex);

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

function bootWithTutorial() {
  if (localStorage.getItem("graphwar.tutorialDone")) {
    start();
    return;
  }

  // Run tutorial before first match
  start(); // set up the field so it's visible behind the tutorial

  const steps = [
    "Welcome to Graph War! You are the RED dot on the left. BLUE is on the right.",
    "Type a mathematical function of x (like: 0, x, sin(x)) into the RED input below. Your shot will travel along that curve.",
    "Press Enter or the Fire button to shoot. Try to hit BLUE!",
  ];

  let stepIndex = 0;

  function showStep() {
    if (stepIndex >= steps.length) {
      finishTutorial();
      return;
    }
    ui.showTutorialStep(steps[stepIndex], () => {
      stepIndex++;
      showStep();
    }, finishTutorial);
  }

  function finishTutorial() {
    ui.hideTutorial();
    localStorage.setItem("graphwar.tutorialDone", "1");
    ui.focus();
  }

  showStep();
}

bootWithTutorial();
