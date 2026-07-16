// server/index.ts
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager, LOBBY_GRACE_MS, type Room } from "./roomManager";
import { parseClientMessage, encode, type ServerMessage } from "../src/net/protocol";
import type { MatchState } from "../src/game/matchState";
import { MatchEngine } from "./matchEngine";

interface Conn { ws: WebSocket; playerId?: string; room?: string; isSpectator?: boolean; isAlive: boolean }

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Wall-clock deadline for each room's active turn, kept in lockstep with
// turnTimers. `MatchEngine.snapshot()` never carries this — armTurnTimer only
// patches it onto the transient broadcast copy — so a (re)joining connection
// needs it read back out of here instead of off the engine's own state.
const turnDeadlines = new Map<string, number>();

export function createServer(port: number): { close: () => Promise<void> } {
  const wss = new WebSocketServer({ port });
  const rooms = new RoomManager();
  const conns = new Set<Conn>();

  const send = (ws: WebSocket, msg: ServerMessage) => ws.send(encode(msg));
  const broadcast = (code: string, msg: ServerMessage) => {
    for (const c of conns) if (c.room === code && c.ws.readyState === WebSocket.OPEN) send(c.ws, msg);
  };
  const rosterMsg = (room: Room): ServerMessage => ({
    type: "lobbyState",
    players: room.players.map((p) => ({ id: p.id, name: p.name, team: p.team })),
    ownerId: room.ownerId,
    spectators: room.spectators.map((s) => ({ id: s.id, name: s.name })),
    round1Seed: room.round1Seed,
    config: {
      mode: room.config.mode,
      rounds: room.config.rounds,
      noTurn: room.config.noTurn,
      turnSeconds: room.config.turnSeconds ?? 60,
      map: room.config.map,
      scatter: room.config.scatter,
    },
  });
  const makeTTLExpiry = (code: string) => () => {
    for (const c of conns) if (c.room === code) c.ws.terminate();
    rooms.remove(code);
  };

  function cancelTurnTimer(code: string): void {
    const t = turnTimers.get(code);
    if (t !== undefined) { clearTimeout(t); turnTimers.delete(code); }
    turnDeadlines.delete(code);
  }

  /** Patch a wall-clock deadline onto state and arm the server turn timer. */
  function armTurnTimer(code: string, state: MatchState, eng: MatchEngine): MatchState {
    cancelTurnTimer(code);
    if (state.phase !== "play" || state.activePlayerId === null || state.config.noTurn) {
      return { ...state, turnDeadline: null };
    }
    const ms = (state.config.turnSeconds ?? 60) * 1000;
    const deadline = Date.now() + ms;
    turnDeadlines.set(code, deadline);
    turnTimers.set(
      code,
      setTimeout(() => {
        turnTimers.delete(code);
        const next = eng.skipActiveTurn();
        const patched = armTurnTimer(code, next, eng);
        broadcast(code, { type: "matchState", state: patched });
      }, ms),
    );
    return { ...state, turnDeadline: deadline };
  }

  /** Snapshot for a (re)joining connection, with the live turn deadline patched back in. */
  function snapshotWithDeadline(code: string, eng: MatchEngine): MatchState {
    return { ...eng.snapshot(), turnDeadline: turnDeadlines.get(code) ?? null };
  }

  /**
   * A state landing in "between" phase (round awarded, match not over) needs
   * the next round begun after a short pause. This is the only path that does
   * that — call it from every place that can produce "between" (shot resolve,
   * forfeit, grace-expiry) so none of them leave the match stuck.
   */
  function scheduleNextRoundIfBetween(code: string): void {
    setTimeout(() => {
      const rm = rooms.get(code);
      if (!rm || !rm.engine) return;
      const nextRound = rm.engine.beginNextRound();
      const patched = armTurnTimer(code, nextRound, rm.engine);
      broadcast(code, { type: "matchState", state: patched });
    }, 2000);
  }

  // Cloudflare Tunnel (and similar proxies) drop WS connections idle for
  // ~100s. Ping every 30s so there's always traffic, and terminate any peer
  // that stops answering pongs (dead socket, not just a quiet turn).
  const heartbeat = setInterval(() => {
    for (const c of conns) {
      if (!c.isAlive) { c.ws.terminate(); continue; }
      c.isAlive = false;
      c.ws.ping();
    }
  }, 30_000);

  wss.on("connection", (ws) => {
    const conn: Conn = { ws, isAlive: true };
    conns.add(conn);
    ws.on("pong", () => { conn.isAlive = true; });

    ws.on("message", (buf) => {
      let msg;
      try { msg = parseClientMessage(JSON.parse(buf.toString())); }
      catch { return send(ws, { type: "error", code: "bad-message", message: "unparseable" }); }

      // ── join ─────────────────────────────────────────────────────────────
      if (msg.type === "join") {
        if (msg.asSpectator) {
          const room = rooms.get(msg.room);
          if (!room) return send(ws, { type: "error", code: "join-failed", message: "room not found" });
          try {
            const id = rooms.joinSpectator(msg.room, msg.name);
            conn.playerId = id; conn.room = msg.room; conn.isSpectator = true;
            send(ws, { type: "joined", playerId: id, token: "", ownerId: room.ownerId });
            broadcast(msg.room, rosterMsg(room));
            if (room.engine) { const snap = snapshotWithDeadline(msg.room, room.engine); setImmediate(() => send(ws, { type: "matchState", state: snap })); }
          } catch (e) {
            send(ws, { type: "error", code: "join-failed", message: (e as Error).message });
          }
          return;
        }
        try {
          const { room, playerId, token } = rooms.join(msg.room, msg.name);
          conn.playerId = playerId; conn.room = msg.room;
          send(ws, { type: "joined", playerId, token, ownerId: room.ownerId });
          broadcast(msg.room, rosterMsg(room));
          rooms.startTTL(msg.room, makeTTLExpiry(msg.room));
        } catch {
          // Room is locked/full/started — fall back to spectator
          const fallbackRoom = rooms.get(msg.room);
          if (!fallbackRoom) return send(ws, { type: "error", code: "join-failed", message: "room not found" });
          try {
            const id = rooms.joinSpectator(msg.room, msg.name);
            conn.playerId = id; conn.room = msg.room; conn.isSpectator = true;
            send(ws, { type: "joined", playerId: id, token: "", ownerId: fallbackRoom.ownerId });
            broadcast(msg.room, rosterMsg(fallbackRoom));
            if (fallbackRoom.engine) {
              const snap = snapshotWithDeadline(msg.room, fallbackRoom.engine);
              setImmediate(() => send(ws, { type: "matchState", state: snap }));
            }
          } catch (e2) {
            send(ws, { type: "error", code: "join-failed", message: (e2 as Error).message });
          }
        }
        return;
      }

      // ── reconnect ─────────────────────────────────────────────────────────
      if (msg.type === "reconnect") {
        const result = rooms.rejoin(msg.room, msg.playerId, msg.token);
        if (!result) return send(ws, { type: "error", code: "rejoin-failed", message: "token invalid or grace expired" });
        conn.playerId = msg.playerId; conn.room = msg.room;
        const { room, token: fresh } = result;
        const player = room.players.find((p) => p.id === msg.playerId);
        send(ws, { type: "joined", playerId: msg.playerId, token: fresh, ownerId: room.ownerId });
        send(ws, rosterMsg(room));
        if (room.engine) send(ws, { type: "matchState", state: snapshotWithDeadline(msg.room, room.engine) });
        broadcast(msg.room, {
          type: "peerStatus", playerId: msg.playerId,
          name: player?.name ?? "Player", connected: true,
        });
        return;
      }

      const room = conn.room ? rooms.get(conn.room) : undefined;
      if (!room || !conn.playerId) return send(ws, { type: "error", code: "no-room", message: "join first" });

      // ── configureRoom ─────────────────────────────────────────────────────
      if (msg.type === "configureRoom") {
        try {
          rooms.setConfig(room.code, conn.playerId, {
            mode: msg.mode,
            rounds: msg.rounds,
            noTurn: msg.noTurn,
            turnSeconds: msg.turnSeconds,
            ...(msg.map !== undefined ? { map: msg.map } : {}),
            ...(msg.scatter !== undefined ? { scatter: msg.scatter } : {}),
          });
          broadcast(room.code, rosterMsg(room));
        } catch (e) {
          send(ws, { type: "error", code: "configure-failed", message: (e as Error).message });
        }
        return;
      }

      // ── switchTeam ────────────────────────────────────────────────────────
      if (msg.type === "switchTeam") {
        try {
          rooms.switchTeam(room.code, conn.playerId, msg.team);
          broadcast(room.code, rosterMsg(room));
        } catch (e) {
          send(ws, { type: "error", code: "switch-failed", message: (e as Error).message });
        }
        return;
      }

      // ── setName ───────────────────────────────────────────────────────────
      if (msg.type === "setName") {
        try {
          rooms.setName(room.code, conn.playerId, msg.name);
          broadcast(room.code, rosterMsg(room));
        } catch (e) {
          send(ws, { type: "error", code: "set-name-failed", message: (e as Error).message });
        }
        return;
      }

      // ── rerollArena ───────────────────────────────────────────────────────
      if (msg.type === "rerollArena") {
        try {
          rooms.reroll(room.code, conn.playerId);
          broadcast(room.code, rosterMsg(room));
        } catch (e) {
          send(ws, { type: "error", code: "reroll-failed", message: (e as Error).message });
        }
        return;
      }

      // ── startMatch ────────────────────────────────────────────────────────
      if (msg.type === "startMatch") {
        if (room.engine !== null || room.locked)
          return send(ws, { type: "error", code: "already-started", message: "match already in progress" });
        if (!rooms.canStart(room.code))
          return send(ws, { type: "error", code: "start-failed", message: "both teams need at least one player" });
        if (conn.playerId !== room.ownerId)
          return send(ws, { type: "error", code: "start-failed", message: "only the host can start" });
        rooms.lock(room.code);
        const startAt = Date.now() + 3000;
        broadcast(room.code, { type: "matchStarting", startAt });
        setTimeout(() => {
          const rm = rooms.get(room.code);
          if (!rm) return;
          try {
            const state = rooms.start(room.code, rm.ownerId);
            rooms.startTTL(room.code, makeTTLExpiry(room.code));
            const patched = armTurnTimer(room.code, state, rm.engine!);
            broadcast(room.code, { type: "matchState", state: patched });
          } catch (e) {
            // Unlock so the room is retryable — otherwise it stays locked with
            // no engine forever, and clients hang after matchStarting.
            rm.locked = false;
            broadcast(room.code, { type: "error", code: "start-failed", message: String((e as Error).message) });
          }
        }, startAt - Date.now());
        return;
      }

      // ── fireIntent ────────────────────────────────────────────────────────
      if (msg.type === "fireIntent") {
        if (conn.isSpectator)
          return send(ws, { type: "error", code: "not-a-player", message: "spectators cannot fire" });
        const engine = room.engine;
        if (!engine) return send(ws, { type: "error", code: "not-started", message: "no match" });
        const r = engine.fire(conn.playerId, msg.latex);
        if (!r.ok) return send(ws, { type: "error", code: r.code, message: r.code });
        // Only now that a shot is actually committed do we stop the turn timer —
        // re-armed after the shot resolves. Cancelling earlier let any rejected
        // or early-returned fireIntent (a stale last-second/not-active shot, a
        // spectator, a dead engine) leave the timer dead, freezing the countdown
        // at 0 and deadlocking the match.
        cancelTurnTimer(conn.room!);
        broadcast(room.code, { type: "shotPlayback", firerId: r.firerId, shot: r.shot, duration: r.duration });
        const firerId = r.firerId;
        setTimeout(() => {
          const rm = rooms.get(room.code);
          if (!rm || !rm.engine) return;
          const prevState = rm.engine.snapshot();
          const raw = rm.engine.resolvePlayerShot(firerId);
          const patched = armTurnTimer(room.code, raw, rm.engine);
          broadcast(room.code, { type: "matchState", state: patched });
          // Guard: only schedule beginNextRound if THIS shot caused the transition.
          // In no-turn mode a concurrent shot may resolve after the round already ended;
          // resolvePlayerShot returns the same state reference in that case.
          if (raw !== prevState && raw.phase === "between") {
            scheduleNextRoundIfBetween(room.code);
          }
        }, r.duration * 1000);
        return;
      }

      // ── forfeit ───────────────────────────────────────────────────────────
      if (msg.type === "forfeit") {
        if (conn.isSpectator) return; // spectators just close their socket to leave
        if (!room.engine) return; // not in a match — nothing to forfeit
        const res = rooms.forfeit(room.code, conn.playerId);
        if (!res.state) return;
        if (res.roomGone) {
          cancelTurnTimer(room.code);
          for (const c of conns) if (c.room === room.code) c.ws.terminate();
          return;
        }
        const rm = rooms.get(room.code);
        if (!rm || !rm.engine) return;
        const patched = armTurnTimer(room.code, res.state, rm.engine);
        broadcast(room.code, { type: "matchState", state: patched });
        if (res.state.phase === "between") scheduleNextRoundIfBetween(room.code);
        return;
      }
    });

    ws.on("close", () => {
      conns.delete(conn);
      if (!conn.room) return;
      const room = rooms.get(conn.room);
      if (!room) return;

      if (conn.isSpectator) {
        room.spectators = room.spectators.filter((s) => s.id !== conn.playerId);
        broadcast(conn.room, rosterMsg(room));
        return;
      }

      // If the player already reconnected on a new socket, this close is stale — skip.
      const alreadyReconnected = [...conns].some(
        (c) => c.room === conn.room && c.playerId === conn.playerId && c.ws.readyState === WebSocket.OPEN,
      );
      if (alreadyReconnected) return;

      const code = conn.room;

      // ── Lobby (no match yet): short grace so a momentary blip keeps the
      // player's id/team/ownership; on expiry, remove + transfer owner + drop
      // empty room (Bug B). Reconnect within the grace cancels this via rejoin().
      if (room.engine === null) {
        const pid = conn.playerId!;
        rooms.startGrace(code, pid, () => {
          const { roomGone } = rooms.removeFromLobby(code, pid);
          if (roomGone) {
            for (const c of conns) if (c.room === code) c.ws.terminate();
          } else {
            const updated = rooms.get(code);
            if (updated) broadcast(code, rosterMsg(updated));
          }
        }, LOBBY_GRACE_MS);
        return;
      }

      // ── In-match: keep peerStatus + 30 s grace → forfeit removal.
      // If the player was already removed (explicit forfeit just ran), this
      // close is a no-op — nothing left to grace.
      if (!room.players.some((p) => p.id === conn.playerId)) return;
      const player = room.players.find((p) => p.id === conn.playerId);
      const name = player?.name ?? "Player";
      broadcast(code, { type: "peerStatus", playerId: conn.playerId!, name, connected: false });
      rooms.startGrace(code, conn.playerId!, () => {
        const res = rooms.forfeit(code, conn.playerId!);
        if (!res.state) return;
        if (res.roomGone) {
          cancelTurnTimer(code);
          for (const c of conns) if (c.room === code) c.ws.terminate();
          return;
        }
        const rm = rooms.get(code);
        if (!rm || !rm.engine) return;
        const patched = armTurnTimer(code, res.state, rm.engine);
        broadcast(code, { type: "matchState", state: patched });
        if (res.state.phase === "between") scheduleNextRoundIfBetween(code);
      });
    });
  });

  return {
    close: () => new Promise<void>((res) => {
      clearInterval(heartbeat);
      for (const c of conns) c.ws.terminate();
      wss.close(() => res());
    }),
  };
}

if (process.env.VITEST === undefined) {
  const port = Number(process.env.PORT ?? 3001);
  createServer(port);
  console.log(`CurveCombat server on ws://localhost:${port}`);
}
