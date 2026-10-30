# AWS access setup

Account **196691452297**, region **us-east-1**. No access keys anywhere; the same pattern as
luna.is.chugging.coffee.

**Applied 2026-10-30** with ACM for `chugging.coffee`. Both operator profiles are written and verified.
Re-run `npm run access:verify` (owner session) any time to re-prove the allow/deny behavior.

Profiles only choose credentials; the IAM policies are what enforce security.

| Profile | Credentials | Used for |
|---|---|---|
| `time-machine-bootstrap` | The owner's `aws login` session (IAM user, browser sign-in, expires on its own) | Applying `ctm-foundation`, `CDKToolkit-ctmtest`, `CDKToolkit-ctmprod`, and owner-only steps |
| `time-machine-test` | `role_arn = …:role/ctm-test-operator`, `source_profile = time-machine-bootstrap` | `npm run infra:* -- --env test` |
| `time-machine-prod` | `role_arn = …:role/ctm-prod-operator`, `source_profile = time-machine-bootstrap` | `npm run infra:* -- --env prod` |

## One-time setup

1. **Owner signs in** (prints a URL and asks for the code shown in the browser):

   ```bash
   aws login --profile time-machine-bootstrap --remote
   ```

   Sign in as your IAM user, not root: root can't assume roles.

2. **Plan (no changes):** checks the identity and account, validates both templates with
   CloudFormation, and runs every policy through IAM Access Analyzer.

   ```bash
   npm run access:setup -- --plan --confirm-account 196691452297 --certificate-domain chugging.coffee
   ```

3. **Apply** (after the owner approves the plan output). This creates or updates the three stacks,
   enables termination protection, writes the two operator profiles, and checks that both resolve to
   their roles.

   ```bash
   npm run access:setup -- --apply --confirm-account 196691452297 --certificate-domain chugging.coffee
   ```

   Leave out `--certificate-domain` to bootstrap production without any ACM permissions.

4. **Check:** `npm run infra:status -- --env test` should show `CtmTest-Site: NOT DEPLOYED`.

## Ending access

The login session is the only credential, and every operator session is derived from it. To cut
access early:

```bash
aws logout --profile time-machine-bootstrap
```

## Removing the access setup (owner only, separate authorization)

1. Make sure no `CtmTest-*` / `CtmProd-*` stacks remain.
2. Turn off termination protection on `CDKToolkit-ctmtest`, `CDKToolkit-ctmprod` and `ctm-foundation`.
3. Empty `cdk-ctm<env>-assets-196691452297-us-east-1` (every version), then delete both
   `CDKToolkit-ctm*` stacks (the staging buckets are retained by design; delete them after emptying).
4. Delete `ctm-foundation`.
