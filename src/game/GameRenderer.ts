import { Application, Container, Graphics, RenderTexture, Sprite, Text } from "pixi.js";
import { Camera } from "../graph/Camera";
import type { ShotResult, Vec2, World } from "../sim/types";

const COLORS = {
  bg: 0x0f141a,
  grid: 0x1d2935,
  axis: 0x3b4f60,
  label: 0x5b7185,
  red: 0xff4444,
  blue: 0x4488ff,
  projectile: 0xffffff,
  boom: 0xffc24d,
  planet: 0x3a4250,
  dust: 0xb59a78,
};

const SHOT_DURATION_MS = 1200;
const PLAYER_RADIUS_WORLD = 0.7;
const BARREL_PX = 18;

export class GameRenderer {
  readonly app = new Application();
  private camera!: Camera;

  private gridLayer = new Graphics();
  private axisLayer = new Graphics();
  private labelLayer = new Container();
  private boundaryLayer = new Graphics();
  private planetLayer = new Container();
  private planetTextures: RenderTexture[] = [];
  private fieldLayer = new Graphics();
  private trailLayer = new Graphics();
  private fxLayer = new Graphics();

  private world!: World;
  private activeTurn: "red" | "blue" = "red";
  private redPos: Vec2 = { x: -9, y: 0 };
  private bluePos: Vec2 = { x: 9, y: 0 };

  async init(container: HTMLElement) {
    await this.app.init({
      resizeTo: container,
      antialias: true,
      background: COLORS.bg,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    container.appendChild(this.app.canvas);

    this.camera = new Camera(this.app.screen.width, this.app.screen.height);
    this.app.stage.addChild(
      this.gridLayer,
      this.axisLayer,
      this.labelLayer,
      this.boundaryLayer,
      this.planetLayer,
      this.fieldLayer,
      this.trailLayer,
      this.fxLayer,
    );

    this.app.renderer.on("resize", () => {
      this.camera.resize(this.app.screen.width, this.app.screen.height);
      this.fitCamera();
      this.drawStatic();
      this.drawPlanets();
      this.drawField();
    });
  }

  setWorld(world: World, activeTurn: "red" | "blue", redPos: Vec2, bluePos: Vec2) {
    this.world = world;
    this.activeTurn = activeTurn;
    this.redPos = redPos;
    this.bluePos = bluePos;
    this.fitCamera();
    this.trailLayer.clear();
    this.fxLayer.clear();
    this.drawStatic();
    this.drawPlanets();
    this.drawField();
  }

  private fitCamera() {
    const b = this.world.bounds;
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const pad = 0.9;
    const scale = Math.min(this.camera.width / bw, this.camera.height / bh) * pad;
    this.camera.scale = scale;
    this.camera.centerX = (b.minX + b.maxX) / 2;
    this.camera.centerY = (b.minY + b.maxY) / 2;
  }

  private drawStatic() {
    const cam = this.camera;
    const w = cam.width;
    const h = cam.height;
    const g = this.gridLayer;
    const a = this.axisLayer;
    g.clear();
    a.clear();
    this.labelLayer.removeChildren();

    const step = niceStep(90 / cam.scale);
    const left = cam.screenToWorldX(0);
    const right = cam.screenToWorldX(w);
    const top = cam.screenToWorldY(0);
    const bottom = cam.screenToWorldY(h);
    const axisX = clamp(cam.worldToScreenX(0), 0, w);
    const axisY = clamp(cam.worldToScreenY(0), 0, h);

    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      const sx = cam.worldToScreenX(x);
      g.moveTo(sx, 0).lineTo(sx, h);
      if (Math.abs(x) > 1e-9) this.addLabel(fmt(x), sx + 3, clamp(axisY, 2, h - 14));
    }
    for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
      const sy = cam.worldToScreenY(y);
      g.moveTo(0, sy).lineTo(w, sy);
      if (Math.abs(y) > 1e-9) this.addLabel(fmt(y), clamp(axisX + 3, 2, w - 30), sy + 2);
    }
    g.stroke({ width: 1, color: COLORS.grid });

    a.moveTo(0, cam.worldToScreenY(0)).lineTo(w, cam.worldToScreenY(0));
    a.moveTo(cam.worldToScreenX(0), 0).lineTo(cam.worldToScreenX(0), h);
    a.stroke({ width: 1.5, color: COLORS.axis });
  }

