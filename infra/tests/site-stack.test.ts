import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../lib/app';
import { stackNames } from '../lib/config';
import { CONTENT_SECURITY_POLICY } from '../lib/site-stack';
import { validateTemplate } from '../lib/validate-template';
import { ACCOUNT, confirmedConfig } from './helpers';

function synth(env: 'test' | 'prod', overrides = {}) {
  const app = buildApp(new cdk.App({ analyticsReporting: false }), confirmedConfig(env, overrides));
  return app.synth();
}

function siteTemplate(env: 'test' | 'prod', overrides = {}) {
  const assembly = synth(env, overrides);
  return assembly.getStackByName(stackNames(env).site).template;
}

describe.each(['test', 'prod'] as const)('%s site stack', (env) => {
  const raw = siteTemplate(env);
  const t = Template.fromJSON(raw);

  it('passes the deploy-time template validation', () => {
    expect(validateTemplate(raw, 'site', env, env === 'test' ? '2026-12-31' : null)).toEqual([]);
  });

  it('contains only the allowlisted resource types and no IAM, Lambda or custom resources', () => {
    const types = Object.values<any>(raw.Resources).map((r) => r.Type).sort();
    expect(types).toEqual([
      'AWS::CloudFront::Distribution',
      'AWS::CloudFront::Function',
      'AWS::CloudFront::OriginAccessControl',
      'AWS::CloudFront::ResponseHeadersPolicy',
      'AWS::S3::Bucket',
      'AWS::S3::BucketPolicy',
    ]);
  });

  it('uses its own bootstrap qualifier', () => {
    expect(raw.Parameters.BootstrapVersion.Default).toBe(`/cdk-bootstrap/ctm${env}/version`);
  });

  it('has a private, encrypted, versioned bucket named for the environment', () => {
    t.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: `ctm-${env}-site-${ACCOUNT}`,
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
      VersioningConfiguration: { Status: 'Enabled' },
      OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
    });
    t.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
  });

  it('lets only this distribution read the bucket, over TLS', () => {
    t.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
          Match.objectLike({ Effect: 'Allow', Action: 's3:GetObject', Principal: { Service: 'cloudfront.amazonaws.com' }, Condition: { StringEquals: { 'AWS:SourceArn': Match.anyValue() } } }),
        ]),
      },
    });
  });

  it('serves HTTPS only through OAC, GET/HEAD, with security headers and the router', () => {
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        PriceClass: 'PriceClass_100',
        Logging: Match.absent(),
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
          AllowedMethods: ['GET', 'HEAD'],
          FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
          ResponseHeadersPolicyId: Match.anyValue(),
        }),
        Origins: [Match.objectLike({ OriginAccessControlId: Match.anyValue(), S3OriginConfig: { OriginAccessIdentity: '' } })],
      }),
    });
    t.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        Name: `ctm-${env}-security-headers`,
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: { ContentSecurityPolicy: CONTENT_SECURITY_POLICY, Override: true },
          FrameOptions: { FrameOption: 'DENY', Override: true },
          StrictTransportSecurity: Match.objectLike({ IncludeSubdomains: false, Preload: false }),
        }),
      }),
    });
    t.hasResourceProperties('AWS::CloudFront::Function', { Name: `ctm-${env}-router` });
  });

  it('tags every taggable resource', () => {
    for (const type of ['AWS::S3::Bucket', 'AWS::CloudFront::Distribution']) {
      const expected = [
        { Key: 'Project', Value: 'chugging-time-machine' },
        { Key: 'Environment', Value: env },
        { Key: 'ManagedBy', Value: 'aws-cdk' },
        ...(env === 'test' ? [{ Key: 'ExpiresOn', Value: '2026-12-31' }] : []),
      ];
      for (const tag of expected) t.hasResourceProperties(type, { Tags: Match.arrayWith([tag]) });
    }
  });

  it('exports nothing', () => {
    for (const out of Object.values<any>(raw.Outputs ?? {})) expect(out.Export).toBeUndefined();
  });
});

