# Workspace reference execution

[workspace-strong.json](workspace-strong.json) is the unmodified `workspace-execution/strong.json` from [CI run 40870106997](https://github.com/nexora-studio-tr/proofgate/actions/runs/40870106997), commit `f9eb3cdf3de07c0ae9f77b9b65106c9eeacac2db`, observed on 2026-10-29. The implementation checkpoint still identified itself as `0.1.0-alpha.2`; that original tool version and plan identity are preserved, rather than relabeled as a later release.

The downloaded execution archive's SHA-256 was verified as `19c8172c1f48d29977173dc155590a9bc9817e3e9d62cacf75050c3ac60d2085`. The source/policy/image hashes, npm version, actual variant/mutation roots and namespaced detecting tests are inside the JSON.

Observed: seven trials, nine detected mutations, three selected members with all required candidate tests present, and `packages/unrelated` explicitly unverified. At least one shared-source mutant was killed by an `apps/api` consumer test. Separate real-container cases rejected weak tests, broken fixes, crashes, incomplete mutation caps, budget exhaustion and cancellation.

This is a recorded synthetic fixture, not verification of a visitor's repository or evidence of independent user adoption. New executions produce new identities. The demo is read-only.

Türkçe: Bu dosya gerçek CI koşusundan değiştirilmeden alınmıştır. İlk uygulama kontrol noktasının sürüm etiketi korunmuştur; yeni sürüme aitmiş gibi değiştirilmemiştir. Yedi deneme ve dokuz yakalanan mutasyon gözlenmiştir. Üç paket doğrulanmış, diğer paket açıkça kapsam dışında bırakılmıştır. Genel doğruluk veya bağımsız kullanıcı kullanımı iddiası değildir.
