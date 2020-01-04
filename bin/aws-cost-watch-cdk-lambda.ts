#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { AwsCostWatchAtCdkLambdaStack } from '../lib/aws-cost-watch-cdk-lambda-stack';
import { bundleNpm } from '../lib/process/setup';
 
// pre-process
bundleNpm();

const app = new cdk.App();
new AwsCostWatchAtCdkLambdaStack(app, 'AwsCostWatchAtCdkLambdaStack');