describe('environment separation', () => {
  it('prod and test share no resource names', () => {
    const names = (env: 'test' | 'prod') =>
      JSON.stringify(siteTemplate(env).Resources).match(/ctm-(?:prod|test)-[a-z0-9-]+/g) ?? [];
    expect(names('test').every((n) => n.startsWith('ctm-test-'))).toBe(true);
    expect(names('prod').every((n) => n.startsWith('ctm-prod-'))).toBe(true);
  });

  it('test never gets a certificate stack, prod only when a domain is configured', () => {
    expect(synth('test').stacks.map((s) => s.stackName)).toEqual(['CtmTest-Site']);
    expect(synth('prod').stacks.map((s) => s.stackName)).toEqual(['CtmProd-Site']);
    // Domain set, certificate not yet issued: certificate stack exists, site has no alias yet.
    const pending = synth('prod', { domainName: 'chugging.coffee' });
    expect(pending.stacks.map((s) => s.stackName).sort()).toEqual(['CtmProd-Certificate', 'CtmProd-Site']);
    Template.fromJSON(pending.getStackByName('CtmProd-Site').template).hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: Match.absent() }),
    });
    const withDomain = synth('prod', {
      domainName: 'chugging.coffee',
      certificateArn: `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/00000000-0000-0000-0000-000000000000`,
    });
    expect(withDomain.stacks.map((s) => s.stackName).sort()).toEqual(['CtmProd-Certificate', 'CtmProd-Site']);
    const cert = withDomain.getStackByName('CtmProd-Certificate').template;
    expect(validateTemplate(cert, 'certificate', 'prod', null)).toEqual([]);
    const site = Template.fromJSON(withDomain.getStackByName('CtmProd-Site').template);
    site.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['chugging.coffee'], ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: 'TLSv1.2_2021' }) }),
    });
  });

  it('prod stacks have termination protection, test stacks do not', () => {
    expect(synth('prod').getStackByName('CtmProd-Site').terminationProtection).toBe(true);
    expect(synth('test').getStackByName('CtmTest-Site').terminationProtection).toBeFalsy();
  });
});

describe('router function', () => {
  const code = readFileSync(join(import.meta.dirname, '../lib/router-function.js'), 'utf8');
  const handler = new Function(`${code}; return handler;`)() as (e: any) => any;
  const run = (uri: string) => handler({ request: { uri, headers: {} } });

  it.each([
    ['/', '/index.html'],
    ['/open/http/chugging.test/', '/index.html'],
    ['/index.html', '/index.html'],
    ['/assets/index-abc123.js', '/assets/index-abc123.js'],
    ['/missing.png', '/missing.png'],
    ['/world/rel-0001/release.json', '/world/rel-0001/release.json'],
    ['/irc', '/irc'],
  ])('%s → origin %s', (uri, expected) => {
    expect(run(uri).uri).toBe(expected);
  });

  it.each([
    ['/time-machine', '/'],
    ['/time-machine/', '/'],
    ['/time-machine/open/http/chugging.test/', '/open/http/chugging.test/'],
    ['/time-machine/assets/index-abc123.js', '/assets/index-abc123.js'],
  ])('redirects the old address %s to %s', (uri, location) => {
    expect(run(uri)).toMatchObject({ statusCode: 301, headers: { location: { value: location } } });
  });

  it('only "/" and /open/ deep links get the shell; other unknown paths are passed through to a 404', () => {
    for (const uri of ['/time-machinex/', '/openx', '/TIME-MACHINE/', '/irc/x']) expect(run(uri).uri).toBe(uri);
  });
});

describe('tags on CloudFront functions', () => {
  it('leaves the CloudFront function untagged (D45) while the bucket and distribution keep their tags', () => {
    for (const env of ['test', 'prod'] as const) {
      const t = Template.fromJSON(siteTemplate(env));
      for (const fn of Object.values(t.findResources('AWS::CloudFront::Function'))) expect((fn as { Properties: { Tags?: unknown } }).Properties.Tags).toBeUndefined();
      t.hasResourceProperties('AWS::S3::Bucket', { Tags: Match.arrayWith([{ Key: 'Project', Value: 'chugging-time-machine' }]) });
      t.hasResourceProperties('AWS::CloudFront::Distribution', { Tags: Match.arrayWith([{ Key: 'Environment', Value: env }]) });
    }
  });
});

