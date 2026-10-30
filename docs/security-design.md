# Security design

Status: **applied 2026-10-30** (account 196691452297, us-east-1): `ctm-foundation`, `CDKToolkit-ctmtest`, `CDKToolkit-ctmprod`, all with termination protection. Production ACM permissions are enabled for `chugging.coffee` only. No site stack is deployed.

## Part 1: The browser application

| Threat | Control |
|---|---|
| Script injection through world content | Pages are schema-validated block JSON. No HTML, script, style text, handlers or frames are expressible. React renders text as text. Widgets are a closed registry with typed props. |
| Navigation to the real internet / open proxy | Only `http://<name>.test/...` and `aol://keyword/...` addresses resolve, and only to pages in the pinned release. No fetch to user-supplied URLs; the CSP `connect-src 'self'` backs this up. |
| Dangerous addresses | Executable schemes (`javascript:`, `data:`, `file:`), credentials in URLs, uppercase / odd hosts, traversal, protocol-relative and oversized input are rejected (tested in `tests/unit/contracts.test.ts`; the full resolver arrives in M3). |
| Malicious import files | 1 MiB byte limit checked before parsing; strict schema with `additionalProperties: false` everywhere; game saves re-checked for conservation; no token or credential fields exist. |
| VFS escape / protected file tampering | Restricted `C:\` path grammar; traversal and other drives rejected; protection comes from trusted seed metadata, never from a stored record (a record claiming `protected` or `origin: system` is rejected). 64 KiB per file and about 5 MiB total. |
| Screen-name abuse | ASCII letters, digits and single spaces, 3-16 characters. Markup, control and look-alike characters rejected. Names are unverified and shown only locally. |
| Fake "real people" | Scripted chat and guestbooks are labelled fictional. No visitor-to-visitor content in v1. |
| Eval-based gadgets | Validators are precompiled. The CSP forbids `unsafe-eval`. |

### HTTP response headers (CloudFront response-headers policy)

`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
`Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`/`preload`, so other
chugging.coffee subdomains aren't committed), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera, microphone,
geolocation, payment and USB off), `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`.
`'unsafe-inline'` for styles is needed for React `style` attributes (window positions); scripts stay strict.

## Part 2: AWS

### Identities and who can do what

```text
Owner: IAM user henry.arroyo, signed in with `aws login` (browser, no access keys)
 ├─ profile time-machine-bootstrap  →  owner's administrator session = BOOTSTRAP MAINTAINER
 │     applies ctm-foundation and CDKToolkit-ctmprod / CDKToolkit-ctmtest; nothing else uses it
 │
 ├─ profile time-machine-test  →  assumes ctm-test-operator   (1 h sessions, boundary attached)
 │     ├─ assumes cdk-ctmtest-deploy-role-…           ─ passes ─▶ cdk-ctmtest-cfn-exec-role-… (CloudFormation only)
 │     ├─ assumes cdk-ctmtest-file-publishing-role-…  (writes deployment templates to the ctmtest staging bucket)
 │     └─ direct: publish/clean ctm-test-site-<acct>, invalidate the test distribution, read test stack status
 │
 └─ profile time-machine-prod  →  assumes ctm-prod-operator   (same shape, prod names only)
```

No IAM users and no long-lived access keys. The bootstrap maintainer is the owner's existing
administrator identity rather than a project role: a scoped "maintainer" role would itself need
broad IAM write access, and adds risk without adding separation. This can be revisited.

### Files

| File | What it is |
|---|---|
| `infra/bootstrap/foundation-template.yaml` | Permission boundary `ctm-permissions-boundary`; operator roles `ctm-test-operator`, `ctm-prod-operator` trusted only by one exact principal: the signed-in IAM user (never root or the account) |
| `infra/access/setup-access.ts` | Applies the foundation and both bootstraps from the owner's login session, after CloudFormation template validation and IAM Access Analyzer `validate-policy` on every policy (blocks on errors and security warnings) |
| `infra/bootstrap/bootstrap-template.yaml` | Restricted CDK bootstrap, applied once per environment with qualifier `ctmtest` or `ctmprod` |
| `infra/policies/allowed-resource-types.json` | Resource-type allowlist, shared by template validation and documentation |
| `infra/config/{test,prod}.json` | Target account, region, profile, role and qualifier; `confirmed: false` until the owner confirms |

