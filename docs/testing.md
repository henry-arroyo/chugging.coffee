# Testing

| Command | What it runs |
|---|---|
| `npm test` | Vitest: contracts, window manager, drag math, menus, Run parsing, manifests, virtual drive, Klondike, Minesweeper, persistence (with fake-indexeddb), addresses, connection, transfer scheduler, world build and repository, network service, asset gate, CDK stacks, IAM policy invariants, infra guards |
| `npm run test:e2e` | Playwright journeys against the dev server (`/time-machine/`) in Chromium, Firefox and WebKit, including axe-core accessibility scans, keyboard-only and touch-only journeys |
| `npm run test:prod` | Builds, then runs `tests/prod/` against the production build served with the CloudFront headers: CSP compliance, startup time, bundle size, drag smoothness |
| `SOAK_MINUTES=45 npx playwright test -c playwright.prod.config.ts soak` | The 45-minute leak session (after `npm run build`) |
| `npm run visual:capture` | Screenshots into `tests/visual/pending/` for **human** review (never auto-approved) |
| `npm run typecheck` | App and Node/test TypeScript projects |
| `npm run content:check` | World release: contracts, links, anchors, keywords, assets, checksums |
| `npm run infra:check` | Synthesizes and validates both environments |

## Browsers

First time: `npx playwright install chromium`. Playwright normally also needs system libraries
(`sudo npx playwright install-deps chromium`). Without root, unpack them into
`~/.cache/ctm-test-libs`, which `playwright.config.ts` picks up automatically:

```bash
mkdir -p ~/.cache/ctm-test-libs/debs && cd ~/.cache/ctm-test-libs/debs
apt-get download libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 libasound2t64 libatspi2.0-0t64 libxi6
for d in *.deb; do dpkg-deb -x "$d" ../root; done
```

Firefox and WebKit need more system libraries. Without root, unpack the packages from
Playwright's own Debian 13 list into `~/.cache/ctm-test-libs/extra` (about 2.2 GB):

```bash
npx playwright install firefox webkit
mkdir -p ~/.cache/ctm-test-libs/extra/debs && cd ~/.cache/ctm-test-libs/extra/debs
# Package names: the "debian13-x64" firefox and webkit lists in node_modules/playwright-core,
# plus their dependencies that are not installed (apt-cache depends --recurse ...).
apt-get download <packages>
for d in *.deb; do dpkg-deb -x "$d" ../root; done
```

`playwright.config.ts` then skips Playwright's pre-launch library check, points Firefox at the
local libraries, and starts WebKit through `scripts/test/webkit-local.sh` (WebKit's own launcher
replaces `LD_LIBRARY_PATH`; the script also points Mesa's EGL loader at the local driver).

## Tested versions

| Date | Browser | Engine | Result |
|---|---|---|---|
| 2026-10-30 | Chrome for Testing 156.0.8078.4 (headless shell, Playwright 1.64.0, Linux/WSL2) | Chromium | M1: 18/18 shell journeys; 54/54 over three repeats |
| 2026-10-30 | Same | Chromium | M2: 31/31 journeys (shell + programs); 93/93 over three repeats |
| 2026-10-30 | Same | Chromium | M3: 37/37 journeys (adds AOL, Netscape, network); 108/108 over three repeats before the sound journey was added |
| 2026-10-30 | Same | Chromium | M4: 43/43 journeys (adds the clue chain, Switchboard reachability, new-edition prompt, dark pages) |
| 2026-10-30 | Chrome for Testing 156.0.8078.4 | Chromium | M5: all journeys, including axe scans, keyboard-only, and touch (mobile emulation, 412x915) |
| 2026-10-30 | Playwright Firefox 157.0 (Linux) | Gecko | M5: all journeys except touch (Playwright cannot emulate mobile in Firefox) |
| 2026-10-30 | Playwright WebKit 27.2 (WPE, Linux) | WebKit | M5: all journeys, including touch (mobile emulation) |

**Not tested on real products:** Microsoft Edge (Chromium-based; covered by the Chromium engine
only), Apple Safari on macOS/iOS (covered by Playwright's WebKit build, not Safari itself), and
real phones (covered by mobile emulation in Chromium and WebKit). Run a smoke pass on real
devices before a public launch.

## Not yet covered

- The application crash boundary has no automated test yet (no app can be made to fail on demand).
- Screen-reader journeys with a real screen reader (NVDA, VoiceOver). Automated axe scans and
  keyboard-only journeys pass; a human pass with a screen reader is still recommended.
