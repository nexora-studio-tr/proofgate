# ProofGate 0.1.0-alpha.2

Read-only workspace impact preflight for a captured code change. The CLI, existing MCP inspection tool and bilingual web dialog explain direct package owners and transitive dependants using both base and candidate graphs. Deleted edges/packages remain represented; cycles and incomplete manifests are explicit.

```sh
node dist/apps/cli/src/index.js inspect /absolute/git-root --base HEAD
```

Inspection executes no target code and requires no Docker or model key. It creates no verification jobs. Monorepo execution is explicitly rejected; the npm/Vitest runner remains single-package. Results bind to source hashes and do not prove imports, test coverage or correctness. See [workspace scope](WORKSPACE-IMPACT.md) and [setup](SETUP.md).

The source archive includes a normalized SHA-256 file manifest. Clean-source checks verify every file, install fresh dependencies, build and exercise the CLI. Hosted checks retain the existing container isolation/execution and demo/team browser gates, plus the new preflight check. Exact results accompany the published release. MIT license.

Türkçe: Değişen paketi ve dolaylı bağımlıları, neden zinciriyle gösteren salt okunur ön inceleme eklendi. Silinen ilişkiler, döngüler ve belirsizlikler görünür. Proje kodu çalıştırılmaz; monorepo doğrulaması desteklenmez. Kaynak paketi dosya bazında SHA-256 manifesti ve temiz kurulum kontrolü içerir. [Türkçe kurulum](SETUP.tr.md).