### How the bootstrap differs from CDK's default (v32)

| Default bootstrap | This project |
|---|---|
| CloudFormation execution role has **AdministratorAccess** | `ctm-<env>-cfn-execution`: only that environment's bucket, distributions, functions, OAC/headers policies, and ACM for one approved domain (prod only, off by default) |
| Deploy/publish roles trusted by the whole account | Trusted only by `ctm-<env>-operator` |
| Deploy role: CloudFormation actions on `*` | Change sets only on the environment's exact stack names; **must** use the environment's execution role (`cloudformation:RoleArn`); **only allowlisted resource types** (`cloudformation:ResourceTypes`); no direct CreateStack/UpdateStack |
| ECR repository, image-publishing role, lookup role, KMS key | None (no container assets, no context lookups; SSE-S3 is enough for deployment templates) |
| No boundary unless requested | `ctm-permissions-boundary` on every role |
| Staging bucket writable by any account principal with permission | Bucket policy denies writes from anyone except the file-publishing role |

### Permission boundary (ceiling for all project roles)

**Allows at most:** CloudFormation on `CtmProd-*` / `CtmTest-*` stacks; S3 on the two exact `ctm-<env>-site-<account>`
buckets and the two `cdk-ctm*-assets-*` buckets; CloudFront and ACM; reading the two bootstrap version parameters;
assuming `cdk-ctm*` roles; passing only the two execution roles, and only to CloudFormation;
`sts:GetCallerIdentity`.

**Explicitly denies:** every IAM write, Organizations, Account and Identity Center; any change to
`ctm-foundation` or `CDKToolkit-ctm*` stacks; CloudFormation **resource import**; regional calls
outside us-east-1.

Lambda, API Gateway, DynamoDB, EC2, RDS, ECS/EKS, NAT and every other service are outside the
boundary, so no project role can use them even if a policy were mistakenly widened.

### Controls matrix

| Requirement | How it's enforced |
|---|---|
| Wrong account/role fails before mutation | `infra:*` refuses unconfirmed config without calling AWS; then `sts get-caller-identity` must show the configured account and an assumed-role session of `ctm-<env>-operator`; region is pinned; ambient credentials are stripped |
| Test can't alter prod (and the reverse) | Separate qualifiers, roles, buckets and policies; operators can assume only their own environment's CDK roles; execution policies name only their own bucket, `ctm-<env>-*` functions and distributions tagged with their own `Environment` |
| Can't alter unrelated resources | Exact bucket ARNs plus `s3:ResourceAccount`; distribution update/delete need `Project` and `Environment` tags; CloudFormation only on the environment's exact stack names |
| Protected tags can't be used to adopt resources | Tagging is allowed only on untagged distributions (fresh creates) or ones already tagged for this environment, with fixed values; protected keys can't be removed; **resource import is denied**, so a stack can't take over an existing resource |
| Unauthorized services denied | Boundary allowlist, IAM `cloudformation:ResourceTypes` allowlist on change sets, plus template validation in `infra:check` |
| Roles can't change their own security | Boundary denies all IAM writes and changes to the foundation/bootstrap stacks; operators can't assume the maintainer identity |
| PassRole limited | Exact execution-role ARN, `iam:PassedToService = cloudformation.amazonaws.com`; no tag-based PassRole |
| Unauthorized resource types fail validation | `validateTemplate` (synth time) and the change-set condition (API time) |

### Actions IAM can't scope tightly (documented exceptions)

| Action | Why | Mitigation |
|---|---|---|
| `cloudfront:CreateDistribution`, `CreateOriginAccessControl`, `CreateResponseHeadersPolicy` | No resource ARN exists before creation. CloudFormation creates distributions untagged, then tags them (seen in the sibling luna.is project). | Creating can't affect existing resources; everything after creation is tag-gated or stack-owned |
| `cloudfront:*OriginAccessControl`, `*ResponseHeadersPolicy` (get/update/delete) | These resource types support no tag or name conditions | Account-scoped ARNs only. The execution role acts only through CloudFormation on resources its own stack created; import is denied, and there are no custom resources or Lambda that could use the role's credentials elsewhere |
| `acm:RequestCertificate` | No ARN before creation | Restricted with `acm:DomainNames` to the single owner-approved domain and DNS validation; prod only; disabled unless `CertificateDomainName` is set |

