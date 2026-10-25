# Contributing

Start with a reproducible issue or a small focused change. State the expected behavior, actual observation, supported runtime versions and a sanitized example. Private code and data are not required.

Run `npm ci --ignore-scripts`, `npm run check` and `npm run format:check`. Runner changes also need the relevant actual Docker and isolation checks; identity changes need negative HTTP/team tests; UI changes need the corresponding browser checks. See the commands in [README](README.md). Do not add tests that merely mirror implementation or weaken required gates to make a run green.

Keep adapters thin and contracts versioned. Preserve source identity, scope accounting and explicit inconclusive outcomes. A timeout/crash is never a caught mutation, missing tests cannot pass, and an old snapshot cannot validate new bytes. Changes to runner/profile/version compatibility need real fixtures before updating support claims.

Use Radix primitives for existing dialogs, menus, selects and tabs. Preserve keyboard access, visible focus, readable labels, status words and TR/EN copy. Read [the architecture](docs/ARCHITECTURE.md) before changing isolation, authorization or evidence semantics.

The release is source-only and allowlisted. Never stage runtime data, credentials, generated local plugin configurations, dependencies or sibling projects. No commercial Discord bot code belongs here.

Türkçe: Küçük, yeniden üretilebilir ve kapsamı belli değişiklikler gönderin. İlgili gerçek testleri çalıştırın; testleri geçsin diye politikayı gevşetmeyin. Yeni kullanıcı metinlerini Türkçe ve İngilizce sağlayın. Özel kod, anahtar veya başka proje kaynaklarını eklemeyin.
