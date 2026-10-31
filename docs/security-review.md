# M5 security review (2026-10-30)

A review of the finished v1 application against [security-design.md](security-design.md), with
what was checked, how, and what remains. Nothing here has been checked against a deployed
environment yet; that happens after the owner authorizes a test deployment.

## Verified by automated tests

| Area | Check | Where |
|---|---|---|
| Content Security Policy | The production build, served with the exact CloudFront headers (shared in `infra/lib/headers.ts`), runs a full sign-on, AOL, keyword and Netscape journey with **no CSP violations and no page errors**. | `tests/prod/production.spec.ts` (`npm run test:prod`) |
| No real internet | A Netscape journey tries real hosts; **no request leaves the local origin**. Real-internet addresses are refused before any network access. | `tests/e2e/online.spec.ts`, `tests/unit/net/address.test.ts` |
| World integrity | Manifests are checked against the release SHA-256; a tampered manifest is rejected; a page carrying an injected `html` block fails validation and is never rendered. Frozen releases are served byte for byte. | `tests/unit/net/repository.test.ts` |
| Safe rendering | Pages are typed blocks rendered as text; links never carry a real `href`; styles come from a validated palette; chat text styles come from a fixed list. | `src/content/render/`, `src/apps/aol/areas.tsx` |
| Local data | Every stored record and imported save is validated; 1 MiB import limit before parsing; hostile records are dropped. | `tests/unit/persistence/` |
| Clue rewards | Written only when the chain is complete, only to a `.txt` file directly in `C:\My Documents`, never overwriting (`addCollected`). The build rejects any other reward path. | `scripts/world/build.ts`, `src/shell/Shell.tsx`, `tests/e2e/world.spec.ts` |
| Accessibility of security prompts | Sign-off, reset, import and restart confirmations are reachable by keyboard and screen reader. | `tests/e2e/input.spec.ts`, `tests/e2e/a11y.spec.ts` |

## Reviewed by reading the code

- **Audio and speech** start only from a user gesture (the Sign On click) and respect the sound
  setting. No microphone, camera or other permissions are requested; `Permissions-Policy` turns
  them off.
- **Scripted people** (chat, mail, guestbook) are fictional and labeled; nothing a guest types
  leaves the browser.
- **Storage scope**: only IndexedDB/localStorage on the site's own origin; no cookies, no
  third-party requests, no analytics.
- **External links**: none. The only URLs the app fetches are its own `/time-machine/` files.

## Dependencies (`npm audit`, 2026-10-30)

- **Runtime (shipped to visitors): React and React DOM only. 0 known vulnerabilities.**
  `ajv` moved to development dependencies in M5: validators are compiled at build time and the
  bundle contains no ajv code.
- **Development and build tooling: 3 moderate advisories, accepted for now.**

  | Package | Advisory | Why it is accepted | Revisit |
  |---|---|---|---|
  | `fast-uri` 3.1.8 (via `ajv`, build time) | GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp | Runs only while compiling our own schemas (trusted input). The fixed 3.1.9 was published 2026-10-19, newer than the project's two-week rule. | Adopt 3.1.9 after 2026-11-02 |
  | `minimatch` 10.2.5 (inside `aws-cdk-lib`) | GHSA-g3hv-75wg-m249 (denial of service with crafted globs) | Bundled inside the CDK library; only our own file patterns are matched during synth. No fix in aws-cdk-lib yet. | Next aws-cdk-lib upgrade |

## Infrastructure

Unchanged from M0 and already applied: restricted bootstrap, permission boundary, per-environment
operator roles, `access:verify` 49/49 policy-simulator checks. **No permission changes are needed
for M5**: the publish command uses the existing `PublishAndClean<Env>Site` and
`Invalidate<Env>Distribution` statements of each operator role.

## Open items

1. **Deployed checks** (after authorization): response headers on the real CloudFront
   distribution, HTTPS redirect, 404 for paths outside `/time-machine/`, MIME types, and the
   CSP journey against the test URL.
2. **Written brand permission** for Microsoft, AOL and Netscape (asset-rights.md).
3. `'unsafe-inline'` for styles stays (React style attributes). Scripts are strict.
