# Security policy and deployment boundaries

This is a browser-based Matrix client, not a hardened security product. Passing tests or publishing the source does not establish that all vulnerabilities have been found. No independent penetration test or cryptographic audit has been performed for this repository.

## Reporting a vulnerability

Do not post passwords, access tokens, room-key exports, recovery keys, private messages, or exploitable details in a public issue. Use the repository's **Security → Report a vulnerability** option if the owner has enabled private reporting. If it is unavailable, ask the maintainer for a private contact without publishing the details. No private contact address or reporting service is configured in this source tree.

Include the affected revision, browser, reproduction steps with a test account, impact, and a minimal redacted example. Rotate exposed credentials immediately. For Matrix SDK vulnerabilities, also follow the [upstream security policy](https://github.com/matrix-org/matrix-js-sdk/security/policy).

## What the app protects

- Matrix room encryption and encrypted media use the Matrix SDK and its Rust/WASM crypto implementation.
- Local room-key archives are AES-GCM encrypted with authenticated account context. SDK stores use a random storage key wrapped by the local vault.
- A random 96-bit IV is generated for each AES-GCM operation; legacy unlock secrets use PBKDF2-SHA-256 with 600,000 iterations and a random salt.
- Full logout requires backup verification before local key deletion. Failed restore/backup operations do not intentionally discard the only local copy.
- Only authenticated homeserver media endpoints receive bearer tokens. Media requests reject redirects and omit browser cookies/referrers.
- Messages are rendered as React text. Admin controls check membership and permissions again when submitting an action. Server authorization remains mandatory.

## Known limitations and threat model

### Browser-managed secrets

Automatic unlocking stores the unlocking material beside the encrypted vault in browser storage. Remembered access tokens also live in `localStorage`; temporary tokens use `sessionStorage`. Encryption of the database does **not** protect these secrets from an attacker who can read the full profile or execute JavaScript on this origin. Clearing a tab or unchecking “Angemeldet bleiben” does not erase local encryption keys.

This design does not meet the [OWASP recommendation against storing session identifiers in localStorage](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html). It is an explicit convenience tradeoff, not a claim of compliance. Use a trusted personal browser/profile and a dedicated HTTPS origin. A stronger deployment would need a separate session/key-storage design and review; do not treat this implementation as suitable for shared kiosks or hostile endpoints.

### Encryption and device trust

Rooms can be unencrypted. The app follows room encryption state; it does not enforce encrypted-only use, require verified-only recipients, or provide interactive device verification/cross-signing setup. Use an established Matrix client for verification workflows. Initializing Rust crypto alone does not authenticate every recipient device.

Room membership, names, timing, receipts, and reactions may be visible to the homeserver or federation. Recovery does not restore an old device's private identity. Server retention is not guaranteed erasure across other clients, servers, backups, or downloaded files.

Include/exclude space-name filters (independent of STAGE) restrict this app's room list and selection, not Matrix authorization or sync. Other joined rooms may still be received and stored by the SDK. Filters depend on available space state and administrator-controlled display names/child lists. Use separate accounts/memberships or servers for a security boundary between environments.

### Files, availability, and untrusted servers

Renaming attachments does not remove EXIF/GPS, document properties, malware, or identifying file contents. Downloaded files are untrusted. Large incoming media, room histories, or reaction sets can consume browser memory/network resources; comprehensive resource-abuse defenses and load testing are not implemented.

The Matrix homeserver and domain discovery configuration are trusted routing inputs. Deployers must control/verify those domains and maintain HTTPS/CORS correctly. Authenticated media redirects are intentionally rejected; a server that redirects media to storage must provide a compatible direct endpoint or be adapted with a reviewed policy.

### Logout semantics

Ordinary logout on a remembered device clears this app's stored tokens and stops sync but does not revoke the server token/device. Full logout revokes the Matrix session and attempts account-specific local cleanup only after backup verification. Errors during cleanup can leave local data behind. A recovery key must be kept outside the browser.

## Contributor requirements

1. Never commit live credentials, private keys, message exports, real-chat screenshots, browser profiles, or request recordings. Keep only public configuration in `.env.example`. All `VITE_*` values are readable by app users.
2. Do not log plaintext messages, credential-bearing request/error objects, backup contents, or recovery secrets. Redact diagnostics before sharing; SDK/browser logs can still contain sensitive metadata.
3. Treat Matrix event contents, URLs, filenames, room/member names, and stored browser values as untrusted. Never render event HTML without a reviewed sanitizer.
4. Preserve account isolation, crypto initialization ordering, backup verification, and the Web Lock that prevents concurrent crypto-store access. Do not bypass failed verification to delete keys.
5. Run `npm run check`, `npm run security:check`, and `npm audit --audit-level=low` before release. Add regression tests for security-sensitive fixes.
6. Keep CI read-only, do not execute untrusted pull-request code with secrets, and review dependency updates. Commit the lockfile and use `npm ci` for reproducible installs.
7. Deploy only built files with HTTPS and the headers in [deployment guidance](docs/deployment.md). A public repository is not proof that a deployment has those controls.

The source scanner is a limited heuristic, not a substitute for GitHub secret scanning, human review, history scanning, or an independent security assessment. Binary files and unknown token formats require separate review.
