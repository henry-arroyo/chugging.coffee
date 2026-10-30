import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { EnvironmentConfig, EnvironmentName } from '../lib/config';

export const ACCOUNT = '111111111111';

export function confirmedConfig(env: EnvironmentName, overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
  return {
    environment: env,
    confirmed: true,
    account: ACCOUNT,
    region: 'us-east-1',
    profile: `time-machine-${env}`,
    operatorRoleName: `ctm-${env}-operator`,
    qualifier: `ctm${env}`,
    domainName: null,
    certificateArn: null,
    expiresOn: env === 'test' ? '2026-12-31' : null,
    ...overrides,
  };
}

/** Loads a CloudFormation YAML template. The templates use only long-form intrinsics. */
export function loadYamlTemplate(name: string): any {
  return parse(readFileSync(join(import.meta.dirname, '../bootstrap', name), 'utf8'));
}

export interface Statement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Action?: string | string[];
  NotAction?: string | string[];
  Resource?: unknown;
  Condition?: Record<string, Record<string, unknown>>;
  Principal?: unknown;
}

export const asList = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Collects every IAM policy statement in a template, unwrapping Fn::If branches. */
export function policyStatements(template: any): { resource: string; statement: Statement }[] {
  const out: { resource: string; statement: Statement }[] = [];
  const add = (resource: string, doc: any) => {
    for (const st of asList(doc?.Statement)) {
      const s: any = st;
      if (s?.['Fn::If']) {
        const branch = s['Fn::If'][1];
        if (branch && !branch.Ref) out.push({ resource, statement: branch });
      } else out.push({ resource, statement: s });
    }
  };
  for (const [id, res] of Object.entries<any>(template.Resources)) {
    if (res.Type === 'AWS::IAM::ManagedPolicy' || res.Type === 'AWS::S3::BucketPolicy') add(id, res.Properties.PolicyDocument);
    if (res.Type === 'AWS::IAM::Role') for (const p of res.Properties.Policies ?? []) add(id, p.PolicyDocument);
  }
  return out;
}
