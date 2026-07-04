# OpenCode Ledger Plugin

A plugin for [OpenCode](https://github.com/opencode-ai) that gives coding agents a short-term memory for confirmed facts — so they stop re-investigating things they already figured out.

## The Problem

When an agent investigates something complex — like reverse-engineering a binary model file — it discovers facts through probing: "the file has no header," "weights are little-endian float32," "token 46107 decodes to ' Damien'." Over a long session, the agent forgets. It re-runs `hexdump`, re-parses the tokenizer, re-checks the byte order. Tokens and time burned re-deriving what it already knew.

The ledger fixes this. It watches the agent work, distills confirmed facts from tool outputs, stores them, and re-injects them when the agent is about to re-investigate the same thing. If the agent keeps ignoring the facts, the ledger escalates.

## Who Is This For?

This plugin is built for **ML model reverse-engineering and binary format archaeology** — long, probe-heavy investigations where facts accumulate slowly through many small observations:

- Figuring out an unknown `.ckpt`, `.safetensors`, `.bin`, or `.npy` file format
- Decoding tokenizers one token at a time (`.bpe` vocab files)
- Mapping weight layouts in checkpoint files
- Debugging segfaults that require accumulating observations across many runs

If your investigation involves running dozens of diagnostic commands and slowly building a picture of how something works, this plugin is for you.

## How It Works

The plugin operates in four layers:

### 1. Observation

Three hooks attach to the agent's lifecycle:

- **`tool.execute.before`** — records the tool name and arguments into the current step buffer
- **`tool.execute.after`** — records the tool output, then checks whether any known facts should be injected
- **`event`** — listens for step-finish events. Each step-finish closes the current step, pushes it to a buffer, and increments the step counter.

### 2. Distillation

Every `extractionIntervalSteps` completed steps (default: 15), the plugin:

1. Copies the step buffer and clears it
2. Spawns a **separate OpenCode session** (titled "ledger-extraction") using the configured extraction agent (default: `momus`)
3. Sends the recent trajectory to that agent with a strict system prompt demanding a JSON array of findings or `[]`
4. Parses the response and adds each finding to the ledger
5. **Deletes the extraction session** — cleanup is mandatory, even on failure

The extraction prompt explicitly instructs the agent to extract from **tool outputs, not the agent's reasoning**. The reasoning "may be wrong" — only observed evidence is trusted. This is what keeps the ledger from accumulating hallucinations.

Extraction is **fire-and-forget** — it runs in the background and doesn't block the agent. A soft lock (`isExtracting`) prevents concurrent extractions.

### 3. Storage

Findings are stored in-memory as `Map<topic, Finding[]>`. Each finding records:

- **`fact`** — the confirmed observation (e.g., "model.ckpt has no header — raw float32 from byte 0")
- **`topic`** — a colon-separated category (e.g., "file-format:model.ckpt")
- **`establishedAt`** — timestamp

Storage rules:

- **Deduplication**: exact-string match on `fact` — duplicates are silently dropped
- **Per-topic cap** (`maxFindingsPerTopic`, default: 5): keeps the newest findings, evicts the oldest in that topic
- **Global cap** (`maxFindings`, default: 50): evicts the single oldest finding across all topics (global LRU)
- **Crash dump**: the full ledger is written to `/tmp/opencode-ledger-facts.json` on every addition. This is **write-only** — it's for inspection and debugging, not reload. The ledger is **session-scoped**: restart OpenCode and the in-memory ledger is gone.

### 4. Re-injection and Escalation

On every `tool.execute.after` for the **`bash` tool**, the plugin:

1. Extracts **filenames** from the command and description using a configurable extension list (default: ML-focused — `.ckpt`, `.safetensors`, `.bpe`, etc.)
2. Finds findings whose topic contains any of those filenames (case-insensitive substring match)
3. If new findings have been discovered since the last injection → **resets the escalation counters** (the agent is learning, not stuck)
4. Increments the injection counter
5. **Injects only on the first match, then goes quiet** — there's a deliberate quiet period to avoid spamming every command
6. At the escalation threshold (`escalationInjections`, default: 4), the message switches from a gentle reminder to a hard stop:

> **First injection (gentle):**
> ```
> 📋 KNOWN FACTS (already established — do not re-investigate):
>   - model.ckpt has no header — raw float32 from byte 0
>   - model.ckpt is little-endian float32
> ```

> **After 4 ignored injections (escalated):**
> ```
> ⚠️ LEDGER ESCALATION: You have been shown these facts 4 times across 12 steps.
> You have ALL the information you need. STOP running diagnostic commands.
> Write your final answer NOW using the facts listed below.
> ```

The escalation reset on new findings is the key design insight: it distinguishes "stuck in a loop" (escalate) from "actively learning" (reset and stay gentle).

## Configuration

All options are passed to the plugin function:

```typescript
import { ledger } from "opencode-ledger";

const hooks = await ledger(ctx, {
  extractionIntervalSteps: 15,
  maxFindings: 50,
  maxFindingsPerTopic: 5,
  injectionEnabled: true,
  agent: "momus",
  escalationInjections: 4,
  injectableExtensions: ["ckpt", "bin", "bpe", "json", "safetensors", "npy", "pt", "pth", "csv", "txt", "dat"],
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `extractionIntervalSteps` | `number` | `15` | How many completed steps before extraction runs. Lower = fresher facts but more LLM calls. |
| `maxFindings` | `number` | `50` | Global cap on stored findings. When hit, the oldest finding across all topics is evicted. |
| `maxFindingsPerTopic` | `number` | `5` | Per-topic cap. Prevents one file from dominating the ledger. Keeps newest. |
| `injectionEnabled` | `boolean` | `true` | Whether to inject findings into bash outputs. Set to `false` to use the ledger as an audit-only artifact. |
| `agent` | `string` | `"momus"` | Which OpenCode agent runs extraction. Use a cheaper agent to cut cost, or a stronger one for harder investigations. |
| `escalationInjections` | `number` | `4` | How many ignored injections before the plugin switches to the hard-stop escalation message. Set to `Infinity` to disable escalation entirely (always use the gentle reminder). |
| `injectableExtensions` | `string[]` | `["ckpt", "bin", "bpe", "json", "safetensors", "npy", "pt", "pth", "csv", "txt", "dat"]` | File extensions that trigger injection. When the agent runs a bash command touching a file with one of these extensions, the plugin checks for relevant findings. **Customize this for your domain** — add `.parquet`, `.h5`, `.onnx`, `.wasm`, etc. as needed. |

### Disabling Escalation

If you want extraction and gentle injection but not the hard-stop "STOP running commands" message, set `escalationInjections` to `Infinity`:

```typescript
const hooks = await ledger(ctx, {
  escalationInjections: Infinity, // always gentle, never escalate
});
```

### Customizing Extensions for Non-ML Domains

The default extension list is ML-focused. If you're working in a different domain, customize it:

```typescript
// Data engineering
const hooks = await ledger(ctx, {
  injectableExtensions: ["parquet", "avro", "orc", "csv", "json", "arrow"],
});

// WebAssembly / binary analysis
const hooks = await ledger(ctx, {
  injectableExtensions: ["wasm", "so", "dylib", "dll", "bin"],
});
```

## Behavioral Details and Limitations

These are things that aren't configurable but affect behavior. If you're evaluating this plugin for production use, read this section carefully:

- **Bash-only injection**: findings are only injected into `bash` tool outputs. Other tools (`read`, `edit`, `grep`, `write`) do not trigger injection.
- **Substring topic matching**: relevance is determined by checking if any extracted filename appears as a case-insensitive substring of a finding's topic. This is fast but imprecise — a file named `model.json` would match a topic about `model.json` even if the finding is unrelated.
- **Exact-string deduplication**: paraphrased duplicates slip through. "File has no header" and "No header in file" are stored as two separate findings.
- **Session-scoped memory**: the ledger lives in memory for the duration of the OpenCode session. There is no cross-session reload. Restart OpenCode = lose all findings.
- **Extra LLM cost**: each extraction run spawns a separate OpenCode session and makes an LLM call. At the default interval of 15 steps, a 150-step investigation triggers ~10 extraction calls.
- **Tool output modification**: the plugin appends text to bash tool outputs in-flight. This is the core mechanism — the agent can't act on facts it can't see. But it means the agent's perceived reality is being edited.
- **Persistence path**: the crash dump is written to `/tmp/opencode-ledger-facts.json` (hardcoded, not configurable). This directory must be writable.

## Use Cases

### Binary Model Format Archaeology

You have a `.ckpt` file from an unknown framework. The agent needs to figure out: header format, data type, endianness, layer ordering, tokenizer encoding. Each probe reveals one fact. Over 50+ steps, the agent accumulates a picture. Without the ledger, it re-hexdumps the file at step 40. With it, the facts are injected and it moves on.

### Tokenizer Decoding

You're reverse-engineering a `.bpe` vocabulary file. Each `python decode_token.py 46107` call reveals one token mapping. The ledger stores each decoded token as a fact. When the agent needs to decode a sequence, the known tokens are already in the ledger.

### Weight Layout Mapping

You're trying to load weights from a `.safetensors` or `.pt` file into a different framework. The agent probes the file, discovers the layer naming convention, the tensor shapes, the dtype. These facts build up. When the agent writes the conversion script, the facts are injected so it doesn't re-probe.

### Segfault Root-Causing

A crash only happens under specific conditions. Each probe narrows the cause: "crashes when attention mask has odd length," "crashes when batch > 4," "crash is in layer 7's attention." The ledger accumulates these partial findings. The escalation mechanism kicks in if the agent keeps re-running the same crash repro without synthesizing what it already knows.

## Installation

```bash
npm install opencode-ledger
```

Add to your `opencode.json` (or `opencode.jsonc`):

```json
{
  "plugins": [
    "opencode-ledger"
  ]
}
```

Or configure programmatically via the SDK:

```typescript
import { ledger } from "opencode-ledger";

const hooks = await ledger(ctx, {
  // optional configuration — see Configuration section above
});
```

## License

[MIT](LICENSE)