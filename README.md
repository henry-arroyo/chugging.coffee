# chugging.coffee Time Machine

A Windows 95 desktop in the browser, connected to a shared, persistent, fictional December 1995
internet: an AOL-style online service, a Netscape-era browser, and seven interlinked `.test` sites.
Served at `/time-machine/`. Static hosting on AWS (CDK v2), no backend in v1.

**Status:** milestone M3: AOL 2.5, Netscape Navigator 2.0b3, the shared dial-up connection and a
three-site seed release of the fictional Web (on top of M2's programs, games and storage). See
[docs/milestones.md](docs/milestones.md).

## Commands

```bash
npm ci
npm run dev                 # local dev server: http://localhost:5173/time-machine/
npm test                    # unit, contract, policy and stack tests
npm run test:e2e            # Playwright journeys (see docs/testing.md for browser setup)
npm run visual:capture      # screenshots for human review in tests/visual/pending/
npm run typecheck
npm run build               # contracts, public asset gate, content check, typecheck, Vite build

npm run contracts:build     # regenerate validators after editing schemas/
npm run assets:check        # asset registry (add --public rules with assets:check:public)
npm run content:check       # validate the world release: contracts, links, assets, checksums

npm run access:setup -- --plan|--apply --confirm-account <id>   # one-time, owner's aws login session
npm run access:verify       # live allow/deny checks of the applied roles (owner session)
npm run infra:check         # synthesize and validate both environments (no AWS calls)
npm run infra:synth   -- --env test|prod
npm run infra:diff    -- --env test|prod      # needs confirmed config and profile
npm run infra:deploy  -- --env test|prod
npm run infra:status  -- --env test|prod
npm run infra:destroy -- --env test|prod
```

AWS commands refuse to run until `infra/config/<env>.json` is confirmed by the owner, and they
verify account, role and region before doing anything. Bootstrapping, deploying, DNS changes and
teardown each need the owner's separate authorization.

## Layout

```text
schemas/            JSON Schemas (authoritative contracts)
src/core/           framework-free logic: contracts, identity, windows, net, vfs, games
src/host, shell, apps, persistence, content   UI and services (from M1)
content/            world release sources and sites (built by scripts/world/)
assets/public/      distributable assets, each listed in assets/registry.json
assets/reference-only/   local-only historical references (git-ignored)
scripts/            build-time tools (validator compiler, asset gate)
tests/              unit tests and fixtures
infra/              CDK app, bootstrap and foundation templates, policies, config, tests
docs/               architecture, decisions, security, rights, runbooks, costs
```

## Documents

- [Architecture](docs/architecture.md) · [Decisions](docs/decisions.md) · [Open questions](docs/open-questions.md)
- [Security design](docs/security-design.md) · [AWS profiles](docs/aws-profiles.md) · [Runbooks](docs/runbooks.md) · [Cost worksheet](docs/cost-worksheet.md)
- [Historical references](docs/historical-references.md) · [Asset rights](docs/asset-rights.md) · [Testing](docs/testing.md)
