import { Application, Container, Graphics, Text } from "pixi.js";
import { Camera } from "./Camera";

export interface PlotItem {
  fn: (x: number) => number;
  color: number;
  visible: boolean;
}

/**
 * PixiJS-based graph view: draws the grid, axes, numeric labels and the plotted
 * curves. Reads plot data only; it owns no game logic. The render layer of the
 * eventual game will grow from this.
 */
export class GraphRenderer {
  readonly app = new Application();
  camera!: Camera;

  private gridLayer = new Graphics();
  private axisLayer = new Graphics();
  private curveLayer = new Graphics();
  private labelLayer = new Container();
  private hoverLayer = new Graphics();
  private hoverLabel = new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 12, fontFamily: "monospace" },
  });
  private hover: { x: number; y: number } | null = null;
  private plots: PlotItem[] = [];
  private dirty = true;

  async init(container: HTMLElement) {
    await this.app.init({
      resizeTo: container,
      antialias: true,
      background: 0x0f141a,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    container.appendChild(this.app.canvas);

    this.camera = new Camera(this.app.screen.width, this.app.screen.height);
    this.hoverLabel.visible = false;
    this.app.stage.addChild(
      this.gridLayer,
      this.axisLayer,
      this.curveLayer,
      this.labelLayer,
      this.hoverLayer,
      this.hoverLabel,
    );

    this.setupInteraction();
    this.app.renderer.on("resize", () => {
      this.camera.resize(this.app.screen.width, this.app.screen.height);
      this.dirty = true;
    });
    this.app.ticker.add(() => {
      if (!this.dirty) return;
      this.draw();
      this.dirty = false;
    });
  }

  setPlots(plots: PlotItem[]) {
    this.plots = plots;
    this.dirty = true;
  }

  private setupInteraction() {
    const canvas = this.app.canvas;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastX = e.offsetX;
      lastY = e.offsetY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", (e) => {
      if (dragging) {
        this.camera.panByPixels(e.offsetX - lastX, e.offsetY - lastY);
        lastX = e.offsetX;
        lastY = e.offsetY;
        this.hover = null;
      } else {
        this.hover = { x: e.offsetX, y: e.offsetY };
      }
      this.dirty = true;
    });
    const end = () => {
      dragging = false;
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => {
      this.hover = null;
      this.dirty = true;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = Math.pow(1.0015, -e.deltaY);
        this.camera.zoomAt(e.offsetX, e.offsetY, factor);
        this.dirty = true;
      },
      { passive: false },
    );
  }

  private draw() {
    this.drawGrid();
    this.drawCurves();
    this.drawHover();
  }

  /** Highlight the nearest curve point under the cursor and show its (x, y). */
  private drawHover() {
    const g = this.hoverLayer;
    g.clear();
    this.hoverLabel.visible = false;
    if (!this.hover) return;

    const cam = this.camera;
    const wx = cam.screenToWorldX(this.hover.x);

    let best: { sy: number; wy: number; color: number; dist: number } | null = null;
    for (const plot of this.plots) {
      if (!plot.visible) continue;
      const wy = plot.fn(wx);
      if (!Number.isFinite(wy)) continue;
      const sy = cam.worldToScreenY(wy);
      const dist = Math.abs(sy - this.hover.y);
      if (!best || dist < best.dist) best = { sy, wy, color: plot.color, dist };
    }
    if (!best || best.dist > 14) return;

    const sx = this.hover.x;
    g.circle(sx, best.sy, 5).fill(0xffffff).stroke({ width: 2.5, color: best.color });

    this.hoverLabel.text = `(${fmt(cam.screenToWorldX(sx))}, ${fmt(best.wy)})`;
    const pad = 6;
    let lx = sx + 12;
    let ly = best.sy - this.hoverLabel.height - 10;
    if (lx + this.hoverLabel.width + pad * 2 > cam.width) lx = sx - this.hoverLabel.width - 18;
    if (ly < 0) ly = best.sy + 12;
    g.roundRect(
      lx - pad,
      ly - pad,
      this.hoverLabel.width + pad * 2,
      this.hoverLabel.height + pad * 2,
      5,
    ).fill({ color: 0x1d2630, alpha: 0.95 });
    this.hoverLabel.position.set(lx, ly);
    this.hoverLabel.visible = true;
  }

  private niceStep(rawStep: number): number {
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const n = rawStep / pow;
    const m = n < 2 ? 2 : n < 5 ? 5 : 10;
    return m * pow;
  }

  private drawGrid() {
    const g = this.gridLayer;
    const a = this.axisLayer;
    const cam = this.camera;
    const w = cam.width;
    const h = cam.height;
    g.clear();
    a.clear();
    this.labelLayer.removeChildren();

    const step = this.niceStep(80 / cam.scale);
    const left = cam.screenToWorldX(0);
    const right = cam.screenToWorldX(w);
    const top = cam.screenToWorldY(0);
    const bottom = cam.screenToWorldY(h);

    const axisX = clamp(cam.worldToScreenX(0), 0, w);
    const axisY = clamp(cam.worldToScreenY(0), 0, h);

    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      const sx = cam.worldToScreenX(x);
      g.moveTo(sx, 0).lineTo(sx, h);
      if (Math.abs(x) > 1e-9)
        this.addLabel(fmt(x), sx + 3, clamp(axisY, 2, h - 14));
    }
    for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
      const sy = cam.worldToScreenY(y);
      g.moveTo(0, sy).lineTo(w, sy);
      if (Math.abs(y) > 1e-9)
        this.addLabel(fmt(y), clamp(axisX + 3, 2, w - 30), sy + 2);
    }
    g.stroke({ width: 1, color: 0x223040, alpha: 1 });

    a.moveTo(0, cam.worldToScreenY(0)).lineTo(w, cam.worldToScreenY(0));
    a.moveTo(cam.worldToScreenX(0), 0).lineTo(cam.worldToScreenX(0), h);
    a.stroke({ width: 1.5, color: 0x4a6072, alpha: 1 });
  }

  private addLabel(text: string, x: number, y: number) {
    const t = new Text({
      text,
      style: { fill: 0x6b8296, fontSize: 11, fontFamily: "monospace" },
    });
    t.position.set(x, y);
    this.labelLayer.addChild(t);
  }

  private drawCurves() {
    const g = this.curveLayer;
    const cam = this.camera;
    const w = cam.width;
    const h = cam.height;
    g.clear();

    for (const plot of this.plots) {
      if (!plot.visible) continue;
      let pen = false;
      let prevSy = 0;
      let drew = false;

      for (let sx = 0; sx <= w; sx += 1) {
        const wy = plot.fn(cam.screenToWorldX(sx));
        if (!Number.isFinite(wy)) {
          pen = false;
          continue;
        }
        const sy = cam.worldToScreenY(wy);
        // Break the line across asymptotes (huge vertical jumps).
        if (pen && Math.abs(sy - prevSy) > h * 2) pen = false;
        if (!pen) {
          g.moveTo(sx, sy);
          pen = true;
        } else {
          g.lineTo(sx, sy);
          drew = true;
        }
        prevSy = sy;
      }

      if (drew)
        g.stroke({
          width: 2.5,
          color: plot.color,
          alpha: 1,
          cap: "round",
          join: "round",
        });
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function fmt(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}
