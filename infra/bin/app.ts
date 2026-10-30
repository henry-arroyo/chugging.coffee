#!/usr/bin/env node
// CDK entry point. The environment must be chosen explicitly: cdk ... -c env=test|prod
import * as cdk from 'aws-cdk-lib';
import { buildApp } from '../lib/app';
import { isEnvironmentName, loadConfig } from '../lib/config';

const app = new cdk.App({ analyticsReporting: false });
const env = app.node.tryGetContext('env');
if (!isEnvironmentName(env)) {
  console.error('Refusing to synthesize: pass -c env=test or -c env=prod (use npm run infra:synth -- --env <env>).');
  process.exit(1);
}
buildApp(app, loadConfig(env)).synth();
