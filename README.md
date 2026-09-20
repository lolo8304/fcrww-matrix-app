# FC RWW Chat

A responsive Matrix web client for FC Rotweiss Winikon, built with React, TypeScript, Vite, and the Matrix JavaScript SDK. The interface is in German and works on desktop and mobile browsers.

The app connects directly to a Matrix homeserver. It has no application backend and does not create Matrix accounts. Room membership, permissions, message storage, and retention are managed by the homeserver.

## Requirements

- **Node.js 24.x** and npm. `.nvmrc` selects the supported Node major version.
- An existing Matrix account and a homeserver supporting password login.
- A current browser with WebAssembly, Web Crypto, IndexedDB (including database enumeration), and Web Locks. Use HTTPS in production; localhost is suitable for development.
- Browser access to the homeserver and, when used, its discovery website via CORS.

## Install and configure

```sh
# From the repository directory:
nvm use                    # If you use nvm
npm ci
cp .env.example .env
```

Edit `.env` for your server:

```dotenv
VITE_MATRIX_BASE_URL=https://matrix.example.org
VITE_MATRIX_SERVER_NAME=example.org
VITE_MATRIX_DISCOVERY_ORIGIN=https://example.org
```

| Variable | Purpose |
| --- | --- |
| `STAGE` | Public build stage: `local`, `preview`, or `prod`. Optional; defaults described below. |
| `VITE_MATRIX_SPACE_INCLUDE` | Optional comma-separated space/room patterns to further restrict visible spaces. |
| `VITE_MATRIX_SPACE_EXCLUDE` | Optional comma-separated space/room patterns to exclude spaces; exclusion wins. |
| `VITE_MATRIX_BASE_URL` | Fallback homeserver for short usernames when website discovery is unavailable. Use HTTPS, except for localhost development. |
| `VITE_MATRIX_SERVER_NAME` | Matrix account domain, e.g. `example.org` for `@alice:example.org`. Allows an explicit mapping to a separate discovery website. |
| `VITE_MATRIX_DISCOVERY_ORIGIN` | Website serving `/.well-known/matrix/client`. Defaults to the app's origin. |

For a Matrix domain served by a canonical `www` website, set the server name to the account domain and the discovery origin to the HTTPS `www` origin. Both discovery and the homeserver must allow the app origin through CORS.

Login accepts a short username, `@username`, `username:example.org`, or `@username:example.org`. Full Matrix IDs use domain discovery; failure does not silently send credentials to the configured fallback. Discovered homeservers are validated and checked through their public versions endpoint before login.

