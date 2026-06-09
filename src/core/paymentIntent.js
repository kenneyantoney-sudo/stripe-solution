// =====================================================================
// paymentIntent.js — creates the PaymentIntent (the "intent to charge").
//
// KEY INTERVIEW POINTS:
//   1. The browser sends only an ITEM ID. The amount is looked up here,
//      server-side, from the menu. The browser is never trusted for price.
//   2. We pass an idempotency key so a double-click / network retry does
//      not create two charges — Stripe replays the original response 24h.
//   3. If a connected account is configured, this becomes a marketplace
//      DESTINATION CHARGE: FoodNow keeps a 20% platform fee and routes the
//      rest to the restaurant/driver's connected account.
//   4. We return the client_secret — a one-time token the browser uses to
//      confirm the payment. It does NOT expose the secret key.
// =====================================================================

const { getItem, CURRENCY } = require("./cart");

// The platform fee FoodNow retains on a marketplace split (20%).
const PLATFORM_FEE_RATE = 0.2;

// Create a PaymentIntent for one menu item.
//   stripe              - a configured Stripe client (from stripeClient.js)
//   itemId              - the menu id the browser selected
//   options.checkoutSessionId - used to build the idempotency key
//   options.connectedAccountId - optional acct_... ; if present we split
async function createPaymentIntent(stripe, itemId, options = {}) {
  const item = getItem(itemId);
  if (!item) {
    const err = new Error("Invalid item");
    err.statusCode = 400;
    throw err;
  }

  // Server computes the trusted amount. This is the only price that matters.
  const amount = item.amount;

  const params = {
    amount,
    currency: CURRENCY,
    // Let Stripe show all eligible payment methods (cards + wallets like
    // Apple Pay / Google Pay) in the Payment Element automatically.
    automatic_payment_methods: { enabled: true },
    metadata: { app: "foodnow", item: String(itemId) },
  };

  // --- OPTIONAL: Stripe Connect destination charge ---
  // If a connected account id is provided, split the payment:
  //   - application_fee_amount  = FoodNow's 20% platform fee (in cents)
  //   - transfer_data.destination = where the remainder is sent
  // The customer still makes ONE payment; Stripe handles the split.
  if (options.connectedAccountId) {
    params.application_fee_amount = Math.round(amount * PLATFORM_FEE_RATE);
    params.transfer_data = { destination: options.connectedAccountId };
    params.metadata.connect = "destination_charge";
  }

  // Idempotency key: ties retries of THIS checkout session to one charge.
  const requestOptions = {};
  if (options.checkoutSessionId) {
    requestOptions.idempotencyKey = `checkout_${options.checkoutSessionId}`;
  }

  const paymentIntent = await stripe.paymentIntents.create(
    params,
    requestOptions
  );

  // Return only what the browser needs. client_secret confirms the payment;
  // it is scoped to this one PaymentIntent and is safe to send to the client.
  return {
    clientSecret: paymentIntent.client_secret,
    amount,
    currency: CURRENCY,
    paymentIntentId: paymentIntent.id,
  };
}

module.exports = { createPaymentIntent, PLATFORM_FEE_RATE };
