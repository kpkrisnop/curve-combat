/**
 * Maps between world coordinates (the math plane) and screen pixels.
 * This transform is deliberately self-contained: the game's render layer will
 * reuse it unchanged for the world <-> screen mapping.
 */
export class Camera {
  /** World coordinate currently at the centre of the viewport. */
  centerX = 0;
  centerY = 0;
  /** Pixels per world unit. */
  scale = 48;

  /**
   * Reflect the world about x=0 on the way to the screen, so a world-right team
   * plays "from the left" (ADR 0008). Presentation only — world coordinates are
   * unchanged; every layer that maps through this camera mirrors together.
   */
  mirror = false;

  constructor(public width: number, public height: number) {}

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  worldToScreenX(wx: number): number {
    const x = this.mirror ? -wx : wx;
    return this.width / 2 + (x - this.centerX) * this.scale;
  }

  worldToScreenY(wy: number): number {
    return this.height / 2 - (wy - this.centerY) * this.scale;
  }

  screenToWorldX(sx: number): number {
    const wx = this.centerX + (sx - this.width / 2) / this.scale;
    return this.mirror ? -wx : wx;
  }

  screenToWorldY(sy: number): number {
    return this.centerY - (sy - this.height / 2) / this.scale;
  }

  /** Pan by a pixel delta (e.g. from a pointer drag). */
  panByPixels(dx: number, dy: number) {
    this.centerX -= dx / this.scale;
    this.centerY += dy / this.scale;
  }

  /** Zoom around a screen point, keeping the world point under it fixed. */
  zoomAt(sx: number, sy: number, factor: number) {
    const wx = this.screenToWorldX(sx);
    const wy = this.screenToWorldY(sy);
    this.scale = Math.min(Math.max(this.scale * factor, 4), 6000);
    this.centerX = wx - (sx - this.width / 2) / this.scale;
    this.centerY = wy + (sy - this.height / 2) / this.scale;
  }
}
