/**
 * Guarded infrastructure commands. Run through npm:
 *
 *   npm run infra:check
 *   npm run infra:synth   -- --env test|prod
 *   npm run infra:diff    -- --env test|prod [--stack certificate]
 *   npm run infra:deploy  -- --env test|prod [--stack certificate]
 *   npm run infra:status  -- --env test|prod
 *   npm run infra:destroy -- --env test|prod
 *   npm run infra:publish -- --env test|prod [--dry-run] [--allow-unfrozen (test only)]
 *   npm run infra:publish -- --env test|prod --promote-release rel-NNNN   (content rollback)
 *
 * Every AWS command verifies the confirmed config, profile, account, assumed role and region
 * before anything else, deploys only the exact template that was synthesized and validated,
 * and never selects stacks by pattern. Deploys go through CloudFormation change sets created
 * as the environment's deploy role, naming its execution role and declaring the template's
 * resource types (see lib/changeset.ts for why the CDK CLI's own deploy is not used).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import * as cdk from 'aws-cdk-lib';
import { buildApp } from '../lib/app';
import {
  cdkRoleArn,
  changeSetName,
  createChangeSetArgs,
  isNoChangeFailure,
  resourceTypesOf,
  summarizeChanges,
  TEMPLATE_BODY_LIMIT,
  type ResourceChange,
} from '../lib/changeset';
import { ENVIRONMENTS, loadConfig, siteBucketName, stackNames, type EnvironmentConfig, type EnvironmentName } from '../lib/config';
import { AWS_COMMANDS, parseArgs, preflightProblems, targetStack, type CallerIdentity } from '../lib/preflight';
import { invalidationPaths, KEY_PREFIX, planPublish, type PublishFile, type PublishPlan } from '../lib/publish';
import { validateTemplate, type StackKind } from '../lib/validate-template';

const INFRA = join(import.meta.dirname, '..');
const ROOT = join(INFRA, '..');

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function assemblyDir(env: EnvironmentName) {
  return join(INFRA, 'cdk.out', env);
}

/** Synthesizes one environment in-process and validates every template it produced. */
function synthAndValidate(config: EnvironmentConfig): { dir: string; templates: Record<string, string>; protectedStacks: Set<string> } {
  const dir = assemblyDir(config.environment);
  const app = buildApp(new cdk.App({ outdir: dir, analyticsReporting: false }), config);
  const assembly = app.synth();
  const names = stackNames(config.environment);
  const templates: Record<string, string> = {};
  const protectedStacks = new Set<string>();
  const problems: string[] = [];

  for (const stack of assembly.stacks) {
    const kind: StackKind | null = stack.stackName === names.site ? 'site' : stack.stackName === names.certificate ? 'certificate' : null;
    if (!kind) {
      problems.push(`unexpected stack ${stack.stackName}`);
      continue;
    }
    const path = join(dir, stack.templateFile);
    templates[stack.stackName] = path;
    if (stack.terminationProtection) protectedStacks.add(stack.stackName);
    for (const p of validateTemplate(JSON.parse(readFileSync(path, 'utf8')), kind, config.environment, config.expiresOn)) {
      problems.push(`${stack.stackName}: ${p}`);
    }
  }
  if (problems.length > 0) fail(`Template validation failed for ${config.environment}:\n  ${problems.join('\n  ')}`);
  console.log(`✔ ${config.environment}: synthesized and validated ${Object.keys(templates).join(', ')} → ${dir}`);
  if (!config.confirmed) console.log(`  (config unconfirmed: account-agnostic templates for review only)`);
  return { dir, templates, protectedStacks };
}

interface Credentials {
  AccessKeyId: string;
  SecretAccessKey: string;
  SessionToken: string;
  Expiration?: string;
}

/** Short-lived credentials for the environment's operator role, set once by verifyIdentity(). */
let credentials: Credentials | null = null;

/** Environment for child processes: the operator credentials only, nothing ambient. */
function credentialEnv(config: EnvironmentConfig, as: Credentials | null = credentials): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, AWS_REGION: config.region, AWS_DEFAULT_REGION: config.region };
  for (const key of ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) delete env[key];
  if (!as) fail('Internal error: AWS called before the identity was verified');
  env.AWS_ACCESS_KEY_ID = as.AccessKeyId;
  env.AWS_SECRET_ACCESS_KEY = as.SecretAccessKey;
  env.AWS_SESSION_TOKEN = as.SessionToken;
  return env;
}

