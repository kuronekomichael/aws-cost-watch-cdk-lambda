import * as https from 'https';
import * as  url from 'url';
import { CostExplorer, SSM, IAM } from 'aws-sdk';
import { Convert } from 'easy-currencies';

const SSM_PATH_SLACK_WEBHOOK_URL = '/CreatedByCDK/AwsCostWatch/SlackWebHookUrl';
const SSM_PATH_TARGETS = '/CreatedByCDK/AwsCostWatch/Targets';

/**
 * Attaches callbacks for the resolution and/or rejection of the Promise.
 * @param value The callback to execute when the Promise is resolved.
 * @param unit The callback to execute when the Promise is rejected.
 * @returns A Promise for the completion of which ever callback is executed.
 */
const getCurrencyJp = async (value: number, unit: string): Promise<string> => {
    const jpy = await Convert(value)
        .from(unit)
        .to('JPY');
    const formatter = new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY'
    });
    return formatter.format(jpy);
}

const sayToSlack = async (slackWebhookUrl: string, pretext: string, fields: any[]) => {

    const parsedUrl = url.parse(slackWebhookUrl);

    const param = {
        hostname: parsedUrl.host,
        port: parsedUrl.protocol === 'https:' ? 443 : 80,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };
    const postData = {
        color: '#fd8c1e',
        pretext,
        fields,
    };
    return new Promise((resolve, reject) => {
        const req = https.request(param, (resp: any) => {
            let data = '';
            resp.on('data', (chunk: any) => { data += chunk; });
            resp.on('end', () => resolve(data));
        }).on('error', (err: any) => reject(err));
        req.write(JSON.stringify(postData));
        req.end();
    });
};

const getSlackWebHookFromSSM = async (ssm: any) => {
    const ssmSecureParam = await ssm.getParameter({
        Name: SSM_PATH_SLACK_WEBHOOK_URL,
        WithDecryption: true,
    }).promise();
    const slackWebhookUrl = ssmSecureParam.Parameter?.Value;
    if (!slackWebhookUrl) throw new Error(`Cannot found slack Webhook URL "${SSM_PATH_SLACK_WEBHOOK_URL}" in SSM`);
    return slackWebhookUrl;
};

const getAccountsFromSSM = async (ssm: SSM, accountMap: {[targetName: string]: {[key: string]: string}} = {}, nextToken?: string): Promise<{[targetName: string]: {[key: string]: string}}> => {
    const ssmSecureParam = await ssm.getParametersByPath({
        Path: SSM_PATH_TARGETS,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
    }).promise();

    const results = ssmSecureParam.Parameters!.reduce((accounts: any, parameter: any) => {
        const tokens = parameter.Name.split('/');
        const key = tokens.pop();
        const name = tokens.pop();
        if (!accounts[name]) accounts[name] = {};

        accounts[name][key] = parameter.Value;

        return accounts;
    }, accountMap);

    return ssmSecureParam.NextToken ? await getAccountsFromSSM(ssm, results, ssmSecureParam.NextToken) : results;
};

const getUnblendedCost = async (accessKeyId: string, secretAccessKey: string) => {
    const costExplorer = new CostExplorer({ accessKeyId, secretAccessKey, region: 'us-east-1' });

    const dt = new Date();
    const yearMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;

    const param = {
        TimePeriod: {
            Start: `${yearMonth}-01`,
            End: `${yearMonth}-${String(dt.getDate()).padStart(2, '0')}`,
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{
            Type: 'DIMENSION',
            Key: 'SERVICE',
        }],
    };

    const cost = await costExplorer.getCostAndUsage(param).promise();
    const costs = cost.ResultsByTime![0].Groups!.filter((group: any) => group.Metrics.UnblendedCost.Amount > 0);

    const total = costs.reduce((total, group: any) => total + parseFloat(group.Metrics.UnblendedCost.Amount), 0)
    const totalJpy: string = await getCurrencyJp(total, costs[0].Metrics!.UnblendedCost.Unit!);

    const jpyList = await Promise.all(costs.map((group: any) => getCurrencyJp(parseFloat(group.Metrics.UnblendedCost.Amount), group.Metrics.UnblendedCost.Unit)));
    const fields = jpyList.map((jpy, index: number) => {
        return {
            title: `${costs[index].Keys!.join(', ')}`,
            value: `${jpy} ($${costs[index].Metrics!.UnblendedCost.Amount})`,
        };
    });

    return {
        start: cost.ResultsByTime![0].TimePeriod!.Start,
        end: cost.ResultsByTime![0].TimePeriod!.End,
        total,
        totalJpy,
        fields
    };
};

const getAliasName = async (accessKeyId: string, secretAccessKey: string) => {
    const iam = new IAM({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
    });
    const aliases = await iam.listAccountAliases({}).promise();
    const aliaseName = aliases.AccountAliases.join(', ');

    return aliaseName ? aliaseName : undefined;
};

exports.handler = async () => {
    const ssm = new SSM();
    const slackWebhookUrl = await getSlackWebHookFromSSM(ssm);
    const accountMap: {[key:string]: {[key:string]: string}} = await getAccountsFromSSM(ssm);

    const promises = Object.keys(accountMap).map(async (targetName) => {
        const account = accountMap[targetName];
        const label = await getAliasName(account.AccessKeyId, account.SecretAccessKey);
        const { start, end, total, totalJpy, fields } = await getUnblendedCost(account.AccessKeyId, account.SecretAccessKey);
        return {
            text: `${label ?? targetName} @${start}〜${end}\n💰 ${totalJpy} ($${total})`,
            fields,
        }
    })

    const results = await Promise.all(promises);
    for (const {text, fields} of results) {
        await sayToSlack(slackWebhookUrl, text, fields);
    }
};