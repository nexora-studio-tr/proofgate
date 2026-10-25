# Security

Supported version: 0.1.0-alpha.1. Report vulnerabilities privately through this repository's GitHub Security Advisories / **Report a vulnerability** when enabled. Do not put credentials, private code or exploit details in a public issue. If private reporting is unavailable, open a minimal issue asking for a private reporting channel without disclosing the vulnerability.

ProofGate runs registered project tests, which are executable code. The supervisor's Docker access is privileged; run it under a trusted dedicated OS account. Only the supervisor launches containers. Verification containers have no network/host credentials/Docker socket, run as non-root with capabilities dropped, and use resource limits and a read-only root. This shared-kernel boundary is not a hostile-code VM or a public multi-tenant execution service.

The private data directory includes source snapshots, session/token digests and generated local connection credentials. Never serve, commit, upload or include it in an issue. Do not publish generated plugin packages containing local configuration. Review deliberately shared reports: exclusion filters cannot find every secret embedded in source/logs.

Use HTTPS for team access beyond loopback. Keep the worker, database and local port private behind the intended proxy. Membership is checked server-side for projects, jobs and artifacts; project tokens are scoped and revocable. SMTP, verified mailbox ownership, MFA and SSO are not features of this alpha.

Pass/fail/inconclusive evidence is an observation within a declared scope. A malicious test suite or host administrator can forge or alter evidence; hashes alone are not hardware attestation. Equivalent mutations, missing requirements and untested behavior remain outside an automatic correctness claim.

Türkçe: Güvenlik açıklarını ayrıntıları herkese açık paylaşmadan GitHub'ın özel güvenlik bildiriminden iletin. Çalışma alanı klasörünü, anahtarları ve özel kaynakları yüklemeyin. Bu alpha sürümü genel güvenlik sertifikası veya keyfi düşmanca kod barındırma hizmeti değildir.