/** Runs the AWS CLI as the operator, or as another role's credentials when `as` is given. */
function aws(config: EnvironmentConfig, args: string[], as?: Credentials): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('aws', [...args, '--region', config.region, '--output', 'json'], { env: credentialEnv(config, as ?? credentials), encoding: 'utf8' });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** The environment's CDK deploy role. CloudFormation work runs only through it. */
function assumeDeployRole(config: EnvironmentConfig): Credentials {
  const r = aws(config, ['sts', 'assume-role', '--role-arn', cdkRoleArn(config.account, config.region, config.qualifier, 'deploy'), '--role-session-name', `ctm-${config.environment}-deploy`]);
  if (!r.ok) fail(`Could not assume the ${config.qualifier} deploy role: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout).Credentials as Credentials;
}

interface Preview {
  name: string;
  type: 'CREATE' | 'UPDATE';
  empty: boolean;
}

/** Creates a change set (execution role + declared resource types) and prints what it would do. */
function createChangeSet(config: EnvironmentConfig, deploy: Credentials, stackName: string, templatePath: string, purpose: 'preview' | 'deploy'): Preview {
  if (statSync(templatePath).size > TEMPLATE_BODY_LIMIT) fail(`${stackName} template exceeds ${TEMPLATE_BODY_LIMIT} bytes; asset upload support is needed first.`);
  const existing = describeStack(config, stackName, deploy);
  const type = existing && existing.StackStatus !== 'REVIEW_IN_PROGRESS' ? 'UPDATE' : 'CREATE';
  const name = changeSetName(purpose);
  const resourceTypes = resourceTypesOf(JSON.parse(readFileSync(templatePath, 'utf8')));
  const args = createChangeSetArgs({
    stackName,
    changeSetName: name,
    type,
    templatePath,
    executionRoleArn: cdkRoleArn(config.account, config.region, config.qualifier, 'cfn-exec'),
    resourceTypes,
    description: `${purpose} by infra:* (git ${git(['rev-parse', '--short', 'HEAD'])})`,
  });
  const created = aws(config, args, deploy);
  if (!created.ok) fail(`create-change-set failed: ${created.stderr.trim()}\nAccessDenied is not a reason to widen permissions: see docs/security-design.md.`);
  aws(config, ['cloudformation', 'wait', 'change-set-create-complete', '--stack-name', stackName, '--change-set-name', name], deploy);
  const described = aws(config, ['cloudformation', 'describe-change-set', '--stack-name', stackName, '--change-set-name', name], deploy);
  if (!described.ok) fail(`describe-change-set failed: ${described.stderr.trim()}`);
  const cs = JSON.parse(described.stdout) as { Status: string; StatusReason?: string; Changes?: ResourceChange[] };
  if (isNoChangeFailure(cs.Status, cs.StatusReason)) {
    console.log(`\n${stackName}: no changes.`);
    return { name, type, empty: true };
  }
  if (cs.Status !== 'CREATE_COMPLETE') fail(`Change set ${name} is ${cs.Status}: ${cs.StatusReason ?? ''}`);
  console.log(`\n${stackName} change set (${type}, resource types: ${resourceTypes.join(', ')}):`);
  console.log(summarizeChanges(cs.Changes ?? []).join('\n'));
  return { name, type, empty: false };
}

/** Removes a change set that will not be executed, and the empty placeholder stack a CREATE leaves. */
function discardChangeSet(config: EnvironmentConfig, deploy: Credentials, stackName: string, preview: Preview) {
  aws(config, ['cloudformation', 'delete-change-set', '--stack-name', stackName, '--change-set-name', preview.name], deploy);
  if (preview.type === 'CREATE') {
    const r = aws(config, ['cloudformation', 'delete-stack', '--stack-name', stackName, '--role-arn', cdkRoleArn(config.account, config.region, config.qualifier, 'cfn-exec')], deploy);
    if (!r.ok) fail(`Could not remove the REVIEW_IN_PROGRESS placeholder for ${stackName}: ${r.stderr.trim()}`);
    aws(config, ['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', stackName], deploy);
  }
}

function printFailures(config: EnvironmentConfig, deploy: Credentials, stackName: string) {
  const r = aws(config, ['cloudformation', 'describe-stack-events', '--stack-name', stackName, '--max-items', '50'], deploy);
  if (!r.ok) return;
  for (const e of JSON.parse(r.stdout).StackEvents ?? []) {
    if (String(e.ResourceStatus).endsWith('FAILED')) console.error(`  ${e.LogicalResourceId}: ${e.ResourceStatus} ${e.ResourceStatusReason ?? ''}`);
  }
}

/** Human-readable template diff (IAM and resource changes). Makes no changes in AWS. */
function templateDiff(config: EnvironmentConfig, dir: string, stackName: string): void {
  spawnSync('npx', ['cdk', 'diff', '--app', dir, stackName, '--exclusively', '--method', 'template'], {
    cwd: INFRA,
    env: credentialEnv(config),
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

/**
 * Resolves the environment's profile (time-machine-<env>: the operator role, sourced from the
 * owner's `aws login` session) into short-lived credentials, the same way the luna.is project
 * does, so the CDK CLI never has to understand login sessions. Then checks exactly those
 * credentials before anything else runs.
 */
function verifyIdentity(config: EnvironmentConfig): CallerIdentity {
  if (!config.confirmed) fail(`infra/config/${config.environment}.json is not confirmed by the owner. No AWS call was made.`);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) delete env[key];
  const exported = spawnSync('aws', ['configure', 'export-credentials', '--profile', config.profile, '--format', 'process'], { env, encoding: 'utf8' });
  if (exported.status !== 0) {
    fail(`Could not get credentials for profile ${config.profile}: ${exported.stderr.trim()}\n  If your login expired: aws login --profile time-machine-bootstrap --remote`);
  }
  credentials = JSON.parse(exported.stdout) as Credentials;
  const r = aws(config, ['sts', 'get-caller-identity']);
  const identity = r.ok ? (JSON.parse(r.stdout) as CallerIdentity) : null;
  const problems = preflightProblems(config, identity, config.region);
  if (problems.length > 0) fail(`Preflight refused ${config.environment}:\n  ${problems.join('\n  ')}`);
  console.log(`✔ Identity ${identity!.Arn} in ${config.account}/${config.region}${credentials.Expiration ? ` (session until ${credentials.Expiration})` : ''}`);
  return identity!;
}

/** Asks for a typed confirmation. Returns false (never exits) so callers can clean up. */
async function confirmed(prompt: string, expected: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error('This step needs an interactive confirmation and stdin is not a terminal.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${prompt}\nType "${expected}" to continue: `)).trim();
  rl.close();
  return answer === expected;
}

