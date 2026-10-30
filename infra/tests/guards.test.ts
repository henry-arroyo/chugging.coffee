import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configProblems, loadConfig } from '../lib/config';
import { parseArgs, preflightProblems, targetStack } from '../lib/preflight';
import { validateTemplate } from '../lib/validate-template';
import { ACCOUNT, confirmedConfig } from './helpers';

describe('argument parsing', () => {
  it('requires an explicit environment for every command except check', () => {
    for (const cmd of ['synth', 'diff', 'deploy', 'status', 'destroy']) expect(() => parseArgs([cmd])).toThrow(/--env/);
    expect(parseArgs(['check'])).toMatchObject({ command: 'check', env: null });
    expect(() => parseArgs(['check', '--env', 'test'])).toThrow();
  });

  it.each([
    [['deploy', '--env', 'staging']],
    [['deploy', '--env']],
    [['deploy', '--env', 'test', 'CtmProd-Site']],
    [['deploy', '--env', 'test', '--all']],
    [['deploy', '--env', 'test', '--stack', '*']],
    [['deploy', '--env', 'test', '--stack', 'CtmTest-*']],
    [['deploy', '--env', 'test', '--stack', 'certificate']],
    [['destroy', '--env', 'prod', '--stack', 'certificate']],
    [['bootstrap', '--env', 'test']],
    [[]],
  ])('rejects %j', (argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });

  it('maps stack roles to exact names', () => {
    expect(targetStack('test', 'site')).toBe('CtmTest-Site');
    expect(targetStack('prod', 'site')).toBe('CtmProd-Site');
    expect(targetStack('prod', 'certificate')).toBe('CtmProd-Certificate');
    expect(() => targetStack('test', 'certificate')).toThrow();
  });
});

describe('preflight', () => {
  const arn = (role: string, account = ACCOUNT) => `arn:aws:sts::${account}:assumed-role/${role}/henry`;

  it('passes for the right account, role and region', () => {
    expect(preflightProblems(confirmedConfig('test'), { Account: ACCOUNT, Arn: arn('ctm-test-operator') }, 'us-east-1')).toEqual([]);
  });

  it.each([
    ['unconfirmed config', confirmedConfig('test', { confirmed: false }), { Account: ACCOUNT, Arn: arn('ctm-test-operator') }, 'us-east-1'],
    ['wrong account', confirmedConfig('test'), { Account: '222222222222', Arn: arn('ctm-test-operator', '222222222222') }, 'us-east-1'],
    ['prod role used for test', confirmedConfig('test'), { Account: ACCOUNT, Arn: arn('ctm-prod-operator') }, 'us-east-1'],
    ['test role used for prod', confirmedConfig('prod'), { Account: ACCOUNT, Arn: arn('ctm-test-operator') }, 'us-east-1'],
    ['admin user instead of operator', confirmedConfig('prod'), { Account: ACCOUNT, Arn: `arn:aws:iam::${ACCOUNT}:user/admin` }, 'us-east-1'],
    ['look-alike role name', confirmedConfig('test'), { Account: ACCOUNT, Arn: arn('ctm-test-operator-admin') }, 'us-east-1'],
    ['wrong region', confirmedConfig('test'), { Account: ACCOUNT, Arn: arn('ctm-test-operator') }, 'eu-west-1'],
    ['no credentials', confirmedConfig('test'), null, 'us-east-1'],
  ])('refuses: %s', (_label, config, identity, region) => {
    expect(preflightProblems(config, identity, region).length).toBeGreaterThan(0);
  });
});

