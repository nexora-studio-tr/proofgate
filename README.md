# ProofGate

**A change. Its evidence.** Before/after tests and bounded mutation evidence for changes written with Claude Code, Codex or your editor.

**[Alpha.3](https://github.com/nexora-studio-tr/proofgate/releases/tag/v0.1.0-alpha.3)** adds [controlled npm workspace verification](docs/WORKSPACE-EXECUTION.md): one frozen plan for up to five packages, seven before/after trials and mutation evidence that identifies the consumer test which caught a shared-code defect.

[Live demo](https://proofgate-demo.onrender.com/) · [Türkçe](README.tr.md) · [Setup](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

An agent can fix a permission check and add a test that also passes on the broken code. ProofGate runs the same selected test on both implementations, then uses StrykerJS to measure which controlled edits the tests detect. Every observation is bound to exact source, dependency, policy and image hashes.

![ProofGate change review](docs/images/workbench.png)

## What it does

- One baseline and three fresh before/after pairs in resource-limited offline Linux containers.
- A reviewed workspace profile with package selection reasons, namespaced test identities and explicit unverified members.
- Changed-source mutation scope using StrykerJS/Vitest, with a hard cap before mutation execution.
- Findings for removed mandatory tests, `skip/only/todo`, configuration changes and mutation exclusions.
- Explicit `pass`, `fail` and `inconclusive` results. Crashes, timeouts, zero tests and incomplete work cannot establish a successful fix.
- A real CLI, six-tool stdio MCP server, TR/EN review UI and downloadable reports.
- Local use without an account; optional self-hosted teams with roles, invitations, expiring project tokens and operator recovery.

Core verification needs **no model API key, paid service or cloud account**. This is an MIT-licensed alpha; a policy pass covers the recorded checks, not general correctness or security.

## Quick start

Use Node.js **24.15+ within the Node 24 line**, npm, Git and a running Docker Linux engine. Windows uses Docker Desktop in Linux-container mode.

```sh
git clone https://github.com/nexora-studio-tr/proofgate.git
cd proofgate
npm run setup
npm start
```

The setup script installs locked dependencies with lifecycle scripts disabled, builds the app/runner, creates an editable example repository and prepares its dependencies. Open the private URL in `.proofgate/launch-url`. In the UI, choose **Verify a change**, leave the base as `HEAD`, freeze the plan and run it. The bundled permissions fix should pass with seven trials and ten detected mutations.

For your own project, register the exact Git root and a reviewed policy outside the candidate tree:

```sh
node dist/apps/cli/src/index.js register /absolute/repo --policy /absolute/policy.json
node dist/apps/cli/src/index.js doctor --build --project PROJECT_ID
node dist/apps/cli/src/index.js verify --project PROJECT_ID --base BASE_COMMIT
```

Keep the local server running. CLI and MCP use the same supervisor and queue. Start with [the example policy](examples/access-control/proofgate-policy.json) and [setup instructions](docs/SETUP.md). The initial adapter pins Vitest 5.0.5 and uses a trusted standalone Node test configuration. Test names must be unique in the registered scope.

To try the workspace example alongside the default single-package example:

```sh
node dist/apps/cli/src/index.js example --workspace
node dist/apps/cli/src/index.js doctor --project PROJECT_ID
node dist/apps/cli/src/index.js verify --project PROJECT_ID --base HEAD
```

Use the ID printed by `example --workspace`. The sample selects a shared permissions package, an API consumer and a transitive audit consumer; a fourth package remains visibly unverified. [Workspace setup and policy](docs/WORKSPACE-EXECUTION.md).

## Claude Code and Codex

With the server running, generate a complete local plugin package:

```sh
node scripts/connect.mjs codex --data .proofgate
node scripts/connect.mjs claude --data .proofgate
```

The printed folder contains the shared skill, project IDs and an absolute-path MCP configuration. The generator does not edit client settings or grant permissions. Legacy and modern MCP handshakes are tested. [Plugin installation](plugins/README.md).

## Demo

[Open the public read-only demo](https://proofgate-demo.onrender.com/). The Free instance can sleep when idle; the first request may take about a minute.

```sh
node dist/apps/cli/src/index.js demo --port 4328 --data .proofgate-demo
```

The read-only demo displays **recorded real executions of the bundled synthetic projects**. Open run history to switch between single-package and workspace evidence. Visitors cannot upload code, run jobs or access team/admin data. [Single-package evidence](examples/evidence/strong.json) · [Workspace evidence and provenance](examples/evidence/WORKSPACE-PROVENANCE.md) · [Free Render deployment](docs/DEPLOY.md).

## Validation

```sh
npm run check
npm run format:check
npm run test:docker -- --all
npm run test:isolation
npm run test:integration
npm run test:workspace-execution
npm run test:browser -- --start
npm run test:team-browser
npm run release:pack
npm run test:release
```

Execution checks require Docker. Browser checks also need `npx playwright install chromium` (Linux CI uses `--with-deps`). Packaging uses an explicit source allowlist; runtime data, credentials, dependencies and sibling projects are excluded. [Validation status](docs/STATUS.md).

## Scope

Support covers a single npm package or the reviewed `npm-workspace-node-v1` profile, TypeScript/JavaScript and offline Node-mode Vitest tests. Workspaces require unchanged manifests/lock/topology, root-hoisted dependencies and at most five selected members. Source capture remains capped at 500 files, 512 KiB per file and 4 MiB total. Public npm dependencies must be integrity-pinned; install scripts are disabled. pnpm/Yarn, build scripts, arbitrary test configuration, browser/E2E adapters, private registries, SMTP, SSO/MFA and automatic fixes are outside this release. Docker shares a kernel; this is not unrestricted hostile-code hosting.

ReproPack is a separate project. No commercial Discord bot source is included.
