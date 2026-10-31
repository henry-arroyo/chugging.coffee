# Open questions and owner decisions

## Decided (2026-10-30)

| # | Question | Decision |
|---|---|---|
| 1 | Skin | **Authentic Microsoft, AOL and Netscape** is the target. Assets are added only with permission evidence; the public-build gate enforces this. See asset-rights.md for the clearance plan and what happens if clearance fails. |
| 2 | Routing | **Production owns `chugging.coffee`.** The apex currently shows only an old iPage placeholder (Cloudflare-proxied A/AAAA). The Zoho MX and SPF/verification TXT records stay untouched. |
| 3 | AWS account | **196691452297** (same account as luna.is), us-east-1 |
| 4 | Sign-in / trusted principal | `aws login` as the owner's IAM user (`henry.arroyo` in the luna.is setup); the operator roles trust that exact user. Bootstrapped by `npm run access:setup` with the owner's session. |
| 5 | AOL reference | **America Online for Windows 2.5** |
| 6 | Netscape reference | **Netscape Navigator 2.0 public beta** |
| 13 | Screen name length (AOL in 1995 allowed 10) | **Keep 3-16 characters**, also on AOL (2026-10-30) |
| 14 | Passwords | **When added, stored only in this browser like everything else** (2026-10-30). Not implemented yet; see D28 |
| 15 | Logos | Owner wants **realistic Windows, AOL and Netscape logos** (2026-10-30). They ship once written permission is recorded (asset-rights.md); until then the slots hold original stand-ins |

| 16 | Tested browsers | Chromium, Firefox and WebKit engines via Playwright (M5). Real Edge, Safari and phones still need a manual pass before a public launch |

## Still open

| # | Question | Blocks | Default until answered |
|---|---|---|---|
| 7 | **Certificate management** for `chugging.coffee` in the prod bootstrap (ACM, that one domain only, DNS validation) | Production custom domain | Included in the proposed `access:setup --apply` run only if the owner approves it |
| 8 | Which 2.0 beta exactly? | Owner sign-off only | **2.0b3**: current on the 1 Dec 1995 story date (b4 came 22 Dec); D31 |
| 9 | AOL 2.5 is a Windows 3.1 program: show its 3.1-style controls inside Windows 95? | Nothing | **No.** The owner's screenshot shows Windows 95 drew its frames and buttons in the 95 style (D37) |
| 10 | `/` on chugging.coffee: 404 (current design) or redirect to `/time-machine/`? | Nothing urgent | 404 |
| 11 | `www.chugging.coffee` also points at the iPage placeholder: leave it, or redirect later? | Nothing urgent | Leave unchanged |
| 12 | Public repository? (account ID is committed in `infra/config`) | Nothing urgent | Committed; account IDs are identifiers, not secrets |

