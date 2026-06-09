# Functional Requirements

## FR-1 — Checkout page
A customer can open a checkout page and pay with the Stripe **Payment
Element** (card + wallets like Apple Pay / Google Pay).

## FR-2 — Server-set amount
`POST /create-payment-intent` computes the amount **on the server** from a
hardcoded cart (`src/core/cart.js`). The browser sends no price.
- Returns only the `client_secret`.

## FR-3 — Event-driven fulfillment
On `payment_intent.succeeded`, the system logs `FULFILL ORDER` with the
PaymentIntent id and amount.
- Local: `POST /webhook` after Stripe-signature verification.
- AWS: fulfillment Lambda triggered by an EventBridge rule.

## FR-4 — Idempotency
A duplicate or replayed event with the same `event.id` must **not**
double-fulfill.
- Local: in-memory Set.
- AWS: DynamoDB conditional write (`attribute_not_exists(eventId)`).

## FR-5 — Optional Connect split
If `CONNECTED_ACCOUNT_ID` is set, the PaymentIntent becomes a **destination
charge**: 20% `application_fee_amount` retained by FoodNow, remainder routed
to the connected account via `transfer_data.destination`.

## FR-6 — Success page
A success page explains that fulfillment came from the **event**, not the
redirect.
