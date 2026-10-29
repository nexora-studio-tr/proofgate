# Implementation and validation status

Version: **0.1.0-alpha.3**. Alpha support is intentionally scoped; the architecture is the design baseline, not a substitute for execution evidence.

## Alpha.3 controlled workspace execution — 2026-10-29

Implemented the approved [workspace profile](WORKSPACE-EXECUTION.md): at most five selected npm members, externally reviewed v2 policy, one hash-bound plan, seven B/C/H trials, safe per-variant and Stryker links, namespaced test/mutation evidence, package outcomes and explicit unverified scope. Source edits after enqueueing are rejected before execution. CLI/MCP/UI/HTML share the evidence format; existing v1 single-package support remains.

All four jobs in [implementation checkpoint CI 40870106997](https://github.com/nexora-studio-tr/proofgate/actions/runs/40870106997) passed at `f9eb3cdf3de07c0ae9f77b9b65106c9eeacac2db`. Its actual workspace run produced seven trials and nine detected mutants, including shared code detected by an API consumer test. Three members passed and one was explicitly unverified. Weak/broken/crash/cap/budget/cancel cases did not pass. [Original evidence and archive checksum](../examples/evidence/WORKSPACE-PROVENANCE.md).

The first fixture checkpoint failed on behaviorally equivalent mutations caused by a redundant branch. The example was redesigned around a meaningful locked-resource permission defect; no mutation policy was relaxed and no survivor was waived.

Release-candidate validation extends those gates with per-member zero/duplicate/missing tests, actual CLI → supervisor → workspace execution → paginated MCP evidence, workspace cancellation/restart, stale source/policy/image/payload HTTP checks, delayed browser plan responses and mobile scope/report agreement. Pure planning rejects unsupported topology/configuration/links before any container starts. Shared team authorization and isolation gates remain active. Windows checks include fresh extracted-source installation and build. See the release workflow result for the exact published commit.

Observed locally for the release candidate: 75 TypeScript tests passed; nine demo browser checks and eight real CLI/MCP/workspace-browser checks passed. The 390px workspace view displays package outcomes without horizontal page overflow. Planning tests use explicit immutable image placeholders and execute no target code; they are separate from hosted real-container evidence.

Local Docker Desktop was not started for this phase; actual container observations came from hosted Linux CI. The bundled checkpoint evidence retains its original alpha.2 tool marker and plan hash. It is not relabeled as an alpha.3 execution. No live user repository, paid API or independent security audit is claimed.

Türkçe: Kontrollü npm workspace çalıştırması eklendi. Gerçek konteyner kanıtında tüketici testi ortak mutasyonu yakaladı. Eksik kapsam, başarısız/kararsız test veya kaçan mutasyon başarılı gösterilmez. Kayıtlı örneğin özgün sürüm/kimlikleri korunur; yayımlanan sürümün tam kontrol sonucu CI üzerinden değerlendirilmelidir.

## Alpha.2 workspace preflight — 2026-10-27

Added read-only, hash-bound package impact through the CLI, registered-project API, existing six-tool MCP and TR/EN UI. Before/after edges, deleted packages, transitive reasons, cycles and conservative diagnostics are covered. Real workspace execution remains unsupported and plans are rejected before enqueueing. See [scope and limits](WORKSPACE-IMPACT.md).

Local Windows validation: strict typecheck/build/format, 65 TypeScript tests and six real CLI/MCP/browser checks using a synthetic Git workspace. These checks execute no target scripts, create no plans/jobs and make no paid calls. The exact published release has separate hosted CI and fresh-source installation evidence.

Türkçe: Etki ön incelemesi eklendi; bu, monorepo testlerinin çalıştırıldığı veya test kapsamının kanıtlandığı anlamına gelmez. Güncel paketin doğrulama ayrıntıları sürüm dosyalarında tutulur.

## Initial alpha.1 observations

Implemented: immutable Git/working snapshots, registered policies, before/after runner, bounded Stryker integration, typed evidence, weakening findings, local API/UI/CLI, shared supervisor queue, six-tool MCP, local plugin package generator, TR/EN UI, team identities/roles/invitations/recovery/project tokens and ownership transfer.

Observed local gates (Windows, Node 24.15.0, Linux containers through Docker Desktop):

| Gate | Observation |
| --- | --- |
| Strict types and production build | Passed |
| Core, real Git and HTTP identity tests | 47 passed |
| Synthetic strong fix | Seven trials, ten detected mutations, policy pass |
| Weak test / broken fix / crash / cap / total budget / cancellation | Expected non-pass outcomes observed in actual containers |
| Container isolation | Nine actual UID, filesystem, network, capability and cgroup checks passed |
| Integrated queue and MCP | Stale plan, single supervisor, real execution, cancellation and restart cleanup passed |
| Demo browser | Eight EN/TR, mobile, filtering, history and export checks passed |
| Team browser | Nine bootstrap/invite/role/ownership/password/workspace/CSP checks passed |
| Skill Creator validation | Shared skill frontmatter validated |
| Source archive | Five checksum, clean offline install, build and CLI checks passed |
| Production demo image | Thirteen actual HTTP, read-only mode and process checks passed under 512 MiB |
| npm dependency audit | Zero known reported vulnerabilities at the recorded local check |

[Reference execution JSON](../examples/evidence/strong.json) is a genuine recorded run of the bundled synthetic project. Its source/image/policy identity and selected mutation locations are included. It does not claim verification of unrelated visitor code.

CI defines Windows/Linux checks plus Linux execution/browser gates. Check the actual repository workflow result for the published commit before treating those remote jobs as passed. Source-archive installation and demo deployment have separate validation scripts and records; preparation alone is not a successful deployment.

Publication verified on 2026-10-25: all four jobs in [CI run 40169454253](https://github.com/nexora-studio-tr/proofgate/actions/runs/40169454253) passed for commit `05fa5a6cd3d56d126b47c3dc8f35ca1c0cc33dec`, including actual Linux container execution and Windows checks. The [public Free demo](https://proofgate-demo.onrender.com/) passed thirteen HTTPS, asset, evidence-export and read-only API checks. These are recorded observations for that version; later commits need their own CI results.

Not claimed: independent security audit, hostile-code isolation, complete natural-language requirement coverage, external user adoption, SMTP delivery, SSO/MFA, arbitrary frameworks or official plugin-directory approval. Local generated plugin bundles do not install themselves into a host client. Mutation waivers are not implemented; surviving/uncovered mutations remain failures in this alpha.

Türkçe: Çalışan alpha kapsamı ve yerelde ölçülen sonuçlar yukarıdadır. Yayındaki commit'in CI kaydı ayrıca kontrol edilmelidir. Ücretli servis, ödeme sistemi veya ticari bot kaynağı dahil edilmedi.
