/**
 * One-time security foundation and CDK bootstrap, run with the owner's `aws login` session.
 *
 *   1. Owner:  aws login --profile time-machine-bootstrap --remote   (paste the code in a browser)
 *   2. Plan:   npm run access:setup -- --plan --confirm-account <id> [--certificate-domain chugging.coffee]
 *   3. Apply:  npm run access:setup -- --apply --confirm-account <id> [--certificate-domain chugging.coffee]
 *
 * --plan makes no changes: it checks the identity, then validates the templates with CloudFormation
 * and every policy with IAM Access Analyzer. --apply repeats those checks and then creates or updates
 * ctm-foundation, CDKToolkit-ctmtest and CDKToolkit-ctmprod, enables termination protection on them,
 * and writes the time-machine-test / time-machine-prod profiles (role_arn + source_profile).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ENVIRONMENTS, loadConfig, type EnvironmentName } from '../lib/config';
import { renderPolicies, type Params, type RenderedPolicy } from '../lib/render-template';

export const BOOTSTRAP_PROFILE = 'time-machine-bootstrap';
const REGION = 'us-east-1';
const HERE = import.meta.dirname;
const FOUNDATION = join(HERE, '../bootstrap/foundation-template.yaml');
const BOOTSTRAP = join(HERE, '../bootstrap/bootstrap-template.yaml');

export interface SetupArgs {
  mode: 'plan' | 'apply';
  confirmAccount: string;
  certificateDomain: string;
}

export function parseSetupArgs(argv: string[], prodDomain: string | null): SetupArgs {
  let mode: SetupArgs['mode'] | null = null;
  let confirmAccount = '';
  let certificateDomain = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--plan' || a === '--apply') {
      if (mode) throw new Error('Choose one of --plan or --apply');
      mode = a === '--plan' ? 'plan' : 'apply';
    } else if (a === '--confirm-account') confirmAccount = argv[++i] ?? '';
    else if (a === '--certificate-domain') certificateDomain = argv[++i] ?? '';
    else throw new Error(`Unexpected argument ${a}`);
  }
  if (!mode) throw new Error('Pass --plan (no changes) or --apply');
  if (!/^[0-9]{12}$/.test(confirmAccount)) throw new Error('--confirm-account <12-digit account ID> is required');
  if (certificateDomain && certificateDomain !== prodDomain) {
    throw new Error(`--certificate-domain must match prod domainName (${prodDomain ?? 'unset'})`);
  }
  return { mode, confirmAccount, certificateDomain };
}

/**
 * The principal the operator roles will trust: the signed-in IAM user, or for an assumed-role
 * session (IAM Identity Center) the role itself. Root is refused: it can't assume roles.
 */
export function trustedPrincipalFor(callerArn: string, rolePathLookup: (roleName: string) => string): string {
  if (/^arn:aws:iam::[0-9]{12}:root$/.test(callerArn)) {
    throw new Error('Signed in as the root user. Sign in as your IAM user (or Identity Center user) instead.');
  }
  if (/^arn:aws:iam::[0-9]{12}:user\/[A-Za-z0-9+=,.@_/-]+$/.test(callerArn)) return callerArn;
  const m = /^arn:aws:sts::([0-9]{12}):assumed-role\/([A-Za-z0-9+=,.@_-]+)\/[^/]+$/.exec(callerArn);
  if (m) return `arn:aws:iam::${m[1]}:role${rolePathLookup(m[2]!)}${m[2]}`;
  throw new Error(`Unsupported identity ${callerArn}`);
}

