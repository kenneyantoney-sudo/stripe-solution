// =====================================================================
// create-payment-intent Lambda  (AWS equivalent of the Express route).
//
// Triggered by: API Gateway (POST /create-payment-intent).
// Responsibilities:
//   - read the Stripe secret key from AWS Secrets Manager (cached)
//   - create the PaymentIntent with a SERVER-SET amount (from src/core)
//   - return only the client_secret to the browser
//
// The money logic is the SAME src/core code used locally. Only the
// surrounding plumbing (API Gateway + Secrets Manager) is different.
// =====================================================================

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

const { makeStripeClient } = require("../../../src/core/stripeClient");
const { createPaymentIntent } = require("../../../src/core/paymentIntent");

const secretsClient = new SecretsManagerClient({});

// Cache the secret + Stripe client across warm invocations (don't re-fetch
// the secret on every request — that's slow and costs money).
let cachedStripe = null;

async function getStripe() {
  if (cachedStripe) return cachedStripe;

  const secretArn = process.env.STRIPE_SECRET_ARN;
  const resp = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );
  // The secret may be stored as raw string or as JSON {"STRIPE_SECRET_KEY": "..."}.
  let key = resp.SecretString;
  try {
    const parsed = JSON.parse(resp.SecretString);
    key = parsed.STRIPE_SECRET_KEY || parsed.secretKey || key;
  } catch (_) {
    /* not JSON — use the raw string */
  }

  cachedStripe = makeStripeClient(key);
  return cachedStripe;
}

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  try {
    // API Gateway delivers the POST body as a JSON string. The browser sends
    // only the item id + checkoutSessionId — never a price.
    const body = event && event.body ? JSON.parse(event.body) : {};
    const { item, checkoutSessionId } = body;

    const stripe = await getStripe();
    const result = await createPaymentIntent(stripe, item, {
      checkoutSessionId,
      // Optional Connect split, if a connected account id is configured.
      connectedAccountId: process.env.CONNECTED_ACCOUNT_ID || undefined,
    });

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ clientSecret: result.clientSecret }),
    };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    console.error("create-payment-intent failed:", err.message);
    return {
      statusCode,
      headers: cors,
      body: JSON.stringify({
        error: statusCode === 400 ? err.message : "Could not create payment intent.",
      }),
    };
  }
};
