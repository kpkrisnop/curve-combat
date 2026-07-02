import "../design/foundation.css";
import { GameRenderer } from "./GameRenderer";
import { GameUI } from "./GameUI";
import { LobbyScreen } from "../ui/LobbyScreen";
import { firstShooterNextRound, type MatchConfig } from "./matchLogic";
import { configToHash, parseConfigFromHash } from "./configRouter";
import { arenaDefaults } from "./arenaDefaults";
import {
  createMatch,
  beginRound,
  worldFor,
  playerById,
  type MatchState,
  type Team,
  type PlayerState,
} from "./matchState";
import { resolveFire } from "./resolveFire";
import { buildLocalLayout } from "./localLayout";
import { NetworkGame } from "../net/NetworkGame";
import { ServerClient } from "../net/ServerClient";

const WS_URL: string = (import.meta.env["VITE_WS_URL"] as string | undefined) ?? "ws://localhost:3001";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const lobbyEl = document.getElementById("lobby-screen")!;
const gameEl = document.getElementById("game")!;

// ── Game state ────────────────────────────────────────────────────────────────

let renderer: GameRenderer | null = null;
let ui: GameUI | null = null;
let matchConfig: MatchConfig = { mode: "classic", rounds: 3, noTurn: false, role: "local", ...arenaDefaults() };
let match: MatchState | null = null;

// ── View adapters (1 player per team → existing 2-panel renderer/UI) ───────────

function redOf(m: MatchState): PlayerState {
  return m.players.find((p) => p.team === "red")!;
}
function blueOf(m: MatchState): PlayerState {
  return m.players.find((p) => p.team === "blue")!;
}

