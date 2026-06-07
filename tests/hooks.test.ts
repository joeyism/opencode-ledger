import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHooks } from "../src/hooks.js";
import { createState, addFinding } from "../src/state.js";
import { resolveOptions } from "../src/config.js";
import * as extractModule from "../src/extract.js";

describe("hooks", () => {
  let state: any;
  let hooks: any;
  let ctx: any;

  beforeEach(() => {
    state = createState(resolveOptions({ extractionIntervalSteps: 2 }));
    ctx = { worktree: "/mock", client: {} };
    hooks = createHooks(ctx, state);
  });

  afterEach(() => vi.restoreAllMocks());

  describe("tool.execute.before", () => {
    it("records tool action in current step", async () => {
      await hooks["tool.execute.before"](
        { tool: "bash", sessionID: "s", callID: "c" },
        { args: { command: "gcc gpt2.c" } }
      );
      expect(state.currentStep.actions).toContain("TOOL: bash args: {\"command\":\"gcc gpt2.c\"}");
    });
  });

  describe("tool.execute.after — injection", () => {
    it("injects relevant findings into bash output", async () => {
      addFinding(state, {
        fact: "model.ckpt has no header — raw float32 from byte 0",
        topic: "file-format:model.ckpt",
        establishedAt: Date.now(),
        sourceStep: 1,
      });

      const output = {
        output: "Magic: 1056304899\nVersion: -1090092352",
        metadata: {},
      };

      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "s", callID: "c", args: { command: "python check_header.py", description: "Check model.ckpt header" } },
        output
      );

      expect(output.output).toContain("KNOWN FACTS");
      expect(output.output).toContain("model.ckpt has no header");
      expect(state.lastInjectedFindingCount).toBe(state.totalFindings);
    });

    it("injects only once per finding set until a new finding is added", async () => {
      addFinding(state, {
        fact: "model.ckpt has no header — raw float32 from byte 0",
        topic: "file-format:model.ckpt",
        establishedAt: Date.now(),
        sourceStep: 1,
      });

      const firstOutput = { output: "first", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "s", callID: "c", args: { command: "python check_header.py", description: "Check model.ckpt header" } },
        firstOutput
      );

      expect(firstOutput.output).toContain("KNOWN FACTS");

      const secondOutput = { output: "second", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "s", callID: "c2", args: { command: "python check_header.py", description: "Check model.ckpt header" } },
        secondOutput
      );

      expect(secondOutput.output).not.toContain("KNOWN FACTS");

      addFinding(state, {
        fact: "model.ckpt is little-endian float32",
        topic: "file-format:model.ckpt",
        establishedAt: Date.now() + 1,
        sourceStep: 2,
      });

      const thirdOutput = { output: "third", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "s", callID: "c3", args: { command: "python check_header.py", description: "Check model.ckpt header" } },
        thirdOutput
      );

      expect(thirdOutput.output).toContain("KNOWN FACTS");
    });

    it("does not inject when no findings are relevant", async () => {
      addFinding(state, {
        fact: "Unrelated fact",
        topic: "unrelated:thing",
        establishedAt: Date.now(),
        sourceStep: 1,
      });

      const output = { output: "some output", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "s", callID: "c", args: { command: "ls -la" } },
        output
      );

      expect(output.output).not.toContain("KNOWN FACTS");
    });

    it("does not inject when injectionEnabled is false", async () => {
      state.options.injectionEnabled = false;
      addFinding(state, {
        fact: "Some fact",
        topic: "file-format:model.ckpt",
        establishedAt: Date.now(),
        sourceStep: 1,
      });

      const output = { output: "output", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "s", callID: "c", args: { command: "python check_model.ckpt.py" } },
        output
      );

      expect(output.output).not.toContain("KNOWN FACTS");
    });

    it("escalates the message after multiple ignored injections", async () => {
      state.options.escalationInjections = 3;
      addFinding(state, {
        fact: "File is a zip archive",
        topic: "file-format:data.dat",
        establishedAt: Date.now(),
        sourceStep: 1,
      });

      const input = { 
        tool: "bash", 
        sessionID: "s", 
        callID: "c", 
        args: { command: "python check.py", description: "Check data.dat" } 
      };

      // 1st injection: Normal
      const out1 = { output: "output 1" };
      await hooks["tool.execute.after"](input, out1);
      expect(out1.output).toContain("KNOWN FACTS");
      expect(out1.output).not.toContain("LEDGER ESCALATION");
      expect(state.totalInjections).toBe(1);

      // 2nd injection: QUIET PERIOD
      // The findings are relevant, but we already injected once.
      // totalInjections becomes 2, but no injection happens.
      const out2 = { output: "output 2" };
      await hooks["tool.execute.after"](input, out2);
      expect(out2.output).not.toContain("KNOWN FACTS");
      expect(out2.output).not.toContain("LEDGER ESCALATION");
      expect(state.totalInjections).toBe(2);

      // 3rd injection: This hits the escalation threshold (totalInjections >= 3)
      // It should bypass the quiet period and use escalated format.
      const out3 = { output: "output 3" };
      await hooks["tool.execute.after"](input, out3);
      expect(out3.output).toContain("LEDGER ESCALATION");
      expect(out3.output).toContain("You have ALL the information you need");
      expect(state.totalInjections).toBe(3);

      // 4th injection: Still escalated
      const out4 = { output: "output 4" };
      await hooks["tool.execute.after"](input, out4);
      expect(out4.output).toContain("LEDGER ESCALATION");
      expect(state.totalInjections).toBe(4);
    });

    it("resets escalation when a NEW finding is discovered", async () => {
      state.options.escalationInjections = 2;
      addFinding(state, { fact: "Fact 1", topic: "file:data.txt", establishedAt: 1, sourceStep: 1 });
      
      const input = { tool: "bash", args: { command: "cat data.txt" } };
      
      // 1st injection: Normal
      await hooks["tool.execute.after"](input, { output: "" });
      expect(state.totalInjections).toBe(1);

      // 2nd injection: Escalated (threshold is 2)
      const out2 = { output: "" };
      await hooks["tool.execute.after"](input, out2);
      expect(out2.output).toContain("LEDGER ESCALATION");
      expect(state.totalInjections).toBe(2);

      // Add a NEW finding - agent is learning!
      addFinding(state, { fact: "Fact 2", topic: "file:data.txt", establishedAt: 2, sourceStep: 2 });
      
      // 3rd injection (after new finding): Should be NORMAL again
      const out3 = { output: "" };
      await hooks["tool.execute.after"](input, out3);
      expect(out3.output).toContain("KNOWN FACTS");
      expect(out3.output).not.toContain("LEDGER ESCALATION");
      expect(state.totalInjections).toBe(1); // Counter reset
    });
  });

  describe("event — step tracking and extraction trigger", () => {
    it("triggers extraction after N steps", async () => {
      const spy = vi.spyOn(extractModule, "runExtractionBackground").mockResolvedValue();

      // Step 1
      await hooks.event({ event: { type: "message.part.updated", part: { type: "step-finish", tokens: { reasoning: 10 } } } });
      expect(spy).not.toHaveBeenCalled();

      // Step 2 — should trigger (extractionIntervalSteps = 2)
      await hooks.event({ event: { type: "message.part.updated", part: { type: "step-finish", tokens: { reasoning: 10 } } } });
      await new Promise(r => setTimeout(r, 0));
      expect(spy).toHaveBeenCalledOnce();
      expect(state.stepsBuffer).toHaveLength(0); // cleared
    });

    it("does not trigger extraction if already extracting", async () => {
      const spy = vi.spyOn(extractModule, "runExtractionBackground").mockResolvedValue();
      state.isExtracting = true;

      await hooks.event({ event: { type: "message.part.updated", part: { type: "step-finish", tokens: { reasoning: 10 } } } });
      await hooks.event({ event: { type: "message.part.updated", part: { type: "step-finish", tokens: { reasoning: 10 } } } });
      expect(spy).not.toHaveBeenCalled();
    });

    it("ignores non-step-finish events", async () => {
      await hooks.event({ event: { type: "session.status", properties: {} } });
      expect(state.completedSteps).toBe(0);
    });
  });
});
