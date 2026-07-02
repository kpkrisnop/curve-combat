// src/net/protocol.ts
import { z } from "zod";
import type { ShotResult } from "../sim/types";
import type { MatchState } from "../game/matchState";

// ── Client → Server ──────────────────────────────────────────────────────────
const join = z.object({ type: z.literal("join"), room: z.string(), name: z.string() });
const startMatch = z.object({ type: z.literal("startMatch") });
const fireIntent = z.object({ type: z.literal("fireIntent"), latex: z.string() });
const clientSchema = z.discriminatedUnion("type", [join, startMatch, fireIntent]);
export type ClientMessage = z.infer<typeof clientSchema>;

// ── Server → Client ──────────────────────────────────────────────────────────
// Opaque payloads (shot, state) are produced by the trusted engine; not deep-validated.
const joined = z.object({ type: z.literal("joined"), playerId: z.string(), ownerId: z.string() });
const lobbyState = z.object({
  type: z.literal("lobbyState"),
  players: z.array(z.object({ id: z.string(), name: z.string(), team: z.enum(["red", "blue"]) })),
  ownerId: z.string(),
});
const shotPlayback = z.object({
  type: z.literal("shotPlayback"),
  firerId: z.string(),
  shot: z.custom<ShotResult>(),
  duration: z.number(),
});
const matchStateMsg = z.object({ type: z.literal("matchState"), state: z.custom<MatchState>() });
const errorMsg = z.object({ type: z.literal("error"), code: z.string(), message: z.string() });
const serverSchema = z.discriminatedUnion("type", [joined, lobbyState, shotPlayback, matchStateMsg, errorMsg]);
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
