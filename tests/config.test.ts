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
    expect(opts.escalationInjections).toBe(4);
    expect(opts.injectableExtensions).toEqual(["ckpt", "bin", "bpe", "json", "safetensors", "npy", "pt", "pth", "csv", "txt", "dat"]);
  });

  it("resolves custom options", () => {
    const opts = resolveOptions({ extractionIntervalSteps: 5, maxFindings: 20, agent: "oracle" });
    expect(opts.extractionIntervalSteps).toBe(5);
    expect(opts.maxFindings).toBe(20);
    expect(opts.agent).toBe("oracle");
  });

  it("resolves custom injectableExtensions", () => {
    const opts = resolveOptions({ injectableExtensions: ["parquet", "h5", "onnx"] });
    expect(opts.injectableExtensions).toEqual(["parquet", "h5", "onnx"]);
  });
});