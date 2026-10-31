import { describe, expect, it } from 'vitest';
import { allowedResourceTypes } from '../lib/validate-template';
import { asList, loadYamlTemplate, policyStatements, type Statement } from './helpers';

const bootstrap = loadYamlTemplate('bootstrap-template.yaml');
const foundation = loadYamlTemplate('foundation-template.yaml');
const actions = (s: Statement) => asList(s.Action);
const json = (v: unknown) => JSON.stringify(v);

/** Allow statements whose Resource is "*", which must be limited to create/identity calls. */
const STAR_ALLOWED = new Set([
  'sts:GetCallerIdentity',
  'cloudfront:CreateDistribution',
  'cloudfront:CreateOriginAccessControl',
  'cloudfront:CreateResponseHeadersPolicy',
  'acm:RequestCertificate',
  // Boundary ceiling only (intersected with each role's own scoped policy):
  'cloudfront:*',
  'acm:*',
]);

describe.each([
  ['bootstrap', bootstrap],
  ['foundation', foundation],
])('%s template policies', (_name, template) => {
  const statements = policyStatements(template);

  it('never allows every action', () => {
    for (const { statement } of statements) {
      if (statement.Effect === 'Allow') expect(actions(statement)).not.toContain('*');
    }
  });

  it('allows Resource "*" only for creates, identity checks and the boundary ceiling', () => {
    for (const { resource, statement } of statements) {
      if (statement.Effect !== 'Allow' || statement.Resource !== '*') continue;
      for (const a of actions(statement)) expect(STAR_ALLOWED.has(a), `${resource}/${statement.Sid}: ${a}`).toBe(true);
    }
  });

  it('scopes every iam:PassRole to exact execution roles and to CloudFormation', () => {
    const pass = statements.filter(({ statement }) => statement.Effect === 'Allow' && actions(statement).includes('iam:PassRole'));
    expect(pass.length).toBeGreaterThan(0);
    for (const { statement } of pass) {
      const resource = json(statement.Resource);
      expect(resource).not.toContain('*');
      expect(resource.includes('cfn-exec-role') || resource === json({ 'Fn::GetAtt': ['CloudFormationExecutionRole', 'Arn'] })).toBe(true);
      expect(statement.Condition?.StringEquals?.['iam:PassedToService']).toBe('cloudformation.amazonaws.com');
    }
  });

  it('grants no IAM writes anywhere', () => {
    for (const { resource, statement } of statements) {
      if (statement.Effect !== 'Allow') continue;
      for (const a of actions(statement)) {
        if (a.startsWith('iam:')) expect(a, `${resource}/${statement.Sid}`).toBe('iam:PassRole');
      }
    }
  });

  it('puts the permission boundary on every role', () => {
    for (const [id, res] of Object.entries<any>(template.Resources)) {
      if (res.Type !== 'AWS::IAM::Role') continue;
      const boundary = json(res.Properties.PermissionsBoundary);
      expect(boundary.includes('ctm-permissions-boundary') || boundary === json({ Ref: 'PermissionsBoundary' }), id).toBe(true);
    }
  });

  it('trusts no account root or wildcard principal', () => {
    for (const [id, res] of Object.entries<any>(template.Resources)) {
      if (res.Type !== 'AWS::IAM::Role') continue;
      const trust = json(res.Properties.AssumeRolePolicyDocument);
      expect(trust, id).not.toMatch(/:root|"AWS":"\*"|"Principal":"\*"/);
      expect(trust, id).not.toContain('AWS::AccountId"}}');
    }
  });
});

