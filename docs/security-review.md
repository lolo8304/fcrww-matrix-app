# Public-source readiness review — 2026-09-19

## Conclusion

The reviewed working tree has no detected credentials in the limited scan and passes its automated checks. This is not a certification that all security guidelines are met or that the deployed application is secure. Browser-managed secrets remain an explicit security limitation; production hosting and GitHub settings were not verified.

## Scope

Reviewed repository configuration, working files and indexed source, session persistence, login/discovery validation, authenticated media transport, rendering, crypto/backup boundaries, and release documentation. No existing repository security policy was present; SECURITY.md now records contributor requirements and limitations. The repository had no commits to scan for historical credentials. Binary assets and unknown credential formats are outside the source scanner's coverage. No live-server penetration test or independent cryptographic audit was performed.

## Changes made

| Finding | Resolution |
| --- | --- |
| `.env` was indexed and environment files were not ignored | Removed it from the index, preserved the local file, added ignore rules and a public `.env.example`. The indexed file was empty; local configuration contained public Vite configuration keys. |
| Avatar requests permitted redirects | Avatar and attachment downloads reject redirects and explicitly omit browser cookies and referrers. Existing homeserver-origin checks remain. |
| Restored sessions allowed arbitrary HTTP server URLs | Require HTTPS except localhost; reject embedded credentials, query strings, and fragments. Added regression tests. |
| Application catches logged raw error objects | Removed those logs to reduce inadvertent disclosure. SDK/browser diagnostics still require redaction before sharing. |
| No repeatable release workflow | Added source/index credential-format checks, npm test/check scripts, pinned read-only CI, and Dependabot configuration. |
| Missing release/security documentation | Added README setup/build/run/test/features, SECURITY.md, and deployment guidance. |

## Verification

- `npm ci`: passed; npm reported an unapproved optional macOS `fsevents` install script. No blanket script approval was granted.
- `npm run check`: passed ESLint, all **72 tests**, TypeScript, and Vite production build.
- `npm audit --audit-level=low`: **0 known vulnerabilities** at review time.
- `npm run security:check`: passed working-tree and indexed-blob checks for its supported credential formats.
- `.env`: confirmed ignored and absent from the Git index.
- Build emits the existing large-JavaScript-chunk warning; this does not fail the build.

## Remaining decisions and checks

1. Remembered tokens and automatic vault-unlock material remain readable to same-origin JavaScript or an attacker with browser-profile access. This does not meet OWASP's recommendation against localStorage session identifiers. Changing that design requires a separate authentication/key-storage change.
2. Room encryption is conditional; verified-only recipients and interactive device verification are not enforced. Renamed media still retains embedded metadata. Resource-abuse limits are incomplete.
3. Apply and test HTTPS/security headers on the production host. The supplied header configuration is guidance, not an active hosting configuration.
4. Enable GitHub private vulnerability reporting, secret scanning/push protection where available, and branch checks. These account/repository settings were not changed.
5. Review and stage the complete intended working tree before committing. Some previously staged component versions differ from the working files; committing only the existing index would omit this work. Rerun the source scan after staging.
6. Confirm publication rights for branding/assets and choose a source license if reuse is intended. No license was selected on the owner's behalf.

No commit, push, deployment, or live Matrix account operation was performed during this review.
