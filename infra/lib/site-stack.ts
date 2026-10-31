import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { siteBucketName, type EnvironmentName } from './config';
import { CONTENT_SECURITY_POLICY, CUSTOM_HEADERS } from './headers';

export interface SiteStackProps extends cdk.StackProps {
  environment: EnvironmentName;
  domainName: string | null;
  certificateArn: string | null;
}

export { CONTENT_SECURITY_POLICY } from './headers';

/**
 * Private S3 bucket behind CloudFront with origin access control. Contains no IAM roles,
 * Lambda functions or custom resources; site files are uploaded separately by the publish step.
 */
export class SiteStack extends cdk.Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);
    const env = props.environment;

    this.bucket = new s3.Bucket(this, 'SiteBucket', {
      // this.account is the configured account, or the AWS::AccountId token for unconfirmed review synths.
      bucketName: siteBucketName(env, this.account),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        { id: 'ExpireOldVersions', noncurrentVersionExpiration: cdk.Duration.days(env === 'prod' ? 90 : 7) },
        { id: 'AbortIncompleteUploads', abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) },
      ],
      // CloudFormation can only delete an empty bucket. infra:destroy empties it first, after
      // checking it is this stack's bucket. No auto-delete custom resource (it adds a Lambda).
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: false,
    });

    const router = new cloudfront.Function(this, 'Router', {
      functionName: `ctm-${env}-router`,
      comment: 'Serve /time-machine/ with a narrow shell fallback',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(readFileSync(join(import.meta.dirname, 'router-function.js'), 'utf8')),
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `ctm-${env}-security-headers`,
      comment: 'Security headers for the Time Machine',
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        // No includeSubDomains or preload: other chugging.coffee subdomains are not ours to commit.
        strictTransportSecurity: { accessControlMaxAge: cdk.Duration.days(365), includeSubdomains: false, preload: false, override: true },
      },
      customHeadersBehavior: {
        customHeaders: Object.entries(CUSTOM_HEADERS).map(([header, value]) => ({ header, value, override: true })),
      },
    });

    const certificate = props.certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn)
      : undefined;

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `chugging.coffee Time Machine (${env})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessControl: new cloudfront.S3OriginAccessControl(this, 'OriginAccessControl', {
            originAccessControlName: `ctm-${env}-site-oac`,
            signing: cloudfront.Signing.SIGV4_ALWAYS,
          }),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: router, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      errorResponses: [
        // S3 answers 403 for missing keys because the origin may not list the bucket.
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/time-machine/404.html', ttl: cdk.Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/time-machine/404.html', ttl: cdk.Duration.minutes(1) },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      enableLogging: false,
      ...(props.domainName && certificate
        ? { domainNames: [props.domainName], certificate, minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021 }
        : {}),
    });

    new cdk.CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: this.distribution.distributionDomainName });
  }
}
