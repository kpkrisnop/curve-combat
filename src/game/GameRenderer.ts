import { Application, Container, Graphics, RenderTexture, Sprite, Text } from "pixi.js";
import { Camera } from "../graph/Camera";
import type { ShotResult, Vec2, World } from "../sim/types";

const COLORS = {
  bg: 0x0f141a,
  grid: 0x1d2935,
  axis: 0x3b4f60,
  label: 0x5b7185,
  soldier: 0x6ee7a3,
  target: 0xff7a6b,
  targetCore: 0xffd2c8,
  trail: 0x76c4ff,
  projectile: 0xffffff,
  boom: 0xffc24d,
  planet: 0x3a4250,
  planetRim: 0x5a6678,
  craterRim: 0x262d38,
  dust: 0xb59a78,
};

const SHOT_DURATION_MS = 1200;

/**
 * PixiJS view for the shooting prototype. Owns its own Application (kept separate
 * from the grapher's GraphRenderer) and uses the shared Camera for the
 * world<->screen mapping. Draws the field, soldier, targets, and animates a
 * projectile tracing the fired curve. Blind-fire: nothing curve-related is drawn
 * until playShot runs.
 */
export class GameRenderer {
  readonly app = new Application();
  private camera!: Camera;

  private gridLayer = new Graphics();
  private axisLayer = new Graphics();
  private labelLayer = new Container();
  private planetLayer = new Container(); // destructible terrain sprites (meat minus craters)
  private planetTextures: RenderTexture[] = []; // owned textures, destroyed on each rebuild
  private fieldLayer = new Graphics(); // soldier + targets
  private trailLayer = new Graphics();
  private fxLayer = new Graphics();

  private world!: World;

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

  setWorld(world: World) {
    this.world = world;
    this.fitCamera();
    this.trailLayer.clear();
    this.fxLayer.clear();
    this.drawStatic();
    this.drawPlanets();
    this.drawField();
  }

  /** Frame the whole playfield into the viewport with a little padding. */
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
    // Each planet is rendered to its own RenderTexture: a filled meat circle, then
    // crater circles drawn with the "erase" blend mode (destination-out) which
    // actually removes pixels. Overlapping craters merge into one clean cavity with
    // no internal outlines, holes are truly transparent (the field shows through),
    // and craters spilling past the rim erase nothing extra. Rebuilt from the full
    // crater list at the current scale each time the world changes.
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

      // Base meat: filled circle + outer rim.
      const base = new Graphics();
      base.circle(center, center, rPx).fill({ color: COLORS.planet });
      base.circle(center, center, rPx).stroke({ width: 2, color: COLORS.planetRim });
      this.app.renderer.render({ container: base, target: rt, clear: true });
      base.destroy();

      // Carve craters by erasing pixels from the meat.
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

  private drawField() {
    const g = this.fieldLayer;
    const cam = this.camera;
    g.clear();

    // Targets.
    for (const t of this.world.targets) {
      const c = this.toScreen(t.pos);
      const r = t.radius * cam.scale;
      g.circle(c.x, c.y, r).fill({ color: COLORS.target, alpha: 0.85 });
      g.circle(c.x, c.y, r).stroke({ width: 2, color: COLORS.targetCore, alpha: 0.9 });
      g.circle(c.x, c.y, Math.max(2, r * 0.28)).fill({ color: COLORS.targetCore });
    }

    // Soldier marker.
    const s = this.toScreen(this.world.soldier.pos);
    g.circle(s.x, s.y, 9).fill({ color: COLORS.soldier });
    g.circle(s.x, s.y, 9).stroke({ width: 2, color: 0x0c1116 });
    const barbX = s.x + this.world.soldier.dir * 16;
    g.moveTo(s.x, s.y).lineTo(barbX, s.y).stroke({ width: 3, color: COLORS.soldier });
  }

  /** Animate a fired shot. Resolves when the projectile + impact FX finish. */
  playShot(result: ShotResult): Promise<void> {
    this.trailLayer.clear();
    this.fxLayer.clear();

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

        // Trail up to the head, breaking across gaps.
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
        g.stroke({ width: 2.5, color: COLORS.trail, cap: "round", join: "round" });

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

  /** A small brown burst where a shot bites into a planet — distinct from a target explosion. */
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