### Permission-expansion procedure (mandatory)

Any new service, action, resource scope, region, account, wildcard, trust, PassRole or boundary
change, or any helper construct that adds permissions (for example `BucketDeployment` or
`autoDeleteObjects`), needs **explicit owner approval before the templates change**. The proposal
must include:

1. The feature that needs it.
2. The exact policy/template diff.
3. New actions, services and resource scope.
4. Cost and security implications.
5. How it will be validated and rolled back.

An AccessDenied error is a diagnosis task, never permission to broaden access. Routine roles can't
apply such a change anyway: the boundary denies IAM writes and changes to the foundation and
bootstrap stacks, so only the owner's maintainer identity can.

### Verification plan (once the owner authorizes bootstrap of test)

| Check | Method |
|---|---|
| Wrong account / role / region refused before any change | Unit tests (`infra/tests/guards.test.ts`, done) + one live run with the wrong profile |
| Policy logic | IAM Access Analyzer `validate-policy` on every policy (built into `access:setup`, blocking); after apply, `iam simulate-principal-policy` for allowed and denied cases (test role → prod bucket, prod distribution, Lambda, `iam:CreateRole`, import change set) |
| Real deploy permissions sufficient and minimal | Test deploy → update → destroy → recreate; every AccessDenied becomes an expansion proposal |
| Bucket cleanup handles versions | Upload, overwrite and delete objects to create versions and delete markers, then `infra:destroy --env test` |
| Teardown leaves prod untouched | `infra:status --env prod` before and after a test teardown (with nothing deployed in prod, it must still be absent) |
| Unauthorized resource types | Add a Lambda to a scratch synth → `infra:check` fails; attempt a change set with it in test → IAM denies |

Harmless denial tests only: no expensive resource is created just to prove a denial.

### Verification results (2026-10-30)

| Check | Result |
|---|---|
| CloudFormation `validate-template` on both templates | Passed |
| IAM Access Analyzer `validate-policy`, 19 policies | No errors or security warnings. Two redundancy suggestions on the boundary's S3 ARNs were fixed by narrowing to exact bucket names; the re-run had zero findings |
| Operator profiles | `time-machine-test` → `assumed-role/ctm-test-operator`, `time-machine-prod` → `assumed-role/ctm-prod-operator` |
| `infra:status` both environments | Works as the operator roles (nothing deployed) |
| Real change set as the test deploy role (`infra:diff --env test`) | Created with the execution role and the six declared resource types, previewed, then deleted along with its placeholder stack |
| `npm run access:verify`: 49 simulated allow/deny cases against the live roles (identity policies plus boundary) | 49/49 as designed, including: test cannot touch prod (buckets, roles, stacks, distributions, functions); no IAM changes, including to the role's own policy and boundary; no Lambda/EC2/DynamoDB/RDS; no resource import; no change set without declared types or containing Lambda/IAM; PassRole only for the matching execution role to CloudFormation; protected tags can't be set to the other environment or removed; ACM only for exactly `chugging.coffee` from prod |

The simulator doesn't evaluate bucket policies, and doesn't add `s3:ResourceAccount` by itself, so
`access:verify` supplies that key for S3 actions. The file-publishing role's real upload during the
diff confirms the condition passes in practice.

### Finding: the CDK CLI can't satisfy the resource-type condition

`cloudformation:ResourceTypes` is present only when the caller sends the `ResourceTypes`
parameter, and the CDK CLI never sends it. With the policy as designed, `cdk deploy` and
`cdk diff` change sets are denied (confirmed live and in the simulator). Rather than drop the
condition (a permission expansion), `infra:*` now creates change sets itself as the deploy role,
always naming the execution role and declaring the template's resource types. CloudFormation then
also refuses any resource outside the declared list. The CDK CLI is still used for the readable
template diff (`--method template`), which makes no changes. It prints a harmless notice that it
couldn't assume a `cdk-ctm*-lookup-role` (deliberately not created).

### Points to verify during the first test deploy

- CloudFormation's S3 and CloudFront handlers may call read actions not listed (for example newer
  bucket settings). The execution policy grants `s3:Get*` on the one bucket for this reason. Any
  remaining AccessDenied gets a proposal.
- ~~Whether CloudFormation evaluates the foundation's `RegionMatches` rule as cfn-lint expects.~~
  It did: the foundation applied cleanly in us-east-1.
