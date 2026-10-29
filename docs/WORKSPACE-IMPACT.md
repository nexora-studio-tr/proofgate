# Workspace impact preflight / Paket etki ön incelemesi

## English

Alpha.2 adds read-only inspection of package manifest dependencies. A changed package selects its direct and transitive dependants with a reason chain. Base and candidate edges are combined, so deleting a dependency or package does not hide its former consumers.

After installing ProofGate's dependencies and building:

```sh
node dist/apps/cli/src/index.js inspect /absolute/git-root --base HEAD
```

The command needs Git and Node; it needs no server, target dependency installation, Docker, policy or API key. It executes no target scripts and changes no source. Tracked working files are captured; untracked files are omitted. Exit codes: completed preflight `0`, inconclusive `2`, capture/command error `1`. Exit `0` is not a verification verdict.

For a registered project, use **Verify a change → Inspect package impact**. The existing MCP `inspect_change` and authenticated `/api/inspect` return the same `workspaceImpact` object; team/project-token boundaries remain enforced. No plan or job is created by inspection. Changing the project/reference or closing the dialog discards old results, including late responses. The MCP server still has six tools.

| Result | Meaning |
| --- | --- |
| Source hashes | Bind the graph to the captured base and candidate. |
| Direct | Files changed inside this package. |
| Dependent | Reverse dependency closure with one shortest chain. |
| Shared | A root/shared file changed; review every captured package. |
| Uncertain | Incomplete graph; review every known package. |
| Cycles | Strongly connected package groups; closure is cycle-safe. |

Root workspaces accept an array or `{ "packages": [...] }`. Supported patterns are literal components, `*` and `**`; negation, braces and partial-component wildcards are explicitly inconclusive. All four dependency sections and npm aliases are considered. Matching local names are conservative edges without semver resolution, so extra packages may be included.

Malformed/missing manifests, duplicate names, nested workspaces, local path dependencies, unmatched patterns or unsupported syntax produce an inconclusive result. Missing explicit `workspace:` targets are flagged. Before/after presence and dependency edges remain visible.

Capture keeps the existing UTF-8, credential-path, symlink/submodule and 500-file / 4 MiB limits. Inspection allows 100 packages per snapshot (root included), 50 patterns and 128 KiB per manifest. If the package limit is exceeded, extra packages are not enumerated and the report is explicitly inconclusive. The MCP response limit remains 32 KiB; large reports must use the CLI/API instead of assuming a truncated success.

`status: complete` means this bounded manifest graph was parsed. It does not establish import/runtime coupling, generated code, build-tool tasks, test coverage or correctness. Inspection does not select or skip verification tests. Alpha.3 adds the separate reviewed [workspace execution profile](WORKSPACE-EXECUTION.md). An existing v1 policy still returns `WORKSPACE_EXECUTION_UNSUPPORTED` for workspaces; register an eligible v2 policy before execution. Inspection alone never authorizes execution.

## Türkçe

Alpha.2, paket bildirimlerinden salt okunur etki ön incelemesi ekler. Yukarıdaki CLI komutunu, panelde **Değişikliği doğrula → Paket etkisini incele** düğmesini veya MCP `inspect_change` aracını kullan. CLI için hedef bağımlılıkların kurulması, Docker ve API anahtarı gerekmez. Proje betiği çalıştırılmaz, kaynak dosyası değiştirilmez. İzlenmeyen dosyalar dahil değildir.

Değişen paketin kendisi ve ona doğrudan/dolaylı bağımlı paketler gerekçe zinciriyle görünür. Önceki ve aday grafikleri birlikte kullanılır; silinen paket veya bağımlılık eski tüketicileri gizleyemez. Kök/ortak dosya değişimi tüm yakalanan paketleri seçer. Döngüler ayrı gösterilir. Proje/referans değişimi veya pencerenin kapanması eski sonucu temizler; geç yanıt bunu geri getiremez.

Desteklenen kalıplar tam yol parçaları, `*` ve `**` şeklindedir. Bozuk/eksik bildirim, aynı adlı paket, bulunamayan `workspace:` hedefi, iç içe çalışma alanı, yerel dosya bağımlılığı veya desteklenmeyen kalıp varsa sonuç belirsizdir; bilinen tüm paketler incelemeye alınır. Semver çözümlemesi yapılmadığından seçim temkinli biçimde geniş olabilir.

Sınırlar: görüntü başına kök dahil 100 paket, 50 kalıp, bildirim başına 128 KiB; kaynak için mevcut 500 dosya / 4 MiB ve gizli dosya/symlink kuralları. Paket sınırı aşılırsa fazladan paketler listelenmez ve belirsizlik açıklanır. MCP'nin 32 KiB yanıt sınırı aşılırsa CLI/API kullanılır. CLI çıkışı: tamamlanan ön inceleme `0`, belirsiz `2`, yakalama/komut hatası `1`.

`complete`, yalnızca yakalanan bildirim grafiğinin okunduğunu belirtir; import ilişkisi, test kapsamı veya kod doğruluğu kanıtı değildir. Alpha.3, ayrı bir [workspace yürütme profili](WORKSPACE-EXECUTION.tr.md) ekler. V1 politika workspace çalıştıramaz; uygun v2 politika kaydedilmelidir. Ön inceleme çalışan testleri seçmez veya atlamaz. Ekip ve proje anahtarı yetkileri korunur.
