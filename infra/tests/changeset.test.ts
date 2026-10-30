import { describe, expect, it } from 'vitest';
import { cdkRoleArn, changeSetName, createChangeSetArgs, isNoChangeFailure, resourceTypesOf, summarizeChanges } from '../lib/changeset';

describe('change-set helpers', () => {
  it('lists each resource type once, sorted', () => {
    expect(resourceTypesOf({ Resources: { A: { Type: 'AWS::S3::Bucket' }, B: { Type: 'AWS::CloudFront::Function' }, C: { Type: 'AWS::S3::Bucket' } } })).toEqual([
      'AWS::CloudFront::Function',
      'AWS::S3::Bucket',
    ]);
  });

  it('builds the role ARNs the bootstrap template creates', () => {
    expect(cdkRoleArn('196691452297', 'us-east-1', 'ctmtest', 'deploy')).toBe('arn:aws:iam::196691452297:role/cdk-ctmtest-deploy-role-196691452297-us-east-1');
    expect(cdkRoleArn('196691452297', 'us-east-1', 'ctmprod', 'cfn-exec')).toBe('arn:aws:iam::196691452297:role/cdk-ctmprod-cfn-exec-role-196691452297-us-east-1');
  });

  it('always sends the execution role and the resource types', () => {
    const args = createChangeSetArgs({
      stackName: 'CtmTest-Site',
      changeSetName: 'ctm-preview-1',
      type: 'CREATE',
      templatePath: '/tmp/t.json',
      executionRoleArn: 'arn:aws:iam::1:role/x',
      resourceTypes: ['AWS::S3::Bucket'],
      description: 'd',
    });
    expect(args).toEqual(expect.arrayContaining(['--role-arn', 'arn:aws:iam::1:role/x', '--resource-types', 'AWS::S3::Bucket', '--stack-name', 'CtmTest-Site']));
    expect(() => createChangeSetArgs({ stackName: 's', changeSetName: 'c', type: 'CREATE', templatePath: 't', executionRoleArn: 'r', resourceTypes: [], description: '' })).toThrow();
  });

  it('makes valid, distinct change set names', () => {
    expect(changeSetName('preview', new Date('2026-10-30T08:15:30.123Z'))).toBe('ctm-preview-20261030081530');
    expect(changeSetName('deploy')).toMatch(/^ctm-deploy-[0-9]{14}$/);
  });

  it('summarizes changes and flags replacements', () => {
    expect(summarizeChanges([{ ResourceChange: { Action: 'Modify', ResourceType: 'AWS::S3::Bucket', LogicalResourceId: 'B', Replacement: 'True' } }])[0]).toContain('(replacement: True)');
    expect(summarizeChanges([{ ResourceChange: { Action: 'Add', ResourceType: 'AWS::S3::Bucket', LogicalResourceId: 'B' } }])[0]).not.toContain('replacement');
  });

  it('recognizes an empty change set', () => {
    expect(isNoChangeFailure('FAILED', "The submitted information didn't contain changes.")).toBe(true);
    expect(isNoChangeFailure('FAILED', 'AccessDenied')).toBe(false);
  });
});
