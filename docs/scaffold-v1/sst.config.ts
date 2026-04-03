/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Airflux Agent SST Configuration
 *
 * Montgomery sst.config.ts 패턴 기반:
 * - Stage-aware configuration (prod vs dev)
 * - VPC deployment (DB/내부서비스 접근)
 * - CloudWatch alarms + SNS alerts
 * - Auto-wired Lambda references
 * - copyFiles for settings
 */

export default $config({
  app(input) {
    return {
      name: "airflux-agent",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const { cloudwatch, sns } = await import("@pulumi/aws");

    // ── Stage-aware Configuration (Montgomery 패턴) ──
    const isProduction = $app.stage === "production";

    const getSecretId = (name: string) =>
      isProduction ? `airflux/prod/${name}` : `airflux/dev/${name}`;

    // ── SNS for Alerts (Montgomery 패턴) ──
    const alertTopic = new sns.Topic("AgentAlerts", {
      name: `airflux-${$app.stage}-alerts`,
    });

    // ── Shared Lambda Config ──
    const sharedConfig = {
      copyFiles: [{ from: "settings", to: "settings" }],
      vpc: {
        privateSubnets: ["subnet-0352b1180a2699c78"],
        securityGroups: [
          "sg-06607c6eb036f9d31", // airbridge-api-lambda
        ],
      },
      environment: {
        STAGE: $app.stage,
        SLACK_BOT_TOKEN_SECRET_ID: getSecretId("slack-bot-token"),
        SLACK_SIGNING_SECRET_ID: getSecretId("slack-signing-secret"),
        LLM_API_KEY_SECRET_ID: getSecretId("anthropic-api-key"),
        SNOWFLAKE_SECRET_ID: getSecretId("snowflake"),
        DRUID_SECRET_ID: "prod/druid/api",
        DB_SECRET_ID: "prod/rds/maindb/api_read",
      },
    };

    // ── Worker Lambda (분석 실행, Montgomery: AsyncProcessor) ──
    const worker = new sst.aws.Function("Worker", {
      handler: "src/worker.handler",
      ...sharedConfig,
      timeout: "120 seconds",
      memory: "512 MB",
    });

    // ── Gateway Lambda (즉시 응답, Montgomery: SlashCommand + EventSubscription 통합) ──
    const gateway = new sst.aws.Function("Gateway", {
      handler: "src/gateway.handler",
      ...sharedConfig,
      url: {
        cors: {
          allowCredentials: false,
          allowHeaders: ["*"],
          allowMethods: ["POST"],
          allowOrigins: ["*"],
        },
      },
      timeout: "3 seconds",
      environment: {
        ...sharedConfig.environment,
        WORKER_FUNCTION_NAME: worker.name,
      },
    });

    // ── Warmup Cron (Round 29: Cold Start 방지) ──
    // 5분마다 Worker Lambda를 깨움
    if (isProduction) {
      new sst.aws.Cron("WorkerWarmup", {
        schedule: "rate(5 minutes)",
        function: {
          handler: "src/warmup.handler",
          environment: {
            WORKER_FUNCTION_NAME: worker.name,
          },
        },
      });
    }

    // ── CloudWatch Alarms (Montgomery 패턴) ──
    for (const [name, fn] of [["Worker", worker], ["Gateway", gateway]] as const) {
      new cloudwatch.MetricAlarm(`${name}ErrorAlarm`, {
        name: `airflux-${$app.stage}-${name}-Errors`,
        metricName: "Errors",
        namespace: "AWS/Lambda",
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 1,
        comparisonOperator: "GreaterThanOrEqualToThreshold",
        dimensions: { FunctionName: fn.name },
        alarmActions: [alertTopic.arn],
        okActions: [alertTopic.arn],
      });
    }

    return {
      gatewayUrl: gateway.url,
      workerArn: worker.arn,
      alertTopicArn: alertTopic.arn,
    };
  },
});