describe('restricted bootstrap', () => {
  const resources = Object.entries<any>(bootstrap.Resources);
  const role = (id: string) => bootstrap.Resources[id].Properties;

  it('creates only the resources a file-asset CDK deploy needs', () => {
    expect(resources.map(([, r]) => r.Type).sort()).toEqual([
      'AWS::IAM::ManagedPolicy',
      'AWS::IAM::Role',
      'AWS::IAM::Role',
      'AWS::IAM::Role',
      'AWS::S3::Bucket',
      'AWS::S3::BucketPolicy',
      'AWS::SSM::Parameter',
    ]);
    expect(json(bootstrap)).not.toMatch(/AWS::ECR::|AWS::KMS::|LookupRole|ImagePublishingRole/);
  });

  it('uses the role names DefaultStackSynthesizer expects', () => {
    expect(json(role('DeploymentActionRole').RoleName)).toContain('cdk-${Qualifier}-deploy-role-${AWS::AccountId}-${AWS::Region}');
    expect(json(role('FilePublishingRole').RoleName)).toContain('cdk-${Qualifier}-file-publishing-role-${AWS::AccountId}-${AWS::Region}');
    expect(json(role('CloudFormationExecutionRole').RoleName)).toContain('cdk-${Qualifier}-cfn-exec-role-${AWS::AccountId}-${AWS::Region}');
    expect(bootstrap.Resources.CdkBootstrapVersion.Properties.Value).toBe('32');
  });

  it('lets only the environment operator role assume the deploy and publishing roles', () => {
    for (const id of ['DeploymentActionRole', 'FilePublishingRole']) {
      const principals = role(id).AssumeRolePolicyDocument.Statement.map((s: any) => json(s.Principal));
      expect(principals).toEqual([json({ AWS: { 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/ctm-${Environment}-operator' } })]);
    }
    expect(role('CloudFormationExecutionRole').AssumeRolePolicyDocument.Statement).toEqual([
      { Effect: 'Allow', Principal: { Service: 'cloudformation.amazonaws.com' }, Action: 'sts:AssumeRole' },
    ]);
  });

  it('does not use AdministratorAccess or any AWS managed policy', () => {
    expect(json(bootstrap.Resources)).not.toContain('AdministratorAccess');
    expect(role('CloudFormationExecutionRole').ManagedPolicyArns).toEqual([{ Ref: 'ExecutionPolicy' }]);
    expect(json(bootstrap.Resources)).not.toContain('arn:aws:iam::aws:policy');
  });

  it('requires the execution role and allowlisted resource types on every change set', () => {
    const st = policyStatements(bootstrap).find((s) => s.statement.Sid === 'ChangeSetsWithExecutionRole')!.statement;
    expect(st.Action).toBe('cloudformation:CreateChangeSet');
    expect(st.Condition?.StringEquals?.['cloudformation:RoleArn']).toEqual({ 'Fn::GetAtt': ['CloudFormationExecutionRole', 'Arn'] });
    const types = st.Condition?.['ForAllValues:StringEquals']?.['cloudformation:ResourceTypes'];
    expect([...(types as string[])].sort()).toEqual([...allowedResourceTypes('site'), ...allowedResourceTypes('certificate')].sort());
    expect(st.Condition?.Null?.['cloudformation:ResourceTypes']).toBe('false');
    expect(json(st.Resource)).toContain('${StackPrefix}-Site/*');
    expect(json(st.Resource)).not.toMatch(/stack\/\*|stack\/\$\{StackPrefix\}\*/);
  });

  it('never lets CloudFormation create stacks without a change set', () => {
    const allowed = policyStatements(bootstrap).filter((s) => s.statement.Effect === 'Allow').flatMap((s) => actions(s.statement));
    expect(allowed).not.toContain('cloudformation:CreateStack');
    expect(allowed).not.toContain('cloudformation:UpdateStack');
  });

  it('tags new distributions only with this environment and never re-labels another', () => {
    const exec = policyStatements(bootstrap).filter((s) => s.resource === 'ExecutionPolicy').map((s) => s.statement);
    const tagNew = exec.find((s) => s.Sid === 'TagNewDistribution')!;
    expect(tagNew.Condition?.StringEquals?.['aws:RequestTag/Environment']).toEqual({ Ref: 'Environment' });
    expect(tagNew.Condition?.Null?.['aws:ResourceTag/Project']).toBe('true');
    const retag = exec.find((s) => s.Sid === 'RetagOwnDistribution')!;
    expect(retag.Condition?.StringEquals?.['aws:ResourceTag/Environment']).toEqual({ Ref: 'Environment' });
    const untag = exec.find((s) => s.Sid === 'UntagOwnDistributionExceptProtectedKeys')!;
    expect(untag.Condition?.['ForAllValues:StringNotEquals']?.['aws:TagKeys']).toEqual(['Project', 'Environment', 'ManagedBy']);
    // Every modify/delete on distributions needs both project tags.
    for (const s of exec) {
      if (s.Effect !== 'Allow') continue;
      if (actions(s).some((a) => /cloudfront:(Update|Delete)Distribution/.test(a))) {
        expect(s.Condition?.StringEquals?.['aws:ResourceTag/Project']).toBe('chugging-time-machine');
        expect(s.Condition?.StringEquals?.['aws:ResourceTag/Environment']).toEqual({ Ref: 'Environment' });
      }
    }
  });

  it('limits S3 to the environment site bucket and functions to the environment prefix', () => {
    const exec = policyStatements(bootstrap).filter((s) => s.resource === 'ExecutionPolicy').map((s) => s.statement);
    for (const s of exec) {
      if (actions(s).some((a) => a.startsWith('s3:') && a !== 's3:GetObject')) {
        expect(json(s.Resource)).toContain('arn:aws:s3:::ctm-${Environment}-site-${AWS::AccountId}');
      }
      if (actions(s).some((a) => a.endsWith('Function'))) expect(json(s.Resource)).toContain('function/ctm-${Environment}-*');
    }
    // Function tags may be read, never written (D45, D46).
    const fns = exec.find((s) => s.Sid === 'EnvironmentFunctions')!;
    expect(actions(fns)).toContain('cloudfront:ListTagsForResource');
    expect(actions(fns).filter((a) => /^cloudfront:(Tag|Untag)Resource$/.test(a))).toEqual([]);
  });

  it('grants ACM only in prod with an owner-approved exact domain', () => {
    const acm = bootstrap.Resources.ExecutionPolicy.Properties.PolicyDocument.Statement.filter((s: any) => json(s).includes('acm:'));
    expect(acm.length).toBeGreaterThan(0);
    for (const s of acm) expect(s['Fn::If']?.[0]).toBe('ManageCertificate');
    expect(bootstrap.Parameters.CertificateDomainName.Default).toBe('');
  });

  it('keeps the staging bucket private and writable only by the file-publishing role', () => {
    const bucket = bootstrap.Resources.StagingBucket;
    expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({ BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true });
    expect(bucket.DeletionPolicy).toBe('Retain');
    const deny = bootstrap.Resources.StagingBucketPolicy.Properties.PolicyDocument.Statement.find((s: any) => s.Sid === 'OnlyFilePublishingRoleWrites');
    expect(deny.Condition.ArnNotEquals['aws:PrincipalArn']).toEqual({ 'Fn::GetAtt': ['FilePublishingRole', 'Arn'] });
  });
});

describe('security foundation', () => {
  const boundary = foundation.Resources.PermissionsBoundary.Properties.PolicyDocument.Statement as Statement[];
  const byId = (sid: string) => boundary.find((s) => s.Sid === sid)!;

  it('denies identity, organization and account changes to every project role', () => {
    const deny = byId('NoIdentityOrAccountChanges');
    expect(deny.Effect).toBe('Deny');
    for (const a of ['iam:Create*', 'iam:Put*', 'iam:Attach*', 'iam:Update*', 'iam:Delete*', 'organizations:*', 'sso:*']) {
      expect(actions(deny)).toContain(a);
    }
  });

  it('protects the foundation and bootstrap stacks from routine roles', () => {
    const deny = byId('NoSecurityFoundationChanges');
    expect(deny.Effect).toBe('Deny');
    expect(json(deny.Resource)).toContain('stack/ctm-foundation/*');
    expect(json(deny.Resource)).toContain('stack/CDKToolkit-ctmprod/*');
    expect(json(deny.Resource)).toContain('stack/CDKToolkit-ctmtest/*');
  });

  it('denies CloudFormation resource import (adoption of existing resources)', () => {
    const deny = byId('NoResourceImport');
    expect(deny.Effect).toBe('Deny');
    expect(deny.Condition?.Null?.['cloudformation:ImportResourceTypes']).toBe('false');
  });

  it('accepts only one exact user or role as the trusted principal', () => {
    const p = foundation.Parameters.TrustedPrincipalArn;
    expect(p.Type).toBe('String');
    const re = new RegExp(p.AllowedPattern);
    expect(re.test('arn:aws:iam::196691452297:user/henry.arroyo')).toBe(true);
    expect(re.test('arn:aws:iam::196691452297:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_Admin_abc')).toBe(true);
    for (const bad of ['arn:aws:iam::196691452297:root', '*', 'arn:aws:iam::196691452297:user/*x', 'arn:aws:sts::196691452297:assumed-role/x/y']) {
      expect(re.test(bad), bad).toBe(false);
    }
  });

  it('confines regional services to the deployment region', () => {
    expect(byId('StayInRegion').Condition?.StringNotEquals?.['aws:RequestedRegion']).toEqual({ Ref: 'DeploymentRegion' });
  });

  it('gives no project role access to unapproved services', () => {
    const allowed = boundary.filter((s) => s.Effect === 'Allow').flatMap((s) => actions(s));
    const services = new Set(allowed.map((a) => a.split(':')[0]));
    expect([...services].sort()).toEqual(['acm', 'cloudformation', 'cloudfront', 's3', 'ssm', 'sts', 'iam'].sort());
    expect(allowed.filter((a) => a.startsWith('iam:'))).toEqual(['iam:PassRole']);
    expect(json(boundary)).not.toMatch(/lambda:|dynamodb:|apigateway:|ec2:|rds:|ecs:|eks:/);
  });

  it('keeps each operator inside its own environment', () => {
    for (const [id, env, other] of [['TestOperatorRole', 'test', 'prod'], ['ProdOperatorRole', 'prod', 'test']] as const) {
      const r = foundation.Resources[id].Properties;
      expect(r.RoleName).toBe(`ctm-${env}-operator`);
      const text = json(r.Policies);
      expect(text).not.toContain(`ctm${other}`);
      expect(text).not.toContain(`ctm-${other}-`);
      expect(text).not.toContain(`Ctm${other === 'prod' ? 'Prod' : 'Test'}-`);
      expect(r.AssumeRolePolicyDocument.Statement).toEqual([
        { Effect: 'Allow', Principal: { AWS: { Ref: 'TrustedPrincipalArn' } }, Action: 'sts:AssumeRole' },
      ]);
      expect(r.MaxSessionDuration).toBe(3600);
    }
  });
});
