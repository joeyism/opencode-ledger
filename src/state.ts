import { writeFileSync } from "node:fs";
import type { PluginState, ResolvedOptions, Finding, Step } from "./types.js";

export function createEmptyStep(): Step {
  return { reasoning: "", actions: [] };
}

export function createState(options: ResolvedOptions): PluginState {
  return {
    options,
    findings: new Map(),
    stepsBuffer: [],
    currentStep: createEmptyStep(),
    completedSteps: 0,
    isExtracting: false,
    totalFindings: 0,
    lastInjectedFindingCount: 0,
    firstInjectionStep: null,
    totalInjections: 0,
  };
}

export function persistFindings(state: PluginState): void {
  try {
    const allFindings = Array.from(state.findings.values()).flat();
    writeFileSync("/tmp/opencode-ledger-facts.json", JSON.stringify(allFindings, null, 2), "utf8");
  } catch (e) {
    console.warn("Ledger failed to persist findings:", e);
  }
}

export function addFinding(state: PluginState, finding: Finding): void {
  const existing = state.findings.get(finding.topic) || [];

  // Deduplicate
  if (existing.some(f => f.fact === finding.fact)) return;

  existing.push(finding);

  // Enforce per-topic limit (keep newest)
  while (existing.length > state.options.maxFindingsPerTopic) {
    existing.shift();
  }

  state.findings.set(finding.topic, existing);

  // Recount total
  let total = 0;
  for (const [, findings] of state.findings) {
    total += findings.length;
  }

  // Enforce global limit (evict oldest across all topics)
  while (total > state.options.maxFindings) {
    let oldestTopic = "";
    let oldestTime = Infinity;
    for (const [topic, findings] of state.findings) {
      if (findings.length > 0 && findings[0].establishedAt < oldestTime) {
        oldestTime = findings[0].establishedAt;
        oldestTopic = topic;
      }
    }
    if (oldestTopic) {
      const topicFindings = state.findings.get(oldestTopic)!;
      topicFindings.shift();
      if (topicFindings.length === 0) state.findings.delete(oldestTopic);
      total--;
    } else break;
  }

  state.totalFindings = total;
  persistFindings(state);
}

export function getRelevantFindings(state: PluginState, keywords: string[]): Finding[] {
  const results: Finding[] = [];
  for (const [topic, findings] of state.findings) {
    const topicLower = topic.toLowerCase();
    if (keywords.some(k => topicLower.includes(k.toLowerCase()))) {
      results.push(...findings);
    }
  }
  return results;
}