function aws(args: string[], { capture = true } = {}): { ok: boolean; out: string; err: string } {
  const env = { ...process.env };
  for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE']) delete env[k];
  const r = spawnSync('aws', [...args, '--region', REGION], { env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  return { ok: r.status === 0, out: r.stdout ?? '', err: r.stderr ?? '' };
}

function must(args: string[]): string {
  const r = aws(args);
  if (!r.ok) fail(`aws ${args.slice(0, 2).join(' ')} failed:\n${r.err.trim()}`);
  return r.out;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function bootstrapParams(env: EnvironmentName, certificateDomain: string): Params {
  return {
    Qualifier: `ctm${env}`,
    Environment: env,
    StackPrefix: env === 'prod' ? 'CtmProd' : 'CtmTest',
    CertificateDomainName: env === 'prod' ? certificateDomain : '',
  };
}

function validateWithAccessAnalyzer(label: string, policies: RenderedPolicy[]): number {
  let blocking = 0;
  for (const p of policies) {
    const args = [
      'accessanalyzer', 'validate-policy', '--profile', BOOTSTRAP_PROFILE, '--output', 'json',
      '--policy-type', p.policyType, '--policy-document', JSON.stringify(p.document),
    ];
    if (p.resourceType) args.push('--validate-policy-resource-type', p.resourceType);
    const findings = JSON.parse(must(args)).findings as { findingType: string; issueCode: string; findingDetails: string }[];
    for (const f of findings) {
      const isBlocking = f.findingType === 'ERROR' || f.findingType === 'SECURITY_WARNING';
      if (isBlocking) blocking++;
      console.log(`  ${isBlocking ? '✖' : '•'} ${label} ${p.name}: ${f.findingType} ${f.issueCode} - ${f.findingDetails}`);
    }
  }
  console.log(`✔ Access Analyzer checked ${policies.length} policies in ${label}${blocking ? ` (${blocking} blocking findings)` : ''}`);
  return blocking;
}

function stackStatus(name: string): string | null {
  const r = aws(['cloudformation', 'describe-stacks', '--profile', BOOTSTRAP_PROFILE, '--stack-name', name, '--output', 'json']);
  if (!r.ok) return r.err.includes('does not exist') ? null : fail(r.err.trim());
  return JSON.parse(r.out).Stacks[0].StackStatus;
}

function deployStack(name: string, template: string, params: Params, environment: EnvironmentName | null) {
  console.log(`\n== ${name}`);
  const overrides = Object.entries(params).map(([k, v]) => `${k}=${v}`);
  const r = aws(
    [
      'cloudformation', 'deploy', '--profile', BOOTSTRAP_PROFILE,
      '--stack-name', name, '--template-file', template,
      '--capabilities', 'CAPABILITY_NAMED_IAM', '--no-fail-on-empty-changeset',
      '--parameter-overrides', ...overrides,
      '--tags', 'Project=chugging-time-machine', 'ManagedBy=owner', ...(environment ? [`Environment=${environment}`] : []),
    ],
    { capture: false },
  );
  if (!r.ok) fail(`Deploying ${name} failed. Nothing further was applied. See the stack events in the console.`);
  must(['cloudformation', 'update-termination-protection', '--profile', BOOTSTRAP_PROFILE, '--stack-name', name, '--enable-termination-protection']);
  console.log(`✔ ${name}: ${stackStatus(name)}, termination protection on`);
}

function writeProfile(env: EnvironmentName, account: string) {
  const profile = `time-machine-${env}`;
  const settings: Record<string, string> = {
    role_arn: `arn:aws:iam::${account}:role/ctm-${env}-operator`,
    source_profile: BOOTSTRAP_PROFILE,
    role_session_name: `ctm-${env}`,
    duration_seconds: '3600',
    region: REGION,
  };
  for (const [k, v] of Object.entries(settings)) must(['configure', 'set', k, v, '--profile', profile]);
  const arn = must(['sts', 'get-caller-identity', '--profile', profile, '--query', 'Arn', '--output', 'text']).trim();
  if (!arn.startsWith(`arn:aws:sts::${account}:assumed-role/ctm-${env}-operator/`)) fail(`${profile} resolved to ${arn}`);
  console.log(`✔ Profile ${profile} → ${arn}`);
}

function main() {
  const prod = loadConfig('prod');
  let args: SetupArgs;
  try {
    args = parseSetupArgs(process.argv.slice(2), prod.domainName);
  } catch (e) {
    fail((e as Error).message);
  }

  const who = aws(['sts', 'get-caller-identity', '--profile', BOOTSTRAP_PROFILE, '--output', 'json']);
  if (!who.ok) {
    fail(`No session for profile ${BOOTSTRAP_PROFILE}. The owner signs in first:\n    aws login --profile ${BOOTSTRAP_PROFILE} --remote`);
  }
  const { Account: account, Arn: callerArn } = JSON.parse(who.out) as { Account: string; Arn: string };
  for (const env of ENVIRONMENTS) {
    if (loadConfig(env).account !== account) fail(`infra/config/${env}.json names a different account than the session (${account})`);
  }
  if (args.confirmAccount !== account) fail(`--confirm-account ${args.confirmAccount} does not match the signed-in account ${account}`);

  let principal: string;
  try {
    principal = trustedPrincipalFor(callerArn, (roleName) =>
      JSON.parse(must(['iam', 'get-role', '--profile', BOOTSTRAP_PROFILE, '--role-name', roleName, '--output', 'json'])).Role.Path,
    );
  } catch (e) {
    fail((e as Error).message);
  }

  console.log(`\n  Account:            ${account}`);
  console.log(`  Signed in as:       ${callerArn}`);
  console.log(`  Operator roles trust: ${principal}`);
  console.log(`  Region:             ${REGION}`);
  console.log(`  Prod certificate:   ${args.certificateDomain || '(none: no ACM permissions)'}`);
  console.log(`  Existing stacks:    ctm-foundation=${stackStatus('ctm-foundation') ?? 'none'}, CDKToolkit-ctmtest=${stackStatus('CDKToolkit-ctmtest') ?? 'none'}, CDKToolkit-ctmprod=${stackStatus('CDKToolkit-ctmprod') ?? 'none'}\n`);

  for (const file of [FOUNDATION, BOOTSTRAP]) {
    must(['cloudformation', 'validate-template', '--profile', BOOTSTRAP_PROFILE, '--template-body', `file://${file}`]);
  }
  console.log('✔ CloudFormation accepted both templates');

  const base = { 'AWS::AccountId': account, 'AWS::Region': REGION };
  const foundationTemplate = parse(readFileSync(FOUNDATION, 'utf8'));
  const bootstrapTemplate = parse(readFileSync(BOOTSTRAP, 'utf8'));
  let blocking = validateWithAccessAnalyzer('ctm-foundation', renderPolicies(foundationTemplate, { ...base, TrustedPrincipalArn: principal }));
  for (const env of ENVIRONMENTS) {
    blocking += validateWithAccessAnalyzer(`CDKToolkit-ctm${env}`, renderPolicies(bootstrapTemplate, { ...base, ...bootstrapParams(env, args.certificateDomain) }));
  }
  if (blocking > 0) fail(`${blocking} blocking Access Analyzer findings. Nothing was applied.`);

  if (args.mode === 'plan') {
    console.log('\nPlan only: no changes made. Re-run with --apply to create the foundation and both bootstraps.');
    return;
  }

  deployStack('ctm-foundation', FOUNDATION, { TrustedPrincipalArn: principal }, null);
  for (const env of ENVIRONMENTS) deployStack(`CDKToolkit-ctm${env}`, BOOTSTRAP, bootstrapParams(env, args.certificateDomain), env);
  for (const env of ENVIRONMENTS) writeProfile(env, account);

  console.log(`\nDone. Routine work now runs as ctm-test-operator / ctm-prod-operator through npm run infra:*.`);
  console.log(`Your login session is the only credential and expires on its own. To cut access early:\n    aws logout --profile ${BOOTSTRAP_PROFILE}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
