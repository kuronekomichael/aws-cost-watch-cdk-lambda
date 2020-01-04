const https = require('https');
const url = require('url');
const AWS = require('aws-sdk');
const {Convert} = require("easy-currencies");

const getCurrencyJp = async (value: number, unit: string) => {
    const jpy = await Convert(value)
        .from(unit)
        .to('JPY');
       
    const formatter = new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY'
    });

    return formatter.format(jpy);   
}

const sayToSlack = async (slackWebHookUrl: string, pretext: string, fields: any[]) => {

    const parsedUrl = url.parse(slackWebHookUrl);

    const param = {
        hostname: parsedUrl.host,
        port: parsedUrl.protocol === 'https:' ? 443 : 80,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {'Content-Type': 'application/json'}
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

const getSecureParamFromSSM = async (ssm: any, name: string) => {
    const ssmSecureParam = await ssm.getParameter({
        Name: name,
        WithDecryption: true,
    }).promise();
    return ssmSecureParam.Parameter.Value;
};

const getUnblendedCost = async () => {

    const costExplorer = new AWS.CostExplorer({region: 'us-east-1'});

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

    const start = cost.ResultsByTime[0].TimePeriod.Start;
    const end = cost.ResultsByTime[0].TimePeriod.End;
    const costs = cost.ResultsByTime[0].Groups.filter((group: any) => group.Metrics.UnblendedCost.Amount > 0);

    const total = costs.reduce((total: number, group: any) => total + parseFloat(group.Metrics.UnblendedCost.Amount), 0)
    const totalJpy = await getCurrencyJp(total, costs[0].Metrics.UnblendedCost.Unit);

    const jpyList = await Promise.all(costs.map((group: any) => getCurrencyJp(parseFloat(group.Metrics.UnblendedCost.Amount), group.Metrics.UnblendedCost.Unit)));
    const fields = jpyList.map((jpy: any, index: number) => {
        return {
            title: `${costs[index].Keys.join(', ')}`,
            value: `${jpy} ($${costs[index].Metrics.UnblendedCost.Amount})`,
        };
    });
       
    return {
        start,
        end,
        total,
        totalJpy,
        fields
    };
};

exports.handler = async () => {

    const ssm = new AWS.SSM();
    const slackWebHookUrl = await getSecureParamFromSSM(ssm, '/CreatedByCDK/AwsCostWatch/SlackWebHookUrl');

    const iam = new AWS.IAM();
    const aliases = await iam.listAccountAliases({}).promise();
    const accountName = aliases.AccountAliases.join(', ');

    const {start, end, total, totalJpy, fields} = await getUnblendedCost();

    const text = `${accountName} @${start}〜${end}\n💰 ${totalJpy} ($${total})`;

    await sayToSlack(slackWebHookUrl, text, fields);
};