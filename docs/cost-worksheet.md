# Cost worksheet (draft)

**Prices are planning figures from memory and must be checked against current AWS pricing
before any deployment.** The simulated 28.8 kbps speed doesn't reduce billed bytes. Budget
alerts notify; they don't cap spending. Excludes the domain, labor, rights and the sibling
project.

## Assumptions to replace with real numbers

| Input | Planning value | Notes |
|---|---|---|
| Visitors per month | 1,000 | Change freely; costs scale roughly linearly |
| Bytes per visit (compressed) | 2 MB | Shell ≤ 1 MiB plus the content and images actually opened |
| Requests per visit | 150 | Page JSON, images, sounds |
| Stored site size, all versions | 200 MB | A few releases plus 90 days of non-current versions (prod) |
| Uploads per release | 300 objects | Hashed assets and content |

## Monthly estimate (static v1, one environment)

| Item | Formula | Planning unit price (verify) | 1,000 visits |
|---|---|---|---|
| CloudFront data transfer out | visits × 2 MB | Always-free 1 TB/month, then about $0.085/GB (Price Class 100) | $0 |
| CloudFront HTTPS requests | visits × 150 | Always-free 10 M/month, then about $0.01 per 10 k | $0 |
| CloudFront Functions | requests | Always-free 2 M/month, then about $0.10 per M | $0 |
| S3 storage (Standard) | 0.2 GB | about $0.023 per GB-month | under $0.01 |
| S3 PUT per release | 300 | about $0.005 per 1,000 | under $0.01 |
| S3 GET from CloudFront (cache misses) | small | about $0.0004 per 1,000 | under $0.01 |
| CDK staging bucket | under 10 MB | as S3 | under $0.01 |
| ACM public certificate | 1 | Free | $0 |
| CloudFormation, IAM, SSM standard parameter | | Free | $0 |
| Logging | Off in v1 | Standard logs to S3 would add storage | $0 |
| **Total** | | | **about $0–1** |

Targets from the handoff: preview $0–5/month and production $0–10/month. Both fit with a
large margin. A sudden viral spike is the main risk: about 1 TB is free, then roughly $85 per
additional TB. Consider a budget alert at $5 and $20.

Flat-rate plans were checked on 2026-10-31: the account's 3 Free plans are all used by other
sites, so both Time Machine distributions stay on pay-as-you-go with the always-free allowance
above (D48).

## Test environment

Same shape. Destroyed when not in use (see the `ExpiresOn` tag), leaving only the staging bucket
(cents).

## Future serverless pilot (not authorized)

API Gateway or AppSync, Lambda and DynamoDB on-demand for a moderated BBS or mail. Planning range
$5–25/month at low volume, dominated by requests and any WebSocket connection minutes. Each needs
its own cost review and permission expansion approval. No NAT gateway, RDS, always-on servers or
paid AI services.
