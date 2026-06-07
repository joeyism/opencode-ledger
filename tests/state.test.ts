import { describe, it, expect } from "vitest";
import { createState, addFinding, getRelevantFindings, createEmptyStep } from "../src/state.js";
import { resolveOptions } from "../src/config.js";

describe("state", () => {
  it("creates initial state", () => {
    const state = createState(resolveOptions());
    expect(state.findings.size).toBe(0);
    expect(state.completedSteps).toBe(0);
    expect(state.isExtracting).toBe(false);
    expect(state.totalFindings).toBe(0);
  });

  it("creates empty step", () => {
    const step = createEmptyStep();
    expect(step.reasoning).toBe("");
    expect(step.actions).toEqual([]);
  });
});

describe("addFinding", () => {
  it("adds a finding under a topic", () => {
    const state = createState(resolveOptions());
    addFinding(state, { fact: "File has no header", topic: "file-format:model.ckpt", establishedAt: Date.now(), sourceStep: 5 });
    expect(state.findings.get("file-format:model.ckpt")).toHaveLength(1);
    expect(state.totalFindings).toBe(1);
  });

  it("respects maxFindingsPerTopic", () => {
    const state = createState(resolveOptions({ maxFindingsPerTopic: 2 }));
    addFinding(state, { fact: "Fact 1", topic: "t", establishedAt: 1, sourceStep: 1 });
    addFinding(state, { fact: "Fact 2", topic: "t", establishedAt: 2, sourceStep: 2 });
    addFinding(state, { fact: "Fact 3", topic: "t", establishedAt: 3, sourceStep: 3 });
    expect(state.findings.get("t")).toHaveLength(2);
    // Should keep the newest
    expect(state.findings.get("t")![0].fact).toBe("Fact 2");
    expect(state.findings.get("t")![1].fact).toBe("Fact 3");
  });

  it("respects maxFindings globally", () => {
    const state = createState(resolveOptions({ maxFindings: 3, maxFindingsPerTopic: 10 }));
    addFinding(state, { fact: "A", topic: "t1", establishedAt: 1, sourceStep: 1 });
    addFinding(state, { fact: "B", topic: "t2", establishedAt: 2, sourceStep: 2 });
    addFinding(state, { fact: "C", topic: "t3", establishedAt: 3, sourceStep: 3 });
    addFinding(state, { fact: "D", topic: "t4", establishedAt: 4, sourceStep: 4 });
    expect(state.totalFindings).toBe(3);
  });

  it("deduplicates findings with the same fact text", () => {
    const state = createState(resolveOptions());
    addFinding(state, { fact: "No header", topic: "t", establishedAt: 1, sourceStep: 1 });
    addFinding(state, { fact: "No header", topic: "t", establishedAt: 2, sourceStep: 2 });
    expect(state.findings.get("t")).toHaveLength(1);
    expect(state.totalFindings).toBe(1);
  });
});

describe("getRelevantFindings", () => {
  it("returns findings matching a topic keyword", () => {
    const state = createState(resolveOptions());
    addFinding(state, { fact: "No header", topic: "file-format:model.ckpt", establishedAt: 1, sourceStep: 1 });
    addFinding(state, { fact: "Uses BPE", topic: "tokenizer:vocab.bpe", establishedAt: 2, sourceStep: 2 });

    const results = getRelevantFindings(state, ["model.ckpt"]);
    expect(results).toHaveLength(1);
    expect(results[0].fact).toBe("No header");
  });

  it("returns empty array when no topics match", () => {
    const state = createState(resolveOptions());
    addFinding(state, { fact: "Unrelated", topic: "other:stuff", establishedAt: 1, sourceStep: 1 });
    expect(getRelevantFindings(state, ["model.ckpt"])).toHaveLength(0);
  });

  it("matches partial topic strings", () => {
    const state = createState(resolveOptions());
    addFinding(state, { fact: "Weight order is HF", topic: "weights:gpt2-124M.ckpt:layout", establishedAt: 1, sourceStep: 1 });
    const results = getRelevantFindings(state, ["gpt2-124M.ckpt"]);
    expect(results).toHaveLength(1);
  });
});