/**
 * Read-only proof that the applied roles allow what they should and deny what they must.
 * Uses IAM's policy simulator (simulate-principal-policy) against the real roles, which includes
 * their identity policies and permission boundary. Resource policies (bucket policies) are not part
 * of the simulation. Run with the owner's session:
 *
 *   npm run access:verify
 */
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../lib/config';
import { BOOTSTRAP_PROFILE } from './setup-access';

type Expect = 'allowed' | 'denied';
interface Context {
  key: string;
  values: string[];
  type?: 'string' | 'stringList';
}
export interface Case {
  title: string;
  role: string;
  action: string;
  resource: string;
  expect: Expect;
  context?: Context[];
}

export function cases(account: string, region: string): Case[] {
  const role = (name: string) => `arn:aws:iam::${account}:role/${name}`;
  const cdk = (env: string, kind: string) => role(`cdk-ctm${env}-${kind}-${account}-${region}`);
  const stack = (name: string) => `arn:aws:cloudformation:${region}:${account}:stack/${name}/00000000-0000-0000-0000-000000000000`;
  const dist = `arn:aws:cloudfront::${account}:distribution/E000000000000`;
  const cert = `arn:aws:acm:${region}:${account}:certificate/00000000-0000-0000-0000-000000000000`;
  const tags = (env: string): Context[] => [
    { key: 'aws:ResourceTag/Project', values: ['chugging-time-machine'] },
    { key: 'aws:ResourceTag/Environment', values: [env] },
  ];
  const changeSet = (execEnv: string, types: string[]): Context[] => [
    { key: 'cloudformation:RoleArn', values: [cdk(execEnv, 'cfn-exec-role')] },
    { key: 'cloudformation:ResourceTypes', values: types, type: 'stringList' },
  ];
  const siteTypes = [
    'AWS::S3::Bucket',
    'AWS::S3::BucketPolicy',
    'AWS::CloudFront::Distribution',
    'AWS::CloudFront::OriginAccessControl',
    'AWS::CloudFront::ResponseHeadersPolicy',
    'AWS::CloudFront::Function',
  ];
  const testOp = role('ctm-test-operator');
  const prodOp = role('ctm-prod-operator');
  const testDeploy = cdk('test', 'deploy-role');
  const testExec = cdk('test', 'cfn-exec-role');
  const prodExec = cdk('prod', 'cfn-exec-role');
  const testPublish = cdk('test', 'file-publishing-role');

  return [
    // Operators
    { title: 'test operator publishes to the test site bucket', role: testOp, action: 's3:PutObject', resource: `arn:aws:s3:::ctm-test-site-${account}/index.html`, expect: 'allowed' },
    { title: 'test operator cannot write the prod site bucket', role: testOp, action: 's3:PutObject', resource: `arn:aws:s3:::ctm-prod-site-${account}/index.html`, expect: 'denied' },
    { title: 'test operator assumes the test deploy role', role: testOp, action: 'sts:AssumeRole', resource: testDeploy, expect: 'allowed' },
    { title: 'test operator cannot assume the prod deploy role', role: testOp, action: 'sts:AssumeRole', resource: cdk('prod', 'deploy-role'), expect: 'denied' },
    { title: 'test operator cannot assume the execution role directly', role: testOp, action: 'sts:AssumeRole', resource: testExec, expect: 'denied' },
    { title: 'prod operator cannot assume the test deploy role', role: prodOp, action: 'sts:AssumeRole', resource: testDeploy, expect: 'denied' },
    { title: 'test operator cannot edit its own policy', role: testOp, action: 'iam:PutRolePolicy', resource: testOp, expect: 'denied' },
    { title: 'test operator cannot remove its boundary', role: testOp, action: 'iam:DeleteRolePermissionsBoundary', resource: testOp, expect: 'denied' },
    { title: 'test operator cannot create roles', role: testOp, action: 'iam:CreateRole', resource: role('anything'), expect: 'denied' },
    { title: 'test operator cannot use Lambda', role: testOp, action: 'lambda:CreateFunction', resource: '*', expect: 'denied' },
    { title: 'test operator invalidates the test distribution', role: testOp, action: 'cloudfront:CreateInvalidation', resource: dist, context: tags('test'), expect: 'allowed' },
    { title: 'test operator cannot invalidate the prod distribution', role: testOp, action: 'cloudfront:CreateInvalidation', resource: dist, context: tags('prod'), expect: 'denied' },
    { title: 'prod operator cannot touch the foundation stack', role: prodOp, action: 'cloudformation:DeleteStack', resource: stack('ctm-foundation'), expect: 'denied' },

    // Deploy role
    { title: 'test deploy role creates a valid test change set', role: testDeploy, action: 'cloudformation:CreateChangeSet', resource: stack('CtmTest-Site'), context: changeSet('test', siteTypes), expect: 'allowed' },
    { title: 'test deploy role cannot change the prod stack', role: testDeploy, action: 'cloudformation:CreateChangeSet', resource: stack('CtmProd-Site'), context: changeSet('test', siteTypes), expect: 'denied' },
    { title: 'test deploy role cannot use the prod execution role', role: testDeploy, action: 'cloudformation:CreateChangeSet', resource: stack('CtmTest-Site'), context: changeSet('prod', siteTypes), expect: 'denied' },
    { title: 'test deploy role cannot deploy a Lambda function', role: testDeploy, action: 'cloudformation:CreateChangeSet', resource: stack('CtmTest-Site'), context: changeSet('test', [...siteTypes, 'AWS::Lambda::Function']), expect: 'denied' },
    { title: 'test deploy role cannot deploy IAM roles', role: testDeploy, action: 'cloudformation:CreateChangeSet', resource: stack('CtmTest-Site'), context: changeSet('test', ['AWS::IAM::Role']), expect: 'denied' },
    { title: 'change set without declared resource types is refused', role: testDeploy, action: 'cloudformation:CreateChangeSet', resource: stack('CtmTest-Site'), context: [{ key: 'cloudformation:RoleArn', values: [testExec] }], expect: 'denied' },
    {
      title: 'resource import (adoption) is refused',
      role: testDeploy,
      action: 'cloudformation:CreateChangeSet',
      resource: stack('CtmTest-Site'),
      context: [...changeSet('test', siteTypes), { key: 'cloudformation:ImportResourceTypes', values: ['AWS::S3::Bucket'], type: 'stringList' }],
      expect: 'denied',
    },
    { title: 'test deploy role cannot update stacks without a change set', role: testDeploy, action: 'cloudformation:UpdateStack', resource: stack('CtmTest-Site'), expect: 'denied' },
    { title: 'test deploy role cannot delete its bootstrap stack', role: testDeploy, action: 'cloudformation:DeleteStack', resource: stack('CDKToolkit-ctmtest'), expect: 'denied' },
    { title: 'test deploy role passes the test execution role to CloudFormation', role: testDeploy, action: 'iam:PassRole', resource: testExec, context: [{ key: 'iam:PassedToService', values: ['cloudformation.amazonaws.com'] }], expect: 'allowed' },
    { title: 'test deploy role cannot pass the prod execution role', role: testDeploy, action: 'iam:PassRole', resource: prodExec, context: [{ key: 'iam:PassedToService', values: ['cloudformation.amazonaws.com'] }], expect: 'denied' },
    { title: 'test deploy role cannot pass the execution role to Lambda', role: testDeploy, action: 'iam:PassRole', resource: testExec, context: [{ key: 'iam:PassedToService', values: ['lambda.amazonaws.com'] }], expect: 'denied' },

    // Execution roles
    { title: 'test execution role creates the test site bucket', role: testExec, action: 's3:CreateBucket', resource: `arn:aws:s3:::ctm-test-site-${account}`, expect: 'allowed' },
    { title: 'test execution role cannot create the prod site bucket', role: testExec, action: 's3:CreateBucket', resource: `arn:aws:s3:::ctm-prod-site-${account}`, expect: 'denied' },
    { title: 'test execution role cannot change the staging bucket policy', role: testExec, action: 's3:PutBucketPolicy', resource: `arn:aws:s3:::cdk-ctmtest-assets-${account}-${region}`, expect: 'denied' },
    { title: 'test execution role cannot touch luna.is buckets', role: testExec, action: 's3:DeleteBucket', resource: 'arn:aws:s3:::socugame-site', expect: 'denied' },
    { title: 'test execution role updates the test distribution', role: testExec, action: 'cloudfront:UpdateDistribution', resource: dist, context: tags('test'), expect: 'allowed' },
    { title: 'test execution role cannot update the prod distribution', role: testExec, action: 'cloudfront:UpdateDistribution', resource: dist, context: tags('prod'), expect: 'denied' },
    { title: 'test execution role cannot update an untagged distribution', role: testExec, action: 'cloudfront:UpdateDistribution', resource: dist, expect: 'denied' },
    {
      title: 'test execution role tags a new distribution as test',
      role: testExec,
      action: 'cloudfront:TagResource',
      resource: dist,
      context: [
        { key: 'aws:RequestTag/Project', values: ['chugging-time-machine'] },
        { key: 'aws:RequestTag/Environment', values: ['test'] },
      ],
      expect: 'allowed',
    },
    {
      title: 'test execution role cannot label anything prod',
      role: testExec,
      action: 'cloudfront:TagResource',
      resource: dist,
      context: [
        { key: 'aws:RequestTag/Project', values: ['chugging-time-machine'] },
        { key: 'aws:RequestTag/Environment', values: ['prod'] },
      ],
      expect: 'denied',
    },
    {
      title: 'test execution role cannot re-label a prod distribution',
      role: testExec,
      action: 'cloudfront:TagResource',
      resource: dist,
      context: [...tags('prod'), { key: 'aws:RequestTag/Environment', values: ['test'] }],
      expect: 'denied',
    },
    {
      title: 'test execution role cannot remove protected tags',
      role: testExec,
      action: 'cloudfront:UntagResource',
      resource: dist,
      context: [...tags('test'), { key: 'aws:TagKeys', values: ['Environment'], type: 'stringList' }],
      expect: 'denied',
    },
    { title: 'test execution role manages ctm-test-* functions', role: testExec, action: 'cloudfront:UpdateFunction', resource: `arn:aws:cloudfront::${account}:function/ctm-test-router`, expect: 'allowed' },
    { title: 'test execution role reads tags of ctm-test-* functions', role: testExec, action: 'cloudfront:ListTagsForResource', resource: `arn:aws:cloudfront::${account}:function/ctm-test-router`, expect: 'allowed' },
    { title: 'test execution role cannot tag functions', role: testExec, action: 'cloudfront:TagResource', resource: `arn:aws:cloudfront::${account}:function/ctm-test-router`, context: [{ key: 'aws:RequestTag/Environment', values: ['test'] }], expect: 'denied' },
    { title: 'test execution role cannot touch ctm-prod-* functions', role: testExec, action: 'cloudfront:UpdateFunction', resource: `arn:aws:cloudfront::${account}:function/ctm-prod-router`, expect: 'denied' },
    { title: 'test execution role cannot request certificates', role: testExec, action: 'acm:RequestCertificate', resource: '*', context: [{ key: 'acm:DomainNames', values: ['chugging.coffee'], type: 'stringList' }], expect: 'denied' },
    {
      title: 'prod execution role requests the chugging.coffee certificate',
      role: prodExec,
      action: 'acm:RequestCertificate',
      resource: '*',
      context: [
        { key: 'acm:DomainNames', values: ['chugging.coffee'], type: 'stringList' },
        { key: 'acm:ValidationMethod', values: ['DNS'] },
      ],
      expect: 'allowed',
    },
    {
      title: 'prod execution role cannot request other domains',
      role: prodExec,
      action: 'acm:RequestCertificate',
      resource: '*',
      context: [
        { key: 'acm:DomainNames', values: ['chugging.coffee', 'evil.example'], type: 'stringList' },
        { key: 'acm:ValidationMethod', values: ['DNS'] },
      ],
      expect: 'denied',
    },
    { title: 'prod execution role cannot delete untagged certificates', role: prodExec, action: 'acm:DeleteCertificate', resource: cert, expect: 'denied' },
    { title: 'execution role cannot create IAM roles', role: testExec, action: 'iam:CreateRole', resource: role('x'), expect: 'denied' },
    { title: 'execution role cannot use Lambda', role: testExec, action: 'lambda:CreateFunction', resource: '*', expect: 'denied' },
    { title: 'execution role cannot launch EC2', role: testExec, action: 'ec2:RunInstances', resource: '*', expect: 'denied' },
    { title: 'execution role cannot create DynamoDB tables', role: testExec, action: 'dynamodb:CreateTable', resource: '*', expect: 'denied' },
    { title: 'execution role cannot create RDS databases', role: prodExec, action: 'rds:CreateDBInstance', resource: '*', expect: 'denied' },

    // File publishing
    { title: 'test publishing role writes the test staging bucket', role: testPublish, action: 's3:PutObject', resource: `arn:aws:s3:::cdk-ctmtest-assets-${account}-${region}/x.json`, expect: 'allowed' },
    { title: 'test publishing role cannot write the prod staging bucket', role: testPublish, action: 's3:PutObject', resource: `arn:aws:s3:::cdk-ctmprod-assets-${account}-${region}/x.json`, expect: 'denied' },
  ];
}

