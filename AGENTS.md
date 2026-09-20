# Repository agent guide

## Role and scope

Maintain FC RWW Chat, a German-language Matrix web client for FC Rotweiss Winikon. Implement focused changes to the application, tests, and documentation; preserve message privacy and recoverable encryption keys. This guide applies throughout the repository.

Read `README.md` for product behavior and configuration, `SECURITY.md` for security requirements, and `docs/deployment.md` for hosting work. Treat `docs/security-review.md` as a historical review, not evidence that the current tree or deployment is secure.

## Commands

Run commands from the repository root using Node.js 24.x (`nvm use` if available) and npm. Use the committed `package-lock.json`.

| Purpose | Command |
| --- | --- |
| Install locked dependencies | `npm ci` |
| Run all tests | `npm test` |
| Run a focused test file | `node --test tests/attachments.test.mjs` |
| Lint | `npm run lint` |
| Type-check only | `npx --no-install tsc -b` |
| Type-check and build into `dist/` | `npm run build` |
| Run lint, tests, and build | `npm run check` |
| Scan working files and indexed blobs for supported secret formats | `npm run security:check` |
| Check known dependency advisories | `npm audit --audit-level=low` |

The user runs services in watch mode: app at `http://localhost:3001`, API at `http://localhost:3000`. Reuse these services for testing. Do not start, restart, or stop services, including `npm run dev` or `npm run preview`. If a service is unavailable, report it and continue checks that do not need it.

Create `.env` from `.env.example` only if no local configuration exists; never overwrite an existing `.env`. All `VITE_*` values and `STAGE` are public build configuration. `STAGE` is a build label, independent of room visibility and Matrix authorization.

`npm run maint:update` changes dependency ranges and the lockfile and runs audit fixes; use it only for requested dependency maintenance, not routine validation. There is no configured formatter or Markdown test command. Vite preview is not a production server.

## Stack and structure

- React 19, TypeScript 6, Vite 8, and plain CSS; no application backend.
- `matrix-js-sdk` 42 and `@matrix-org/matrix-sdk-crypto-wasm` 18 handle Matrix and encryption. Consult `package.json` and the lockfile for exact versions.
- Browser APIs include Web Crypto, WebAssembly, IndexedDB, and Web Locks.

