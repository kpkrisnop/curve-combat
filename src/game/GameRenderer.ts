import { Application, Container, Graphics, RenderTexture, Sprite, Text } from "pixi.js";
import { Camera } from "../graph/Camera";
import type { Bounds, ShotResult, Vec2, World } from "../sim/types";
import type { MapConfig } from "./matchLogic";
import { DEFAULT_MAP } from "./arenaDefaults";
import { boundsFromMap } from "../sim/planetScatter";
import { fitContain, boundaryRectPx } from "../sim/fitRect";
import { X_VELOCITY_WORLD } from "../sim/timing";
import type { PlayerState } from "./matchState";
import { HP_MAX } from "./hpLogic";
import { badgeText, badgeSize, hpFraction, showHpBar, type BadgePhase, type MatchMode } from "./badge";

const COLORS = {
  bg: 0x0f141a,
  grid: 0x1d2935,
  axis: 0x3b4f60,
  label: 0x5b7185,
  boundary: 0x5b7185,
  red: 0xff4444,
  blue: 0x4488ff,
  projectile: 0xffffff,
  boom: 0xffc24d,
  planet: 0x3a4250,
  dust: 0xb59a78,
};

/** Minimum animation duration in ms — prevents instant flicker on zero-length shots. */
const MIN_SHOT_MS = 200;
const PLAYER_RADIUS_WORLD = 0.2;
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
  private trailLayerRed = new Graphics();
  private trailLayerBlue = new Graphics();
  private fxLayer = new Graphics();
  /**
   * Name badges anchored to each soldier dot (Task D1+D2). A plain Pixi layer —
   * Text/Graphics here never receive pointer events (nothing in this app enables
   * `eventMode`), and the sim's hit detection resolves purely against
   * `world.targets` (position + PLAYER_RADIUS), so badges are excluded from the
   * hitbox by construction, not by an extra check.
   */
  private badgeLayer = new Container();

  private world!: World;
  private activeTurn: "red" | "blue" = "red";
  private noTurnMode = false;
  /** Full soldier roster for the current round — drives both dots and badges. */
  private players: PlayerState[] = [];
  private badgePhase: BadgePhase = "pregame";
  private badgeMode: MatchMode = "classic";

  /**
   * The logical playfield rectangle (world units). Set from MatchConfig via
   * setMap(); the camera scales it uniformly to fit the canvas (contain/letterbox).
   */
  private map: MapConfig = { ...DEFAULT_MAP };

  /** Collision bounds — the map rectangle, centered on the origin. */
  private effectiveBounds: Bounds = boundsFromMap(DEFAULT_MAP);

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
      this.trailLayerRed,
      this.trailLayerBlue,
      this.fxLayer,
      this.badgeLayer,
    );

    // Pre-compute before setWorld is called so main.ts can read bounds immediately.
    this.recomputeEffectiveBounds();

    this.app.renderer.on("resize", () => {
      this.camera.resize(this.app.screen.width, this.app.screen.height);
      this.recomputeEffectiveBounds();
      if (this.world) {
        this.drawStatic();
        this.drawPlanets();
        this.drawField();
      }
    });
  }

  /**
   * Current world bounds that exactly match the visible canvas area.
   * Call this after init() to get the collision bounds for buildWorld().
   */
  getEffectiveBounds(): Bounds {
    return { ...this.effectiveBounds };
  }

  /** Set the logical playfield rectangle. Call before getEffectiveBounds()/setWorld(). */
  setMap(map: MapConfig): void {
    this.map = { ...map };
    if (this.camera) this.recomputeEffectiveBounds();
  }

  /**
   * @param players Full soldier roster for the round (any NvN size) — every
   *   alive entry gets a dot + name badge; `opts.phase`/`opts.mode` control
   *   badge size and whether the HP bar shows (see src/game/badge.ts).
   */
  setWorld(
    world: World,
    activeTurn: "red" | "blue",
    players: PlayerState[],
    opts: { phase: BadgePhase; mode: MatchMode },
  ) {
    this.world = world;
    this.activeTurn = activeTurn;
    this.players = players;
    this.badgePhase = opts.phase;
    this.badgeMode = opts.mode;
    this.recomputeEffectiveBounds();
    this.trailLayerRed.clear();
    this.trailLayerBlue.clear();
    this.fxLayer.clear();
    this.drawStatic();
    this.drawPlanets();
    this.drawField();
  }

  /**
   * Scale the logical map rectangle uniformly to fit the canvas (contain), so
   * the same map looks identical on every display — only the pixel size differs.
   * Any aspect mismatch becomes a letterbox/pillarbox margin.
   */
  private recomputeEffectiveBounds() {
    const cam = this.camera;
    cam.scale = fitContain(this.map, cam.width, cam.height).scale;
    cam.centerX = 0;
    cam.centerY = 0;
    this.effectiveBounds = boundsFromMap(this.map);
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

    // The spacetime grid is ambient and paints the entire viewport — it is not
    // clipped to the world/play bounds. The play boundary is drawn separately
    // (drawBoundary()) as an explicit rect at the sim's collision bounds.
    const step = niceStep(45 / cam.scale);
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

    this.drawBoundary();
  }

  /**
   * Draws the visible play-boundary rectangle — the same `bounds` the sim
   * collides bullets against (`detectCollision` in src/sim/collision.ts),
   * derived here via the shared pure `boundaryRectPx()` (src/sim/fitRect.ts).
   * Never a separate constant: single source of truth is `boundsFromMap(map)`.
   */
  private drawBoundary() {
    const cam = this.camera;
    const rect = boundaryRectPx(this.map, cam.width, cam.height);
    this.boundaryLayer.clear();
    this.boundaryLayer
      .rect(rect.x, rect.y, rect.w, rect.h)
      .stroke({ width: 2, color: COLORS.boundary, alpha: 0.6 });
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
    // Render planets into a supersampled (2x) + antialiased texture, then draw
    // the sprite at 1/SS scale — smooths both the planet rim and the carved
    // crater edges far better than relying on the canvas antialias alone.
    const SS = 2;

    for (const planet of this.world.planets) {
      const rPx = planet.radius * cam.scale;
      const pad = 3;
      const size = Math.ceil(rPx * 2 + pad * 2); // logical (on-screen) size
      const center = size / 2;
      const texSize = size * SS; // texture is rendered at SS× resolution
      const texCenter = center * SS;
      const ps = this.toScreen(planet.pos);

      const rt = RenderTexture.create({ width: texSize, height: texSize, resolution: dpr, antialias: true });

      const base = new Graphics();
      base.circle(texCenter, texCenter, rPx * SS).fill({ color: COLORS.planet });
      this.app.renderer.render({ container: base, target: rt, clear: true });
      base.destroy();

      if (planet.craters.length > 0) {
        const erasers = new Container();
        for (const cr of planet.craters) {
          const cs = this.toScreen(cr.pos);
          const e = new Graphics()
            .circle(texCenter + (cs.x - ps.x) * SS, texCenter + (cs.y - ps.y) * SS, cr.radius * cam.scale * SS)
            .fill({ color: 0xffffff });
          e.blendMode = "erase";
          erasers.addChild(e);
        }
        this.app.renderer.render({ container: erasers, target: rt, clear: false });
        erasers.destroy({ children: true });
      }

      const sprite = new Sprite(rt);
      sprite.scale.set(1 / SS);
      sprite.position.set(ps.x - center, ps.y - center);
      this.planetLayer.addChild(sprite);
      this.planetTextures.push(rt);
    }
  }

  setNoTurnMode(enabled: boolean): void {
    this.noTurnMode = enabled;
  }

  /**
   * Draws every alive soldier as a dot (full brightness on the active team,
   * dimmed otherwise) plus its anchored name badge. Runs for any NvN roster
   * size, not just one red + one blue — badges track camera scale/pan because
   * they're positioned from the same `toScreen()` used for the dot itself, and
   * this whole method reruns on every resize (see the "resize" handler above).
   */
  private drawField() {
    const g = this.fieldLayer;
    const cam = this.camera;
    g.clear();
    this.badgeLayer.removeChildren();

    const rPx = PLAYER_RADIUS_WORLD * cam.scale;

    for (const p of this.players) {
      if (!p.alive) continue;
      const color = p.team === "red" ? COLORS.red : COLORS.blue;
      const isActive = this.noTurnMode || this.activeTurn === p.team;
      const s = this.toScreen(p.pos);

      if (isActive) {
        g.circle(s.x, s.y, rPx + 6).stroke({ width: 2.5, color, alpha: 0.35 });
      }
      g.circle(s.x, s.y, rPx).fill({ color, alpha: isActive ? 1.0 : 0.4 });
      if (isActive) {
        const dir = p.team === "red" ? 1 : -1;
        g.moveTo(s.x, s.y).lineTo(s.x + dir * BARREL_PX, s.y).stroke({ width: 3, color });
      }

      this.drawBadge(p, s, color, rPx);
    }
  }

  /**
   * One name badge, anchored above its soldier dot. `size="lg"` pre-game,
   * `size="sm"` in-game (badge.ts:badgeSize); HP mode additionally shows a
   * mini fill bar + the numeric HP (badge.ts:showHpBar/hpFraction) — Classic
   * mode shows only the name. Never interactive, so never part of the hitbox.
   */
  private drawBadge(p: PlayerState, dotScreenPos: Vec2, color: number, dotRadiusPx: number): void {
    const big = badgeSize(this.badgePhase) === "lg";
    const withHp = showHpBar(this.badgeMode);
    const fontSize = big ? 12 : 9;
    const barW = big ? 36 : 26;
    const barH = 5;

    const group = new Container();

    const nameText = new Text({
      text: badgeText(p.name),
      style: { fill: color, fontSize, fontFamily: "monospace", fontWeight: "600" },
    });
    nameText.anchor.set(0.5, 1);
    nameText.position.set(0, withHp ? -(barH + 6) : 0);
    group.addChild(nameText);

    if (withHp) {
      const frac = hpFraction(p.hp, HP_MAX);
      const barX = -barW / 2;
      const barY = -barH;
      group.addChild(
        new Graphics()
          .roundRect(barX, barY, barW, barH, 2)
          .fill({ color: 0x0b0e15 })
          .stroke({ width: 1, color }),
        new Graphics().roundRect(barX, barY, Math.max(1, barW * frac), barH, 2).fill({ color }),
      );

      const hpText = new Text({
        text: `${Math.round(p.hp)}`,
        style: { fill: color, fontSize: Math.max(8, fontSize - 2), fontFamily: "monospace" },
      });
      hpText.anchor.set(0, 0.5);
      hpText.position.set(barW / 2 + 4, barY + barH / 2);
      group.addChild(hpText);
    }

    group.position.set(dotScreenPos.x, dotScreenPos.y - dotRadiusPx - (big ? 12 : 8));
    this.badgeLayer.addChild(group);
  }

  playShot(result: ShotResult, player?: "red" | "blue"): Promise<void> {
    const effectivePlayer = player ?? this.activeTurn;
    const trailLayer = effectivePlayer === "red" ? this.trailLayerRed : this.trailLayerBlue;
    trailLayer.clear();
    if (!player) this.fxLayer.clear(); // Only clear fx in turn-based mode
    const trailColor = effectivePlayer === "red" ? COLORS.red : COLORS.blue;

    return new Promise((resolve) => {
      if (result.hit.kind === "dud" || result.samples.length < 2) {
        this.flashDud(this.world.soldier.pos);
        window.setTimeout(resolve, 350);
        return;
      }

      const samples = result.samples;

      // Compute total x-distance of the shot path (skip gap segments).
      let xLength = 0;
      for (let i = 0; i < samples.length - 1; i++) {
        if (!samples[i + 1].gap) {
          xLength += Math.abs(samples[i + 1].x - samples[i].x);
        }
      }
      const shotDurationMs = Math.max(MIN_SHOT_MS, (xLength / X_VELOCITY_WORLD) * 1000);

      const start = performance.now();
      const tick = () => {
        const progress = Math.min(1, (performance.now() - start) / shotDurationMs);
        const headF = progress * (samples.length - 1);
        const headIdx = Math.floor(headF);
        const frac = headF - headIdx;

        const g = trailLayer;
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

  showFloatingDamage(at: Vec2, dmg: number, player: "red" | "blue"): void {
    const color = player === "red" ? COLORS.red : COLORS.blue;
    const pos = this.toScreen(at);
    const text = new Text({
      text: `-${dmg}`,
      style: {
        fill: color,
        fontSize: 22,
        fontWeight: "bold",
        fontFamily: "system-ui, -apple-system, sans-serif",
      },
    });
    text.anchor.set(0.5, 1);
    text.position.set(pos.x, pos.y);
    text.alpha = 1;
    this.fxLayer.addChild(text);

    const startMs = performance.now();
    const dur = 700;
    const startY = pos.y;
    const tick = () => {
      const p = Math.min(1, (performance.now() - startMs) / dur);
      text.y = startY - p * 40;
      text.alpha = 1 - p;
      if (p >= 1) {
        this.app.ticker.remove(tick);
        if (!text.destroyed) text.destroy();
      }
    };
    this.app.ticker.add(tick);
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
