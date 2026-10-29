# Controlled npm workspace verification

[Türkçe](WORKSPACE-EXECUTION.tr.md) · [Design](WORKSPACE-EXECUTION-RFC.md) · [Validation](STATUS.md)

Alpha.3 verifies implementation/test changes across a small npm monorepo. One source-bound plan selects every affected member and its transitive consumers. Seven trial containers cover the entire selection; mutation and time budgets are shared across the job.

## Try the bundled project

Run the normal [setup](SETUP.md) and keep the local server running. Then:

```sh
node dist/apps/cli/src/index.js example --workspace
node dist/apps/cli/src/index.js doctor --project PROJECT_ID
node dist/apps/cli/src/index.js verify --project PROJECT_ID --base HEAD
```

Replace `PROJECT_ID` with the ID from the first command. `doctor` needs a running Docker Linux engine and network access for reviewed public dependencies. It installs from the captured lockfile with lifecycle scripts disabled. Later test containers are offline.

The original permissions function wrongly permits editing locked resources. The candidate fixes it in `packages/access`; an added `apps/api` test fails on the original and passes on the fix. The policy also requires a transitive consumer, `apps/audit`. `packages/unrelated` is captured but explicitly unverified. A mutation in the shared function is detected by the consumer's regression test inside Stryker's own copied sandbox.

## Register your own policy

Review [the v2 example](../examples/workspace-access/proofgate-policy.json), copy/adapt it outside the candidate repository, then register it:

```sh
node dist/apps/cli/src/index.js register /absolute/git-root --policy /absolute/workspace-policy.json
node dist/apps/cli/src/index.js doctor --project PROJECT_ID
```

Policies are operator-controlled. Execution requests cannot replace them. Each test ID is `member-path::repository-relative-file::full-test-name`. Duplicate names in different members are distinct. Every selected member needs baseline and required tests. The one regression ID must appear in `requiredTests` and fail on the original with the approved assertion message. A missing identity, setup/import crash, skipped test or unstable result cannot establish a pass.

- `schemaVersion: 2`, `profile: npm-workspace-node-v1`.
- Up to five selected members, 30 standalone test files and 200 required identities in total.
- Exactly one B trial and three fresh C/H pairs. C transfers only registered test files onto the original implementation.
- Up to 25 selected mutants for the entire job, 120 seconds per stage and 600 seconds total. Mutation omissions remain visible; a cap is not a complete pass.
- Every changed file must be declared as a test or production file. All affected consumers must be selected; manually shrinking that closure is rejected.

The plan identity binds both snapshots, policy, manifests/lock, graph/reason chains, selection, link map, tool/runtime versions, immutable images and budgets. Source, policy or image changes invalidate a saved plan before enqueueing and execution. The exact observed npm version is recorded in evidence; its installation is bound by the immutable image.

## Supported boundary

Node 24, npm lockfile v3, pinned Vitest 5.0.5 and Stryker 10.1.1. Use array-form workspaces and source exports that Node-mode tests can consume without a build. Local member versions must be `X.Y.Z`; internal references must be that exact version or `*`. npm-generated local lock links must match captured names/paths. External dependencies require root-hoisted, integrity-pinned public npm packages.

Manifest/lock/topology/configuration changes, added/deleted/renamed members, dependency cycles, incomplete graphs, shared-root edits, arbitrary local links, nested external dependency trees and `workspace:` protocol references block this profile. The read-only inspector accepts a broader set of manifests; its `complete` result is not execution eligibility. pnpm/Yarn, project lifecycle/build scripts, browser tests and private registries are unsupported.

The manifest graph is conservative metadata, not proof of complete runtime coupling. Review the policy's test and production scope. No general correctness, security or hostile-code isolation certificate is issued.

## Read the result

The CLI JSON/HTML export, MCP and TR/EN UI expose the same v2 evidence identity. The UI shows why each member was selected, candidate test discovery, package outcome and unverified members. A package with all H tests green still cannot pass a shared gate with a surviving mutation, weak regression or incomplete work. A directly failed package is `fail`; other packages in an incomplete/failed shared gate remain `inconclusive`.

MCP still has six tools. `get_verification` includes `planHash` and workspace results. `get_evidence` accepts paginated `workspace` and `links` sections alongside findings/trials/mutations; its existing response-size cap remains enforced. Read-only inspection never queues work.

The demo's [recorded evidence](../examples/evidence/WORKSPACE-PROVENANCE.md) comes from an actual synthetic execution, with original version/identities preserved. It does not run visitor code. Existing v1 single-package policies and reports remain supported. Re-register an old workspace project with a reviewed v2 policy before executing it.
