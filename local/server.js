// =====================================================================
// server.js — PATH A: local Express server (FoodNow storefront).
//
// UI structure follows the Stripe Press bookstore take-home pattern:
//   GET  /                       -> menu storefront (Handlebars grid)
//   GET  /checkout?item=<id>      -> Payment Element checkout for one item
//   POST /create-payment-intent   -> server looks up price, returns secret
//   GET  /success?payment_intent= -> retrieves the PI and shows a receipt
//   POST /webhook                 -> verified event -> idempotent FULFILL
//
// These routes mirror the AWS architecture:
//   /create-payment-intent  -> (AWS: API Gateway + Lambda)
//   /webhook                 -> (AWS: native Stripe -> EventBridge)
// The MONEY LOGIC is shared from src/core, so what you explain here is the
// same logic that runs on AWS. Only the plumbing differs.
// =====================================================================

require("dotenv").config(); // load .env into process.env (local only)

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { engine } = require("express-handlebars");

const { makeStripeClient } = require("../src/core/stripeClient");
const { createPaymentIntent } = require("../src/core/paymentIntent");
const { fulfillOrder, extractPaymentInfo } = require("../src/core/fulfillment");
const { getMenu, getItem } = require("../src/core/cart");

// --- Config from environment (never hardcoded) ---
const {
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET,
  CONNECTED_ACCOUNT_ID, // optional: enables the Connect split
  PORT = 4242,
} = process.env;

const stripe = makeStripeClient(STRIPE_SECRET_KEY);
const app = express();

// --- Handlebars view engine (same setup as the bookstore reference) ---
app.engine("hbs", engine({ defaultLayout: "main", extname: ".hbs" }));
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// -------------------------------------------------------------------
// IDEMPOTENCY STORE (local only).
// Remembers which Stripe event.ids we've processed so a duplicate
// delivery can't fulfill twice. On AWS this is a DynamoDB conditional
// write instead of an in-memory Set.
// -------------------------------------------------------------------
const processedEventIds = new Set();

// -------------------------------------------------------------------
// GET / — storefront. Render the menu from the server-side catalog so the
// displayed prices always match the charging logic.
// -------------------------------------------------------------------
app.get("/", (_req, res) => {
  res.render("index", { menu: getMenu() });
});

// -------------------------------------------------------------------
// GET /checkout?item=<id> — checkout page for one selected item.
// We mint a checkoutSessionId here and reuse it as the idempotency key if
// the browser retries PaymentIntent creation.
// -------------------------------------------------------------------
app.get("/checkout", (req, res) => {
  const item = getItem(req.query.item);
  if (!item) {
    return res.render("checkout", { error: "No item selected" });
  }
  res.render("checkout", {
    itemId: req.query.item,
    title: item.title,
    vendor: item.vendor,
    emoji: item.emoji,
    amount: item.amount,
    publishableKey: STRIPE_PUBLISHABLE_KEY,
    checkoutSessionId: crypto.randomUUID(),
  });
});

// -------------------------------------------------------------------
// POST /create-payment-intent
// The browser sends only the item id + checkoutSessionId. The amount is
// looked up HERE on the server. We return only the client_secret.
// -------------------------------------------------------------------
app.post("/create-payment-intent", express.json(), async (req, res) => {
  try {
    const { item, checkoutSessionId } = req.body;
    const result = await createPaymentIntent(stripe, item, {
      checkoutSessionId,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
    });
    res.json({ clientSecret: result.clientSecret });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error("create-payment-intent failed:", err.message);
    res
      .status(status)
      .json({ error: status === 400 ? err.message : "Could not start checkout." });
  }
});

// -------------------------------------------------------------------
// GET /success — Stripe redirects here after confirmPayment().
// We RETRIEVE the PaymentIntent from Stripe (the source of truth — never
// trust the URL alone) and render a receipt. NOTE: this page does NOT
// fulfill the order; the webhook event does.
// -------------------------------------------------------------------
app.get("/success", async (req, res) => {
  const paymentIntentId = req.query.payment_intent;
  if (!paymentIntentId) {
    return res.render("success", {});
  }
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    res.render("success", {
      amount: pi.amount,
      paymentIntentId: pi.id,
      status: pi.status,
      isSuccess: pi.status === "succeeded",
    });
  } catch (err) {
    console.error("PaymentIntent retrieve failed:", err.message);
    res.render("success", { error: "Could not load payment details." });
  }
});

// -------------------------------------------------------------------
// POST /webhook
// Stripe calls this when events happen. We MUST:
//   1. Verify the signature using the raw body + webhook secret.
//   2. Return 200 fast.
//   3. On payment_intent.succeeded, fulfill ONCE (idempotent on event.id).
//
// express.raw — signature verification needs the EXACT raw bytes, not a
// parsed JSON object, so this route uses raw instead of express.json().
// -------------------------------------------------------------------
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    // Throws if the signature doesn't match — i.e. the request did not
    // genuinely come from Stripe. We act ONLY on verified events.
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Signature verification FAILED:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Return 200 immediately so Stripe doesn't retry. Do work after.
  res.json({ received: true });

  // --- Idempotency: dedupe on event.id ---
  if (processedEventIds.has(event.id)) {
    console.log(`Duplicate event ${event.id} ignored (already fulfilled).`);
    return;
  }
  processedEventIds.add(event.id);

  // --- Act only on the event that means "money actually moved" ---
  if (event.type === "payment_intent.succeeded") {
    fulfillOrder(extractPaymentInfo(event.data.object)); // prints FULFILL ORDER
  } else {
    console.log(`Ignoring event type: ${event.type}`);
  }
});

app.listen(PORT, () => {
  console.log(`FoodNow local demo running: http://localhost:${PORT}`);
  if (CONNECTED_ACCOUNT_ID) {
    console.log(`Connect split ENABLED -> ${CONNECTED_ACCOUNT_ID} (20% fee)`);
  } else {
    console.log("Connect split disabled (single charge). Set CONNECTED_ACCOUNT_ID to enable.");
  }
});
