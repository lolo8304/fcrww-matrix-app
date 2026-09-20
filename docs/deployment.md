# Production deployment

Build with public configuration using `npm ci && npm run build`. Serve only `dist/`, at the origin root, over HTTPS. Avoid third-party scripts and host the app on a dedicated origin: unrelated same-origin applications can access its browser storage.

The repository does not configure a production host. The following headers are a starting policy to configure on your web server/CDN and test against your actual homeserver. They are not applied by `npm run build` or by publishing the repository to GitHub.

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(self), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000
```

- `wasm-unsafe-eval` permits the Matrix crypto WASM module. Do not replace it with unrestricted script `unsafe-eval`.
- Inline styles support React positioning and the emoji picker; inline scripts are not permitted by this policy.
- The app allows login to other Matrix domains, so this example permits HTTPS connections generally. For a club-only deployment, tighten `connect-src` to your exact homeserver and discovery origins after testing all required traffic. A broad HTTPS rule does not prevent exfiltration by compromised application code.
- HTTPS is required for production. Add HSTS only once HTTPS is correctly configured; subdomain coverage/preloading needs a separate review.
- Native camera file selection depends on the browser/OS. Voice recording is not implemented.
- Serve `.wasm` as `application/wasm`, JavaScript with a JavaScript MIME type, and CSS as `text/css`. Do not return the HTML fallback for missing assets.
- Prefer short/no-cache HTML and immutable caching for Vite's hashed assets. Do not cache authenticated Matrix traffic in your application proxy or service worker.
- GitHub Pages does not provide arbitrary response-header configuration. Choose a host/reverse proxy with header control for this policy; a meta CSP cannot enforce `frame-ancestors` and does not replace other response headers.

Test login, discovery, encrypted text/media, image previews, backup/restore, and browser-console CSP violations after applying the headers. Also test the actual mobile browsers your users rely on. This example has not been validated against a production deployment.
