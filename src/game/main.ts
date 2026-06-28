import { GameRenderer } from "./GameRenderer";
import { GameUI } from "./GameUI";
import { LobbyScreen } from "../ui/LobbyScreen";
import { fire } from "../sim/engine";
import { evaluateAll } from "../math/Context";
import { matchWinner, firstShooterNextRound, type MatchConfig } from "./matchLogic";
import { configToHash, parseConfigFromHash } from "./configRouter";
import type { Bounds, Planet, Vec2, World } from "../sim/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CRATER_RADIUS = 0.8;
const PLAYER_RADIUS = 0.1;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const lobbyEl = document.getElementById("lobby-screen")!;
const gameEl = document.getElementById("game")!;

// ── Game state (initialised lazily in startGame) ──────────────────────────────

let renderer: GameRenderer | null = null;
let ui: GameUI | null = null;
let matchConfig: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local" };

let redPlayerPos: Vec2 = { x: -9, y: 0 };
let bluePlayerPos: Vec2 = { x: 9, y: 0 };
let planets: Planet[] = [];
let activeTurn: "red" | "blue" = "red";
let busy = false;
let gameOver = false;
let redScore = 0;
let blueScore = 0;
let currentRound = 1;

// ── Planet seed ───────────────────────────────────────────────────────────────

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

// ── World helpers ─────────────────────────────────────────────────────────────

function buildWorld(turn: "red" | "blue", ps: Planet[]): World {
  return turn === "red"
    ? { soldier: { pos: redPlayerPos, dir: 1 }, bounds: renderer!.getEffectiveBounds(), targets: [{ id: "blue", pos: bluePlayerPos, radius: PLAYER_RADIUS }], planets: ps }
    : { soldier: { pos: bluePlayerPos, dir: -1 }, bounds: renderer!.getEffectiveBounds(), targets: [{ id: "red", pos: redPlayerPos, radius: PLAYER_RADIUS }], planets: ps };
}

