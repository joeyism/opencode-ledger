import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { resolveOptions } from "./config.js";
import { createState } from "./state.js";
import { createHooks } from "./hooks.js";
import type { LedgerOptions } from "./types.js";

const ledger = async (ctx: PluginInput, options?: LedgerOptions): Promise<Hooks> => {
  const resolved = resolveOptions(options);
  const state = createState(resolved);
  return createHooks(ctx, state);
};

export { ledger };
export default ledger;