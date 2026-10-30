import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_TAG, type EnvironmentName } from './config';

export type StackKind = 'site' | 'certificate';

const ALLOWED: Record<StackKind, string[]> = JSON.parse(
  readFileSync(join(import.meta.dirname, '../policies/allowed-resource-types.json'), 'utf8'),
);

export function allowedResourceTypes(kind: StackKind): readonly string[] {
  return ALLOWED[kind];
}

/** Resource types that carry CloudFormation tags and so must carry the project tags. */
const TAGGABLE = new Set(['AWS::S3::Bucket', 'AWS::CloudFront::Distribution', 'AWS::CertificateManager::Certificate']);

interface Template {
  Parameters?: Record<string, { Default?: unknown }>;
  Resources?: Record<string, { Type: string; Properties?: Record<string, any> }>;
  Outputs?: Record<string, { Export?: unknown }>;
}

function tagsOf(props: Record<string, any> | undefined): Record<string, unknown> {
  const list = props?.Tags;
  const tags: Record<string, unknown> = {};
  for (const t of (Array.isArray(list) ? list : []) as { Key: string; Value: unknown }[]) tags[t.Key] = t.Value;
  return tags;
}

/**
 * Checks a synthesized template before anything is sent to AWS. This supplements IAM, which
 * enforces the same resource-type allowlist on CreateChangeSet; it does not replace it.
 */
export function validateTemplate(template: Template, kind: StackKind, env: EnvironmentName, expiresOn: string | null): string[] {
  const problems: string[] = [];
  const allowed = new Set(ALLOWED[kind]);
  const resources = template.Resources ?? {};

  const qualifierParam = template.Parameters?.BootstrapVersion?.Default;
  if (qualifierParam !== `/cdk-bootstrap/ctm${env}/version`) {
    problems.push(`BootstrapVersion must come from /cdk-bootstrap/ctm${env}/version (got ${String(qualifierParam)})`);
  }
  if (Object.keys(resources).length === 0) problems.push('template has no resources');

  for (const [id, res] of Object.entries(resources)) {
    const props = res.Properties;
    if (!allowed.has(res.Type)) problems.push(`${id}: resource type ${res.Type} is not allowed in a ${kind} stack`);

    if (TAGGABLE.has(res.Type)) {
      const tags = tagsOf(props);
      if (tags.Project !== PROJECT_TAG) problems.push(`${id}: missing tag Project=${PROJECT_TAG}`);
      if (tags.Environment !== env) problems.push(`${id}: missing tag Environment=${env}`);
      if (tags.ManagedBy !== 'aws-cdk') problems.push(`${id}: missing tag ManagedBy=aws-cdk`);
      if (env === 'test' && tags.ExpiresOn !== expiresOn) problems.push(`${id}: missing tag ExpiresOn=${expiresOn}`);
    }

    if (res.Type === 'AWS::S3::Bucket') {
      const pab = props?.PublicAccessBlockConfiguration ?? {};
      for (const k of ['BlockPublicAcls', 'BlockPublicPolicy', 'IgnorePublicAcls', 'RestrictPublicBuckets']) {
        if (pab[k] !== true) problems.push(`${id}: ${k} must be true`);
      }
      if (!props?.BucketEncryption) problems.push(`${id}: bucket encryption is required`);
      if (props?.WebsiteConfiguration) problems.push(`${id}: S3 website hosting is not allowed (private REST origin only)`);
      const name = JSON.stringify(props?.BucketName ?? '');
      if (!name.includes(`ctm-${env}-site-`)) problems.push(`${id}: bucket must be named ctm-${env}-site-<account>`);
    }

    if (res.Type === 'AWS::CloudFront::Function' && !String(props?.Name ?? '').startsWith(`ctm-${env}-`)) {
      problems.push(`${id}: CloudFront Function name must start with ctm-${env}-`);
    }

    if (res.Type === 'AWS::CloudFront::Distribution') {
      const config = props?.DistributionConfig ?? {};
      const behaviors = [config.DefaultCacheBehavior, ...(config.CacheBehaviors ?? [])].filter(Boolean);
      for (const b of behaviors) {
        if (b.ViewerProtocolPolicy !== 'redirect-to-https' && b.ViewerProtocolPolicy !== 'https-only') {
          problems.push(`${id}: every behavior must require HTTPS`);
        }
      }
      for (const o of config.Origins ?? []) {
        if (o.CustomOriginConfig) problems.push(`${id}: custom (non-S3) origins are not allowed`);
        if (!o.OriginAccessControlId) problems.push(`${id}: S3 origins must use origin access control`);
      }
    }

    if (res.Type === 'AWS::S3::BucketPolicy') {
      for (const st of props?.PolicyDocument?.Statement ?? []) {
        const principal = JSON.stringify(st.Principal ?? '');
        if (st.Effect === 'Allow' && (principal === '"*"' || principal.includes('{"AWS":"*"}'))) {
          problems.push(`${id}: bucket policy must not allow a public principal`);
        }
      }
    }
  }

  for (const [id, out] of Object.entries(template.Outputs ?? {})) {
    if (out.Export) problems.push(`Output ${id}: stack exports are not allowed (they couple stack lifecycles)`);
  }
  return problems;
}
