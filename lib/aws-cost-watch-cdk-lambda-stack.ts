import cdk = require('@aws-cdk/core');
import lambda = require('@aws-cdk/aws-lambda');
import events = require('@aws-cdk/aws-events');
import targets = require('@aws-cdk/aws-events-targets');
import {Role, ServicePrincipal, ManagedPolicy, PolicyStatement, Effect } from '@aws-cdk/aws-iam';

import {NODE_LAMBDA_LAYER_DIR} from './process/setup';

export class AwsCostWatchAtCdkLambdaStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // IAM Role for Lambda Execution
    const iamRoleForLambda = new Role(this, 'IAMRoleForLamda', {
      roleName: 'aws-cost-watch-lambda-role',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'), // SSMからSecureStringを読み込むため
      ],
    });
    // Allow access Cost Explorer
    iamRoleForLambda.addToPolicy(new PolicyStatement({
      actions: ['ce:GetCostAndUsage'],
      resources: ['*'],
      effect: Effect.ALLOW,
    }));
    // Allow access Account Aliases Name
    iamRoleForLambda.addToPolicy(new PolicyStatement({
      actions: ['iam:ListAccountAliases'],
      resources: ['*'],
      effect: Effect.ALLOW,
    }));

    const nodeModulesLayer = new lambda.LayerVersion(this, 'NodeModulesLayer', {
      code: lambda.AssetCode.fromAsset(NODE_LAMBDA_LAYER_DIR),
      compatibleRuntimes: [lambda.Runtime.NODEJS_10_X]
    });

    const lambdaFn = new lambda.Function(this, 'AwsCostReport', {
      code: lambda.Code.asset('lambda'),
      handler: 'lifeguard.handler',
      timeout: cdk.Duration.seconds(300),
      role: iamRoleForLambda,
      layers: [nodeModulesLayer],
      runtime: lambda.Runtime.NODEJS_10_X,
      environment: {
        TZ: 'Asia/Tokyo',
      },
    });

    const timerRule = new events.Rule(this, 'timerRule', {
      schedule: events.Schedule.expression(`cron(0 1 * * ? *)`), // 毎日朝10時(JST,+0900)
      //                                         │ │ │ │ │ └ Year
      //                                         │ │ │ │ └ Day-of-week (?=いずれかの曜日)
      //                                         │ │ │ └ Month
      //                                         │ │ └ Day-of-month
      //                                         │ └ Hours(UTC)
      //                                         └ Minutes
    });

    timerRule.addTarget(new targets.LambdaFunction(lambdaFn, {
      event: events.RuleTargetInput.fromObject({/* event parameters */})
    }));
  }
}
