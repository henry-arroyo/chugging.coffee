import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENVIRONMENTS = ['test', 'prod'] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export const PROJECT_TAG = 'chugging-time-machine';
export const ALLOWED_REGIONS = ['us-east-1'] as const;

export interface EnvironmentConfig {
  environment: EnvironmentName;
  confirmed: boolean;
  account: string;
  region: string;
  profile: string;
  operatorRoleName: string;
  qualifier: string;
  domainName: string | null;
  certificateArn: string | null;
  expiresOn: string | null;
}

/** Exact names of every stack an environment may contain. Nothing else is ever selected. */
export function stackNames(env: EnvironmentName) {
  const prefix = env === 'prod' ? 'CtmProd' : 'CtmTest';
  return {
    site: `${prefix}-Site`,
    // Only production has a certificate stack; test uses the CloudFront default domain.
    certificate: env === 'prod' ? `${prefix}-Certificate` : null,
  } as const;
}

export function siteBucketName(env: EnvironmentName, account: string): string {
  return `ctm-${env}-site-${account}`;
}

export function isEnvironmentName(value: unknown): value is EnvironmentName {
  return typeof value === 'string' && (ENVIRONMENTS as readonly string[]).includes(value);
}

/** Checks a parsed config file. Returns a list of problems; empty means usable for synth. */
export function configProblems(env: EnvironmentName, raw: unknown): string[] {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null) return ['config is not an object'];
  const c = raw as Record<string, unknown>;
  const expectKeys = ['environment', 'confirmed', 'account', 'region', 'profile', 'operatorRoleName', 'qualifier', 'domainName', 'certificateArn', 'expiresOn'];
  for (const key of Object.keys(c)) if (!expectKeys.includes(key)) problems.push(`unknown field ${key}`);
  for (const key of expectKeys) if (!(key in c)) problems.push(`missing field ${key}`);

  if (c.environment !== env) problems.push(`environment must be "${env}"`);
  if (typeof c.confirmed !== 'boolean') problems.push('confirmed must be true or false');
  if (!(c.account === 'UNCONFIRMED' || (typeof c.account === 'string' && /^[0-9]{12}$/.test(c.account)))) {
    problems.push('account must be a 12-digit ID or "UNCONFIRMED"');
  }
  if (c.confirmed === true && c.account === 'UNCONFIRMED') problems.push('confirmed config needs a real account ID');
  if (!(ALLOWED_REGIONS as readonly unknown[]).includes(c.region)) problems.push(`region must be one of ${ALLOWED_REGIONS.join(', ')}`);
  if (c.profile !== `time-machine-${env}`) problems.push(`profile must be "time-machine-${env}"`);
  if (c.operatorRoleName !== `ctm-${env}-operator`) problems.push(`operatorRoleName must be "ctm-${env}-operator"`);
  if (c.qualifier !== `ctm${env}`) problems.push(`qualifier must be "ctm${env}"`);
  if (c.domainName !== null && !(typeof c.domainName === 'string' && /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(c.domainName))) {
    problems.push('domainName must be a lowercase hostname or null');
  }
  // The certificate stack is deployed first (domainName set, certificateArn null); the site
  // attaches the alias once the issued certificate's ARN is recorded here.
  if (c.certificateArn !== null && c.domainName === null) problems.push('certificateArn needs domainName');
  if (c.certificateArn !== null) {
    const m = typeof c.certificateArn === 'string' ? /^arn:aws:acm:us-east-1:([0-9]{12}):certificate\/[0-9a-f-]{36}$/.exec(c.certificateArn) : null;
    if (!m) problems.push('certificateArn must be an ACM certificate ARN in us-east-1');
    else if (m[1] !== c.account) problems.push('certificateArn must belong to the configured account');
  }
  if (env === 'test') {
    if (c.domainName !== null) problems.push('test uses the CloudFront default domain; domainName must be null');
    if (!(typeof c.expiresOn === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(c.expiresOn))) problems.push('test config needs expiresOn (YYYY-MM-DD)');
  } else if (c.expiresOn !== null) {
    problems.push('prod config must have expiresOn null');
  }
  return problems;
}

export function loadConfig(env: EnvironmentName, dir = join(import.meta.dirname, '../config')): EnvironmentConfig {
  const raw: unknown = JSON.parse(readFileSync(join(dir, `${env}.json`), 'utf8'));
  const problems = configProblems(env, raw);
  if (problems.length > 0) throw new Error(`infra/config/${env}.json is invalid:\n  ${problems.join('\n  ')}`);
  return raw as EnvironmentConfig;
}
