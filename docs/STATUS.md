# Implementation and validation status

Version: **0.1.0-alpha.1**. Alpha support is intentionally scoped; the architecture is the design baseline, not a substitute for execution evidence.

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

Publication verified on 2026-10-25: all four jobs in [CI run 40169454253](https://github.com/shadow2028-blip/proofgate/actions/runs/40169454253) passed for commit `05fa5a6cd3d56d126b47c3dc8f35ca1c0cc33dec`, including actual Linux container execution and Windows checks. The [public Free demo](https://proofgate-demo.onrender.com/) passed thirteen HTTPS, asset, evidence-export and read-only API checks. These are recorded observations for that version; later commits need their own CI results.

Not claimed: independent security audit, hostile-code isolation, complete natural-language requirement coverage, external user adoption, SMTP delivery, SSO/MFA, arbitrary frameworks or official plugin-directory approval. Local generated plugin bundles do not install themselves into a host client. Mutation waivers are not implemented; surviving/uncovered mutations remain failures in this alpha.

Türkçe: Çalışan alpha kapsamı ve yerelde ölçülen sonuçlar yukarıdadır. Yayındaki commit'in CI kaydı ayrıca kontrol edilmelidir. Ücretli servis, ödeme sistemi veya ticari bot kaynağı dahil edilmedi.
