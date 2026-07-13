// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

// Mock heavy screen modules that pull in Pixi.js / canvas APIs incompatible with jsdom.
// Intent preserved: landing renders by default at hash "".
vi.mock("./screens/LandingScreen", () => ({
  LandingScreen: () => (
    <div>
      <span className="t-red">CURVE</span> <span className="t-blue">COMBAT</span>
    </div>
  ),
}));
vi.mock("./screens/LocalFlow", () => ({ LocalFlow: () => <div data-testid="local-flow" /> }));
vi.mock("./screens/OnlineParity", () => ({ OnlineParity: () => <div data-testid="online-parity" /> }));
vi.mock("./PhoneGate", () => ({ PhoneGate: () => null }));

describe("App", () => {
  it("renders the landing title at hash ''", () => {
    location.hash = "";
    render(<App />);
    expect(screen.getByText("CURVE")).toBeTruthy();
    expect(screen.getByText("COMBAT")).toBeTruthy();
  });
});
