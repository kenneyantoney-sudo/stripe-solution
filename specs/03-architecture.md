# Architecture

## Path A — Local (rehearsal)
```
Browser (Payment Element)
   │  GET /config            → publishable key + cart
   │  POST /create-payment-intent → client_secret (amount set on server)
   ▼
Express server (local/server.js)
   ▲
   │  Stripe CLI: `stripe listen --forward-to localhost:4242/webhook`
   │  POST /webhook (signature verified) → FULFILL ORDER (idempotent Set)
Stripe (test mode)
```

## Path B — AWS (the presented architecture)
```
Browser (Payment Element)
   │  POST {ApiUrl}/create-payment-intent
   ▼
API Gateway (HTTP) → create-payment-intent Lambda
                         │ reads Stripe key from Secrets Manager
                         ▼
                       Stripe (test mode) → creates PaymentIntent
   ...customer pays...
Stripe  ──native event destination──▶  Amazon EventBridge
                                          (partner event bus
                                           aws.partner/stripe.com/<id>)
                                              │ rule: detail-type =
                                              │ payment_intent.succeeded
                                              ▼
                                        fulfillment Lambda
                                          │ DynamoDB conditional write
                                          │ (dedupe on event.id)
                                          ▼
                                        FULFILL ORDER → CloudWatch Logs
```

## Key decision: native EventBridge, not a webhook server
On AWS, Stripe delivers events **directly to Amazon EventBridge**. There is
**no self-hosted webhook server**. Benefits: no server to host/patch/scale,
AWS-native auth on the event source, and EventBridge rules fan out to many
targets. The local `/webhook` exists only so we can rehearse without AWS.

## EventBridge payload shape (per Stripe docs)
Ref: <https://docs.stripe.com/event-destinations/eventbridge>. EventBridge wraps
the full Stripe Event object inside `detail`:

| Field | Value | Used for |
|---|---|---|
| `detail-type` | `"payment_intent.succeeded"` | **the rule's event pattern matches this** |
| `source` | `aws.partner/stripe.com/<id>` | identifies the Stripe partner bus |
| `detail.id` | `"evt_..."` | **idempotency dedupe key** |
| `detail.type` | `"payment_intent.succeeded"` | same type, inside the event |
| `detail.data.object` | the PaymentIntent | what fulfillment reads (snapshot payload) |

We send **snapshot** events (full object in `detail.data.object`), not thin
events, so the fulfillment Lambda needs no extra API call to hydrate.

Setup (one-time): enable Workbench → create an Amazon EventBridge event
destination (AWS account + region, event types) → AWS deletes the pending
partner source if not associated to a bus **within 7 days** → associate it →
redeploy CDK with `-c partnerEventBusName=aws.partner/stripe.com/<id>`.

Delivery caveats Stripe documents: retries up to ~3 days, **no manual retry**,
**no ordering guarantee** — handled by idempotent, order-independent fulfillment.

## Local → AWS mapping
| Local piece | AWS equivalent |
|---|---|
| Express `/create-payment-intent` | API Gateway + Lambda |
| `stripe listen` + `/webhook` | Stripe native event destination → EventBridge rule |
| signature verification | trusted Stripe partner event bus |
| in-memory `Set` dedupe | DynamoDB conditional write on `eventId` |
| `.env` secret | Secrets Manager (read at runtime) |
| `console.log` FULFILL ORDER | CloudWatch Logs |