**Every `VITE_*` variable is public in the browser bundle.** Never place passwords, access tokens, recovery keys, private keys, or administrator credentials in these variables. `.env` and mode-specific environment files are ignored by Git; commit only `.env.example`. See [Vite's environment documentation](https://vite.dev/guide/env-and-mode).

Restart the development server after changing environment files. Production configuration is embedded at build time: rebuild to change it.

### Application stage

Set `STAGE` in `.env`, a mode-specific environment file, or the command environment:

```sh
STAGE=local npm run dev
STAGE=preview npm run build
STAGE=prod npm run build
```

Without an explicit value, development uses `local`, builds use `prod`, and `--mode preview` uses `preview`. Command-environment values override environment files. Invalid values stop Vite with an error. A value in `.env` applies to builds too, so explicitly override `STAGE=local` when producing a deployment build.

Application code can read the typed public value as `import.meta.env.STAGE`. Only this unprefixed variable is exposed; it is not a secret. The stage is a build label only; it does not affect space visibility, homeservers, encryption, or Matrix permissions. Configure the Matrix variables separately for each environment. `npm run preview` serves an existing build and does not change its embedded stage; rebuild first. Vite reserves the environment-file suffix `.local`, so use `.env.local` for local overrides, not `--mode local`.

### Space and room naming

Space visibility depends **only** on `VITE_MATRIX_SPACE_INCLUDE` and `VITE_MATRIX_SPACE_EXCLUDE`, independently of `STAGE`. Rooms keep their normal names. The policy checks Matrix **space and room display names**, not aliases or IDs; it does not rename anything.

For example, this works even with `STAGE=local` and shows spaces except those with the two excluded prefixes:

```dotenv
STAGE=local
VITE_MATRIX_SPACE_INCLUDE=*
VITE_MATRIX_SPACE_EXCLUDE=local_*,preview_*
```

To show only local spaces instead, set `INCLUDE=local_*` and leave `EXCLUDE` empty (using the full variable names above).

Both filters accept comma-separated `<space-pattern>.<room-pattern>` rules. Without a dot, the room pattern defaults to `*` (all rooms in the matched space).

| Pattern | Matches |
| --- | --- |
| `*.B` | Room named exactly `B` in any space |
| `*.B*` | Rooms beginning with `B` in any space |
| `FC RWW.B` | Room `B` in space `FC RWW` |
| `FC RWW` or `FC RWW.*` | All rooms in space `FC RWW` |
| `local_*` | All rooms in spaces beginning with `local_` |

For example, `INCLUDE=*.B,*.C` with `EXCLUDE=local_*,preview_*` includes rooms B and C except in the excluded spaces. Use the full environment variable names above. Exclusions support room patterns too: `EXCLUDE=*.Archive` hides rooms named `Archive` everywhere.

The first unescaped dot separates space and room patterns. Write `FC\.RWW.B` to match space `FC.RWW`, room `B`; dots after the separator are literal room-name characters. An explicit empty part such as `Teams.` matches nothing.

Filters are case-sensitive full-name matches with `*` as the only wildcard. Exclusions blacklist matching space/room pairs even when included. Empty include means all named spaces; empty exclude means no blacklist. With both empty, all named spaces qualify. Leading/trailing whitespace is ignored for matching; display names remain unchanged. Restart/rebuild after changing configuration.

Only joined rooms linked from joined, allowed spaces are listed or opened, including restored selections. A room's self-declared parent alone is insufficient: the space must list it as a child. Rooms without spaces are hidden. For nested spaces, every known ancestor must also be joined and match the filters using the final room name (for example, `*.B` also works for nested room B). A room linked to both allowed and excluded spaces is hidden; cyclic hierarchies are also hidden.

**This is an app visibility filter, not an authorization boundary.** Matrix sync and local SDK storage may still receive other rooms the account has joined. Use separate accounts, memberships, or homeservers when actual environment isolation is required. Matrix administrators control who may rename spaces and change their child lists.

## Run locally

```sh
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

For a LAN test, `npm run dev -- --host 0.0.0.0` exposes the development server to the local network. A plain HTTP LAN address is not a secure browser context: crypto and Web Locks may fail. Use an HTTPS development setup for phone testing. Do not expose the development server publicly.

## Build and preview

```sh
npm run build
npm run preview
```

`build` type-checks the application and writes static production files to `dist/`. `preview` serves that build locally, usually at `http://localhost:4173`; it is not a production server.

Serve **only `dist/`** from an HTTPS static host. Never serve the repository root, `.env`, `.git`, or browser data. The app currently uses root-relative asset paths and expects deployment at `/`; a GitHub Pages project subdirectory needs additional base-path work. Publishing the repository to GitHub does not deploy the application.

Configure the security headers described in [deployment guidance](docs/deployment.md). The current large-chunk warning is expected from the Matrix SDK and crypto implementation; the emoji picker is loaded separately on demand.

## Test and check

```sh
npm test                   # Node's built-in test runner; Node 24 runs the TypeScript helpers
npm run lint               # ESLint, including React hooks rules
npm run build              # TypeScript and production bundling
npm run check              # All three checks above
npm run security:check     # Limited credential scan of source files and the Git index
npm audit --audit-level=low # Known dependency advisories
```

Run an individual test file with:

```sh
node --test tests/attachments.test.mjs
```

The tests use fixtures and mocked Matrix requests; they do not require an account or modify live rooms. Crypto and backup tests exercise the actual Matrix WASM implementation, including tampered media and missing backup history. Coverage also includes session storage, recovery, room ordering, read markers, permission checks, reactions, polls, and reading positions.

Browser behavior is not fully covered by these unit tests. Before release, manually check login, reopening an encrypted room, read badges, mobile composing, attachment previews, reactions, and backup/recovery with a disposable test account. Never test destructive logout with the only copy of important room keys.

GitHub Actions runs the source check, lint, tests, build, and dependency audit on pushes and pull requests. It uses read-only repository permissions and pinned action revisions. Dependabot checks npm packages and workflow actions weekly.

## Features

### Login and session handling

- Password login to an existing Matrix account, with short usernames or full Matrix IDs and homeserver discovery as described above.
- **Angemeldet bleiben** remembers the session; otherwise the access token is kept for the browser tab's session. Previously saved sessions are restored when the app opens.
- Account-specific device and encryption-key storage, plus a browser lock to prevent concurrent use of the same crypto store across tabs.
- Loading, connection, login, and crypto-startup error states. Expired sessions return to login.
- The profile footer shows the current user, connection state, backup/security button, and logout button.

### Layout, rooms, and navigation

- German interface with a dark blue theme, circular club logo on white, rounded team avatars, and initials when an avatar is unavailable.
- Desktop shows the room list beside the selected conversation. Mobile switches between the list and conversation, with a back button.
- Joined rooms are listed with their parent Matrix space information; spaces themselves are not shown as chats. Include/exclude rules apply to the list and restored room selections; see [Space and room naming](#space-and-room-naming).
- Search by room or space name. Rooms sort by newest message timestamp, with alphabetical ties; empty rooms appear last alphabetically. Administrative events, reactions, and message edits do not move a room to the top.
- Room rows show avatars, two-line message previews, sender names, photo/video/file indicators, timestamps, and unread counts. A muted indicator reflects existing Matrix room push rules; this app does not provide a mute-setting control.
- Unread timestamps and badges use green. Dates display as a time today, **Gestern**, or a date for older messages.
- The chat header shows the room name, space, member count, and explicit retention policy when present. Timer badges also identify rooms with an explicit retention policy.
- The selected room and reading position are stored per account. Selecting a room does not create an invitation or public room link.

### Reading history and unread messages

- Entering a room marks messages through its latest locally available message as read in Matrix. Clicking the message area also retries read marking. New messages arriving during a pending read request retain their unread indication.
- Per-room scroll bookmarks survive reloads. The app follows new messages while at the bottom and lets you browse older history without jumping back down.
- Growing the message input preserves bottom-following behavior. Changing the layout or loading media preserves the reading anchor.
- Older/newer history can be loaded with pagination buttons. **Zu den neuesten Nachrichten** returns to the live end of the conversation; failed history loads provide retry controls.
- Messages are separated by day and grouped by sender, with colored sender names, avatars, timestamps, and outgoing send-status text.

### Composing, replies, and deletion

- Text messages use incoming blue and outgoing green bubbles with mobile-friendly maximum widths. The composer has no placeholder text.
- **Enter** sends; **Shift+Enter** inserts a newline. The input grows to five visible lines, then scrolls internally. IME composition does not trigger Enter-to-send prematurely.
- An empty composer shows **+** and the camera shortcut. Text or an attachment enables Send; the camera moves into the attachment menu while composing.
- Message options offer **Antworten** and **Löschen**. A reply draft shows its quoted original and can be cancelled before sending.
- Click a quoted reply to jump to and briefly highlight the original message. Older originals load their surrounding history directly. Keyboard users can activate the quote as a button; unavailable or locally hidden originals show an explanation.
- Failed outgoing messages offer retry or discard. Sending errors leave the draft available to retry.
- **Löschen** opens a confirmation. Local deletion hides a message for this browser or temporary session; **Für alle löschen** uses Matrix redaction when permitted. Redaction cannot retract copies already saved elsewhere.
- Deleted and undecryptable messages use compact placeholders; decryption details are available in the message tooltip.

### Files, photos, videos, and camera

- **+** offers files, photos/videos, and polls. Camera capture uses the browser/device file picker; availability depends on the device and browser.
- One attachment can be staged at a time. Its thumbnail or file icon replaces **+**; you can replace or remove it before sending. Existing text is preserved and sent as its caption in the same Matrix message.
- The homeserver's upload-size limit is checked before uploading. Encrypted rooms use encrypted media; media downloads use authenticated homeserver URLs.
- Images have inline previews; videos have inline playback controls. Other files load on demand. Download and retry controls are provided.
- Original upload names are replaced by generic names such as `example-org-B-2026-09-19-15-25-30-007.png`. The prefix comes dynamically from the Matrix account domain, with the homeserver hostname as fallback; `B` is the fixed filename marker. Downloads generate a name using the current local date/time, including milliseconds. Original filenames are not displayed in the attachment UI.
- **File contents and embedded metadata (such as EXIF/GPS) are not scrubbed.**
- Tap an image for a full-screen view, animated from and back to its inline position. Back, Escape, background tap, or a vertical swipe closes it and restores the message-list position. Reduced-motion preferences disable the transition.

### Emoji reactions

- Tap a message to show quick reactions: 👍 ❤️ 😂 😮 😢 🙏 🙈.
- **+** on the reaction bar opens the searchable `emoji-picker-react` library with native emoji rendering.
- Reaction chips show counts and whether you reacted. Click a chip to add your reaction or remove your own existing reaction. Hover text lists the reacting members.
- Reactions update from Matrix events; load failures offer retry. Sending respects the room's permissions and requires a sent, non-redacted message.

### Polls

- Create a poll from **+ → Umfrage**, with a question and 2–20 distinct nonempty answers. The form limits the question to 500 characters and each answer to 200 characters.
- Polls created here allow one choice per person and display results openly. Incoming polls can also allow multiple selections or withhold results until the poll ends.
- Your selected answers have checkmarks. You can change or deselect votes while the poll remains open, within its selection limit.
- Visible results include vote counts, voter initials, relative result bars, and participant totals. Bars are scaled against the most popular answer, not percentages of all votes.
- **Stimmen ansehen** lists voters by answer when results are visible. The creator can end their poll; ended polls disable voting.
- Poll-load and vote errors provide feedback and retry controls. Poll compatibility depends on the other Matrix clients in the room.

### Room administration

Joined room admins with power level 100 or higher can open room details by clicking the chat title. Individual actions also check the relevant Matrix power-level permission; the homeserver is the final authority.

Room details include room/space information, member avatars and roles, member search, an expandable member list, name editing, invitations by full Matrix ID, and retention options: **24h, 7d, 30d, 60d, or server standard**. “None” is displayed as unavailable because this app cannot provide an unlimited-retention override of the server default. Invitation links and QR codes are not implemented.

Retention uses the experimental `m.room.retention` room state. The server must support and enable it; server minimum/maximum limits may override the selected duration. The room badge shows the explicit room policy, not a verified effective server default. Retention is not a guarantee that copies on other clients, downloads, backups, or federated servers are erased.

### Devices, keys, and logout

The cloud-and-key button beside the logged-in user opens **Gerät & Sicherung**:

- Create a Matrix room-key backup without resetting an existing backup.
- Show an available backup recovery key, restore room keys, and verify backup coverage.
- Accept a direct backup key or a compatible Matrix Secret Storage recovery key.
- **Abmelden** on a remembered device stops the local session and clears stored access tokens while retaining local keys for the next login. This does not revoke the Matrix server session. On a temporary session, the footer directs you to device/security options.
- **Gerät vergessen & vollständig abmelden** verifies recoverability, revokes the server session, and removes this account's local crypto stores, key archives, vault, and saved reading positions. You must save the recovery key outside the browser and enter it again. Failure before cleanup preserves local keys; partial cleanup after a server logout may leave some local data.

Backup verification imports the downloaded backup and local snapshot into an isolated in-memory crypto engine. Missing sessions or earlier ratchet history prevent destructive cleanup. A room-key backup preserves recoverable message history, not the device's private identity.

Older local stores are migrated by encrypting and verifying room-key archives before deleting legacy plaintext stores. Migration to an encrypted store can require a new device identity. An older manually protected vault asks for its previous unlock code once.

## Functionality not currently provided

- Account registration, SSO login, password reset, and account/profile editing.
- Creating spaces or rooms, joining rooms through links, invitation links, or QR codes.
- Voice messages, voice/video calls, contact cards, and calendar-event creation.
- Editing or forwarding existing messages, bulk attachment selection, and searching message history.
- Interactive device verification/cross-signing setup, guaranteed server-side deletion after retention, or media metadata removal.

Use another compatible Matrix client for workflows not exposed here. Visibility filtering does not restrict what the Matrix account can access through other clients.

## Security and privacy limits

Read [SECURITY.md](SECURITY.md) before deploying or using this app with sensitive data.

See the [public-source readiness review](docs/security-review.md) for findings, fixes, verification results, and remaining release checks.

- End-to-end encryption applies only to rooms with Matrix encryption enabled. This app does not force encryption on every room or implement an interactive device-verification UI.
- “Angemeldet bleiben” stores the access token in `localStorage`; otherwise the token is in `sessionStorage`. In both modes, encrypted keys and the browser-managed material used to unlock them persist locally. This is **not** protection against same-origin scripts, malicious extensions, or someone who can read the browser profile.
- Room names, membership, timestamps, and some event metadata are not covered by message-body encryption. Reactions are standard Matrix reaction events and are not encrypted message bodies.
- Message text is rendered as text, not trusted HTML. Do not add analytics, third-party scripts, or unsafe HTML rendering to the authenticated origin without a security review.
- Public source availability and passing tests are not an independent security certification.

## Before publishing to GitHub

```sh
npm ci
npm run check
npm run security:check
npm audit --audit-level=low
git status --short
git diff --cached --stat
```

Review all proposed files, then stage your intended changes and rerun `npm run security:check`. It checks indexed blobs as well as working files, but only a limited set of credential formats; review for private data and other secret formats yourself. Never commit screenshots of real chats, key exports, HAR files, live credentials, or `.env` files. If a credential ever entered Git history, revoke/rotate it and remove it from history before publishing.

Enable GitHub secret scanning/push protection where available and require the Checks workflow for protected branches. Confirm you have permission to publish included logos and assets. This repository does not currently include a license granting reuse of the code or club branding.

## Project structure

```text
src/components/   Chat UI, room list, media, reactions, polls, and account screens
src/hooks/        Timeline pagination and scroll-position behavior
src/matrix/       Login, sessions, encryption, backup, media, and room helpers
tests/            Node tests with mocked transport and real crypto primitives
scripts/          Local public-repository checks
public/           Static app logo and assets
.github/          CI and dependency update configuration
docs/             Deployment guidance and review notes
```
