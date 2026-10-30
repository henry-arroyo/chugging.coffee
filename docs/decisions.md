# Architecture decisions

Short records of decisions and why. Superseded entries stay, marked as such.

## D1. Toolchain: TypeScript, React, Vite, Vitest, Playwright, npm (2026-10-29)

As the handoff specifies. The repository started empty, so there was no existing stack to keep.
npm (not pnpm) because it's what's installed. Dependencies are pinned exactly (`.npmrc`
`save-exact`), installed with `--before` set two weeks back, and the lockfile is committed.
Installed: React 19.3, Vite 8.3, Vitest 5.0, TypeScript 7.0, Playwright 1.64, aws-cdk-lib 2.273,
aws-cdk CLI 2.1145, ajv 8.20.

*Open item:* ajv's dependency `fast-uri` 3.1.8 has moderate advisories (URI parsing). The fix,
3.1.9, was released 2026-10-19, which is under the two-week rule. fast-uri isn't reachable at
runtime (precompiled validators don't import ajv, and schemas avoid `format: uri`). Update after
2026-11-02.

## D2. Schemas are authoritative and precompiled (2026-10-29)

JSON Schema 2020-12 files in `schemas/` are the single source of truth. A build step compiles them
to standalone ESM validators, so the browser never runs `new Function` (keeps `unsafe-eval` out of
the CSP) and doesn't ship ajv. TypeScript types in `src/core/contracts/types.ts` mirror the
schemas by hand; fixtures and tests catch drift. Date and date-time use regex patterns instead of
ajv-formats, which doesn't fit standalone ESM output.

## D3. Content is safe block JSON, not HTML (2026-10-29)

See architecture.md. One addition to the handoff's block list: `preformatted` (text only, with an
accessible label) for BBS screens and ASCII art.

## D4. World releases are immutable; tabs pin a release (2026-10-29)

`world/current.json` is the only mutable pointer. Rollback is a pointer change. Personal progress
references stable IDs and the release it happened in.

## D5. One CDK app per environment, with separate bootstrap qualifiers (2026-10-29)

`ctmtest` and `ctmprod` each get their own bootstrap stack, staging bucket, deploy role,
file-publishing role and execution role. That puts the prod/test split in IAM itself rather than in
naming conventions. Each `cdk` run synthesizes exactly one environment (`-c env=…`).

## D6. Custom minimal bootstrap template, no default AdministratorAccess (2026-10-29)

Derived from the CDK v2 bootstrap template (version 32): no ECR, image role, lookup role or KMS
key; trust restricted to the environment's operator role; scoped execution policy; boundary on every
role. The deploy role can only create change sets that use the environment's execution role and
contain allowlisted resource types (`cloudformation:RoleArn`, `cloudformation:ResourceTypes`,
confirmed against AWS's service reference on 2026-10-29).

## D7. No BucketDeployment, no auto-delete; files published by a script (2026-10-29)

Both add Lambda functions and IAM roles. The site stack has exactly six resource types and no
IAM. Site files go up via the operator role's narrow S3 permissions (publish step, M5), and
teardown empties the bucket explicitly after checking its name and tags.

## D8. Certificate stack has its own lifecycle; its ARN goes into config (2026-10-29)

No cross-stack export, so the site stack can be destroyed and rebuilt freely and the certificate
(free, slow to validate) stays. DNS is in Cloudflare (seen in the sibling luna.is project), so
validation and alias records are added by hand. No Route 53 permissions are granted at all.

## D9. us-east-1 only (2026-10-29; confirmed 2026-10-30)

CloudFront certificates must be in us-east-1. One region avoids cross-region references, and
matches the sibling project in the same account.

## D10. Bootstrap maintainer is the owner's admin identity (2026-10-29)

See security-design.md. Routine roles carry a boundary that denies IAM writes and changes to the
foundation and bootstrap stacks.

## D11. ~~Interim skin is original stand-ins~~ (2026-10-29; superseded by D12)

## D12. Authentic skin is the target, gated by permission evidence (2026-10-30)

Owner decision: authentic Microsoft, AOL and Netscape branding and artwork. Nothing authentic is
extracted, committed or shipped until its registry entry is `approved` with permission evidence;
the build gate enforces this. The shell is built so every branded element (icons, logos,
wordmarks, sounds, fonts, cursors) is a registry asset slot, so cleared files drop in with no code
changes. Until then, slots hold labeled stand-ins. Layout, metrics, colors and behavior follow
the 4.00.950 reference. If clearance is refused or stalls, the handoff requires a new owner
decision (approved homage or postpone) rather than a silent change.

Solitaire and Minesweeper implement the traditional Klondike rules and the minesweeper genre
rules with original card faces, backs and game art in every case; they are not recreations of
Microsoft's versions.

## D13. Production serves the chugging.coffee apex (2026-10-30)

The apex shows only an old iPage placeholder, so the production distribution takes the apex
(`domainName: chugging.coffee`). In Cloudflare, the apex A/AAAA records are replaced by one
DNS-only CNAME to CloudFront (Cloudflare flattens it); MX and TXT (Zoho mail) are not touched.
The certificate stack deploys first; the site attaches the alias only once `certificateArn` is
recorded in config.

## D14. Access is set up from the owner's `aws login` session (2026-10-30)

Same pattern as luna.is: the owner signs in with `aws login --profile time-machine-bootstrap
--remote` and hands the session over. `npm run access:setup` validates both templates with
CloudFormation and every policy with IAM Access Analyzer (blocking on errors and security
warnings), then applies `ctm-foundation`, `CDKToolkit-ctmtest` and `CDKToolkit-ctmprod`, turns on
termination protection, and writes the two operator profiles. The operator roles trust exactly
the signed-in IAM user (never root or the whole account, unlike luna.is). `infra:*` exports
short-lived credentials from the operator profile (`aws configure export-credentials`), like
luna.is's `as-deployer.sh`, so the CDK CLI never handles login sessions itself.

## D15. infra:* creates CloudFormation change sets itself (2026-10-30)

The deploy role's `cloudformation:ResourceTypes` condition needs the caller to send
`ResourceTypes`, which the CDK CLI doesn't do. Keeping that IAM-level allowlist was preferred over
removing the condition, so `infra:diff`, `infra:deploy` and `infra:destroy` call CloudFormation
directly as the deploy role (change set with `--role-arn` and `--resource-types`, then
execute/delete). The template is still synthesized and validated by CDK, and sent inline (it's
well under the 51,200-byte limit; larger templates would need the staging-bucket upload added).
Termination protection for prod stacks is set by `infra:deploy` after a successful create.
