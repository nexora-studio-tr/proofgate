# ProofGate 0.1.0-alpha.3

**One change. One plan. Evidence across packages.**

A regression can be fixed in a shared package while its consumer test still misses the defect. Alpha.3 verifies a reviewed npm workspace scope and records which consumer test actually detected a shared-code mutation.

- Up to five selected members under one frozen source/policy/image identity.
- Seven before/after trials and one shared mutation/time budget.
- npm-generated local links rebuilt inside each variant and Stryker sandbox.
- Namespaced member/file/test identities, per-member discovery/outcomes and explicit unverified members.
- Matching CLI, six-tool MCP, TR/EN UI and HTML evidence; late obsolete plans are discarded.
- Recorded real workspace demo alongside the existing single-package example.

```sh
node dist/apps/cli/src/index.js example --workspace
node dist/apps/cli/src/index.js doctor --project PROJECT_ID
node dist/apps/cli/src/index.js verify --project PROJECT_ID --base HEAD
```

Use the ID printed by the first command and keep the local server running. [Workspace guide](https://github.com/nexora-studio-tr/proofgate/blob/main/docs/WORKSPACE-EXECUTION.md) · [Recorded proof and provenance](https://github.com/nexora-studio-tr/proofgate/blob/main/examples/evidence/WORKSPACE-PROVENANCE.md) · [Validation](https://github.com/nexora-studio-tr/proofgate/blob/main/docs/STATUS.md).

This profile requires Node 24, npm lockfile v3, pinned Vitest 5.0.5, unchanged manifests/topology/configuration and root-hoisted public dependencies. pnpm/Yarn, build scripts, arbitrary configuration and private registries remain unsupported. A policy pass covers the recorded checks; it is not a general correctness or security certificate. Existing v1 policies/reports remain supported. MIT; no model key or paid service required.

Source archives include a normalized per-file SHA-256 manifest and an archive checksum. Windows/Linux clean-source installation, build, browser, real-container and integration gates run in CI. Release assets are added after those gates succeed; existing assets are never overwritten.

**Türkçe:** Alpha.3, en fazla beş npm paketi için tek sabit plan ve yedi önce/sonra denemesi ekler. Ortak koddaki kontrollü hatayı hangi tüketici testinin yakaladığı kaydedilir; paketlerin test/sonuçları ve doğrulanmayan kapsam açıkça görünür. CLI, MCP, iki dilli panel ve HTML raporu aynı kimliği taşır. Mobil plan görünümü ve kuyrukta kaynak değişimi denetimi iyileştirildi. [Türkçe kullanım](https://github.com/nexora-studio-tr/proofgate/blob/main/docs/WORKSPACE-EXECUTION.tr.md). V1 politikalar korunur; bu sınırlı alpha genel kod doğruluğu iddiası değildir.
