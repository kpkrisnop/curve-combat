// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { SpacetimeBackground } from "./SpacetimeBackground";

describe("SpacetimeBackground", () => {
  it("mounts a canvas and starts an animation frame", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    // vmThreads jsdom does not define matchMedia — define before spying
    if (!window.matchMedia) {
      Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({}) });
    }
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    // jsdom has no 2d context — stub it
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      set strokeStyle(_v: unknown) {}, set fillStyle(_v: unknown) {},
      set lineWidth(_v: unknown) {}, set globalAlpha(_v: unknown) {},
    } as unknown as CanvasRenderingContext2D);
    const { container, unmount } = render(<SpacetimeBackground />);
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(raf).toHaveBeenCalled();
    unmount(); // must not throw (cancels rAF)
  });
});
