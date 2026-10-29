# Setup

## Local workspace

Use Node 24.15+ in the Node 24 line, npm, Git and a running Docker Linux engine. Windows uses Docker Desktop. Run `npm run setup`, then `npm start`. Open `.proofgate/launch-url` privately. Its one-use fragment token is exchanged and removed from browser history. There are no default passwords or public signup.

Local mode uses OS operator identity and loopback binding. Cookie sessions still require HttpOnly, SameSite and CSRF protection. Keep the server running for CLI/MCP verification: all clients share one supervisor and queue. `--data /absolute/directory` selects an installation; do not reuse a data directory across modes.

## Your repository

Register the exact Git root with `register REPO --policy POLICY.json`. Store the policy outside the candidate tree. Its reviewed copy lives in the control database, so a candidate cannot override it. Registration, dependency preparation and recovery are local operator actions, not MCP parameters.

The adapter requires exact Vitest 5.0.5, a single npm v3 lockfile and integrity-pinned public npm tarballs. `doctor --build --project ID` prepares a sealed dependency image without scripts or credentials. Verification is offline. A generated standalone Node config controls the test list; repository Vitest/Vite config is not loaded. Test names must be unique across the registered scope.

The policy selects test paths, mandatory test names, one regression test, its expected assertion-message signature and production paths. The first adapter transfers standalone registered test files to the base. New APIs, dependencies or helpers that prevent a comparable run are inconclusive. Pre-existing baseline failures prevent a pass. Start with [the example policy](../examples/access-control/proofgate-policy.json).

For npm monorepos use the reviewed [workspace v2 profile](WORKSPACE-EXECUTION.md), with member/file/test identities and one shared execution budget. Existing v1 policies remain single-package.

Working snapshots include tracked text and explicitly selected new files. Limits: 500 files, 512 KiB per file, 4 MiB total and 30 test files. Credentials, `.env*`, runtime/dependency directories, symlinks and submodules are excluded or rejected. Review exports before sharing: name/pattern filters are not comprehensive secret detection.

## Results and limits

`verify --project ID --base REF` freezes bytes without staging, resetting, cleaning or committing the checkout. Later edits make old evidence stale; the CLI cannot use it to pass the current-workspace gate.

One baseline and three C/H pairs run fresh. Stryker uses its own workers in a separate candidate stage; not every mutant has a fresh container. It tests the changed span of registered production files. The plan is checked before mutation execution: at most 25 mutants may run. An oversized scope needs narrowing and does not silently pass. Surviving mutations may be equivalent and need review.

Default ceilings are 2 CPU, 2 GiB RAM, 256 PIDs, 256 MiB scratch, 120 seconds per stage and 10 minutes per run. Queue limits are eight globally and two per team, with one active run. Cancellation/restart cleanup is scoped to owned run identities. Interrupted work needs a fresh plan. Docker shares a kernel; use registered trusted projects, not public hostile-code hosting.

Plans expire after 30 minutes. Internal completed run/source records expire after seven days when maintenance runs; audit records expire after 90 days. Explicit CLI exports in `reports/` remain until the operator removes them. There is no external telemetry or model API call.

## Self-hosted team

```sh
node dist/apps/cli/src/index.js doctor --build --data .proofgate-team
node dist/apps/cli/src/index.js serve --team-mode --data .proofgate-team
```

Use its private launch URL to create the owner with a 15+ character password. Beyond loopback, put it behind a TLS proxy, pass `--host 0.0.0.0 --origin https://YOUR_DOMAIN`, preserve Host/Origin, and keep port 4327 private. Protect the data directory and use a dedicated trusted OS account. Only the supervisor controls Docker; its daemon privileges remain sensitive.

The Team screen supports manual one-use invitations, roles, removal, password-confirmed ownership transfer, workspaces and seven-day project tokens. Viewers cannot run jobs. Scoped tokens cannot access team administration or another project. Use the shown team ID with operator registration: `--team TEAM_ID --data .proofgate-team`. Invite mail addresses are identifiers, not independently verified mailbox ownership.

Opaque token digests and bounded async scrypt protect stored credentials. Role changes apply to existing sessions; ownership transfer rotates/revokes team sessions. Password change/recovery revokes sessions, project tokens, pending links issued by the account and its queued/running jobs. Exactly one owner is preserved by the transfer transaction.

The operator runs `recovery --email ADDRESS --data .proofgate-team` to issue a 30-minute one-use link, then delivers it privately. SMTP, public signup, SSO and MFA are not implemented. Forwarded IP headers are not trusted by default; proxy clients may share login throttles.

## Troubleshooting

- Docker missing: start its Linux engine, then `doctor --build`.
- Dependencies not prepared: `doctor --build --project ID` against the current lock.
- Source changed: freeze a new plan; do not reuse an old green result.
- Mutation cap: narrow the registered production scope.
- Private registries and config-dependent tests are unsupported. npm workspaces need the reviewed v2 [workspace profile](WORKSPACE-EXECUTION.md).
- Restart: let the supervisor recover only its own work; do not remove a live lock.

[Türkçe](SETUP.tr.md) · [Security reporting](../SECURITY.md)
