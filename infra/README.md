# Infrastructure

CDK v2 app for the Time Machine. Start with [docs/security-design.md](../docs/security-design.md)
and [docs/runbooks.md](../docs/runbooks.md). Run commands from the repository root (`npm run infra:*`).

- `bin/`, `lib/`: CDK app (site stack, certificate stack, config, preflight, template validation)
- `bootstrap/`: owner-controlled foundation and restricted bootstrap templates
- `policies/`: resource-type allowlist
- `config/`: per-environment targets (unconfirmed until the owner confirms)
- `scripts/infra.ts`: guarded command runner
- `tests/`: stack, policy and guard tests
