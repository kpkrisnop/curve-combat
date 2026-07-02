import { it, expect, vi } from "vitest";
import { ServerClient } from "./ServerClient";
import { encode } from "./protocol";

it("dispatches parsed server messages to type handlers", () => {
  const c = new ServerClient("ws://x");
  const got = vi.fn();
  c.on("joined", got);
  // simulate an inbound message frame
  (c as any).handleRaw(encode({ type: "joined", playerId: "p1", ownerId: "p1", token: "tok-x" }));
  expect(got).toHaveBeenCalledWith({ type: "joined", playerId: "p1", ownerId: "p1", token: "tok-x" });
});
