// =====================================================================
// fulfillment Lambda  (AWS equivalent of the /webhook handler).
//
// Triggered by: an EventBridge rule matching Stripe's
//   "payment_intent.succeeded" event, delivered NATIVELY by Stripe to
//   Amazon EventBridge (there is NO self-hosted webhook server on AWS).
//
// Why no signature verification here?
//   With native EventBridge delivery, AWS authenticates the event source
//   (a Stripe-owned partner event bus). The trust boundary is the event
//   bus itself, so we don't re-verify a Stripe-Signature header the way
//   the local webhook does. (The local path DOES verify, because there
//   anyone could POST to the open /webhook URL.)
//
// IDEMPOTENCY:
//   Stripe delivers at-least-once, so the SAME event.id can arrive twice
//   (or be replayed in a test). We do a DynamoDB CONDITIONAL WRITE on the
//   event id: the first write wins and fulfills; any duplicate write fails
//   the condition and we skip fulfillment. No double-cooked orders.
// =====================================================================

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const { fulfillOrder, extractPaymentInfo } = require("../../../src/core/fulfillment");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.IDEMPOTENCY_TABLE;

// Returns true if THIS call claimed the event (i.e. it's the first time we
// see this id). Returns false if it was already processed.
async function claimEvent(eventId) {
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          eventId,
          processedAt: new Date().toISOString(),
          // TTL: auto-expire dedupe rows after 30 days to keep the table small.
          ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        },
        // Only write if no row with this eventId exists yet.
        ConditionExpression: "attribute_not_exists(eventId)",
      })
    );
    return true; // we claimed it -> first time -> fulfill
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return false; // already processed -> skip
    }
    throw err; // a real error -> let Lambda retry
  }
}

exports.handler = async (event) => {
  // EventBridge wraps the full Stripe Event object in `detail` (per Stripe's
  // docs: docs.stripe.com/event-destinations/eventbridge). Structure:
  //   event["detail-type"]      = "payment_intent.succeeded"  (rule matches this)
  //   event.detail.id           = "evt_..."   <- the Stripe EVENT id (dedupe key)
  //   event.detail.type         = "payment_intent.succeeded"
  //   event.detail.data.object  = the PaymentIntent (snapshot payload)
  const detail = event.detail || {};

  // Dedupe on the Stripe EVENT id (evt_...), which lives at detail.id.
  // Fall back to EventBridge's own id only if detail.id is somehow absent.
  const stripeEventId = detail.id || event.id;

  const isFirstTime = await claimEvent(stripeEventId);
  if (!isFirstTime) {
    console.log(`Duplicate event ${stripeEventId} ignored (already fulfilled).`);
    return { duplicate: true };
  }

  // The PaymentIntent object Stripe sent inside the event (snapshot payload).
  const paymentIntentObject = (detail.data && detail.data.object) || {};

  const info = extractPaymentInfo(paymentIntentObject);
  fulfillOrder(info); // prints "FULFILL ORDER ..." to CloudWatch Logs
  return { fulfilled: true };
};