describe('environment config', () => {
  it('accepts the committed configs', () => {
    expect(loadConfig('test')).toMatchObject({ confirmed: true, account: '196691452297', domainName: null });
    expect(loadConfig('prod')).toMatchObject({ confirmed: true, account: '196691452297', domainName: 'chugging.coffee' });
  });

  it.each([
    ['cross-wired environment', 'test', { environment: 'prod' }],
    ['shared qualifier', 'test', { qualifier: 'ctmprod' }],
    ['wrong profile', 'prod', { profile: 'default' }],
    ['other region', 'test', { region: 'us-west-2' }],
    ['confirmed placeholder account', 'test', { confirmed: true, account: 'UNCONFIRMED' }],
    ['test without expiry', 'test', { expiresOn: null }],
    ['prod with expiry', 'prod', { expiresOn: '2027-01-01' }],
    ['certificate without domain', 'prod', { certificateArn: 'arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000' }],
    ['certificate from another account', 'prod', { domainName: 'chugging.coffee', certificateArn: 'arn:aws:acm:us-east-1:222222222222:certificate/00000000-0000-0000-0000-000000000000' }],
    ['test with a custom domain', 'test', { domainName: 'test.chugging.coffee' }],
    ['unknown field', 'test', { adminRole: 'x' }],
  ] as const)('rejects %s', (_label, env, overrides) => {
    const base = { ...confirmedConfig(env) };
    expect(configProblems(env, base)).toEqual([]);
    expect(configProblems(env, { ...base, ...overrides }).length).toBeGreaterThan(0);
  });

  it('loads from an explicit directory and reports every problem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctm-config-'));
    writeFileSync(join(dir, 'test.json'), JSON.stringify({ environment: 'test' }));
    expect(() => loadConfig('test', dir)).toThrow(/missing field account/);
  });
});