  private addLabel(text: string, x: number, y: number) {
    const t = new Text({ text, style: { fill: COLORS.label, fontSize: 11, fontFamily: "monospace" } });
    t.position.set(x, y);
    this.labelLayer.addChild(t);
  }

  private drawPlanets() {
    this.planetLayer.removeChildren();
    for (const rt of this.planetTextures) rt.destroy(true);
    this.planetTextures = [];

    const cam = this.camera;
    const dpr = window.devicePixelRatio || 1;

    for (const planet of this.world.planets) {
      const rPx = planet.radius * cam.scale;
      const pad = 3;
      const size = Math.ceil(rPx * 2 + pad * 2);
      const center = size / 2;
      const ps = this.toScreen(planet.pos);

      const rt = RenderTexture.create({ width: size, height: size, resolution: dpr });

      const base = new Graphics();
      base.circle(center, center, rPx).fill({ color: COLORS.planet });
      this.app.renderer.render({ container: base, target: rt, clear: true });
      base.destroy();

      if (planet.craters.length > 0) {
        const erasers = new Container();
        for (const cr of planet.craters) {
          const cs = this.toScreen(cr.pos);
          const e = new Graphics()
            .circle(center + (cs.x - ps.x), center + (cs.y - ps.y), cr.radius * cam.scale)
            .fill({ color: 0xffffff });
          e.blendMode = "erase";
          erasers.addChild(e);
        }
        this.app.renderer.render({ container: erasers, target: rt, clear: false });
        erasers.destroy({ children: true });
      }

      const sprite = new Sprite(rt);
      sprite.position.set(ps.x - center, ps.y - center);
      this.planetLayer.addChild(sprite);
      this.planetTextures.push(rt);
    }
  }

  private activeColor(): number {
    return this.activeTurn === "red" ? COLORS.red : COLORS.blue;
  }

  private drawField() {
    const g = this.fieldLayer;
    const b = this.boundaryLayer;
    const cam = this.camera;
    g.clear();
    b.clear();

    // Boundary rectangle — color tracks the active player's turn.
    const { minX, minY, maxX, maxY } = this.world.bounds;
    const bx1 = cam.worldToScreenX(minX);
    const bx2 = cam.worldToScreenX(maxX);
    const by1 = cam.worldToScreenY(maxY); // screen Y is inverted
    const by2 = cam.worldToScreenY(minY);
    b.rect(bx1, by1, bx2 - bx1, by2 - by1).stroke({ width: 2.5, color: this.activeColor(), alpha: 0.7 });

    const rPx = PLAYER_RADIUS_WORLD * cam.scale;

    // RED — full brightness when active, dimmed when waiting.
    const rs = this.toScreen(this.redPos);
    const isRedActive = this.activeTurn === "red";
    if (isRedActive) {
      g.circle(rs.x, rs.y, rPx + 6).stroke({ width: 2.5, color: COLORS.red, alpha: 0.35 });
    }
    g.circle(rs.x, rs.y, rPx).fill({ color: COLORS.red, alpha: isRedActive ? 1.0 : 0.4 });
    if (isRedActive) {
      g.moveTo(rs.x, rs.y).lineTo(rs.x + BARREL_PX, rs.y).stroke({ width: 3, color: COLORS.red });
    }

    // BLUE — full brightness when active, dimmed when waiting.
    const bs = this.toScreen(this.bluePos);
    const isBlueActive = this.activeTurn === "blue";
    if (isBlueActive) {
      g.circle(bs.x, bs.y, rPx + 6).stroke({ width: 2.5, color: COLORS.blue, alpha: 0.35 });
    }
    g.circle(bs.x, bs.y, rPx).fill({ color: COLORS.blue, alpha: isBlueActive ? 1.0 : 0.4 });
    if (isBlueActive) {
      g.moveTo(bs.x, bs.y).lineTo(bs.x - BARREL_PX, bs.y).stroke({ width: 3, color: COLORS.blue });
    }
  }

