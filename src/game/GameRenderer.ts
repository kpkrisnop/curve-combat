import { Application, Container, Graphics, RenderTexture, Sprite, Text } from "pixi.js";
import { Camera } from "../graph/Camera";
import type { Bounds, ShotResult, Vec2, World } from "../sim/types";
import type { MapConfig, ScatterConfig } from "./matchLogic";
import { DEFAULT_MAP } from "./arenaDefaults";
import { boundsFromMap, spawnZoneRects } from "../sim/planetScatter";
import { fitContain } from "../sim/fitRect";
import { shotDuration } from "../sim/timing";
import { cumulativeArcLength, pointAtLength, bangTravelProgress } from "../sim/playback";
import { PLAYER_RADIUS, type PlayerState } from "./matchState";
import { HP_MAX } from "./hpLogic";
import {
  badgeText,
  badgeSize,
  hpFraction,
  showHpBar,
  isPlayerActive,
  type BadgePhase,
  type MatchMode,
} from "./badge";

// Arena palette, aligned to the DESIGN.md tokens (foundation.css): pitch-black
// stage, the border ramp for grid chrome, the ink ramp for labels/boundary,
// and saturated hue reserved for the two teams + fx.
const COLORS = {
  bg: 0x000000,        // --cc-bg — pitch black, same field as the page
  grid: 0x1d222a,      // --cc-border — default hairline
  axis: 0x303c48,      // --cc-border-strong — emphasized hairline
  label: 0x5e7081,     // --cc-text-faint
  boundary: 0x5e7081,  // --cc-text-faint — the real collision bounds
  red: 0xff4444,       // --cc-red
  blue: 0x4488ff,      // --cc-blue
  projectile: 0xffffff,
  boom: 0xffc24d,
  planet: 0x262c34,
  planetRim: 0x485460, // light catching the planet's edge — glow-not-shadow depth
  dust: 0xb59a78,
};

/** Colors for the pre-game margin guides that aren't team-tinted (Task S3). */
const GUIDE_COLORS = {
  /** Field-margin box — faint ink, quiet ambient guide. */
  margin: 0x5e7081,
  /** Spawn separation ring — primary ink, the brightest guide. */
  separation: 0xcdd9e5,
};

/** Minimum animation duration in ms — prevents instant flicker on zero-length shots. */
const MIN_SHOT_MS = 200;
// Bang→travel projectile pacing (Issue 5, ADR-0004): the head starts at `c×` cruise
// speed and decays at rate `a` toward cruise (b=1 baseline). Front-loads speed within
// the shot's fixed duration; only the ratio c/b shapes the curve.
const BANG_DECAY_RATE = 1; // a
const BANG_SPEED_MULTIPLIER = 3; // c
const BARREL_PX = 18;

/**
 * Detach and destroy every child of a Pixi layer (M4 fix). `removeChildren()`
 * alone only detaches — it never frees the child's GPU-side resources
 * (Text's rendered-glyph texture, Graphics' geometry context) — so a layer
 * whose children are freshly `new Text()`/`new Graphics()`'d on every draw
 * (badgeLayer's per-soldier badge groups, labelLayer's grid-label Text) leaks
 * GPU memory over a long match if only `removeChildren()` is called.
 *
 * `textureSource: false` is deliberate, not an oversight: Pixi's text render
 * pipe (node_modules/pixi.js CanvasTextPipe.js) pools/ref-counts the
 * underlying canvas texture by a (text content + style) key via
 * `canvasText.getManagedTexture()` — two Text objects with identical
 * content+style (e.g. two same-named players) can share one GPU texture
 * source. Forcing `textureSource: true` here would destroy that shared
 * resource out from under any other live Text still using the same key.
 * Destroying the object's own `texture` wrapper plus all children
 * (`children: true` — Graphics.destroy() always frees its own owned
 * geometry context regardless of these flags) releases everything this draw
 * call exclusively owns, without touching anything shared/pooled.
 *
 * Never call this on a layer holding long-lived shared Graphics singletons
 * that are only ever `.clear()`ed and redrawn in place (gridLayer,
 * axisLayer, boundaryLayer, fieldLayer, trail/fx layers) — those must not be
 * destroyed, only cleared.
 */
