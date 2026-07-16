import { describe, it, expect } from "vitest";
import { Camera } from "./Camera";

describe("Camera mirror (ADR 0008)", () => {
  it("reflects world x about 0 when mirrored, leaving y and center untouched", () => {
    const cam = new Camera(800, 600);
    cam.scale = 50;
    const unmirroredRight = cam.worldToScreenX(3);
    const unmirroredLeft = cam.worldToScreenX(-3);

    cam.mirror = true;
    // world +3 now lands where world -3 did, and vice versa (reflection about x=0)
    expect(cam.worldToScreenX(3)).toBeCloseTo(unmirroredLeft, 9);
    expect(cam.worldToScreenX(-3)).toBeCloseTo(unmirroredRight, 9);
    // x=0 stays put on screen
    expect(cam.worldToScreenX(0)).toBeCloseTo(400, 9);
  });

  it("round-trips screen<->world under the mirror", () => {
    const cam = new Camera(800, 600);
    cam.scale = 40;
    cam.mirror = true;
    for (const wx of [-5, -1.2, 0, 2.7, 6]) {
      expect(cam.screenToWorldX(cam.worldToScreenX(wx))).toBeCloseTo(wx, 9);
    }
  });
});
