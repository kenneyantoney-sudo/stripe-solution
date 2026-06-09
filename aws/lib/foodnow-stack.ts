// =====================================================================
// foodnow-stack.ts — PATH B infrastructure as code (AWS CDK).
//
// Provisions:
//   1. Secrets Manager secret holding the Stripe TEST secret key.
//   2. API Gateway (HTTP) + Lambda for POST /create-payment-intent.
//   3. DynamoDB table for idempotency (dedupe on Stripe event id).
//   4. A fulfillment Lambda triggered by an EventBridge rule that
//      matches Stripe's payment_intent.succeeded events delivered
//      NATIVELY to a Stripe partner event bus (no webhook server).
//
// HOW THE STRIPE -> EVENTBRIDGE LINK WORKS:
//   You register an "Amazon EventBridge" event destination in the Stripe
//   Dashboard/Workbench. Stripe then creates a PARTNER EVENT SOURCE in
//   your AWS account named like:
//     aws.partner/stripe.com/<id>
//   You associate that source with an event bus. Because that name only
//   exists AFTER you register in Stripe, we pass it in as a CDK context
//   value (-c partnerEventBusName=...) on the SECOND deploy. On the first
//   deploy (before registering), we skip the rule so the stack still
//   creates the API + secret you need to register in the first place.
// =====================================================================

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

export class FoodNowStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------------
    // 1. Secrets Manager — holds the Stripe TEST secret key.
    //    We create the secret SHELL here; you put the real value in via
    //    the CLI after deploy (so the key never lives in this code/repo).
    // -----------------------------------------------------------------
    const stripeSecret = new secretsmanager.Secret(this, "StripeSecretKey", {
      secretName: "foodnow/stripe-secret-key",
      description: "Stripe TEST secret key for FoodNow demo (set value post-deploy).",
    });

    // Optional Connect split: pass -c connectedAccountId=acct_xxx at deploy.
    const connectedAccountId =
      (this.node.tryGetContext("connectedAccountId") as string) || "";

    // -----------------------------------------------------------------
    // 2. DynamoDB idempotency table — partition key = Stripe event id.
    //    Pay-per-request so there's nothing to size for a demo. TTL on
    //    "ttl" attribute auto-cleans old dedupe rows.
    // -----------------------------------------------------------------
    const idempotencyTable = new dynamodb.Table(this, "IdempotencyTable", {
      partitionKey: { name: "eventId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY, // demo: tear down cleanly
    });

    // Shared bundling for Node 20 Lambdas. We package from the REPO ROOT
    // so the functions can require ../../../src/core shared logic.
    const commonFnProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
    };

    // -----------------------------------------------------------------
    // 3. create-payment-intent Lambda + HTTP API Gateway route.
    // -----------------------------------------------------------------
    const createPiFn = new lambda.Function(this, "CreatePaymentIntentFn", {
      ...commonFnProps,
      handler: "aws/functions/create-payment-intent/index.handler",
      // Bundle the whole repo (small) so shared src/core + node_modules ship.
      code: lambda.Code.fromAsset("..", {
        exclude: [
          ".git",
          "aws/cdk.out",
          "aws/node_modules",
          "**/*.md",
          "local/public",
          ".env*",
          "sample.env",
        ],
      }),
      environment: {
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
        CONNECTED_ACCOUNT_ID: connectedAccountId,
      },
    });
    // Least privilege: the function may only READ the Stripe secret.
    stripeSecret.grantRead(createPiFn);

    const httpApi = new apigw.HttpApi(this, "FoodNowApi", {
      description: "FoodNow create-payment-intent API",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.OPTIONS],
        allowHeaders: ["content-type"],
      },
    });
    httpApi.addRoutes({
      path: "/create-payment-intent",
      methods: [apigw.HttpMethod.POST],
      integration: new HttpLambdaIntegration("CreatePiIntegration", createPiFn),
    });

    // -----------------------------------------------------------------
    // 4. fulfillment Lambda — triggered by EventBridge on success.
    // -----------------------------------------------------------------
    const fulfillmentFn = new lambda.Function(this, "FulfillmentFn", {
      ...commonFnProps,
      handler: "aws/functions/fulfillment/index.handler",
      code: lambda.Code.fromAsset("..", {
        exclude: [
          ".git",
          "aws/cdk.out",
          "aws/node_modules",
          "**/*.md",
          "local/public",
          ".env*",
          "sample.env",
        ],
      }),
      environment: {
        IDEMPOTENCY_TABLE: idempotencyTable.tableName,
      },
    });
    // Least privilege: the function may only WRITE dedupe rows.
    idempotencyTable.grantWriteData(fulfillmentFn);

    // The EventBridge rule lives on the STRIPE PARTNER event bus. That bus
    // only exists after you register the event destination in Stripe, so
    // its name is supplied via context on a second deploy:
    //   cdk deploy -c partnerEventBusName=aws.partner/stripe.com/<id>
    const partnerEventBusName =
      (this.node.tryGetContext("partnerEventBusName") as string) || "";

    if (partnerEventBusName) {
      const partnerBus = events.EventBus.fromEventBusName(
        this,
        "StripePartnerBus",
        partnerEventBusName
      );

      // Match only the event that means money moved.
      const rule = new events.Rule(this, "PaymentSucceededRule", {
        eventBus: partnerBus,
        description: "Route Stripe payment_intent.succeeded to fulfillment.",
        eventPattern: {
          // Stripe sets detail-type / detail.type to the event type.
          detailType: ["payment_intent.succeeded"],
        },
      });
      rule.addTarget(new targets.LambdaFunction(fulfillmentFn, { retryAttempts: 2 }));

      new cdk.CfnOutput(this, "PartnerEventBus", { value: partnerEventBusName });
    } else {
      new cdk.CfnOutput(this, "NextStep_RegisterStripe", {
        value:
          "Register an Amazon EventBridge event destination in Stripe, then redeploy with -c partnerEventBusName=aws.partner/stripe.com/<id>",
      });
    }

    // -----------------------------------------------------------------
    // Outputs — what you need after deploy.
    // -----------------------------------------------------------------
    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      description: "Base URL. POST {ApiUrl}/create-payment-intent",
    });
    new cdk.CfnOutput(this, "StripeSecretArn", {
      value: stripeSecret.secretArn,
      description: "Put your Stripe TEST secret key here (see README).",
    });
    new cdk.CfnOutput(this, "IdempotencyTableName", {
      value: idempotencyTable.tableName,
    });
  }
}
