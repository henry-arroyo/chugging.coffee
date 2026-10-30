import { describe, expect, it } from 'vitest';
import { renderPolicies } from '../lib/render-template';
import { loadYamlTemplate } from './helpers';

const ACCOUNT = '196691452297';
const base = { 'AWS::AccountId': ACCOUNT, 'AWS::Region': 'us-east-1' };
const foundation = () =>
  renderPolicies(loadYamlTemplate('foundation-template.yaml'), { ...base, TrustedPrincipalArn: `arn:aws:iam::${ACCOUNT}:user/henry.arroyo` });
const bootstrap = (env: 'test' | 'prod', domain = '') =>
  renderPolicies(loadYamlTemplate('bootstrap-template.yaml'), {
    ...base,
    Qualifier: `ctm${env}`,
    Environment: env,
    StackPrefix: env === 'prod' ? 'CtmProd' : 'CtmTest',
    CertificateDomainName: domain,
  });

describe('rendered policies (input to IAM Access Analyzer)', () => {
  it.each([
    ['foundation', foundation],
    ['test bootstrap', () => bootstrap('test')],
    ['prod bootstrap', () => bootstrap('prod')],
    ['prod bootstrap with certificate', () => bootstrap('prod', 'chugging.coffee')],
  ])('%s resolves to plain JSON', (_label, render) => {
    const policies = render();
    expect(policies.length).toBeGreaterThan(3);
    const text = JSON.stringify(policies.map((p) => p.document));
    expect(text).not.toMatch(/Fn::|"Ref"|\$\{/);
    expect(text).toContain(ACCOUNT);
  });

  it('names the exact roles, buckets and principal', () => {
    const f = JSON.stringify(foundation());
    expect(f).toContain(`arn:aws:iam::${ACCOUNT}:user/henry.arroyo`);
    expect(f).toContain(`arn:aws:iam::${ACCOUNT}:role/cdk-ctmtest-deploy-role-${ACCOUNT}-us-east-1`);
    const t = bootstrap('test');
    const trust = t.find((p) => p.name === 'DeploymentActionRole/trust')!;
    expect(JSON.stringify(trust.document)).toContain(`arn:aws:iam::${ACCOUNT}:role/ctm-test-operator`);
    const deploy = JSON.stringify(t.find((p) => p.name.startsWith('DeploymentActionRole/inline'))!.document);
    expect(deploy).toContain(`stack/CtmTest-Site/*`);
    expect(deploy).toContain(`role/cdk-ctmtest-cfn-exec-role-${ACCOUNT}-us-east-1`);
    expect(deploy).not.toContain('ctmprod');
    const exec = JSON.stringify(t.find((p) => p.name.startsWith('ExecutionPolicy'))!.document);
    expect(exec).toContain(`arn:aws:s3:::ctm-test-site-${ACCOUNT}`);
  });

  it('includes ACM statements only for prod with an approved domain', () => {
    const acm = (ps: ReturnType<typeof bootstrap>) => JSON.stringify(ps.find((p) => p.name.startsWith('ExecutionPolicy'))!.document).includes('acm:');
    expect(acm(bootstrap('test'))).toBe(false);
    expect(acm(bootstrap('prod'))).toBe(false);
    expect(acm(bootstrap('prod', 'chugging.coffee'))).toBe(true);
    expect(JSON.stringify(bootstrap('prod', 'chugging.coffee'))).toContain('"acm:DomainNames":["chugging.coffee"]');
  });
});
