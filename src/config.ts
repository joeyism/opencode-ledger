import type { LedgerOptions, ResolvedOptions } from "./types.js";

const DEFAULT_EXTENSIONS = ["ckpt", "bin", "bpe", "json", "safetensors", "npy", "pt", "pth", "csv", "txt", "dat"];

export function resolveOptions(options?: LedgerOptions): ResolvedOptions {
  return {
    extractionIntervalSteps: options?.extractionIntervalSteps ?? 15,
    maxFindings: options?.maxFindings ?? 50,
    maxFindingsPerTopic: options?.maxFindingsPerTopic ?? 5,
    injectionEnabled: options?.injectionEnabled ?? true,
    agent: options?.agent ?? "momus",
    escalationInjections: options?.escalationInjections ?? 4,
    injectableExtensions: options?.injectableExtensions ?? DEFAULT_EXTENSIONS,
  };
}