export function destroyLayerChildren(layer: {
  removeChildren(): Array<{ destroy(options?: unknown): void }>;
}): void {
  for (const child of layer.removeChildren()) {
    child.destroy({ children: true, texture: true, textureSource: false });
  }
}

/** Camera pixels-per-world-unit that fits the map, scaled by a zoom factor (<1 = zoomed out). */
export function zoomedCamScale(map: MapConfig, canvasW: number, canvasH: number, factor: number): number {
  return fitContain(map, canvasW, canvasH).scale * factor;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class GameRenderer {
  readonly app = new Application();
  private camera!: Camera;

  private gridLayer = new Graphics();
  private axisLayer = new Graphics();
  private labelLayer = new Container();
  private boundaryLayer = new Graphics();
  /**
   * Ambient pre-game "margin guide" overlay (Task S3) — spawn zone rects,
   * spawn clearance/separation rings, and the field-margin box. Wordless,
   * only ever drawn while `badgePhase === "pregame"` (see drawGuides());
   * cleared and left empty once the match starts. Sits behind planetLayer
   * so planets can visually overlap the guides, same as the prototype.
   */
  private guideLayer = new Graphics();
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
  /**
   * The single player whose turn it is (turn-based mode); null in no-turn
   * mode or before any turn has been assigned. Drives per-player glow/aim —
   * see isPlayerActive() in ./badge and its use in drawField(). This is the
   * H3 fix: activity is a PLAYER identity, not a TEAM one.
   */
  private activePlayerId: string | null = null;
  /** Full soldier roster for the current round — drives both dots and badges. */
  private players: PlayerState[] = [];
  private badgePhase: BadgePhase = "pregame";
  private badgeMode: MatchMode = "classic";
  /** Live scatter config for the pre-game margin guides (undefined ⇒ guides stay hidden). */
  private arenaScatter: ScatterConfig | undefined;

  /**
   * The logical playfield rectangle (world units). Set from MatchConfig via
   * setMap(); the camera scales it uniformly to fit the canvas (contain/letterbox).
   */
  private map: MapConfig = { ...DEFAULT_MAP };

  /** Collision bounds — the map rectangle, centered on the origin. */
  private effectiveBounds: Bounds = boundsFromMap(DEFAULT_MAP);

  /** Visual zoom multiplier on the fit-to-frame camera scale (1 = arena fills frame). */
  private zoomFactor = 1;
  private zoomRaf: number | null = null;

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
      this.guideLayer,
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
   * @param opts.activePlayerId The single player whose turn it is (turn-based
   *   mode), or null in no-turn mode / before a turn is assigned. Drives
   *   which one player glows + shows an aim barrel (H3 fix — see
   *   isPlayerActive() in ./badge). `activeTurn` above is kept only for
   *   team-colored trail/fx bookkeeping in playShot(); it no longer decides
   *   who is highlighted.
   * @param opts.scatter Live scatter config, used to draw the pre-game
   *   margin guides (Task S3 — see drawGuides()). Optional: omit (or pass
   *   undefined) for in-match render paths where the guides never show
   *   anyway (badgePhase !== "pregame" already hides them).
   */
  setWorld(
    world: World,
    activeTurn: "red" | "blue",
    players: PlayerState[],
    opts: { phase: BadgePhase; mode: MatchMode; activePlayerId: string | null; scatter?: ScatterConfig },
  ) {
    this.world = world;
    this.activeTurn = activeTurn;
    this.players = players;
    this.badgePhase = opts.phase;
    this.badgeMode = opts.mode;
    this.activePlayerId = opts.activePlayerId;
    this.arenaScatter = opts.scatter;
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
    cam.scale = zoomedCamScale(this.map, cam.width, cam.height, this.zoomFactor);
    cam.centerX = 0;
    cam.centerY = 0;
    this.effectiveBounds = boundsFromMap(this.map);
  }

  /** Set the zoom factor and redraw immediately (no animation). */
  setZoomFactor(factor: number): void {
    this.zoomFactor = factor;
    this.recomputeEffectiveBounds();
    if (this.world) {
      this.drawStatic();
      this.drawPlanets();
      this.drawField();
    }
  }

  /** Tween the zoom factor to `to` over `durationMs`, redrawing each frame. */
  animateZoom(to: number, durationMs = 900): void {
    if (this.zoomRaf !== null) cancelAnimationFrame(this.zoomRaf);
    const from = this.zoomFactor;
    if (from === to) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      this.setZoomFactor(from + (to - from) * easeInOutCubic(t));
      if (t < 1) {
        this.zoomRaf = requestAnimationFrame(step);
      } else {
        this.zoomRaf = null;
      }
    };
    this.zoomRaf = requestAnimationFrame(step);
  }

  private drawStatic() {
    const cam = this.camera;
    const w = cam.width;
    const h = cam.height;
    const g = this.gridLayer;
    const a = this.axisLayer;
    g.clear();
    a.clear();
    destroyLayerChildren(this.labelLayer);

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
      // Axis numbering reads the VIEW coordinate: mirrored, x_view = -x_world (ADR 0008).
      if (Math.abs(x) > 1e-9) this.addLabel(fmt(cam.mirror ? -x : x), sx + 3, clamp(axisY, 2, h - 14));
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
   * collides bullets against (`detectCollision` in src/sim/collision.ts).
   * Mapped through the camera (`toScreen`), so it inherits the same
   * zoom-aware `cam.scale` as the grid/planets/guides and moves *with* the
   * coordinate plane during the pre-game→match zoom tween — not pinned to the
   * frame. Single source of truth for the rect is `boundsFromMap(map)` =
   * `effectiveBounds`.
   */
  private drawBoundary() {
    const b = this.effectiveBounds;
    const tl = this.toScreen({ x: b.minX, y: b.maxY });
    const br = this.toScreen({ x: b.maxX, y: b.minY });
    this.boundaryLayer.clear();
    this.boundaryLayer
      .rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y)
      .stroke({ width: 1.5, color: COLORS.boundary, alpha: 0.55 });
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
      base.circle(texCenter, texCenter, rPx * SS)
        .fill({ color: COLORS.planet })
        .stroke({ width: 1 * SS, color: COLORS.planetRim, alpha: 0.55 });
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
   * Reflect the view about world x=0 (ADR 0008) so a world-right team plays
   * "from the left". Every layer inherits it via the shared camera; redraws in
   * place when a world is loaded.
   */
  setMirror(enabled: boolean): void {
    if (this.camera.mirror === enabled) return;
    this.camera.mirror = enabled;
    if (this.world) {
      this.drawStatic();
      this.drawPlanets();
      this.drawField();
    }
  }

  /** Whether the view is currently mirrored (world-right team's frame). */
  get mirrored(): boolean {
    return this.camera.mirror;
  }

  /**
   * Draws every alive soldier as a dot (full brightness on the active team,
   * dimmed otherwise) plus its anchored name badge. Runs for any NvN roster
   * size, not just one red + one blue — badges track camera scale/pan because
   * they're positioned from the same `toScreen()` used for the dot itself, and
   * this whole method reruns on every resize (see the "resize" handler above).
   */
  private drawField() {
    this.drawGuides();
    const g = this.fieldLayer;
    const cam = this.camera;
    g.clear();
    destroyLayerChildren(this.badgeLayer);

    const rPx = PLAYER_RADIUS * cam.scale;

    for (const p of this.players) {
      if (!p.alive) continue;
      const color = p.team === "red" ? COLORS.red : COLORS.blue;
      const isActive = isPlayerActive(p.id, this.activePlayerId, this.noTurnMode);
      const s = this.toScreen(p.pos);

      if (isActive) {
        g.circle(s.x, s.y, rPx + 6).stroke({ width: 2.5, color, alpha: 0.35 });
      }
      g.circle(s.x, s.y, rPx).fill({ color, alpha: isActive ? 1.0 : 0.4 });
      if (isActive) {
        // Barrel points "rightward" in the viewer's own frame: the world dir,
        // flipped when the view is mirrored (ADR 0008) — everyone fires right.
        const dir = (p.team === "red" ? 1 : -1) * (cam.mirror ? -1 : 1);
        g.moveTo(s.x, s.y).lineTo(s.x + dir * BARREL_PX, s.y).stroke({ width: 3, color });
      }

      this.drawBadge(p, s, color, rPx);
    }
  }

  /**
   * Ambient, wordless "margin guide" overlay (Task S3) — spawn zone rects,
   * spawn clearance/separation rings, and the field-margin box. Drawn ONLY
   * during the pre-game/config phase (see `this.badgePhase`); cleared and
   * left empty in-match, matching `prototypes/spawn-randomizer.ts` render().
   * Rings are centered on each live player's CURRENT position, which in
   * pre-game is exactly their spawn.
   */
  private drawGuides(): void {
    const g = this.guideLayer;
    g.clear();
    if (this.badgePhase !== "pregame" || !this.arenaScatter) return;

    const cam = this.camera;
    const scatter = this.arenaScatter;
    const b = this.effectiveBounds;

    // Field-margin box — grey dashed rectangle, bounds inset by fieldMargin.
    const fm = scatter.fieldMargin;
    const marginTopLeft = this.toScreen({ x: b.minX + fm, y: b.maxY - fm });
    this.strokeDashedRect(
      g,
      marginTopLeft,
      (b.maxX - b.minX - 2 * fm) * cam.scale,
      (b.maxY - b.minY - 2 * fm) * cam.scale,
      7,
      5,
      GUIDE_COLORS.margin,
      0.3,
    );

    // Spawn zone rects — one per side, team-tinted fill + stroke (solid, no dash).
    for (const zone of spawnZoneRects(b, scatter)) {
      const topLeft = this.toScreen({ x: Math.min(zone.xLo, zone.xHi), y: zone.yHi });
      const w = Math.abs(zone.xHi - zone.xLo) * cam.scale;
      const h = (zone.yHi - zone.yLo) * cam.scale;
      const color = zone.sign < 0 ? COLORS.red : COLORS.blue;
      g.rect(topLeft.x, topLeft.y, w, h)
        .fill({ color, alpha: 0.07 })
        .stroke({ width: 1, color, alpha: 0.3 });
    }

    // Spawn clearance (team-colored) + spawn separation (whitish) rings,
    // centered on each live soldier's current (= spawn) position.
    for (const p of this.players) {
      if (!p.alive) continue;
      const center = this.toScreen(p.pos);
      const color = p.team === "red" ? COLORS.red : COLORS.blue;
      this.strokeDashedCircle(g, center, scatter.spawnClearance * cam.scale, 5, 4, color, 0.28);
      this.strokeDashedCircle(
        g,
        center,
        (scatter.spawnSeparation / 2) * cam.scale,
        1,
        4,
        GUIDE_COLORS.separation,
        0.35,
      );
    }
  }

  /** Draws a dashed circle outline onto `g` (Pixi v8 Graphics has no native line-dash support). */
  private strokeDashedCircle(
    g: Graphics,
    center: Vec2,
    r: number,
    dash: number,
    gap: number,
    color: number,
    alpha: number,
  ): void {
    if (r <= 0) return;
    for (const [start, end] of dashRanges(2 * Math.PI * r, dash, gap)) {
      const steps = Math.max(1, Math.ceil((end - start) / 3));
      for (let i = 0; i <= steps; i++) {
        const t = start + ((end - start) * i) / steps;
        const p = circlePoint(center.x, center.y, r, t);
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
    }
    g.stroke({ width: 1, color, alpha });
  }

  /** Draws a dashed rectangle outline onto `g`, top-left `topLeft`, size `w`×`h` (screen px). */
  private strokeDashedRect(
    g: Graphics,
    topLeft: Vec2,
    w: number,
    h: number,
    dash: number,
    gap: number,
    color: number,
    alpha: number,
  ): void {
    if (w <= 0 || h <= 0) return;
    for (const [start, end] of dashRanges(2 * (w + h), dash, gap)) {
      const steps = Math.max(1, Math.ceil((end - start) / 3));
      for (let i = 0; i <= steps; i++) {
        const t = start + ((end - start) * i) / steps;
        const p = rectPerimeterPoint(topLeft.x, topLeft.y, w, h, t);
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
    }
    g.stroke({ width: 1, color, alpha });
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
      // The animation owns the trail's lifetime: it must erase what it drew.
      // Online, the authoritative matchState (→ setWorld → trailLayer.clear())
      // lands at the same instant as the final animation frame, so a clear from
      // there can be re-drawn over by this loop and stick until the next shot.
      const finish = () => {
        trailLayer.clear();
        resolve();
      };

      if (result.hit.kind === "dud" || result.samples.length < 2) {
        this.flashDud(this.world.soldier.pos);
        window.setTimeout(finish, 350);
        return;
      }

      const samples = result.samples;

      // Duration stays x-based ("same time" — ADR-0002): flights are bounded no
      // matter how wiggly the function is. Shared with the server (ADR + exploit
      // fix): true curvature slows the shot down within that bound.
      const shotDurationMs = Math.max(MIN_SHOT_MS, shotDuration(result) * 1000);

      // Drive the head by cumulative ARC LENGTH, not sample index, so on-screen
      // speed is constant despite curvature-adaptive sampling (ADR-0004).
      const arcLen = cumulativeArcLength(samples);
      const totalArc = arcLen[arcLen.length - 1];

      const start = performance.now();
      const tick = () => {
        const progress = Math.min(1, (performance.now() - start) / shotDurationMs);
        const paced = bangTravelProgress(progress, BANG_DECAY_RATE, BANG_SPEED_MULTIPLIER);
        const { idx: headIdx, frac } = pointAtLength(arcLen, paced * totalArc);

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
          this.resolveImpact(result, finish);
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

/**
 * Splits a closed contour of length `totalLen` into alternating dash/gap
 * ranges `[start, end)` (arc length from the contour's origin), each no
 * longer than `dash`. Pure — extracted so the dash pattern itself is
 * unit-testable without a real Pixi Graphics/canvas (jsdom has none). Used by
 * GameRenderer.strokeDashedCircle/strokeDashedRect to fake Pixi v8's Graphics,
 * which has no native line-dash support.
 */
export function dashRanges(totalLen: number, dash: number, gap: number): Array<[number, number]> {
  if (totalLen <= 0 || dash <= 0) return [];
  const ranges: Array<[number, number]> = [];
  const period = dash + gap;
  for (let start = 0; start < totalLen; start += period) {
    ranges.push([start, Math.min(start + dash, totalLen)]);
  }
  return ranges;
}

/** Point at arc length `t` around a circle centered at (cx, cy) with radius `r`. Pure. */
export function circlePoint(cx: number, cy: number, r: number, t: number): Vec2 {
  const angle = t / r;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/**
 * Point at perimeter distance `t` around a rectangle (top-left `x`,`y`, size
 * `w`×`h`), walking clockwise from the top-left corner: right along the top
 * edge, down the right edge, left along the bottom edge, up the left edge.
 * Pure — `t` is clamped into [0, perimeter).
 */
export function rectPerimeterPoint(x: number, y: number, w: number, h: number, t: number): Vec2 {
  const perimeter = 2 * (w + h);
  let d = ((t % perimeter) + perimeter) % perimeter;
  if (d <= w) return { x: x + d, y };
  d -= w;
  if (d <= h) return { x: x + w, y: y + d };
  d -= h;
  if (d <= w) return { x: x + w - d, y: y + h };
  d -= w;
  return { x, y: y + h - d };
}
