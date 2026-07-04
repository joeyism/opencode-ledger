export interface LedgerOptions {
  extractionIntervalSteps?: number; // How often to run LLM extraction (default: 15)
  maxFindings?: number;             // Max total findings to store (default: 50)
  maxFindingsPerTopic?: number;     // Max findings per topic (default: 5)
  injectionEnabled?: boolean;       // Whether to inject findings into outputs (default: true)
  agent?: string;                   // Agent to use for extraction (default: "momus")
  escalationInjections?: number;    // After how many injections to escalate (default: 4)
  injectableExtensions?: string[];  // File extensions that trigger injection (default: ML-focused set)
}

export interface ResolvedOptions {
  extractionIntervalSteps: number;
  maxFindings: number;
  maxFindingsPerTopic: number;
  injectionEnabled: boolean;
  agent: string;
  escalationInjections: number;
  injectableExtensions: string[];
}

export interface Finding {
  fact: string;
  topic: string;
  establishedAt: number;
  sourceStep: number;
}

export interface Step {
  reasoning: string;
  actions: string[];
}

export interface PluginState {
  options: ResolvedOptions;
  findings: Map<string, Finding[]>;
  stepsBuffer: Step[];
  currentStep: Step;
  completedSteps: number;
  isExtracting: boolean;
  totalFindings: number;
  lastInjectedFindingCount: number;
  firstInjectionStep: number | null;    // step when facts were first injected
  totalInjections: number;              // how many times KNOWN FACTS have been appended
}

export interface PluginContext {
  worktree: string;
  client: any;
}
