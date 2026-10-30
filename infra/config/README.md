# Environment configuration

One file per environment. `confirmed` stays `false`, and `account` stays `UNCONFIRMED`,
until the owner confirms the account ID, region, trusted principals and domain plan.
`synth` works with unconfirmed config (account-agnostic templates). `diff`, `deploy`,
`status` and `destroy` refuse to run until `confirmed` is `true`.

| Field | Meaning |
|---|---|
| `account` | 12-digit AWS account ID, or `UNCONFIRMED` |
| `region` | Deployment region. Only `us-east-1` is accepted (CloudFront certificates live there) |
| `profile` | AWS CLI profile that must be used: `time-machine-<env>` |
| `operatorRoleName` | Role the profile must resolve to; checked with `sts get-caller-identity` before any change |
| `qualifier` | CDK bootstrap qualifier: `ctm<env>`. Each environment has its own bootstrap stack and roles |
| `domainName` | Custom domain for CloudFront, or `null` to use the `*.cloudfront.net` name |
| `certificateArn` | ACM certificate (us-east-1) for `domainName`, from the certificate stack |
| `expiresOn` | Test only: date after which the test stack should be destroyed (tagged `ExpiresOn`) |
