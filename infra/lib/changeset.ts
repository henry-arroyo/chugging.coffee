/**
 * Helpers for deploying through CloudFormation change sets directly.
 *
 * The deploy role may only create change sets that name the environment's execution role
 * (cloudformation:RoleArn) and declare an allowlisted ResourceTypes list
 * (cloudformation:ResourceTypes). That condition key exists only when the caller sends the
 * ResourceTypes parameter, which the CDK CLI never does, so infra:* creates change sets itself.
 * CloudFormation then also refuses any template resource outside the declared list.
 */

/** CloudFormation's limit for an inline template body. */
export const TEMPLATE_BODY_LIMIT = 51_200;

export function resourceTypesOf(template: { Resources?: Record<string, { Type: string }> }): string[] {
  return [...new Set(Object.values(template.Resources ?? {}).map((r) => r.Type))].sort();
}

export function cdkRoleArn(account: string, region: string, qualifier: string, kind: 'deploy' | 'cfn-exec'): string {
  const role = kind === 'deploy' ? 'deploy-role' : 'cfn-exec-role';
  return `arn:aws:iam::${account}:role/cdk-${qualifier}-${role}-${account}-${region}`;
}

export interface ChangeSetRequest {
  stackName: string;
  changeSetName: string;
  type: 'CREATE' | 'UPDATE';
  templatePath: string;
  executionRoleArn: string;
  resourceTypes: string[];
  description: string;
}

export function createChangeSetArgs(r: ChangeSetRequest): string[] {
  if (r.resourceTypes.length === 0) throw new Error('A change set needs at least one resource type');
  return [
    'cloudformation', 'create-change-set',
    '--stack-name', r.stackName,
    '--change-set-name', r.changeSetName,
    '--change-set-type', r.type,
    '--template-body', `file://${r.templatePath}`,
    '--role-arn', r.executionRoleArn,
    '--resource-types', ...r.resourceTypes,
    '--description', r.description,
  ];
}

/** A change set name unique per run: letters, digits and hyphens, starting with a letter. */
export function changeSetName(prefix: 'preview' | 'deploy', now = new Date()): string {
  return `ctm-${prefix}-${now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
}

export interface ResourceChange {
  ResourceChange?: { Action?: string; LogicalResourceId?: string; ResourceType?: string; Replacement?: string };
}

export function summarizeChanges(changes: ResourceChange[]): string[] {
  return changes.map(({ ResourceChange: c = {} }) => {
    const replacement = c.Action === 'Modify' && c.Replacement && c.Replacement !== 'False' ? ` (replacement: ${c.Replacement})` : '';
    return `  ${(c.Action ?? '?').padEnd(7)} ${(c.ResourceType ?? '').padEnd(40)} ${c.LogicalResourceId ?? ''}${replacement}`;
  });
}

export function isNoChangeFailure(status: string, reason: string | undefined): boolean {
  return status === 'FAILED' && /didn't contain changes|No updates are to be performed/i.test(reason ?? '');
}
