import { describe, it, expect } from "vitest";
import { resolveOptions } from "../src/config.js";

describe("config", () => {
  it("resolves default options", () => {
    const opts = resolveOptions();
    expect(opts.extractionIntervalSteps).toBe(15);
    expect(opts.maxFindings).toBe(50);
    expect(opts.maxFindingsPerTopic).toBe(5);
    expect(opts.injectionEnabled).toBe(true);
    expect(opts.agent).toBe("momus");
  });

  it("resolves custom options", () => {
    const opts = resolveOptions({ extractionIntervalSteps: 5, maxFindings: 20, agent: "oracle" });
    expect(opts.extractionIntervalSteps).toBe(5);
    expect(opts.maxFindings).toBe(20);
    expect(opts.agent).toBe("oracle");
  });
});