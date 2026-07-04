import type { PluginState } from "./types.js";
import { getRelevantFindings, createEmptyStep } from "./state.js";
import { runExtractionBackground } from "./extract.js";

function extractKeywordsFromCommand(command: string, extensions: string[], description?: string): string[] {
  const keywords: string[] = [];
  const escaped = extensions.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const fileRegex = new RegExp(`[\\w.-]+\\.(?:${escaped.join("|")})`, "gi");
  let match;
  while ((match = fileRegex.exec(command)) !== null) {
    keywords.push(match[0]);
  }
  if (description) {
    fileRegex.lastIndex = 0;
    const descFileMatch = fileRegex.exec(description);
    if (descFileMatch) keywords.push(descFileMatch[0]);
  }
  return keywords;
}

export function createHooks(ctx: any, state: PluginState) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: any }
    ) => {
      const argsStr = JSON.stringify(output?.args || {});
      state.currentStep.actions.push(`TOOL: ${input.tool} args: ${argsStr}`);
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args?: any },
      output: { output?: string; metadata?: any }
    ) => {
      // Record output
      state.currentStep.actions.push(`OUTPUT: ${output?.output || ""}`);

      // Inject findings if relevant
      if (!state.options.injectionEnabled) return;
      if (state.findings.size === 0) return;
      if (input.tool !== "bash") return;

      const command = input.args?.command || "";
      const description = input.args?.description || "";
      const keywords = extractKeywordsFromCommand(command, state.options.injectableExtensions, description);
      if (keywords.length === 0) return;

      const relevant = getRelevantFindings(state, keywords);
      if (relevant.length === 0) return;

      // Handle finding count increase: reset injection counters
      if (state.totalFindings > state.lastInjectedFindingCount) {
        state.totalInjections = 0;
        state.firstInjectionStep = null;
        state.lastInjectedFindingCount = state.totalFindings;
      }

      state.totalInjections += 1;
      if (state.totalInjections === 1) {
        state.firstInjectionStep = state.completedSteps;
      }

      const isEscalated = state.totalInjections >= state.options.escalationInjections;
      const shouldInject = state.totalInjections === 1 || isEscalated;

      if (!shouldInject) return;

      let injection = "";
      if (isEscalated) {
        const stepsSinceFirst = state.firstInjectionStep !== null ? (state.completedSteps - state.firstInjectionStep) : 0;
        injection = "\n\n⚠️ LEDGER ESCALATION: You have been shown these facts " + 
          state.totalInjections + " times across " + stepsSinceFirst + " steps.\n" +
          "You have ALL the information you need. STOP running diagnostic commands.\n" +
          "Write your final answer NOW using the facts listed below.\n\n" +
          "📋 ESTABLISHED FACTS:\n" +
          relevant.map(f => `  - ${f.fact}`).join("\n");
      } else {
        injection = "\n\n📋 KNOWN FACTS (already established — do not re-investigate):\n" +
          relevant.map(f => `  - ${f.fact}`).join("\n");
      }

      if (typeof output.output === "string") {
        output.output += injection;
      } else {
        output.output = injection;
      }
    },

    event: async (input: { event: any }) => {
      const event = input?.event;
      if (event?.type !== "message.part.updated") return;
      const part = event.part ?? event.properties?.part;
      if (part?.type !== "step-finish") return;

      state.completedSteps += 1;
      const reasoning = part?.reasoning || "";
      state.currentStep.reasoning += reasoning;

      state.stepsBuffer.push(state.currentStep);
      state.currentStep = createEmptyStep();

      if (state.stepsBuffer.length >= state.options.extractionIntervalSteps && !state.isExtracting) {
        const copiedBuffer = [...state.stepsBuffer];
        state.stepsBuffer = [];
        runExtractionBackground(ctx, copiedBuffer, state).catch(() => {});
      }
    },
  };
}