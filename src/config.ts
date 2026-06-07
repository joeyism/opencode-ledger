import type { LedgerOptions, ResolvedOptions } from "./types.js";

export function resolveOptions(options?: LedgerOptions): ResolvedOptions {
  return {
    extractionIntervalSteps: options?.extractionIntervalSteps ?? 15,
    maxFindings: options?.maxFindings ?? 50,
    maxFindingsPerTopic: options?.maxFindingsPerTopic ?? 5,
    injectionEnabled: options?.injectionEnabled ?? true,
    agent: options?.agent ?? "momus",
    escalationInjections: options?.escalationInjections ?? 4,
  };
}