  playShot(result: ShotResult): Promise<void> {
    this.trailLayer.clear();
    this.fxLayer.clear();
    const trailColor = this.activeColor();

    return new Promise((resolve) => {
      if (result.hit.kind === "dud" || result.samples.length < 2) {
        this.flashDud(this.world.soldier.pos);
        window.setTimeout(resolve, 350);
        return;
      }

      const samples = result.samples;
      const start = performance.now();
      const tick = () => {
        const progress = Math.min(1, (performance.now() - start) / SHOT_DURATION_MS);
        const headF = progress * (samples.length - 1);
        const headIdx = Math.floor(headF);
        const frac = headF - headIdx;

        const g = this.trailLayer;
        g.clear();
        let pen = false;
        for (let i = 0; i <= headIdx; i++) {
          const sp = this.toScreen(samples[i].p);
          if (samples[i].gap) pen = false;
          if (!pen) {
            g.moveTo(sp.x, sp.y);
            pen = true;
          } else {
            g.lineTo(sp.x, sp.y);
          }
        }
        let head = samples[headIdx].p;
        if (headIdx < samples.length - 1 && !samples[headIdx + 1].gap) {
          const next = samples[headIdx + 1].p;
          head = { x: head.x + (next.x - head.x) * frac, y: head.y + (next.y - head.y) * frac };
          const hp = this.toScreen(head);
          if (pen) g.lineTo(hp.x, hp.y);
        }
        g.stroke({ width: 2.5, color: trailColor, cap: "round", join: "round" });

        const hp = this.toScreen(head);
        g.circle(hp.x, hp.y, 4).fill({ color: COLORS.projectile });

        if (progress >= 1) {
          this.app.ticker.remove(tick);
          this.resolveImpact(result, resolve);
        }
      };
      this.app.ticker.add(tick);
    });
  }

  private resolveImpact(result: ShotResult, done: () => void) {
    const at = result.hit.at;
    if (result.hit.kind === "target") {
      this.explode(at, () => done());
    } else if (result.hit.kind === "planet") {
      this.dustPuff(at, () => done());
    } else {
      this.flashDud(at);
      window.setTimeout(done, 250);
    }
  }

  private dustPuff(at: Vec2, done: () => void) {
    const center = this.toScreen(at);
    const start = performance.now();
    const dur = 320;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / dur);
      this.fxLayer.clear();
      const r = 4 + p * 24;
      this.fxLayer.circle(center.x, center.y, r).fill({ color: COLORS.dust, alpha: (1 - p) * 0.5 });
      this.fxLayer.circle(center.x, center.y, r).stroke({ width: 2 * (1 - p), color: COLORS.dust, alpha: 1 - p });
      if (p >= 1) {
        this.app.ticker.remove(tick);
        this.fxLayer.clear();
        done();
      }
    };
    this.app.ticker.add(tick);
  }

  private explode(at: Vec2, done: () => void) {
    const center = this.toScreen(at);
    const start = performance.now();
    const dur = 380;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / dur);
      this.fxLayer.clear();
      const r = 6 + p * 46;
      this.fxLayer.circle(center.x, center.y, r).stroke({ width: 3 * (1 - p), color: COLORS.boom, alpha: 1 - p });
      this.fxLayer.circle(center.x, center.y, r * 0.5).fill({ color: COLORS.boom, alpha: (1 - p) * 0.5 });
      if (p >= 1) {
        this.app.ticker.remove(tick);
        this.fxLayer.clear();
        done();
      }
    };
    this.app.ticker.add(tick);
  }

  private flashDud(at: Vec2) {
    const c = this.toScreen(at);
    this.fxLayer.circle(c.x, c.y, 14).stroke({ width: 2, color: 0x8aa0b4, alpha: 0.8 });
    window.setTimeout(() => this.fxLayer.clear(), 300);
  }

  private toScreen(p: Vec2): Vec2 {
    return { x: this.camera.worldToScreenX(p.x), y: this.camera.worldToScreenY(p.y) };
  }
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const m = n < 2 ? 2 : n < 5 ? 5 : 10;
  return m * pow;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function fmt(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}