/** Push the current match into the renderer from a given team's perspective. */
function renderFrom(m: MatchState, viewTeam: Team): void {
  const viewer = m.players.find((p) => p.team === viewTeam && p.alive) ?? redOf(m);
  renderer!.setWorld(worldFor(m, viewer), viewTeam, redOf(m).pos, blueOf(m).pos);
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

function start(): void {
  renderer!.setMap(matchConfig.map);
  const bounds = renderer!.getEffectiveBounds();
  match = createMatch(matchConfig, buildLocalLayout(bounds, matchConfig), bounds, "red");

  const viewTeam: Team = match.activePlayerId
    ? playerById(match, match.activePlayerId)!.team
    : "red";
  renderFrom(match, viewTeam);

  ui!.resetInputs();
  ui!.setTurn(viewTeam, "");
  renderer!.setNoTurnMode(matchConfig.noTurn);
  if (matchConfig.noTurn) ui!.setNoTurnMode(true);
  ui!.hideWin();
  ui!.hideSplash();
  ui!.updateScoreboard(match.scores.red, match.scores.blue, match.round, matchConfig.rounds);
  ui!.showHpBars(matchConfig.mode === "hp");
  ui!.updateHp(redOf(match).hp, blueOf(match).hp);
  ui!.setStatus();
  ui!.focus();
}

function handleRoundEnd(roundLoser: Team): void {
  const m = match!;
  if (m.phase === "over") {
    ui!.setBusy("red", false);
    ui!.setBusy("blue", false);
    ui!.showWin(m.winner!, matchConfig.mode === "hp" ? "Health depleted." : "Direct hit.");
    return;
  }

  const loserLabel = roundLoser === "red" ? "RED" : "BLUE";
  const winnerLabel = roundLoser === "red" ? "BLUE" : "RED";
  const splashHtml =
    `Round ${m.round + 1} of ${matchConfig.rounds}<br>` +
    `<span style="color:${roundLoser === "red" ? "#4488ff" : "#ff4444"}">${winnerLabel} wins the round!</span><br>` +
    `<small style="color:#5e7081">${loserLabel} shoots first</small>`;
  ui!.showSplash(splashHtml);

  window.setTimeout(() => {
    ui!.hideSplash();
    const bounds = renderer!.getEffectiveBounds();
    const firstTeam = firstShooterNextRound(roundLoser);
    match = beginRound(m, buildLocalLayout(bounds, matchConfig), firstTeam);

    const viewTeam: Team = match.activePlayerId
      ? playerById(match, match.activePlayerId)!.team
      : "red";
    renderFrom(match, viewTeam);
    ui!.resetInputs();
    ui!.setTurn(viewTeam, "");
    ui!.setNoTurnMode(matchConfig.noTurn);
    ui!.updateScoreboard(match.scores.red, match.scores.blue, match.round, matchConfig.rounds);
    if (matchConfig.mode === "hp") ui!.updateHp(redOf(match).hp, blueOf(match).hp);
    ui!.setStatus();
    ui!.focus();
  }, 2000);
}

async function onFire(player: Team, latex: string): Promise<void> {
  const m = match;
  if (!m || m.phase !== "play") return;

  const shooter = m.players.find((p) => p.team === player && p.alive);
  if (!shooter) return;

  const res = resolveFire(m, { playerId: shooter.id, latex });

  if (res.rejected) {
    if (res.rejected === "bad-function") {
      ui!.setStatus("that isn't a plottable function of x");
    }
    return;
  }

  ui!.setBusy(player, true);
  await renderer!.playShot(res.shot!, player);
  ui!.setBusy(player, false);

  // Commit against LIVE state. In No-Turn the enemy may have mutated `match`
  // (or ended the round) while this shot was in flight; per design an in-flight
  // shot does not count once the round has ended.
  let commit = res;
  if (matchConfig.noTurn) {
    commit = resolveFire(match!, { playerId: shooter.id, latex });
    if (commit.rejected) {
      ui!.focus();
      return; // round already ended (or shooter eliminated) mid-flight — shot doesn't count
    }
  }
  match = commit.next;

  // Crater / HP visuals.
  if (commit.shot!.hit.kind === "target" && matchConfig.mode === "hp" && commit.damage) {
    const defender: Team = player === "red" ? "blue" : "red";
    renderer!.showFloatingDamage(commit.shot!.hit.at, commit.damage, defender);
  }

  if (commit.roundEnded) {
    const viewTeam: Team = player; // shooter's view for the final frame
    renderFrom(match, viewTeam);
    if (matchConfig.mode === "hp") ui!.updateHp(redOf(match).hp, blueOf(match).hp);
    handleRoundEnd(commit.roundLoser!);
    return;
  }

  // Round continues: re-render from the new active team's perspective.
  const viewTeam: Team = match.activePlayerId
    ? playerById(match, match.activePlayerId)!.team
    : player;
  renderFrom(match, viewTeam);
  if (matchConfig.mode === "hp") ui!.updateHp(redOf(match).hp, blueOf(match).hp);
  if (!matchConfig.noTurn) ui!.setTurn(viewTeam, latex);
  ui!.setStatus(commit.shot!.hit.kind === "target" ? `Hit! -${commit.damage ?? 0} HP` : noteFor(commit.shot!.hit.kind));
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
    try {
      const stage = document.getElementById("game-stage")!;
      renderer = new GameRenderer();
      await renderer.init(stage);

      ui = new GameUI();
      ui.onFire(onFire);
      // "Back to Lobby" button replaces old "Play again"
      ui.onReset(goToLobby);
    } catch (err) {
      console.error("Failed to start game:", err);
      renderer = null;
      ui = null;
      goToLobby();
      return;
    }
  }

  bootWithTutorial();
}

// ── Lobby ─────────────────────────────────────────────────────────────────────

function goToLobby() {
  gameEl.hidden = true;
  lobbyEl.hidden = false;
  history.pushState(null, "", "/");
}

// ── Network game path ─────────────────────────────────────────────────────────

async function startNetworkGame(room: string): Promise<void> {
  lobbyEl.hidden = true;
  gameEl.hidden = false;

  if (!renderer) {
    try {
      const stage = document.getElementById("game-stage")!;
      renderer = new GameRenderer();
      await renderer.init(stage);

      ui = new GameUI();
      ui.onReset(goToLobby);
    } catch (err) {
      console.error("Failed to start network game:", err);
      renderer = null;
      ui = null;
      goToLobby();
      return;
    }
  }

  const name = prompt("Enter your name:", "Player") ?? "Player";
  const net = new NetworkGame(new ServerClient(WS_URL), renderer!, ui!);
  await net.start(room, name);
}

// ── Router entry point ────────────────────────────────────────────────────────

function route() {
  const hash = location.hash;
  if (hash.startsWith("#room=")) {
    const room = hash.slice("#room=".length);
    void startNetworkGame(room);
  } else if (hash.startsWith("#game")) {
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
  if (location.hash.startsWith("#room=")) {
    const room = location.hash.slice("#room=".length);
    void startNetworkGame(room);
  } else if (location.hash.startsWith("#game")) {
    startGame(parseConfigFromHash(location.hash));
  } else {
    goToLobby();
  }
});

route();