function git(args: string[]): string {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function describeStack(config: EnvironmentConfig, stackName: string, as?: Credentials): any | null {
  const r = aws(config, ['cloudformation', 'describe-stacks', '--stack-name', stackName], as);
  if (!r.ok) {
    if (r.stderr.includes('does not exist')) return null;
    fail(`describe-stacks failed: ${r.stderr.trim()}`);
  }
  return JSON.parse(r.stdout).Stacks?.[0] ?? null;
}

function outputsOf(stack: any): Record<string, string> {
  return Object.fromEntries((stack?.Outputs ?? []).map((o: any) => [o.OutputKey, o.OutputValue]));
}

/** Deletes every object version and delete marker in the stack's own site bucket. */
function emptySiteBucket(config: EnvironmentConfig, bucket: string): number {
  const tags = aws(config, ['s3api', 'get-bucket-tagging', '--bucket', bucket]);
  if (!tags.ok) fail(`Could not read tags of ${bucket}: ${tags.stderr.trim()}`);
  const tagMap = Object.fromEntries(JSON.parse(tags.stdout).TagSet.map((t: any) => [t.Key, t.Value]));
  if (tagMap.Project !== 'chugging-time-machine' || tagMap.Environment !== config.environment) {
    fail(`${bucket} is not tagged Project=chugging-time-machine, Environment=${config.environment}. Refusing to empty it.`);
  }
  let deleted = 0;
  for (;;) {
    const list = aws(config, ['s3api', 'list-object-versions', '--bucket', bucket, '--max-items', '1000']);
    if (!list.ok) fail(`list-object-versions failed: ${list.stderr.trim()}`);
    const page = JSON.parse(list.stdout || '{}');
    const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].map((v: any) => ({ Key: v.Key, VersionId: v.VersionId }));
    if (objects.length === 0) return deleted;
    const del = aws(config, ['s3api', 'delete-objects', '--bucket', bucket, '--delete', JSON.stringify({ Objects: objects, Quiet: true })]);
    if (!del.ok) fail(`delete-objects failed: ${del.stderr.trim()}`);
    const errors = JSON.parse(del.stdout || '{}').Errors ?? [];
    if (errors.length > 0) fail(`Some objects could not be deleted: ${JSON.stringify(errors.slice(0, 5))}`);
    deleted += objects.length;
    console.log(`  removed ${deleted} object versions / delete markers so far`);
  }
}

