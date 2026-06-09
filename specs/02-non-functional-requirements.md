# Non-Functional Requirements

## NFR-1 — Security
- **Test mode only.** Reject `sk_live_` keys at startup.
- Secret key never in client code or git. `.env` (gitignored) locally;
  Secrets Manager on AWS, read at runtime with least-privilege IAM.
- Publishable key is the only Stripe key exposed to the browser.

## NFR-2 — Trust boundary on events
- Local `/webhook` **must verify the Stripe signature** on the raw body
  before acting (the URL is publicly reachable, so anyone could POST to it).
- AWS path trusts the **Stripe partner event bus**; AWS authenticates the
  source, so no header re-verification is required.

## NFR-3 — Responsiveness
- Webhook returns `200` fast, then does work (avoid Stripe retries).
- Lambdas cache the Stripe client / secret across warm invocations.

## NFR-4 — Idempotency guarantee
- At-least-once delivery is assumed. Dedupe key = Stripe `event.id`.
- DynamoDB rows auto-expire via TTL (30 days) to bound table size.

## NFR-5 — Explainability (interview constraint)
- Minimal dependencies.
- Every file commented so each line can be explained live.