function placePlayersRandomly(b: Bounds) {
  const yLo = b.minY + 1, yHi = b.maxY - 1;
  const xEdge = Math.abs(b.minX) - 0.3;
  const xInner = Math.min(11, xEdge);
  const xRange = Math.max(0, xEdge - xInner);
  redPlayerPos = { x: -(xInner + Math.random() * xRange), y: yLo + Math.random() * (yHi - yLo) };
  bluePlayerPos = { x: xInner + Math.random() * xRange, y: yLo + Math.random() * (yHi - yLo) };
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

function start() {
  planets = seedPlanets();
  activeTurn = "red";
  gameOver = false;
  busy = false;
  redScore = 0;
  blueScore = 0;
  currentRound = 1;
  placePlayersRandomly(renderer!.getEffectiveBounds());
  renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
  ui!.resetInputs();
  ui!.setTurn(activeTurn, "");
  ui!.hideWin();
  ui!.hideSplash();
  ui!.updateScoreboard(redScore, blueScore, currentRound, matchConfig.rounds);
  ui!.setStatus();
  ui!.focus();
}

function nextRound(roundLoser: "red" | "blue") {
  if (roundLoser === "red") blueScore++;
  else redScore++;

  const winner = matchWinner(redScore, blueScore, matchConfig.rounds);
  if (winner) {
    gameOver = true;
    busy = false;
    ui!.setBusy(false);
    ui!.showWin(winner);
    return;
  }

  currentRound++;
  const loserLabel = roundLoser === "red" ? "RED" : "BLUE";
  const winnerLabel = roundLoser === "red" ? "BLUE" : "RED";
  const splashHtml =
    `Round ${currentRound} of ${matchConfig.rounds}<br>` +
    `<span style="color:${roundLoser === "red" ? "#4488ff" : "#ff4444"}">${winnerLabel} wins the round!</span><br>` +
    `<small style="color:#5e7081">${loserLabel} shoots first</small>`;

  ui!.showSplash(splashHtml);

  window.setTimeout(() => {
    ui!.hideSplash();
    planets = seedPlanets();
    activeTurn = firstShooterNextRound(roundLoser);
    gameOver = false;
    busy = false;
    placePlayersRandomly(renderer!.getEffectiveBounds());
    renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
    ui!.resetInputs();
    ui!.setTurn(activeTurn, "");
    ui!.updateScoreboard(redScore, blueScore, currentRound, matchConfig.rounds);
    ui!.setStatus();
    ui!.focus();
  }, 2000);
}

async function onFire(latex: string) {
  if (busy || gameOver) return;

  const result = evaluateAll([{ id: "shot", latex }]);
  const row = result.get("shot");
  const fn = row?.kind === "curve" ? row.fn : undefined;
  if (!fn) {
    ui!.setStatus("that isn't a plottable function of x");
    return;
  }

  busy = true;
  ui!.setBusy(true);

  const shooter = activeTurn;
  const world = buildWorld(shooter, planets);
  const shot = fire(world, fn);

  await renderer!.playShot(shot);

  if (shot.hit.kind === "planet" && shot.hit.planetId) {
    const planet = planets.find((p) => p.id === shot.hit.planetId);
    if (planet) planet.craters.push({ pos: shot.hit.at, radius: CRATER_RADIUS });
  }

  if (shot.hit.kind === "target") {
    const roundLoser = shooter === "red" ? "blue" : "red";
    renderer!.setWorld(buildWorld(shooter, planets), shooter, redPlayerPos, bluePlayerPos);
    nextRound(roundLoser);
    return;
  }

  activeTurn = shooter === "red" ? "blue" : "red";
  renderer!.setWorld(buildWorld(activeTurn, planets), activeTurn, redPlayerPos, bluePlayerPos);
  ui!.setTurn(activeTurn, latex);
  busy = false;
  ui!.setBusy(false);
  ui!.setStatus(noteFor(shot.hit.kind));
  ui!.focus();
}

function noteFor(kind: string): string {
  switch (kind) {
    case "planet": return "blocked by a planet — carve through or arc around";
    case "bounds": return "flew off the field — try again";
    case "dud": return "undefined at your position — shift your function";
    default: return "adjust and fire again";
  }
}

// ── Tutorial ──────────────────────────────────────────────────────────────────

function bootWithTutorial() {
  if (localStorage.getItem("graphwar.tutorialDone")) {
    start();
    return;
  }

  start();

  const steps = [
    "Welcome to Graph War! You are the RED dot on the left. BLUE is on the right.",
    "Type a mathematical function of x (like: 0, x, sin(x)) into the RED input below. Your shot will travel along that curve.",
    "Press Enter or the Fire button to shoot. Try to hit BLUE!",
  ];

  let stepIndex = 0;

  function showStep() {
    if (stepIndex >= steps.length) { finishTutorial(); return; }
    ui!.showTutorialStep(steps[stepIndex], () => { stepIndex++; showStep(); }, finishTutorial);
  }

  function finishTutorial() {
    ui!.hideTutorial();
    localStorage.setItem("graphwar.tutorialDone", "1");
    ui!.focus();
  }

  showStep();
}

// ── Game screen init (lazy — only runs when lobby starts a match) ─────────────

async function startGame(config: MatchConfig) {
  matchConfig = config;

  // Push hash so back-navigation works
  history.pushState(null, "", configToHash(config));

  // Show game, hide lobby
  lobbyEl.hidden = true;
  gameEl.hidden = false;

  // Initialise renderer + UI only once
  if (!renderer) {
    const stage = document.getElementById("game-stage")!;
    renderer = new GameRenderer();
    await renderer.init(stage);

    ui = new GameUI();
    ui.onFire(onFire);
    // "Back to Lobby" button replaces old "Play again"
    ui.onReset(goToLobby);
  }

  bootWithTutorial();
}

// ── Lobby ─────────────────────────────────────────────────────────────────────

function goToLobby() {
  gameEl.hidden = true;
  lobbyEl.hidden = false;
  history.pushState(null, "", "/");
}

// ── Router entry point ────────────────────────────────────────────────────────

function route() {
  const hash = location.hash;
  if (hash.startsWith("#game")) {
    const config = parseConfigFromHash(hash);
    startGame(config);
  } else {
    // Default: show lobby
    lobbyEl.hidden = false;
    gameEl.hidden = true;
    const lobby = new LobbyScreen();
    lobby.onStart((config) => startGame(config));
  }
}

window.addEventListener("popstate", () => {
  if (!location.hash.startsWith("#game")) goToLobby();
});

route();