describe('template validation', () => {
  const base = () => ({
    Parameters: { BootstrapVersion: { Default: '/cdk-bootstrap/ctmtest/version' } },
    Resources: {
      Bucket: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: 'ctm-test-site-111111111111',
          BucketEncryption: {},
          PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
          Tags: [
            { Key: 'Project', Value: 'chugging-time-machine' },
            { Key: 'Environment', Value: 'test' },
            { Key: 'ManagedBy', Value: 'aws-cdk' },
            { Key: 'ExpiresOn', Value: '2026-12-31' },
          ],
        },
      },
    } as Record<string, any>,
    Outputs: {} as Record<string, any>,
  });
  const check = (t: any) => validateTemplate(t, 'site', 'test', '2026-12-31');

  it('accepts a compliant template', () => {
    expect(check(base())).toEqual([]);
  });

  it.each([
    ['Lambda function', (t: any) => (t.Resources.Fn = { Type: 'AWS::Lambda::Function' })],
    ['IAM role', (t: any) => (t.Resources.Role = { Type: 'AWS::IAM::Role' })],
    ['custom resource', (t: any) => (t.Resources.Auto = { Type: 'Custom::S3AutoDeleteObjects' })],
    ['BucketDeployment', (t: any) => (t.Resources.Deploy = { Type: 'Custom::CDKBucketDeployment' })],
    ['DynamoDB table', (t: any) => (t.Resources.Table = { Type: 'AWS::DynamoDB::Table' })],
    ['EC2 instance', (t: any) => (t.Resources.Box = { Type: 'AWS::EC2::Instance' })],
    ['certificate in the site stack', (t: any) => (t.Resources.Cert = { Type: 'AWS::CertificateManager::Certificate' })],
    ['production bootstrap qualifier', (t: any) => (t.Parameters.BootstrapVersion.Default = '/cdk-bootstrap/ctmprod/version')],
    ['default bootstrap qualifier', (t: any) => (t.Parameters.BootstrapVersion.Default = '/cdk-bootstrap/hnb659fds/version')],
    ['public access allowed', (t: any) => (t.Resources.Bucket.Properties.PublicAccessBlockConfiguration.BlockPublicPolicy = false)],
    ['website hosting', (t: any) => (t.Resources.Bucket.Properties.WebsiteConfiguration = { IndexDocument: 'index.html' })],
    ['prod-named bucket in test', (t: any) => (t.Resources.Bucket.Properties.BucketName = 'ctm-prod-site-111111111111')],
    ['protected tag mislabelled', (t: any) => (t.Resources.Bucket.Properties.Tags[1].Value = 'prod')],
    ['missing expiry tag', (t: any) => t.Resources.Bucket.Properties.Tags.pop()],
    ['stack export', (t: any) => (t.Outputs.X = { Value: 'x', Export: { Name: 'x' } })],
    ['public bucket policy', (t: any) => (t.Resources.Policy = { Type: 'AWS::S3::BucketPolicy', Properties: { PolicyDocument: { Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject' }] } } })],
    ['HTTP distribution', (t: any) => (t.Resources.D = { Type: 'AWS::CloudFront::Distribution', Properties: { Tags: t.Resources.Bucket.Properties.Tags, DistributionConfig: { DefaultCacheBehavior: { ViewerProtocolPolicy: 'allow-all' }, Origins: [{ OriginAccessControlId: 'x' }] } } })],
    ['custom origin (proxy)', (t: any) => (t.Resources.D = { Type: 'AWS::CloudFront::Distribution', Properties: { Tags: t.Resources.Bucket.Properties.Tags, DistributionConfig: { DefaultCacheBehavior: { ViewerProtocolPolicy: 'https-only' }, Origins: [{ CustomOriginConfig: {}, OriginAccessControlId: 'x' }] } } })],
    ['function outside the prefix', (t: any) => (t.Resources.F = { Type: 'AWS::CloudFront::Function', Properties: { Name: 'router' } })],
  ])('rejects %s', (_label, mutate) => {
    const t = base();
    mutate(t);
    expect(check(t).length).toBeGreaterThan(0);
  });
});

describe('access setup', async () => {
  const { parseSetupArgs, trustedPrincipalFor } = await import('../access/setup-access');
  const noLookup = () => {
    throw new Error('lookup not expected');
  };

  it('trusts the signed-in IAM user directly', () => {
    expect(trustedPrincipalFor('arn:aws:iam::196691452297:user/henry.arroyo', noLookup)).toBe('arn:aws:iam::196691452297:user/henry.arroyo');
  });

  it('maps an Identity Center session to its role, including the path', () => {
    const arn = trustedPrincipalFor('arn:aws:sts::196691452297:assumed-role/AWSReservedSSO_Admin_0123/henry', () => '/aws-reserved/sso.amazonaws.com/');
    expect(arn).toBe('arn:aws:iam::196691452297:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_Admin_0123');
  });

  it('refuses root and unknown identities', () => {
    expect(() => trustedPrincipalFor('arn:aws:iam::196691452297:root', noLookup)).toThrow(/root/);
    expect(() => trustedPrincipalFor('arn:aws:sts::196691452297:federated-user/x', noLookup)).toThrow();
  });

  it('requires a mode and the typed account ID, and only the configured prod domain', () => {
    expect(parseSetupArgs(['--plan', '--confirm-account', '196691452297'], 'chugging.coffee')).toEqual({ mode: 'plan', confirmAccount: '196691452297', certificateDomain: '' });
    expect(parseSetupArgs(['--apply', '--confirm-account', '196691452297', '--certificate-domain', 'chugging.coffee'], 'chugging.coffee').certificateDomain).toBe('chugging.coffee');
    expect(() => parseSetupArgs(['--confirm-account', '196691452297'], 'chugging.coffee')).toThrow(/--plan/);
    expect(() => parseSetupArgs(['--apply'], 'chugging.coffee')).toThrow(/confirm-account/);
    expect(() => parseSetupArgs(['--plan', '--apply', '--confirm-account', '196691452297'], 'chugging.coffee')).toThrow();
    expect(() => parseSetupArgs(['--apply', '--confirm-account', '196691452297', '--certificate-domain', 'evil.example'], 'chugging.coffee')).toThrow();
  });
});
