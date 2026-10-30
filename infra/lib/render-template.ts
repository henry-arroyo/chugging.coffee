/**
 * Resolves the intrinsic functions used by the foundation and bootstrap templates, so their IAM
 * policies can be checked by IAM Access Analyzer (validate-policy) before anything is applied.
 * Supports only what those templates use: Ref, Fn::Sub, Fn::GetAtt (Arn), Fn::If, Fn::Join,
 * Fn::Equals/And/Not in Conditions, and AWS::NoValue. Anything else throws.
 */

export type Params = Record<string, string>;

export interface RenderedPolicy {
  /** Human-readable location, e.g. "DeploymentActionRole/inline/deploy-environment-stacks". */
  name: string;
  policyType: 'IDENTITY_POLICY' | 'RESOURCE_POLICY';
  /** For resource policies: what the policy is attached to (Access Analyzer validatePolicyResourceType). */
  resourceType?: 'AWS::IAM::AssumeRolePolicyDocument' | 'AWS::S3::Bucket';
  document: unknown;
}

const NO_VALUE = Symbol('NoValue');

export function renderPolicies(template: any, params: Params): RenderedPolicy[] {
  const resources: Record<string, any> = template.Resources ?? {};
  const values: Params = { ...defaultsOf(template), ...params, 'AWS::Partition': 'aws' };
  const conditions: Record<string, boolean> = {};

  const refs: Record<string, string> = {};
  const arns: Record<string, string> = {};

  function resolve(node: any): any {
    if (Array.isArray(node)) return node.map(resolve).filter((v) => v !== NO_VALUE);
    if (node === null || typeof node !== 'object') return node;
    const keys = Object.keys(node);
    if (keys.length === 1) {
      const [k] = keys as [string];
      const v = node[k];
      switch (k) {
        case 'Ref':
          if (v === 'AWS::NoValue') return NO_VALUE;
          if (v in values) return values[v];
          if (v in refs) return refs[v];
          throw new Error(`Unresolved Ref ${v}`);
        case 'Fn::GetAtt': {
          const [res, attr] = Array.isArray(v) ? v : String(v).split('.');
          if (attr !== 'Arn' || !(res in arns)) throw new Error(`Unresolved GetAtt ${res}.${attr}`);
          return arns[res];
        }
        case 'Fn::Sub': {
          const [text, vars] = Array.isArray(v) ? [v[0], resolve(v[1])] : [v, {}];
          return String(text).replace(/\$\{([^}]+)\}/g, (_m, name: string) => {
            if (name in vars) return vars[name];
            if (name.endsWith('.Arn') && name.slice(0, -4) in arns) return arns[name.slice(0, -4)]!;
            if (name in values) return values[name]!;
            if (name in refs) return refs[name]!;
            throw new Error(`Unresolved \${${name}}`);
          });
        }
        case 'Fn::Join':
          return (resolve(v[1]) as string[]).join(v[0]);
        case 'Fn::If':
          if (!(v[0] in conditions)) throw new Error(`Unknown condition ${v[0]}`);
          return resolve(conditions[v[0]] ? v[1] : v[2]);
        case 'Fn::Equals':
          return resolve(v[0]) === resolve(v[1]);
        case 'Fn::And':
          return (v as any[]).every((c) => evalCondition(c));
        case 'Fn::Not':
          return !evalCondition(v[0]);
        case 'Fn::Or':
          return (v as any[]).some((c) => evalCondition(c));
        default:
          if (k.startsWith('Fn::')) throw new Error(`Unsupported intrinsic ${k}`);
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const r = resolve(v);
      if (r !== NO_VALUE) out[k] = r;
    }
    return out;
  }

  function evalCondition(c: any): boolean {
    if (c && typeof c === 'object' && 'Condition' in c) return conditions[c.Condition] ?? false;
    return Boolean(resolve(c));
  }

  for (const [name, c] of Object.entries<any>(template.Conditions ?? {})) conditions[name] = evalCondition(c);

  // Names first (they only depend on parameters), so ARNs are known before any policy is resolved.
  for (const [id, res] of Object.entries<any>(resources)) {
    const p = res.Properties ?? {};
    if (res.Type === 'AWS::IAM::Role') {
      const name = resolve(p.RoleName);
      refs[id] = name;
      arns[id] = `arn:aws:iam::${values['AWS::AccountId']}:role/${name}`;
    } else if (res.Type === 'AWS::IAM::ManagedPolicy') {
      refs[id] = `arn:aws:iam::${values['AWS::AccountId']}:policy/${resolve(p.ManagedPolicyName)}`;
    } else if (res.Type === 'AWS::S3::Bucket') {
      const name = resolve(p.BucketName);
      refs[id] = name;
      arns[id] = `arn:aws:s3:::${name}`;
    }
  }

  const policies: RenderedPolicy[] = [];
  for (const [id, res] of Object.entries<any>(resources)) {
    const p = res.Properties ?? {};
    if (res.Type === 'AWS::IAM::ManagedPolicy') {
      policies.push({ name: `${id} (${resolve(p.ManagedPolicyName)})`, policyType: 'IDENTITY_POLICY', document: resolve(p.PolicyDocument) });
    } else if (res.Type === 'AWS::IAM::Role') {
      policies.push({
        name: `${id}/trust`,
        policyType: 'RESOURCE_POLICY',
        resourceType: 'AWS::IAM::AssumeRolePolicyDocument',
        document: resolve(p.AssumeRolePolicyDocument),
      });
      for (const inline of p.Policies ?? []) {
        policies.push({ name: `${id}/inline/${inline.PolicyName}`, policyType: 'IDENTITY_POLICY', document: resolve(inline.PolicyDocument) });
      }
    } else if (res.Type === 'AWS::S3::BucketPolicy') {
      policies.push({ name: `${id}`, policyType: 'RESOURCE_POLICY', resourceType: 'AWS::S3::Bucket', document: resolve(p.PolicyDocument) });
    }
  }
  return policies;
}

function defaultsOf(template: any): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries<any>(template.Parameters ?? {})) if (v.Default !== undefined) out[k] = String(v.Default);
  return out;
}
