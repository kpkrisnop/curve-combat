// server/index.ts
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager, type Room } from "./roomManager";
import { parseClientMessage, encode, type ServerMessage } from "../src/net/protocol";
import type { MatchState } from "../src/game/matchState";
import { MatchEngine } from "./matchEngine";

interface Conn { ws: WebSocket; playerId?: string; room?: string; isSpectator?: boolean }

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
  });
  const makeTTLExpiry = (code: string) => () => {
    for (const c of conns) if (c.room === code) c.ws.terminate();
    rooms.remove(code);
  };

  function cancelTurnTimer(code: string): void {
    const t = turnTimers.get(code);
    if (t !== undefined) { clearTimeout(t); turnTimers.delete(code); }
  }

  /** Patch a wall-clock deadline onto state and arm the server turn timer. */
  function armTurnTimer(code: string, state: MatchState, eng: MatchEngine): MatchState {
    cancelTurnTimer(code);
    if (state.phase !== "play" || state.activePlayerId === null || state.config.noTurn) {
      return { ...state, turnDeadline: null };
    }
    const ms = (state.config.turnSeconds ?? 60) * 1000;
    const deadline = Date.now() + ms;
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

  wss.on("connection", (ws) => {
    const conn: Conn = { ws };
    conns.add(conn);

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
            if (room.engine) { const snap = room.engine.snapshot(); setImmediate(() => send(ws, { type: "matchState", state: snap })); }
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
        } catch (e) {
          send(ws, { type: "error", code: "join-failed", message: (e as Error).message });
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
        if (room.engine) send(ws, { type: "matchState", state: room.engine.snapshot() });
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
          });
          broadcast(room.code, {
            type: "lobbyState",
            players: room.players.map((p) => ({ id: p.id, name: p.name, team: p.team })),
            ownerId: room.ownerId,
            spectators: room.spectators.map((s) => ({ id: s.id, name: s.name })),
            config: {
              mode: room.config.mode,
              rounds: room.config.rounds,
              noTurn: room.config.noTurn,
              turnSeconds: room.config.turnSeconds ?? 60,
            },
          });
        } catch (e) {
          send(ws, { type: "error", code: "configure-failed", message: (e as Error).message });
        }
        return;
      }

      // ── startMatch ────────────────────────────────────────────────────────
      if (msg.type === "startMatch") {
        if (room.engine !== null)
          return send(ws, { type: "error", code: "already-started", message: "match already in progress" });
        try {
          const state = rooms.start(room.code, conn.playerId);
          rooms.startTTL(room.code, makeTTLExpiry(room.code));
          const patched = armTurnTimer(room.code, state, room.engine!);
          broadcast(room.code, { type: "matchState", state: patched });
        } catch (e) {
          send(ws, { type: "error", code: "start-failed", message: String((e as Error).message) });
        }
        return;
      }

      // ── fireIntent ────────────────────────────────────────────────────────
      if (msg.type === "fireIntent") {
        cancelTurnTimer(conn.room!);
        if (conn.isSpectator)
          return send(ws, { type: "error", code: "not-a-player", message: "spectators cannot fire" });
        const engine = room.engine;
        if (!engine) return send(ws, { type: "error", code: "not-started", message: "no match" });
        const r = engine.fire(conn.playerId, msg.latex);
        if (!r.ok) return send(ws, { type: "error", code: r.code, message: r.code });
        broadcast(room.code, { type: "shotPlayback", firerId: r.firerId, shot: r.shot, duration: r.duration });
        setTimeout(() => {
          const rm = rooms.get(room.code);
          if (!rm || !rm.engine) return;
          const raw = rm.engine.resolvePending();
          const patched = armTurnTimer(room.code, raw, rm.engine);
          broadcast(room.code, { type: "matchState", state: patched });
          if (raw.phase === "between") {
            setTimeout(() => {
              const rm2 = rooms.get(room.code);
              if (!rm2 || !rm2.engine) return;
              const nextRound = rm2.engine.beginNextRound();
              const patched2 = armTurnTimer(room.code, nextRound, rm2.engine);
              broadcast(room.code, { type: "matchState", state: patched2 });
            }, 2000);
          }
        }, r.duration * 1000);
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

      // If the player already reconnected on a new socket, this close is stale — skip grace.
      const alreadyReconnected = [...conns].some(
        (c) => c.room === conn.room && c.playerId === conn.playerId && c.ws.readyState === WebSocket.OPEN,
      );
      if (alreadyReconnected) return;

      const player = room.players.find((p) => p.id === conn.playerId);
      const name = player?.name ?? "Player";
      broadcast(conn.room, { type: "peerStatus", playerId: conn.playerId!, name, connected: false });

      const code = conn.room;
      rooms.startGrace(code, conn.playerId!, () => {
        cancelTurnTimer(code);
        const rm = rooms.get(code);
        if (rm) broadcast(code, { type: "error", code: "opponent-timed-out", message: "Opponent timed out — room closed." });
        rooms.remove(code);
      });
    });
  });

  return {
    close: () => new Promise<void>((res) => {
      for (const c of conns) c.ws.terminate();
      wss.close(() => res());
    }),
  };
}

if (process.env.VITEST === undefined) {
  const port = Number(process.env.PORT ?? 3001);
  createServer(port);
  console.log(`Graph War server on ws://localhost:${port}`);
}
