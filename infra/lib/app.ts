import * as cdk from 'aws-cdk-lib';
import { CertificateStack } from './certificate-stack';
import { PROJECT_TAG, stackNames, type EnvironmentConfig } from './config';
import { SiteStack } from './site-stack';

/**
 * Builds the CDK app for exactly one environment. Production and test never share a synth,
 * a bootstrap qualifier, roles, buckets or distributions.
 */
export function buildApp(app: cdk.App, config: EnvironmentConfig): cdk.App {
  const names = stackNames(config.environment);

  // Each environment deploys through its own bootstrap (infra/bootstrap/bootstrap-template.yaml).
  const synthesizer = () =>
    new cdk.DefaultStackSynthesizer({
      qualifier: config.qualifier,
      generateBootstrapVersionRule: true,
    });

  // Unconfirmed config synthesizes account-agnostic templates for review; deploys refuse it.
  const env = config.confirmed ? { account: config.account, region: config.region } : { region: config.region };

  const site = new SiteStack(app, names.site, {
    env,
    synthesizer: synthesizer(),
    environment: config.environment,
    // The alias is attached only once the certificate exists and its ARN is in config.
    domainName: config.certificateArn ? config.domainName : null,
    certificateArn: config.certificateArn,
    description: `chugging.coffee Time Machine static site (${config.environment})`,
    terminationProtection: config.environment === 'prod',
  });
  applyTags(site, config);

  if (names.certificate && config.domainName) {
    const cert = new CertificateStack(app, names.certificate, {
      env,
      synthesizer: synthesizer(),
      domainName: config.domainName,
      description: 'chugging.coffee Time Machine certificate (independent lifecycle)',
      terminationProtection: true,
    });
    applyTags(cert, config);
  }
  return app;
}

/**
 * CloudFront functions are left untagged: the execution role controls them by name
 * (`function/ctm-<env>-*`) and may not tag them, so tagging would need a permission expansion
 * for no security gain (D45). Origin access controls and headers policies cannot be tagged at all.
 */
export const UNTAGGED_RESOURCE_TYPES = ['AWS::CloudFront::Function'];

function applyTags(stack: cdk.Stack, config: EnvironmentConfig) {
  const options = { excludeResourceTypes: UNTAGGED_RESOURCE_TYPES };
  cdk.Tags.of(stack).add('Project', PROJECT_TAG, options);
  cdk.Tags.of(stack).add('Environment', config.environment, options);
  cdk.Tags.of(stack).add('ManagedBy', 'aws-cdk', options);
  if (config.expiresOn) cdk.Tags.of(stack).add('ExpiresOn', config.expiresOn, options);
}
