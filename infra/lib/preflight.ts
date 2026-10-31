import { stackNames, type EnvironmentConfig, type EnvironmentName } from './config';

export const COMMANDS = ['check', 'synth', 'diff', 'deploy', 'status', 'destroy', 'publish'] as const;
export type Command = (typeof COMMANDS)[number];

/** Commands that talk to AWS and therefore need confirmed config and a verified identity. */
export const AWS_COMMANDS: readonly Command[] = ['diff', 'deploy', 'status', 'destroy', 'publish'];

export interface ParsedArgs {
  command: Command;
  env: EnvironmentName | null;
  stack: 'site' | 'certificate';
  /** publish only: plan locally and stop before any AWS call. */
  dryRun: boolean;
  /** publish to test only: allow a release that is not frozen yet. */
  allowUnfrozen: boolean;
  /** publish only: repoint current.json at an already published release (rollback). */
  promoteRelease: string | null;
}

/**
 * Parses `infra <command> --env test|prod [--stack site|certificate]`. Stack selection is by role,
 * never by name or pattern, so wildcards and --all cannot be expressed.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (!(COMMANDS as readonly string[]).includes(command ?? '')) {
    throw new Error(`Unknown command "${command ?? ''}". Use one of: ${COMMANDS.join(', ')}`);
  }
  let env: EnvironmentName | null = null;
  let stack: 'site' | 'certificate' = 'site';
  let dryRun = false;
  let allowUnfrozen = false;
  let promoteRelease: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const value = rest[i + 1];
    if (arg === '--env') {
      if (value !== 'test' && value !== 'prod') throw new Error('--env must be "test" or "prod"');
      env = value;
      i++;
    } else if (arg === '--stack') {
      if (value !== 'site' && value !== 'certificate') throw new Error('--stack must be "site" or "certificate"');
      stack = value;
      i++;
    } else if (command === 'publish' && arg === '--dry-run') {
      dryRun = true;
    } else if (command === 'publish' && arg === '--allow-unfrozen') {
      allowUnfrozen = true;
    } else if (command === 'publish' && arg === '--promote-release') {
      if (!/^rel-\d{4}$/.test(value ?? '')) throw new Error('--promote-release needs a release id such as rel-0001');
      promoteRelease = value!;
      i++;
    } else {
      throw new Error(`Unexpected argument "${arg}". Stacks are chosen with --stack site|certificate, never by name.`);
    }
  }
  if (command !== 'check' && env === null) throw new Error(`"${command}" needs an explicit --env test|prod`);
  if (command === 'check' && env !== null) throw new Error('"check" always covers both environments; drop --env');
  if (stack === 'certificate' && env !== 'prod') throw new Error('Only prod has a certificate stack');
  if (stack === 'certificate' && command === 'destroy') {
    throw new Error('The certificate stack has its own lifecycle and is never destroyed by infra:destroy (see docs/runbooks.md)');
  }
  if (command === 'publish' && stack !== 'site') throw new Error('publish always targets the site stack');
  if (allowUnfrozen && env !== 'test') throw new Error('--allow-unfrozen is for the test environment only; production publishes frozen releases');
  if (promoteRelease && (dryRun || allowUnfrozen)) throw new Error('--promote-release cannot be combined with other publish options');
  return { command: command as Command, env, stack, dryRun, allowUnfrozen, promoteRelease };
}

export function targetStack(env: EnvironmentName, stack: 'site' | 'certificate'): string {
  const names = stackNames(env);
  const name = stack === 'site' ? names.site : names.certificate;
  if (!name) throw new Error(`No ${stack} stack in ${env}`);
  return name;
}

export interface CallerIdentity {
  Account: string;
  Arn: string;
}

/**
 * Everything that must be true before a command may touch AWS. Returns problems; empty means go.
 * The identity comes from `aws sts get-caller-identity` using the environment's profile.
 */
export function preflightProblems(config: EnvironmentConfig, identity: CallerIdentity | null, region: string | undefined): string[] {
  const problems: string[] = [];
  if (!config.confirmed) problems.push(`infra/config/${config.environment}.json is not confirmed by the owner`);
  if (!/^[0-9]{12}$/.test(config.account)) problems.push('configured account is not a 12-digit ID');
  if (region !== config.region) problems.push(`region must be ${config.region} (got ${region ?? 'unset'})`);
  if (!identity) {
    problems.push(`could not resolve credentials for profile ${config.profile}`);
    return problems;
  }
  if (identity.Account !== config.account) {
    problems.push(`credentials are for account ${identity.Account}, config expects ${config.account}`);
  }
  const expected = new RegExp(`^arn:aws:sts::${config.account}:assumed-role/${config.operatorRoleName}/[A-Za-z0-9+=,.@_-]+$`);
  if (!expected.test(identity.Arn)) {
    problems.push(`credentials are ${identity.Arn}, expected an assumed-role session of ${config.operatorRoleName}`);
  }
  return problems;
}
