# Testing

| Command | What it runs |
|---|---|
| `npm test` | Vitest: contracts, window manager, drag math, menus, Run parsing, manifests, asset gate, CDK stacks, IAM policy invariants, infra guards |
| `npm run test:e2e` | Playwright journeys against the dev server (`/time-machine/`) |
| `npm run visual:capture` | Screenshots into `tests/visual/pending/` for **human** review (never auto-approved) |
| `npm run typecheck` | App and Node/test TypeScript projects |
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

## Tested versions

| Date | Browser | Engine | Result |
|---|---|---|---|
| 2026-10-30 | Chrome for Testing 156.0.8078.4 (headless shell, Playwright 1.64.0, Linux/WSL2) | Chromium | 18/18 shell journeys; 54/54 over three repeats |

Firefox, Safari/WebKit, Edge and mobile smoke tests are scheduled for M5 and are **not yet run**.

## Not yet covered

- The application crash boundary has no automated test yet (no app can be made to fail on demand).
- The 45-minute exploration session for leaks (M5).
- Screen-reader journeys (M5); M1 provides roles, names, focus management and keyboard paths.
