// =====================================================================
// fulfillment.js — what happens AFTER a payment truly succeeds.
//
// KEY INTERVIEW POINTS:
//   1. Fulfillment is triggered by the EVENT (payment_intent.succeeded),
//      never by the browser redirect. The browser can close, lose network,
//      or be faked — the event from Stripe is the source of truth.
//   2. It must be IDEMPOTENT: Stripe may deliver the same event more than
//      once (at-least-once delivery). We dedupe on event.id so a duplicate
//      never double-fulfills (no double-cooked order, no double payout).
//
//   This module holds the PURE fulfillment action. The "have I seen this
//   event.id before?" check lives in the caller, because the storage differs:
//     - Path A (local): an in-memory Set (fine for a single-process demo)
//     - Path B (AWS):   DynamoDB conditional write (durable, distributed)
// =====================================================================

// Perform the actual order fulfillment. In a real system this would notify
// the kitchen, assign a driver, etc. For the demo we log a clear marker.
function fulfillOrder({ paymentIntentId, amount, currency }) {
  const dollars = (amount / 100).toFixed(2);
  console.log(
    `FULFILL ORDER — paymentIntent=${paymentIntentId} amount=${dollars} ${String(
      currency
    ).toUpperCase()}`
  );
  return { fulfilled: true, paymentIntentId };
}

// Extract the bits we care about from a Stripe payment_intent.succeeded event.
// Works for both a raw Stripe webhook event and an EventBridge-wrapped event.
function extractPaymentInfo(paymentIntentObject) {
  return {
    paymentIntentId: paymentIntentObject.id,
    amount: paymentIntentObject.amount,
    currency: paymentIntentObject.currency,
  };
}

module.exports = { fulfillOrder, extractPaymentInfo };
