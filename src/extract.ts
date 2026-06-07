import type { PluginState, Step, Finding } from "./types.js";
import { addFinding } from "./state.js";

export function buildExtractionPrompt(steps: Step[], state: PluginState): string {
  const trajectory = steps
    .map((s, i) => `Step ${i + 1}:\nThoughts: ${s.reasoning}\nActions:\n${s.actions.join("\n")}`)
    .join("\n\n");

  const existingFindings = Array.from(state.findings.values()).flat().map(f => `- [${f.topic}] ${f.fact}`).join("\n");

  return `You are observing a coding agent's recent work. Extract any CONFIRMED FACTUAL FINDINGS from the tool outputs (not the agent's reasoning — it may be wrong).

A finding is a concrete, verifiable fact that the agent has established through observation:
- File format discoveries (e.g., "model.ckpt starts with raw float32 values, no header")
- Confirmed data structures (e.g., "weights are in HuggingFace per-layer order")
- Verified behaviors (e.g., "token 46107 decodes to ' Damien'")
- Error root causes (e.g., "segfault caused by off-by-one in attention mask")

DO NOT extract:
- Hypotheses or plans
- Things the agent said it would try
- Anything not backed by tool output evidence

${existingFindings ? `Already known findings (do not duplicate):\n${existingFindings}\n` : ""}

Recent trajectory:
${trajectory}`;
}

export function parseExtractionResult(text: string): Array<{ fact: string; topic: string }> | null {
  try {
    let clean = text.trim();
    if (clean.startsWith("```json")) clean = clean.slice(7);
    else if (clean.startsWith("```")) clean = clean.slice(3);
    if (clean.endsWith("```")) clean = clean.slice(0, -3);

    const parsed = JSON.parse(clean.trim());
    if (!Array.isArray(parsed)) return null;

    return parsed.filter(
      (item: any) => typeof item.fact === "string" && typeof item.topic === "string"
    );
  } catch {
    return null;
  }
}

export async function runExtractionBackground(ctx: any, steps: Step[], state: PluginState): Promise<void> {
  state.isExtracting = true;
  let sessionID: string | null = null;
  try {
    const promptText = buildExtractionPrompt(steps, state);

    const sessionRes = await ctx.client.session.create({ body: { title: "ledger-extraction" } });
    if (!sessionRes.data?.id) throw new Error("Failed to create extraction session");
    sessionID = sessionRes.data.id;

    const systemPrompt = `You extract factual findings from a coding agent's trajectory. Respond ONLY with a JSON array: [{ "fact": string, "topic": string }].

The "topic" should be a colon-separated category like "file-format:filename", "weights:filename:layout", "tokenizer:vocab.bpe", "error:component".

Return [] if no confirmed findings exist. No other text.`;

    const promptRes = await ctx.client.session.prompt({
      path: { id: sessionID },
      body: {
        agent: state.options.agent,
        system: systemPrompt,
        tools: {},
        parts: [{ type: "text", text: promptText }],
      },
    });

    if (!promptRes.data) throw new Error("No response from extraction");

    const responseText = (promptRes.data.parts || [])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || "")
      .join("\n")
      .trim();

    const findings = parseExtractionResult(responseText);
    if (findings) {
      for (const f of findings) {
        addFinding(state, {
          fact: f.fact,
          topic: f.topic,
          establishedAt: Date.now(),
          sourceStep: state.completedSteps,
        });
      }
    }
  } catch (e) {
    console.error("Ledger extraction failed:", e);
  } finally {
    if (sessionID) {
      try {
        await ctx.client.session.delete({ path: { id: sessionID } });
      } catch (e) {
        console.warn("Ledger failed to delete extraction session:", e);
      }
    }
    state.isExtracting = false;
  }
}