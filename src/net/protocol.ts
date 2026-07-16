// src/net/protocol.ts
import { z } from "zod";
import type { ShotResult } from "../sim/types";
import type { MatchState } from "../game/matchState";

// ── Shared arena shapes ───────────────────────────────────────────────────────
const mapShape = z.object({ width: z.number().min(8).max(60), height: z.number().min(6).max(40) });
const scatterShape = z.object({
  rMin: z.number().min(0.3).max(4), rMax: z.number().min(0.3).max(4),
  gapMin: z.number().min(0).max(6), gapMax: z.number().min(0).max(6),
  spawnClearance: z.number().min(0).max(5), fieldMargin: z.number().min(0).max(3),
  maxPlanets: z.number().int().min(0).max(24),
  spawnEdgeGap: z.number().min(0).max(6), spawnBandX: z.number().min(0).max(8),
  spawnYMargin: z.number().min(0).max(5), spawnSeparation: z.number().min(0).max(6),
  spawnMirror: z.boolean(),
});

// ── Client → Server ──────────────────────────────────────────────────────────
const join = z.object({ type: z.literal("join"), room: z.string(), name: z.string(), asSpectator: z.boolean().optional() });
const reconnect = z.object({ type: z.literal("reconnect"), room: z.string(), playerId: z.string(), token: z.string() });
const startMatch = z.object({ type: z.literal("startMatch") });
const fireIntent = z.object({ type: z.literal("fireIntent"), latex: z.string() });
const configureRoom = z.object({
  type: z.literal("configureRoom"),
  mode: z.enum(["classic", "hp"]),
  rounds: z.union([z.literal(3), z.literal(5)]),
  noTurn: z.boolean(),
  turnSeconds: z.number().int().min(15).max(120),
  map: mapShape.optional(),
  scatter: scatterShape.optional(),
  gridMode: z.enum(["full", "minimal"]).optional(),
});
const switchTeam = z.object({ type: z.literal("switchTeam"), team: z.enum(["red", "blue"]) });
const rerollArena = z.object({ type: z.literal("rerollArena") });
const setName = z.object({ type: z.literal("setName"), name: z.string() });
const forfeit = z.object({ type: z.literal("forfeit") });
const clientSchema = z.discriminatedUnion("type", [join, startMatch, fireIntent, reconnect, configureRoom, switchTeam, rerollArena, setName, forfeit]);
export type ClientMessage = z.infer<typeof clientSchema>;

// ── Server → Client ──────────────────────────────────────────────────────────
const joined = z.object({ type: z.literal("joined"), playerId: z.string(), ownerId: z.string(), token: z.string() });
const lobbyState = z.object({
  type: z.literal("lobbyState"),
  players: z.array(z.object({ id: z.string(), name: z.string(), team: z.enum(["red", "blue"]) })),
  ownerId: z.string(),
  spectators: z.array(z.object({ id: z.string(), name: z.string() })),
  round1Seed: z.number().optional(),
  config: z.object({
    mode: z.enum(["classic", "hp"]),
    rounds: z.union([z.literal(3), z.literal(5)]),
    noTurn: z.boolean(),
    turnSeconds: z.number(),
    map: mapShape.optional(),
    scatter: scatterShape.optional(),
    gridMode: z.enum(["full", "minimal"]).optional(),
  }).optional(),
});
const shotPlayback = z.object({
  type: z.literal("shotPlayback"),
  firerId: z.string(),
  shot: z.custom<ShotResult>(),
  duration: z.number(),
});
const matchStateMsg = z.object({ type: z.literal("matchState"), state: z.custom<MatchState>() });
const errorMsg = z.object({ type: z.literal("error"), code: z.string(), message: z.string() });
const peerStatus = z.object({ type: z.literal("peerStatus"), playerId: z.string(), name: z.string(), connected: z.boolean() });
const matchStarting = z.object({ type: z.literal("matchStarting"), startAt: z.number() });
const serverSchema = z.discriminatedUnion("type", [joined, lobbyState, shotPlayback, matchStateMsg, errorMsg, peerStatus, matchStarting]);
export type ServerMessage = z.infer<typeof serverSchema>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return clientSchema.parse(raw);
}
export function parseServerMessage(raw: unknown): ServerMessage {
  return serverSchema.parse(raw);
}
export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}