const RETAINED = [
  'ctm-foundation (permission boundary, operator roles) - owner-controlled',
  'CDKToolkit-ctm<env> (bootstrap roles, staging bucket, version parameter) - owner-controlled',
  'cdk-ctm<env>-assets-* staging bucket (DeletionPolicy Retain; old versions expire after 30 days)',
  'CtmProd-Certificate and its ACM certificate (independent lifecycle; certificates are free)',
  'Cloudflare DNS records for chugging.coffee (manual; remove the CloudFront CNAME before rebuilding prod)',
];

// ------------------------------------------------------------------ publish

/** Builds from the current tree and plans the upload. Makes no AWS call. */
function planOrFail(config: EnvironmentConfig, allowUnfrozen: boolean): { plan: PublishPlan; dist: string } {
  const dirty = git(['status', '--porcelain']) !== '';
  if (config.environment === 'prod' && dirty) fail('Production publishes only from a clean, committed tree. Commit or stash first.');
  console.log('Building from the current tree (npm run build)...');
  const built = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  if (built.status !== 0) fail('The build failed; nothing was published.');
  const dist = join(ROOT, 'dist/time-machine');
  const plan = planPublish(dist);
  const frozen = existsSync(join(ROOT, 'content/world/published', plan.releaseId));
  if (!frozen && !allowUnfrozen) fail(`${plan.releaseId} is not frozen. Published releases never change, so freeze it first: npm run content:freeze, then commit.`);
  const by = (k: PublishFile['kind']) => plan.files.filter((f) => f.kind === k);
  console.log(`Plan for ${config.environment}: release ${plan.releaseId}${frozen ? '' : ' (NOT frozen: test only)'}, commit ${git(['rev-parse', '--short', 'HEAD'])}${dirty ? ' + uncommitted changes' : ''}`);
  console.log(`  ${by('immutable').length} immutable files, ${by('static').length} static, then world/current.json and index.html last`);
  console.log(`  ${(plan.files.reduce((n, f) => n + f.bytes, 0) / 1024).toFixed(0)} KiB in total; invalidates ${invalidationPaths().join(', ')}`);
  return { plan, dist };
}

function siteTargets(config: EnvironmentConfig, stackName: string): { bucket: string; distributionId: string } {
  const stack = describeStack(config, stackName);
  if (!stack || !/_COMPLETE$/.test(stack.StackStatus) || /DELETE|ROLLBACK/.test(stack.StackStatus)) fail(`${stackName} is not deployed (status ${stack?.StackStatus ?? 'none'}). Deploy it first.`);
  const outputs = outputsOf(stack);
  const expected = siteBucketName(config.environment, config.account);
  if (outputs.BucketName !== expected) fail(`${stackName} reports bucket ${outputs.BucketName}, expected ${expected}. Refusing.`);
  const tags = aws(config, ['s3api', 'get-bucket-tagging', '--bucket', expected]);
  const tagSet: { Key: string; Value: string }[] = tags.ok ? JSON.parse(tags.stdout).TagSet : [];
  if (!tagSet.some((t) => t.Key === 'Environment' && t.Value === config.environment)) fail(`Bucket ${expected} is not tagged Environment=${config.environment}. Refusing.`);
  if (!outputs.DistributionId) fail(`${stackName} has no DistributionId output.`);
  return { bucket: expected, distributionId: outputs.DistributionId };
}

function remoteSha(config: EnvironmentConfig, bucket: string, key: string): { exists: boolean; sha: string | null; bytes: number } {
  const head = aws(config, ['s3api', 'head-object', '--bucket', bucket, '--key', key]);
  if (!head.ok) return { exists: false, sha: null, bytes: 0 };
  const parsed = JSON.parse(head.stdout) as { Metadata?: Record<string, string>; ContentLength?: number };
  return { exists: true, sha: parsed.Metadata?.sha256 ?? null, bytes: parsed.ContentLength ?? 0 };
}

