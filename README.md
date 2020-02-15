# AWS Cost Watcher built by AWS CDK

Output monthly AWS cost to Slack channel every day.

These are processed based on AWS Lambda and CloudWatch Events, and managed using AWS CDK. The Slack Incoming WebHook URL must be registered with AWS Systems Manager.

![img](https://i.imgur.com/jHyAcGG.png)

## Prerequipment

#### 1. AWS CLI

https://aws.amazon.com/cli/

```sh
aws configure --profile ${YOUR_AWS_PROFILE_NAME}
```

#### 2. Slack Incoming WebHook URL

https://slack.com/help/articles/115005265063

ex) `https://hooks.slack.com/services/KLG439D/KGS341928/Lkfgja2LKGDS2k3j4`

#### 3. Allow using Cost Explorer

Operation with AWS root account is required on AWS Console.
https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/ce-access.html

## Setup

#### 1. Install required packages to deploy using CDK

```sh
npm install
```

#### 2. Prepare environment for using CDK (one time only for each aws account)

```sh
cdk bootstrap --profile ${YOUR_AWS_PROFILE_NAME}
```

#### 3. Register IAM that can access the target AWS account

Register to AWS Systems Manager(SSM)

IAM Policy for cost watcher 
```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "ce:getCostAndUsage",
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": "iam:ListAccountAliases",
            "Resource": "*"
        }
    ]
}
```

```sh
aws ssm put-parameter \
    --profile ${YOUR_AWS_PROFILE_NAME} \
    --type SecureString \
    --name "/CreatedByCDK/AwsCostWatch/Targets/<aws-account-name>/AccessKeyId" \
    --value "<your-access-key-id>"

aws ssm put-parameter \
    --profile ${YOUR_AWS_PROFILE_NAME} \
    --type SecureString \
    --name "/CreatedByCDK/AwsCostWatch/Targets/<aws-account-name>/SecretAccessKey" \
    --value "<your-secret-access-key>"
```

It is possible to register multiple accounts with different account names

```sh
aws ssm put-parameter \
    --profile ${YOUR_AWS_PROFILE_NAME} \
    --type SecureString \
    --name "/CreatedByCDK/AwsCostWatch/Targets/Account2/AccessKeyId" \
    --value "JIO9924lkJSURLKJkfasjdfsaf"

aws ssm put-parameter \
    --profile ${YOUR_AWS_PROFILE_NAME} \
    --type SecureString \
    --name "/CreatedByCDK/AwsCostWatch/Targets/Account2/SecretAccessKey" \
    --value "KSLJ434TLKWTJSE45325U0SGKIJLRKJ643TLKEAJIGLSG"
```


#### 4. Register Slack WebHook URL

Register to AWS Systems Manager(SSM)

```sh
aws ssm put-parameter \
    --profile ${YOUR_AWS_PROFILE_NAME} \
    --cli-input-json '{"Name": "/CreatedByCDK/AwsCostWatch/SlackWebHookUrl", "Type": "SecureString",  "Value": "https://hooks.slack.com/services/KLG439D/KGS341928/Lkfgja2LKGDS2k3j4", "Description": "Incoming Webhook URL for slack.com"}'
```

## Deploy

```sh
npm run build && cdk deploy --profile ${YOUR_AWS_PROFILE_NAME}
```

## Usage

Automatically posted on the Slack channel at 10:00 AM JST.

![img](https://i.imgur.com/jHyAcGG.png)

## Destroy

If you don't use it, destroy everything.

```sh
cdk destroy --profile ${YOUR_AWS_PROFILE_NAME}
```

## References

- [Class: AWS.CostExplorer — AWS SDK for JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CostExplorer.html)
- [AWSサービス毎の請求額を毎日Slackに通知してみた ｜ Developers.IO](https://dev.classmethod.jp/cloud/aws/notify-slack-aws-billing/)
- [Legacy tokens | Slack](https://api.slack.com/custom-integrations/legacy-tokens)
