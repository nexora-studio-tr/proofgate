# Local plugin packages

Generate a complete package wired to this installation, without changing either client's global settings:

```sh
node scripts/connect.mjs codex --data .proofgate
node scripts/connect.mjs claude --data .proofgate
```

Run the local ProofGate server first. Generated packages live under the selected private data directory, contain the shared skill and an MCP configuration with absolute executable/data paths, and include registered project IDs. Keep these local generated packages out of public source archives.

Codex output uses a portable `plugin.json` and `mcp.json`. Claude Code output uses `.claude-plugin/plugin.json` and `.mcp.json`. Add the resulting folder using the client's supported local plugin installation flow. The generator never grants permissions or edits the host's configuration for you. Both packages use the same six-tool stdio server, with no lifecycle hooks and no extra model key.

A source clone and its built CLI must remain at their configured location. Regenerate to a new `--out` directory after moving the installation. Directory publication and approval are separate from these local packages.