function upload(config: EnvironmentConfig, bucket: string, file: PublishFile, body: string) {
  const r = aws(config, ['s3api', 'put-object', '--bucket', bucket, '--key', file.key, '--body', body, '--content-type', file.contentType, '--cache-control', file.cacheControl, '--metadata', `sha256=${file.sha256}`, '--checksum-algorithm', 'SHA256']);
  if (!r.ok) fail(`Upload of ${file.key} failed: ${r.stderr.trim()}\n  AccessDenied is not a reason to widen permissions: see docs/security-design.md.`);
  const after = remoteSha(config, bucket, file.key);
  if (after.sha !== file.sha256 || after.bytes !== file.bytes) fail(`Verification of ${file.key} failed after upload.`);
}

function invalidate(config: EnvironmentConfig, distributionId: string): string {
  const paths = invalidationPaths();
  const r = aws(config, ['cloudfront', 'create-invalidation', '--distribution-id', distributionId, '--paths', ...paths]);
  if (!r.ok) fail(`Invalidation failed: ${r.stderr.trim()}`);
  const id = (JSON.parse(r.stdout) as { Invalidation: { Id: string } }).Invalidation.Id;
  aws(config, ['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', distributionId, '--id', id]);
  return id;
}

function writeRecord(config: EnvironmentConfig, record: Record<string, unknown>): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const recordDir = join(INFRA, 'deploy-records');
  mkdirSync(recordDir, { recursive: true });
  const file = join(recordDir, `${config.environment}-publish-${stamp}.json`);
  writeFileSync(file, `${JSON.stringify({ environment: config.environment, account: config.account, region: config.region, gitCommit: git(['rev-parse', 'HEAD']), at: new Date().toISOString(), ...record }, null, 2)}\n`);
  return file;
}

async function publish(config: EnvironmentConfig, stackName: string, identity: CallerIdentity, plan: PublishPlan, dist: string) {
  const { bucket, distributionId } = siteTargets(config, stackName);
  let uploaded = 0;
  let unchanged = 0;
  for (const file of plan.order.filter((f) => f.kind !== 'pointer')) {
    const remote = remoteSha(config, bucket, file.key);
    if (remote.exists && remote.sha === file.sha256) {
      unchanged++;
      continue;
    }
    if (remote.exists && file.kind === 'immutable') fail(`${file.key} is already published with different content. Immutable files never change; this build is not reproducible or a release was edited. Nothing was promoted.`);
    upload(config, bucket, file, join(dist, file.path));
    uploaded++;
  }
  console.log(`✔ ${uploaded} files uploaded and verified, ${unchanged} already in place`);
  if (config.environment === 'prod' && !(await confirmed(`Promote ${plan.releaseId} and the new index.html to production (${bucket})?`, `publish ${stackName}`))) {
    fail('Not confirmed. Immutable files are uploaded but nothing was promoted; the site is unchanged.');
  }
  for (const file of plan.order.filter((f) => f.kind === 'pointer')) upload(config, bucket, file, join(dist, file.path));
  const invalidation = invalidate(config, distributionId);
  const record = writeRecord(config, { action: 'publish', caller: identity.Arn, releaseId: plan.releaseId, bucket, distributionId, uploaded, unchanged, invalidation, files: plan.files.map((f) => ({ key: f.key, sha256: f.sha256 })) });
  console.log(`✔ Published ${plan.releaseId} to ${config.environment}. Record: ${relativeToRoot(record)}`);
}

