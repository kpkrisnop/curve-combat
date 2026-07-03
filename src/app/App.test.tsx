// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the landing title", () => {
    location.hash = "";
    render(<App />);
    expect(screen.getByText("GRAPH")).toBeTruthy();
    expect(screen.getByText("WAR")).toBeTruthy();
  });
});
