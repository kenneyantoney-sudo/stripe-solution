# Acceptance Criteria

These are the checks that prove the build is done. The `verify-demo` skill
walks through them.

## AC-1 — Local happy path
- [ ] `npm start` boots and prints the local URL.
- [ ] Visiting `/` shows the cart with a server-computed total.
- [ ] Paying with `4242 4242 4242 4242` succeeds and redirects to success.
- [ ] The server terminal prints `FULFILL ORDER — paymentIntent=pi_... amount=...`.

## AC-2 — Server owns the price
- [ ] The browser sends no amount; `POST /create-payment-intent` body is `{}`.
- [ ] Editing client JS cannot change the charged amount.

## AC-3 — Signature verification (local)
- [ ] A POST to `/webhook` without a valid `stripe-signature` returns `400`.

## AC-4 — Idempotency
- [ ] Replaying the same event (`stripe events resend <id>` locally, or a
      replay on AWS) prints "Duplicate event ... ignored" and does NOT
      fulfill a second time.

## AC-5 — Optional Connect split
- [ ] With `CONNECTED_ACCOUNT_ID` set, the PaymentIntent has
      `application_fee_amount` = 20% and `transfer_data.destination` set.

## AC-6 — AWS deploy
- [ ] `cdk deploy` outputs `ApiUrl`, `StripeSecretArn`, `IdempotencyTableName`.
- [ ] After registering the EventBridge destination in Stripe and redeploying
      with `-c partnerEventBusName=...`, a test payment triggers the
      fulfillment Lambda (visible in CloudWatch Logs).
- [ ] A replayed event does NOT double-fulfill (DynamoDB conditional write).

## AC-7 — Secrets hygiene
- [ ] No secret key in git. `.env` is gitignored. `.env.example` has placeholders.
- [ ] Lambdas read the key from Secrets Manager at runtime.
