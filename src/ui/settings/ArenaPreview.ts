import type { MapConfig, ScatterConfig } from "../../game/matchLogic";
import { boundsFromMap, computeSpawns, generatePlanetsWithStats } from "../../sim/planetScatter";
import { fitContain } from "../../sim/fitRect";
import { coverage } from "./coverage";

export interface PreviewStats {
  placed: number;
  coveragePct: number;
  attempts: number;
}

/**
 * Lightweight, Pixi-free preview of a generated arena. Faithful to the game
 * because it calls the same sim generator + the same contain-fit rule.
 */
export class ArenaPreview {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  render(map: MapConfig, scatter: ScatterConfig, teamSize: number, seed: number): PreviewStats {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const spawns = computeSpawns(map, teamSize);
    const { planets, attempts } = generatePlanetsWithStats(seed, boundsFromMap(map), spawns, scatter);
    const t = fitContain(map, W, H);
    const b = boundsFromMap(map);
    const sx = (x: number) => t.offsetX + (x - b.minX) * t.scale;
    const sy = (y: number) => t.offsetY + (b.maxY - y) * t.scale;

    ctx.clearRect(0, 0, W, H);

    // map rectangle
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(sx(b.minX), sy(b.maxY), map.width * t.scale, map.height * t.scale);
    ctx.strokeStyle = "#2b3a49";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(b.minX), sy(b.maxY), map.width * t.scale, map.height * t.scale);

    // spawn clearance halos + dots
    for (const s of spawns) {
      const red = s.x < 0;
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), scatter.spawnClearance * t.scale, 0, Math.PI * 2);
      ctx.fillStyle = red ? "rgba(255,68,68,0.07)" : "rgba(68,136,255,0.07)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), 4, 0, Math.PI * 2);
      ctx.fillStyle = red ? "#ff4444" : "#4488ff";
      ctx.fill();
    }

    // planets
    for (const p of planets) {
      ctx.beginPath();
      ctx.arc(sx(p.pos.x), sy(p.pos.y), p.radius * t.scale, 0, Math.PI * 2);
      ctx.fillStyle = "#7d8aa0";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#aab6c8";
      ctx.stroke();
    }

    return { placed: planets.length, coveragePct: 100 * coverage(planets, map), attempts };
  }
}
