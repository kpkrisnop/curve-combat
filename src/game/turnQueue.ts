// src/game/turnQueue.ts
import type { PlayerState, Team } from "./matchState";

/**
 * Snake / alternating firing order starting with `firstTeam`:
 * F1, O1, F2, O2, … then any trailing players of the larger team.
 * Includes all players (a round starts with everyone alive).
 */
export function buildTurnQueue(players: PlayerState[], firstTeam: Team): string[] {
  const first = players.filter((p) => p.team === firstTeam).map((p) => p.id);
  const second = players.filter((p) => p.team !== firstTeam).map((p) => p.id);
  const out: string[] = [];
  const n = Math.max(first.length, second.length);
  for (let i = 0; i < n; i++) {
    if (i < first.length) out.push(first[i]);
    if (i < second.length) out.push(second[i]);
  }
  return out;
}

/**
 * The next ALIVE player id after `currentId` in the queue, cycling around.
 * If `currentId` is null/absent, search from the start. Returns null if no
 * player satisfies `isAlive`.
 */
export function nextActive(
  queue: string[],
  currentId: string | null,
  isAlive: (id: string) => boolean,
): string | null {
  if (queue.length === 0) return null;
  const start = currentId ? queue.indexOf(currentId) : -1;
  for (let step = 1; step <= queue.length; step++) {
    const id = queue[(start + step + queue.length) % queue.length];
    if (isAlive(id)) return id;
  }
  return null;
}
