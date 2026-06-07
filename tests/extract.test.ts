import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildExtractionPrompt, parseExtractionResult, runExtractionBackground } from "../src/extract.js";
import { createState } from "../src/state.js";
import { resolveOptions } from "../src/config.js";

describe("buildExtractionPrompt", () => {
  it("includes step trajectory in prompt", () => {
    const state = createState(resolveOptions());
    state.completedSteps = 10;
    const prompt = buildExtractionPrompt([
      { reasoning: "Confirmed file has no header", actions: ["TOOL: bash args: ...", "OUTPUT: First 8 floats: (0.48, -0.52, ...)"] }
    ], state);
    expect(prompt).toContain("Confirmed file has no header");
    expect(prompt).toContain("First 8 floats");
  });
});

describe("parseExtractionResult", () => {
  it("parses valid JSON array of findings", () => {
    const result = parseExtractionResult(JSON.stringify([
      { fact: "File has no header", topic: "file-format:model.ckpt" },
      { fact: "Weights are float32", topic: "file-format:model.ckpt" }
    ]));
    expect(result).toHaveLength(2);
    expect(result![0].fact).toBe("File has no header");
  });

  it("handles json wrapped in markdown fences", () => {
    const result = parseExtractionResult("```json\n" + JSON.stringify([
      { fact: "No header", topic: "file:model.ckpt" }
    ]) + "\n```");
    expect(result).toHaveLength(1);
  });

  it("returns null for invalid JSON", () => {
    expect(parseExtractionResult("not json")).toBeNull();
  });

  it("returns null for non-array JSON", () => {
    expect(parseExtractionResult(JSON.stringify({ fact: "test" }))).toBeNull();
  });

  it("filters out findings missing required fields", () => {
    const result = parseExtractionResult(JSON.stringify([
      { fact: "Good finding", topic: "good:topic" },
      { fact: "Missing topic" },
      { topic: "missing:fact" },
    ]));
    expect(result).toHaveLength(1);
    expect(result![0].fact).toBe("Good finding");
  });
});

describe("runExtractionBackground", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("adds extracted findings to state", async () => {
    const mockCtx = {
      client: {
        session: {
          create: vi.fn().mockResolvedValue({ data: { id: "s1" } }),
          prompt: vi.fn().mockResolvedValue({
            data: { parts: [{ type: "text", text: JSON.stringify([
              { fact: "No header in checkpoint", topic: "file-format:model.ckpt" }
            ])}]}
          }),
          delete: vi.fn().mockResolvedValue({}),
        }
      }
    };
    const state = createState(resolveOptions());
    await runExtractionBackground(mockCtx as any, [{ reasoning: "test", actions: [] }], state);

    expect(state.findings.get("file-format:model.ckpt")).toHaveLength(1);
    expect(state.isExtracting).toBe(false);
  });

  it("handles extraction failure gracefully", async () => {
    const mockCtx = {
      client: {
        session: {
          create: vi.fn().mockRejectedValue(new Error("fail")),
          delete: vi.fn().mockResolvedValue({}),
        }
      }
    };
    const state = createState(resolveOptions());
    await runExtractionBackground(mockCtx as any, [], state);
    expect(state.findings.size).toBe(0);
    expect(state.isExtracting).toBe(false);
  });

  it("cleans up session after extraction", async () => {
    const mockCtx = {
      client: {
        session: {
          create: vi.fn().mockResolvedValue({ data: { id: "s1" } }),
          prompt: vi.fn().mockResolvedValue({ data: { parts: [{ type: "text", text: "[]" }] } }),
          delete: vi.fn().mockResolvedValue({}),
        }
      }
    };
    const state = createState(resolveOptions());
    await runExtractionBackground(mockCtx as any, [], state);
    expect(mockCtx.client.session.delete).toHaveBeenCalledWith({ path: { id: "s1" } });
  });
});