| Path | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/main.tsx` | Application composition, session UI, and startup |
| `src/components/` | Chat, login, room administration, attachments, polls, and security UI |
| `src/hooks/` | Chat history pagination and scroll behavior |
| `src/matrix/` | Matrix transport, sessions, crypto lifecycle, backups, and room helpers |
| `src/App.css`, `src/index.css` | Application and global styles |
| `src/assets/`, `public/` | Bundled and static assets |
| `tests/*.test.mjs` | Node tests, mocked transport, and real crypto checks |
| `scripts/check-public-repo.mjs` | Limited source/index credential scanner |
| `.github/` | CI checks and Dependabot configuration |
| `docs/` | Deployment guidance, review notes, and authoring references |
| `dist/`, `node_modules/` | Generated output and dependencies; do not edit manually |

## Code conventions

- Use function components and hooks. Component names and files use PascalCase; hooks use `use...`; helpers and variables use camelCase. Follow the surrounding file's indentation and quote style without unrelated reformatting.
- Keep reusable Matrix behavior in `src/matrix/` and UI rendering in `src/components/`. Prefer typed arguments and small helpers over additional abstractions or dependencies.
- Use ESM and type-only imports where appropriate. Helpers imported directly by Node tests must remain compatible with Node 24's TypeScript support; follow existing explicit `.ts` imports in tests and their helper dependencies.
- Keep user-facing copy in German and code identifiers in English. Preserve mobile layouts, keyboard access, accessible labels, and reduced-motion behavior when changing UI.
- Clean up event subscriptions, object URLs, and asynchronous effects. Preserve React StrictMode-safe startup: component effect cleanup must not close the session-owned crypto store.
- Validate untrusted event contents, stored values, filenames, and URLs before use. Render message bodies as React text. Avoid raw credential-bearing error logs.

Example of a focused helper test using the project's existing style:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLoginName} from '../src/matrix/loginDiscovery.ts';

test('rejects malformed Matrix IDs', () => {
  assert.throws(() => parseLoginName('@alice:example.org/path'));
});
```

## Testing and validation

- Tests use `node:test` and `node:assert/strict` in `tests/*.test.mjs`, importing TypeScript helpers directly. Mock network and browser storage; do not require real accounts. Crypto tests intentionally exercise the actual WASM implementation.
- Add or update regression tests for meaningful behavior changes, especially authentication, permissions, media transport, account isolation, backup, and cleanup. Cover failure paths as well as success; do not add tests that merely repeat implementation details.
- Run the relevant test file during development and `npm run check` after application changes. Before release, run `npm run check`, `npm run security:check`, and `npm audit --audit-level=low` as required by `SECURITY.md`.
- For documentation-only edits, verify commands, paths, links, and consistency with source. A full application rebuild is unnecessary unless the documentation change reveals or accompanies a code change.
- For UI changes, verify the affected flow at desktop and mobile sizes when browser tooling is available. Unit tests do not establish browser correctness. Report any browser validation that could not be performed.
- Fix failures caused by the change. Report unrelated failures accurately; never remove assertions, disable checks, or weaken security behavior merely to obtain a pass.

## Security invariants

- Initialize crypto before sync and retain the Web Lock preventing concurrent crypto-store access. Preserve account and device isolation in storage identifiers and cleanup.
- Preserve and verify recoverable room keys before destructive migration or full logout. Never bypass failed backup verification to delete the only local copy. Keep ordinary logout and full logout semantics distinct.
- Use the Matrix SDK and WASM crypto primitives; do not substitute custom cryptographic algorithms. Preserve authenticated account context and fresh random IVs in vault encryption.
- Send media bearer tokens only to validated homeserver endpoints. Preserve redirect rejection, omitted cookies, and omitted referrers in attachment and avatar requests.
- Require HTTPS for remote homeservers and preserve full-ID discovery's refusal to silently fall back to another server. Recheck membership and action permissions on submission; the homeserver remains the authority.
- Space/room filters control visibility only. Do not describe them as access control or environment isolation. Encryption applies only to encrypted rooms; verified-only recipients are not enforced.
- Browser storage contains session tokens and automatic vault-unlock material. Do not claim local encryption protects against same-origin script execution or full browser-profile access.

## Git workflow

- Expect the user to edit files concurrently. Inspect `git status --short`, the working diff, and the staged diff; reread files before editing and preserve the user's latest changes. Do not treat concurrent changes as unexpected or revert them.
- Always work with and validate the complete current Git changes, including the user's edits. When staging or committing is requested, include all current changes, not just agent-authored changes, while retaining the exclusions for secrets and generated/private files. Rerun `npm run security:check` after staging to scan the actual indexed content.
- Do not commit, push, or deploy unless authorized. Do not assume branch protection, a commit-message convention, or a release-branch policy: none is established in the repository documentation.
- Do not discard unrelated work, rewrite history, or force-push without explicit authorization. Keep generated builds, local configuration, and private browser data out of commits.

## Boundaries

### Always

- Make routine source, test, and documentation changes needed for the authorized task without repeatedly requesting permission.
- Update `README.md`, `SECURITY.md`, or deployment guidance when behavior or documented limitations change.
- Keep CI permissions read-only, action revisions pinned, and untrusted pull-request code isolated from secrets.

### Ask first when not already authorized

- Broad dependency upgrades, architectural changes, or changes to authentication, persistent key formats, migration/deletion behavior, or deployment policy beyond the requested fix.
- Live Matrix operations that send messages, invite users, alter rooms, revoke devices, or delete data. Use a disposable test account for authorized integration checks; never risk the only copy of important room keys.
- Production deployment, repository security-setting changes, or destructive Git operations.

### Never

- Commit or log live credentials, recovery secrets, room-key exports, private messages, real-chat screenshots, HAR files, or browser profiles. Do not expose secrets through Vite environment variables.
- Manually edit `node_modules/` or generated `dist/` output, or suppress failing checks just to finish.
- Serve the repository root, `.git`, or `.env` in production. Deploy only built files over HTTPS with reviewed hosting headers.
- Present a passing source scanner, dependency audit, or test suite as proof of complete security. The scanner does not cover every secret format or binary asset.

## Definition of done

Confirm the requested behavior or documentation is complete, relevant checks have run, and the diff contains no accidental changes. Keep final responses short: summarize the result and relevant verification or blockers in a few sentences. Mention commit, push, or deployment status when relevant.
