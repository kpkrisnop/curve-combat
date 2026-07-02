// server/index.ts
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager, type Room } from "./roomManager";
import { parseClientMessage, encode, type ServerMessage } from "../src/net/protocol";

interface Conn { ws: WebSocket; playerId?: string; room?: string }

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
  });

  wss.on("connection", (ws) => {
    const conn: Conn = { ws };
    conns.add(conn);
    ws.on("message", (buf) => {
      let msg;
      try { msg = parseClientMessage(JSON.parse(buf.toString())); }
      catch { return send(ws, { type: "error", code: "bad-message", message: "unparseable" }); }

      if (msg.type === "join") {
        try {
          const { room, playerId } = rooms.join(msg.room, msg.name);
          conn.playerId = playerId; conn.room = msg.room;
          send(ws, { type: "joined", playerId, ownerId: room.ownerId });
          broadcast(msg.room, rosterMsg(room));
        } catch (e) {
          send(ws, { type: "error", code: "join-failed", message: (e as Error).message });
        }
        return;
      }
      const room = conn.room ? rooms.get(conn.room) : undefined;
      if (!room || !conn.playerId) return send(ws, { type: "error", code: "no-room", message: "join first" });

      if (msg.type === "startMatch") {
        try {
          const state = rooms.start(room.code, conn.playerId);
          broadcast(room.code, { type: "matchState", state });
        } catch (e) { send(ws, { type: "error", code: "start-failed", message: String((e as Error).message) }); }
        return;
      }

      if (msg.type === "fireIntent") {
        const engine = room.engine;
        if (!engine) return send(ws, { type: "error", code: "not-started", message: "no match" });
        const r = engine.fire(conn.playerId, msg.latex);
        if (!r.ok) return send(ws, { type: "error", code: r.code, message: r.code });
        broadcast(room.code, { type: "shotPlayback", firerId: r.firerId, shot: r.shot, duration: r.duration });
        setTimeout(() => {
          const rm = rooms.get(room.code);
          if (!rm || !rm.engine) return;
          const state = rm.engine.resolvePending();
          broadcast(room.code, { type: "matchState", state });
          if (state.phase === "between") {
            setTimeout(() => {
              const rm2 = rooms.get(room.code);
              if (!rm2 || !rm2.engine) return;
              broadcast(room.code, { type: "matchState", state: rm2.engine.beginNextRound() });
            }, 2000);
          }
        }, r.duration * 1000);
        return;
      }
    });
    ws.on("close", () => {
      conns.delete(conn);
      if (conn.room && rooms.get(conn.room)) {
        broadcast(conn.room, { type: "error", code: "opponent-left", message: "Opponent disconnected — room closed." });
        rooms.remove(conn.room);
      }
    });
  });

  return {
    close: () => new Promise<void>((res) => {
      for (const c of conns) c.ws.terminate();
      wss.close(() => res());
    }),
  };
}

// Self-start when run directly (npm run server).
if (process.env.VITEST === undefined) {
  const port = Number(process.env.PORT ?? 3001);
  createServer(port);
  console.log(`Graph War server on ws://localhost:${port}`);
}
