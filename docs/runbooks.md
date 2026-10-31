# Runbooks

Status: **design only.** No environment exists. Every AWS step below needs the owner's go-ahead
at the time, and production steps need it separately.

## Commands

| Command | Talks to AWS | What it does |
|---|---|---|
| `npm run infra:check` | No | Synthesizes both environments and validates every template (resource types, tags, privacy, HTTPS, OAC, qualifier, no exports) |
| `npm run infra:synth -- --env <env>` | No | Same for one environment, written to `infra/cdk.out/<env>` |
| `npm run infra:diff -- --env <env>` | Preview | Preflight, synth and validate, a readable template diff, then a real change set (execution role and declared resource types) that is described and deleted. A first preview briefly creates and removes an empty `REVIEW_IN_PROGRESS` stack |
| `npm run infra:deploy -- --env <env>` | Yes | As diff, then typed confirmation, execute the change set, wait, set prod termination protection, record in `infra/deploy-records/`. Declining deletes the change set |
| `npm run infra:status -- --env <env>` | Read | Stack status, outputs, tags |
| `npm run infra:destroy -- --env <env>` | Yes | Preflight; checks bucket name and tags; lists removed and retained resources; typed confirmation; empties every version and delete marker; deletes the exact stack with the execution role |
| `npm run access:verify` | Read | 49 IAM policy-simulator checks against the live roles (owner session) |

Preflight refuses: an unconfirmed config (before any AWS call), the wrong account, a role other
than `ctm-<env>-operator`, the wrong region, missing credentials. Stacks are chosen with
`--stack site|certificate` only; names, patterns and `--all` are rejected.

## Deploy the test environment

1. `npm run infra:check` and `npm test`.
2. `npm run infra:diff -- --env test` and review.
3. `npm run infra:deploy -- --env test` and type the stack name when prompted.
4. Publish the site build (see **Publish a release** below):
   `npm run infra:publish -- --env test --dry-run`, then without `--dry-run`.
5. Open `https://<DistributionDomainName>/time-machine/`.

## Deploy production (later)

1. **Certificate (once).** Requires prod bootstrapped with `--certificate-domain chugging.coffee`.
   `npm run infra:deploy -- --env prod --stack certificate`. In Cloudflare, add the ACM validation
   CNAME (DNS only, grey cloud) and wait for `ISSUED`.
2. **Record the ARN.** Put the certificate ARN in `infra/config/prod.json` (`certificateArn`).
3. **Site.** `npm run infra:deploy -- --env prod`, typing `deploy CtmProd-Site`. Publish the
   build, and check `https://<DistributionDomainName>/time-machine/`.
4. **DNS cut-over** (owner, in Cloudflare, chugging.coffee zone). Today the apex has two A
   records (172.67.194.105, 104.21.20.208) and two AAAA records, all proxied, serving an old iPage
   placeholder.
   - Delete the apex A and AAAA records.
   - Add `CNAME  @  <DistributionDomainName>`, **DNS only (grey cloud)**. Cloudflare flattens apex
     CNAMEs. It must be grey: CloudFront serves the ACM certificate itself.
   - **Do not touch** the MX records (Zoho: mx, mx2, mx3) or the TXT records (SPF, Zoho
     verification), or `luna.is` and its validation record.
   - `www` is left as is (open question 11).
5. **Verify** `https://chugging.coffee/time-machine/`, and that mail still flows (send a test message
   to a chugging.coffee address).

## Publish a release

`infra:publish` builds the current tree, then uploads it to the environment's own site bucket.

1. **Freeze the release** the first time it is published anywhere: `npm run content:freeze`, then
   commit `content/world/published/<release>/`. Production refuses an unfrozen release and an
   uncommitted tree. Test accepts `--allow-unfrozen` for previews.
2. **Dry run** (no AWS call): `npm run infra:publish -- --env test|prod --dry-run` prints the plan:
   release, commit, file counts, total size and the paths it will invalidate.
3. **Publish**: `npm run infra:publish -- --env test|prod`. After the usual identity preflight, it:
   - checks that the stack is deployed and that its bucket output and `Environment` tag match;
   - uploads hashed assets and release files with a one-year immutable cache. Files already
     there with the same SHA-256 are skipped. If an immutable file already exists with
     different content, the publish stops before anything is promoted;
   - verifies every upload (size and SHA-256);
   - promotes `world/current.json` and then `index.html` (`no-cache`), after a typed
     confirmation in production (`publish CtmProd-Site`);
   - invalidates only `/time-machine/`, `/time-machine/index.html` and
     `/time-machine/world/current.json`, then writes `infra/deploy-records/<env>-publish-*.json`.
4. **Check** the site in a fresh browser tab. Tabs already open stay on their pinned release and
   are offered a restart.

No new permissions are needed: the operator roles' `PublishAndClean<Env>Site` and
`Invalidate<Env>Distribution` statements cover these calls.

## Roll back

- **Content:** `npm run infra:publish -- --env <env> --promote-release rel-NNNN`. It checks that the
  target is published and that the live release lists it in `rollbackSafeTo`, asks for
  `promote rel-NNNN`, repoints `world/current.json`, invalidates it and writes a record. Rolling
  forward again works the same way. Releases are never edited.
- **Application:** re-upload the previous `index.html` (hashed assets from earlier builds stay in
  the bucket until lifecycle expiry) and invalidate `/time-machine/index.html`.
- **Infrastructure:** check out the previous commit (see `infra/deploy-records/`), then
  `infra:diff` and `infra:deploy`.

## Tear down test

`npm run infra:destroy -- --env test`. It removes the stack, the distribution, the function,
the headers policy, the OAC and the bucket with all versions. It keeps the foundation, the
`CDKToolkit-ctmtest` stack and staging bucket (old versions expire after 30 days), and anything in
production. Recreate with `infra:deploy`.

## Production teardown

1. Owner decision recorded.
2. The owner turns off termination protection with their login session:
   `aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name CtmProd-Site --profile time-machine-bootstrap`.
3. `npm run infra:destroy -- --env prod`, typing `destroy CtmProd-Site`.
4. Remove or repoint the Cloudflare record for the domain. Before ever rebuilding, delete the
   CNAME first: CloudFront refuses an alias that still points at an old distribution (lesson
   from luna.is).
5. Retained: `CtmProd-Certificate` (free), the bootstrap and foundation stacks, and the staging
   bucket. Removing those is a separate, owner-authorized step: empty `cdk-ctmprod-assets-*`, delete
   `CDKToolkit-ctmprod`, then `ctm-foundation` once neither environment needs it.

## Recovery

| Situation | Action |
|---|---|
| Deploy failed partway | CloudFormation rolls back automatically. Read the `infra/deploy-records/` entry and `infra:status`. AccessDenied means **diagnose and propose**, not widen. |
| Stack stuck in `UPDATE_ROLLBACK_FAILED` | The deploy role may `ContinueUpdateRollback` with the execution role. Otherwise escalate to the maintainer. |
| Bucket deletion blocked | Re-run `infra:destroy`; it re-empties the bucket before calling CloudFormation again. |
| Lost local progress (visitor) | Not recoverable by design. Visitors can export and import a save file. |
| Publish stopped with "already published with different content" | The build is not the one that was published (or a frozen release was edited). Find the cause; never overwrite immutable files. Nothing was promoted, so the site is unchanged. |
| Publish uploaded files but was not confirmed | Nothing was promoted; the site is unchanged. Re-run when ready (uploads are skipped as unchanged). |
| A bad release is live | `infra:publish --promote-release <previous>` (content rollback), then fix forward with a new release. |
