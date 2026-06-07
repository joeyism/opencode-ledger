# OpenCode Ledger Plugin

OpenCode plugin that tracks confirmed findings and injects them to prevent re-investigation

## Installation

```bash
npm install opencode-ledger
```

## Features

- Extracts concrete factual findings from the agent's trajectory (e.g., file formats, data structures).
- Maintains a persistent ledger of confirmed facts across the session.
- Injects known facts into future prompts to prevent the agent from re-investigating the same things over and over.
- Improves long-term memory and efficiency for complex codebases.

## Usage

This is a plugin for [OpenCode](https://github.com/opencode-ai). 

You can easily enable this plugin globally by adding it to your `opencode.json` (or `opencode.jsonc`) configuration file under the `plugins` array.

```json
{
  "plugins": [
    "opencode-ledger"
  ]
}
```

Once added to your configuration, OpenCode will automatically load and activate the plugin whenever it starts.

Alternatively, if you are configuring OpenCode programmatically via the SDK, you can register it like this:

```typescript
import { configureAgent } from '@opencode-ai/sdk';
import plugin from 'opencode-ledger';

const agent = configureAgent({
  plugins: [
    plugin({
      // Provide configuration options here
    })
  ]
});
```

## License

[MIT](LICENSE)
