import { useEffect, useRef } from "react";

const GRID = 26;      // grid lines per axis
const STARS = 140;

/** Radial spacetime warp: pulls a point toward the center mass. */
function warp(x: number, y: number, cx: number, cy: number, t: number): [number, number] {
  const dx = x - cx, dy = y - cy;
  const r = Math.hypot(dx, dy) + 1;
  const pull = 2600 / (r * 0.9 + 60);           // stronger near the center
  const swirl = 0.14 * Math.sin(t * 0.0002 + r * 0.004);
  const a = Math.atan2(dy, dx) + swirl;
  const r2 = Math.max(6, r - pull);
  return [cx + Math.cos(a) * r2, cy + Math.sin(a) * r2];
}

export function SpacetimeBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const stars = Array.from({ length: STARS }, () => ({
      x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.4,
    }));
    let raf = 0;

    const draw = (t: number) => {
      const w = (canvas.width = canvas.clientWidth);
      const h = (canvas.height = canvas.clientHeight);
      const cx = w / 2, cy = h * 0.44;
      ctx.clearRect(0, 0, w, h);

      // stars
      ctx.fillStyle = "#8499ab";
      for (const st of stars) {
        ctx.globalAlpha = 0.25 + 0.3 * Math.sin(t * 0.0006 + st.x * 40);
        ctx.fillRect(st.x * w, st.y * h, st.s, st.s);
      }
      ctx.globalAlpha = 1;

      // warped grid
      ctx.strokeStyle = "rgba(68, 136, 255, 0.10)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath();
        for (let j = 0; j <= GRID; j++) {
          const [px, py] = warp((i / GRID) * w, (j / GRID) * h, cx, cy, t);
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let j = 0; j <= GRID; j++) {
          const [px, py] = warp((j / GRID) * w, (i / GRID) * h, cx, cy, t);
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // event horizon
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      g.addColorStop(0, "#000");
      g.addColorStop(0.8, "#000");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      draw(0);
    } else {
      const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="cc-bgcanvas" aria-hidden="true" />;
}
