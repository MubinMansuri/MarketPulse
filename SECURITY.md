# Production security operations

## Current application controls

- Translation APIs accept only same-origin JSON POST requests, validate and bound input, return `no-store`, and apply per-instance IP throttling.
- Next emits a Content Security Policy, HSTS, anti-clickjacking, MIME-sniffing, referrer, permissions, and cross-origin policy headers.
- PDF parsing stays lazy-loaded. No GTM presentation or report workflow is changed by these controls.

## Required edge control before production

The in-process limiter is a fallback only. It does not share counters between instances or regions. Configure an edge WAF with a shared, IP-based limit before exposing either translation endpoint.

Use the following rollout values initially. They are deliberately more permissive than the application fallback to prevent false positives while production traffic is observed.

| Path and method | Key | Initial limit | Enforcement |
| --- | --- | --- | --- |
| `POST /api/translate` | client IP | 60 requests / 60 seconds | Log first, then HTTP 429 |
| `POST /api/translate/batch` | client IP | 20 requests / 60 seconds | Log first, then HTTP 429 |

After at least 24 hours of clean traffic review, tune toward the app limits (20/min and 10/min respectively) only if legitimate users stay comfortably below them. Keep standard managed DDoS and bot protections enabled. Do not count on client-provided `X-Forwarded-For`; configure the hosting platform or reverse proxy to supply and trust the verified client IP.

### Vercel Firewall example

If the project is deployed on Vercel, first link the repository to the correct project. Stage these rules in **log** mode, review traffic, and let a production owner publish the drafts:

```sh
vercel firewall rules add "Observe single translation abuse" \
  --condition '{"type":"path","op":"eq","value":"/api/translate"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action log --yes

vercel firewall rules add "Observe batch translation abuse" \
  --condition '{"type":"path","op":"eq","value":"/api/translate/batch"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action log --yes
```

After review, replace each rule with the platform's IP-keyed rate-limit action using the limits in the table. On Vercel the counters are per region, so verify the deployment region strategy or use the platform rate-limiting SDK/shared store if a strict global quota is required. Run `vercel firewall diff` before the owner runs `vercel firewall publish --yes`.

### Multi-instance verification

Run the same request burst against two separate production instances or regions with one known test IP. The edge must issue HTTP 429 after the shared threshold across the combined requests, not separately per instance. Record the WAF rule ID, time window, region(s), request count, and response status in the deployment change record. Do this only against a staging or explicitly approved production environment.

## Deployed header verification

Replace the URL below with the HTTPS production URL and verify all expected headers:

```sh
curl -sSI https://YOUR_DOMAIN/ | grep -Ei 'content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|cross-origin-opener-policy|cross-origin-resource-policy'
```

Expected values include `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security: max-age=31536000`, `Referrer-Policy: strict-origin-when-cross-origin`, and the configured permissions/cross-origin policies. Test the GTM report, PDF import, external GTM logo, and translation workflow after applying a WAF rule or changing CSP.

## Dependency risk review

`npm audit --omit=dev` is clean. The full audit currently reports eight moderate findings only in the development lint chain:

- Direct package: `eslint-config-next@16.4.5`.
- Transitive path: `typescript-eslint` and `minimatch` (glob amplification advisory).
- `npm outdated` reports no compatible non-breaking update. The audit's suggested `eslint-config-next@15.5.29` is a major downgrade from Next 16 and is not safe.

Accepted risk: development-only tooling, not shipped in the production runtime. Monitor the Next.js release notes and run `npm run audit:prod` on every release; update the lint toolchain when Next publishes a compatible patch.