async function promoteRelease(config: EnvironmentConfig, stackName: string, identity: CallerIdentity, target: string) {
  const { bucket, distributionId } = siteTargets(config, stackName);
  const tmp = mkdtempSync(join(tmpdir(), 'ctm-promote-'));
  const get = (key: string, out: string) => aws(config, ['s3api', 'get-object', '--bucket', bucket, '--key', `${KEY_PREFIX}${key}`, join(tmp, out)]).ok;
  if (!get(`world/${target}/release.json`, 'target.json')) fail(`${target} is not published in ${bucket}.`);
  if (!get('world/current.json', 'current.json')) fail('No world/current.json is published yet; publish a release first.');
  const current = (JSON.parse(readFileSync(join(tmp, 'current.json'), 'utf8')) as { releaseId: string }).releaseId;
  if (current === target) fail(`${target} is already current.`);
  if (!get(`world/${current}/release.json`, 'live.json')) fail(`The live release ${current} is missing its release.json.`);
  const live = JSON.parse(readFileSync(join(tmp, 'live.json'), 'utf8')) as { sequence: number; compatibility: { rollbackSafeTo: string[] } };
  const next = JSON.parse(readFileSync(join(tmp, 'target.json'), 'utf8')) as { sequence: number };
  const rollingBack = next.sequence < live.sequence;
  if (rollingBack && !live.compatibility.rollbackSafeTo.includes(target)) fail(`${current} does not list ${target} in rollbackSafeTo; rolling back to it is not safe.`);
  if (!(await confirmed(`Repoint world/current.json in ${config.environment} from ${current} to ${target}?`, `promote ${target}`))) fail('Not confirmed; nothing changed.');
  const body = join(tmp, 'new-current.json');
  writeFileSync(body, JSON.stringify({ releaseId: target }));
  const bytes = statSync(body).size;
  const sha = createHash('sha256').update(readFileSync(body)).digest('hex');
  upload(config, bucket, { path: 'world/current.json', key: `${KEY_PREFIX}world/current.json`, bytes, sha256: sha, contentType: 'application/json; charset=utf-8', cacheControl: 'no-cache', kind: 'pointer' }, body);
  const invalidation = invalidate(config, distributionId);
  const record = writeRecord(config, { action: rollingBack ? 'rollback' : 'promote', caller: identity.Arn, from: current, to: target, bucket, distributionId, invalidation });
  console.log(`✔ ${config.environment} now serves ${target} (was ${current}). Open tabs keep their pinned release. Record: ${relativeToRoot(record)}`);
}

