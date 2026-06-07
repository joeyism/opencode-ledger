import { describe, it, expect } from "vitest";
import ledger from "../src/index.js";

describe("index", () => {
  it("creates hooks successfully", async () => {
    const hooks = await ledger({} as any);
    expect(hooks).toBeDefined();
    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(hooks["tool.execute.after"]).toBeDefined();
    expect(hooks.event).toBeDefined();
  });
});