function simulate(c: Case, account: string, region: string): { decision: string; boundary: boolean | null } {
  // Real S3 requests carry s3:ResourceAccount (the bucket owner); the simulator does not add it.
  const implicit: Context[] = [{ key: 'aws:RequestedRegion', values: [region] }];
  if (c.action.startsWith('s3:')) implicit.push({ key: 's3:ResourceAccount', values: [account] });
  const context = [...implicit, ...(c.context ?? [])].map((x) => ({
    ContextKeyName: x.key,
    ContextKeyValues: x.values,
    ContextKeyType: x.type ?? 'string',
  }));
  const env = { ...process.env };
  for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE']) delete env[k];
  const r = spawnSync(
    'aws',
    [
      'iam', 'simulate-principal-policy', '--profile', BOOTSTRAP_PROFILE, '--region', region, '--output', 'json',
      '--policy-source-arn', c.role, '--action-names', c.action, '--resource-arns', c.resource,
      '--context-entries', JSON.stringify(context),
    ],
    { env, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`simulate-principal-policy failed for "${c.title}": ${r.stderr.trim()}`);
  const result = JSON.parse(r.stdout).EvaluationResults[0];
  return { decision: result.EvalDecision, boundary: result.PermissionsBoundaryDecisionDetail?.AllowedByPermissionsBoundary ?? null };
}

function main() {
  const config = loadConfig('test');
  const all = cases(config.account, config.region);
  let failures = 0;
  for (const c of all) {
    const { decision } = simulate(c, config.account, config.region);
    const actual: Expect = decision === 'allowed' ? 'allowed' : 'denied';
    const ok = actual === c.expect;
    if (!ok) failures++;
    console.log(`${ok ? '✔' : '✖'} ${c.title.padEnd(68)} ${decision}`);
  }
  console.log(`\n${all.length - failures}/${all.length} access checks behaved as designed.`);
  if (failures > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
