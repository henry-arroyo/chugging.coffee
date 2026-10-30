import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import type { Construct } from 'constructs';

export interface CertificateStackProps extends cdk.StackProps {
  domainName: string;
}

/**
 * ACM certificate with its own lifecycle, so the site stack can be destroyed and rebuilt without
 * re-validating. DNS for chugging.coffee is in Cloudflare: the validation CNAME is added by hand,
 * and the site stack receives the certificate ARN through config rather than a stack export.
 */
export class CertificateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(),
    });
    certificate.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    new cdk.CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
  }
}