function relativeToRoot(path: string): string {
  return path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail((e as Error).message);
  }

  if (args.command === 'check') {
    for (const env of ENVIRONMENTS) synthAndValidate(loadConfig(env));
    console.log('✔ infra:check passed. Run npm test for the policy and stack tests.');
    return;
  }

  const config = loadConfig(args.env!);
  const stackName = targetStack(config.environment, args.stack);

  if (args.command === 'synth') {
    synthAndValidate(config);
    return;
  }

  // Publishing plans locally first; --dry-run stops before any AWS call.
  const publishing = args.command === 'publish' && !args.promoteRelease ? planOrFail(config, args.allowUnfrozen) : null;
  if (args.command === 'publish' && args.dryRun) {
    console.log('\n✔ Dry run: nothing was uploaded and no AWS call was made.');
    return;
  }

  if (!AWS_COMMANDS.includes(args.command)) fail(`Unhandled command ${args.command}`);
  // Identity first: nothing else runs until the account, role and region are verified.
  const identity = verifyIdentity(config);

  if (args.command === 'publish') {
    if (args.promoteRelease) await promoteRelease(config, stackName, identity, args.promoteRelease);
    else await publish(config, stackName, identity, publishing!.plan, publishing!.dist);
    return;
  }

  if (args.command === 'status') {
    for (const name of [stackNames(config.environment).site, stackNames(config.environment).certificate].filter(Boolean) as string[]) {
      const stack = describeStack(config, name);
      console.log(`\n${name}: ${stack ? stack.StackStatus : 'NOT DEPLOYED'}`);
      if (stack) console.log(JSON.stringify({ outputs: outputsOf(stack), tags: stack.Tags, lastUpdated: stack.LastUpdatedTime ?? stack.CreationTime }, null, 2));
    }
    return;
  }

  const { dir, templates, protectedStacks } = synthAndValidate(config);
  const templatePath = templates[stackName];
  if (!templatePath) fail(`${stackName} is not part of the ${config.environment} assembly (is domainName configured?)`);
  const deploy = assumeDeployRole(config);

  if (args.command === 'diff') {
    templateDiff(config, dir, stackName);
    const preview = createChangeSet(config, deploy, stackName, templatePath, 'preview');
    if (!preview.empty || preview.type === 'CREATE') discardChangeSet(config, deploy, stackName, preview);
    console.log('\n✔ Preview only: the change set was deleted and nothing was changed.');
    return;
  }

  if (args.command === 'deploy') {
    templateDiff(config, dir, stackName);
    const changeSet = createChangeSet(config, deploy, stackName, templatePath, 'deploy');
    if (changeSet.empty) {
      discardChangeSet(config, deploy, stackName, changeSet);
      return;
    }
    const prompt = `Execute this change set on ${stackName} in ${config.account}/${config.region}?`;
    if (!(await confirmed(prompt, config.environment === 'prod' ? `deploy ${stackName}` : stackName))) {
      discardChangeSet(config, deploy, stackName, changeSet);
      fail('Not confirmed. The change set was deleted and nothing was changed.');
    }
    const executed = aws(config, ['cloudformation', 'execute-change-set', '--stack-name', stackName, '--change-set-name', changeSet.name], deploy);
    if (!executed.ok) fail(`execute-change-set failed: ${executed.stderr.trim()}`);
    console.log(`Executing ${changeSet.name}; CloudFront distributions usually take several minutes...`);
    const waited = aws(config, ['cloudformation', 'wait', changeSet.type === 'CREATE' ? 'stack-create-complete' : 'stack-update-complete', '--stack-name', stackName], deploy);
    const after = describeStack(config, stackName, deploy);
    const ok = waited.ok && /_COMPLETE$/.test(after?.StackStatus ?? '') && !/ROLLBACK/.test(after?.StackStatus ?? '');
    if (ok && protectedStacks.has(stackName) && !after.EnableTerminationProtection) {
      aws(config, ['cloudformation', 'update-termination-protection', '--stack-name', stackName, '--enable-termination-protection'], deploy);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recordDir = join(INFRA, 'deploy-records');
    mkdirSync(recordDir, { recursive: true });
    const record = {
      environment: config.environment,
      stack: stackName,
      account: config.account,
      region: config.region,
      caller: identity.Arn,
      changeSet: changeSet.name,
      result: ok ? 'succeeded' : `failed (${after?.StackStatus ?? 'unknown'})`,
      gitCommit: git(['rev-parse', 'HEAD']),
      gitDirty: git(['status', '--porcelain']) !== '',
      templateSha256: sha256(templatePath),
      outputs: ok ? outputsOf(after) : null,
      at: new Date().toISOString(),
    };
    writeFileSync(join(recordDir, `${config.environment}-${stamp}.json`), `${JSON.stringify(record, null, 2)}\n`);
    if (!ok) {
      printFailures(config, deploy, stackName);
      fail(`Deploy failed (${after?.StackStatus ?? 'unknown'}). Record written to deploy-records/. AccessDenied is not a reason to widen permissions: see docs/security-design.md.`);
    }
    console.log(`✔ Deployed ${stackName}: ${JSON.stringify(record.outputs)}\n  Record: infra/deploy-records/${config.environment}-${stamp}.json`);
    return;
  }

  if (args.command === 'destroy') {
    const stack = describeStack(config, stackName);
    if (!stack) fail(`${stackName} is not deployed.`);
    if (stack.EnableTerminationProtection) {
      fail(`${stackName} has termination protection. The owner must turn it off first (docs/runbooks.md, production teardown).`);
    }
    const bucket = outputsOf(stack).BucketName;
    const expectedBucket = siteBucketName(config.environment, config.account);
    if (bucket !== expectedBucket) fail(`Stack output BucketName is ${bucket}, expected ${expectedBucket}. Refusing.`);
    console.log(`\nWill remove: stack ${stackName}, its CloudFront distribution, function, headers policy, OAC, and bucket ${bucket} with every object version.`);
    console.log(`Will keep:\n  - ${RETAINED.join('\n  - ')}`);
    const ok = await confirmed(
      config.environment === 'prod' ? 'PRODUCTION TEARDOWN. The public site will go offline.' : `Destroy ${stackName}?`,
      config.environment === 'prod' ? `destroy ${stackName}` : stackName,
    );
    if (!ok) fail('Not confirmed. Nothing was changed.');
    console.log(`Emptying ${bucket}...`);
    const removed = emptySiteBucket(config, bucket);
    console.log(`✔ Bucket empty (${removed} versions/markers removed)`);
    const deleted = aws(config, ['cloudformation', 'delete-stack', '--stack-name', stackName, '--role-arn', cdkRoleArn(config.account, config.region, config.qualifier, 'cfn-exec')], deploy);
    if (!deleted.ok) fail(`delete-stack failed: ${deleted.stderr.trim()}`);
    console.log('Deleting; removing the CloudFront distribution usually takes several minutes...');
    const waited = aws(config, ['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', stackName], deploy);
    if (!waited.ok) {
      printFailures(config, deploy, stackName);
      fail('Stack deletion did not complete; the bucket is already empty. Re-run infra:destroy after fixing.');
    }
    console.log(`✔ Destroyed ${stackName}. Retained resources are listed above; their running cost is in docs/cost-worksheet.md.`);
  }
}

await main();
