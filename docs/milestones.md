# Milestones

| Milestone | Scope | Status |
|---|---|---|
| **M0** | References, rights, schemas, architecture and security design | **Complete (pending owner review)**: see below |
| M1 | Windows 95 desktop and window management | Not started |
| M2 | Local applications and persistence | Not started |
| M3 | AOL, connection scheduler, Netscape | Not started |
| M4 | Seven-site world and clue chain | Not started |
| M5 | Accessibility, security, performance, browser QA, deployment-ready package | Not started |

## M0 report (2026-10-29)

**Works**

- Repository with pinned toolchain and lockfile. The Vite production build runs end to end
  (placeholder page only: 69 KB gzipped).
- 13 JSON Schemas covering every contract in handoff §10, plus save export. Compiled to
  standalone validators with no eval, and a stale-output check.
- Screen-name normalization per §5.
- Asset-rights registry, schema and build gate. Public builds reject pending, blocked,
  reference-only, expired, unevidenced and unregistered files.
- CDK v2 app: test and prod site stacks (private S3 + CloudFront OAC, security headers, narrow
  `/time-machine/` router), optional prod certificate stack, guarded `infra:*` commands.
- Owner-controlled foundation template (boundary and operator roles) and restricted bootstrap
  template, both passing cfn-lint 1.59.0.
- Documents: architecture, decisions, historical references, asset rights, security design,
  profile setup, runbooks, cost worksheet, open questions.

**Tests actually run**

- `npm test`: 240 passed (contracts with 59 targeted invalid cases, screen names, asset gate,
  site stacks, router function, policy invariants, argument/preflight/config guards, template
  validation).
- `npm run typecheck`: clean. `npm run build`: passes. `npm run infra:check`: passes for both
  environments. `cfn-lint` on all three templates: no findings.

**Not done / not verified**

- No AWS calls of any kind; IAM policies are verified only statically (tests and cfn-lint), not with
  Access Analyzer or a real deploy.
- No UI beyond a placeholder. No browser tests yet (Playwright installed; browsers not downloaded).
- Historical builds for AOL and Netscape are not fully resolved (dates to source).
- The publish step (`infra:publish`) is designed but not written (M5).

**Risks**

- Authentic branding very likely can't be cleared (decision 1).
- Root-path routing on `chugging.coffee` is unknown (decision 2).
- The first real deploy may show missing read permissions for CloudFormation's handlers; each
  becomes an expansion proposal.

**Next step:** M1, the window manager state machine and Windows 95 shell, after owner review of M0.

## M0 follow-up (2026-10-30)

Owner decisions recorded (open-questions.md): authentic skin (rights-gated), production on the
chugging.coffee apex, account 196691452297, AOL 2.5, Netscape 2.0 beta.

- Config confirmed for both environments; prod `domainName: chugging.coffee`. The certificate
  stack can deploy before the site attaches the alias.
- Foundation trusts one exact IAM user or role (parameter `TrustedPrincipalArn`).
- `npm run access:setup` (`--plan` / `--apply`) bootstraps from the owner's `aws login` session,
  with CloudFormation validation and blocking Access Analyzer checks first.
- `infra:*` now uses exported short-lived operator credentials (luna.is pattern).
- Applied with the owner's session: `ctm-foundation`, `CDKToolkit-ctmtest`, `CDKToolkit-ctmprod`
  (termination protection on; prod ACM limited to chugging.coffee). Access Analyzer: zero findings.
- Found that the CDK CLI can't meet the deploy role's resource-type condition; `infra:*` now drives
  change sets directly (D15). A live test preview change set succeeded and was cleaned up.
- `npm run access:verify`: 49/49 live allow/deny checks as designed.
- No site stack deployed; no DNS changed.
