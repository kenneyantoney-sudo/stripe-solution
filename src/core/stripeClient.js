// =====================================================================
// stripeClient.js — builds a configured Stripe SDK client.
//
// KEY INTERVIEW POINT:
//   The secret key NEVER lives in code. It comes from:
//     - Path A (local): process.env.STRIPE_SECRET_KEY (from .env)
//     - Path B (AWS):   AWS Secrets Manager, read at Lambda runtime
//   This module just accepts a key string, so the SAME core code works
//   in both worlds — only the *source* of the key changes.
// =====================================================================

const Stripe = require("stripe");

// Build a Stripe client from an explicitly-passed secret key.
// We pin the apiVersion so behavior never changes underneath us silently.
function makeStripeClient(secretKey) {
  if (!secretKey) {
    throw new Error("Missing Stripe secret key — refusing to start.");
  }
  // Safety rail: this demo is TEST MODE ONLY. A live key starts "sk_live_".
  if (secretKey.startsWith("sk_live_")) {
    throw new Error("Live key detected. This demo is TEST MODE ONLY.");
  }
  return new Stripe(secretKey, { apiVersion: "2024-06-20" });
}

module.exports = { makeStripeClient };
