#!/usr/bin/env node
// Entry point for the CDK app. Instantiates the FoodNow stack in us-east-1.
import * as cdk from "aws-cdk-lib";
import { FoodNowStack } from "../lib/foodnow-stack";

const app = new cdk.App();

new FoodNowStack(app, "FoodNowStripeStack", {
  env: {
    // Account is taken from your environment at deploy time (`cdk deploy` /
    // AWS_PROFILE) — never hardcoded.
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: "FoodNow Stripe demo — API GW + Lambda, native Stripe->EventBridge, DynamoDB idempotency, Secrets Manager.",
});
