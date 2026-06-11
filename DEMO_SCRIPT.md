# FoodNow — Demo Video Script & Recording Kit

A complete, step-by-step guide to record a 3–8 minute walkthrough of the FoodNow
Stripe payments demo. Works on a fresh laptop. Read the **SAY** lines aloud;
perform the **DO** actions.

> **Test mode only.** Never show `.env`, your AWS account id, or ARNs on camera.

---

## Part 0 — One-time setup on a new laptop

Skip this if the machine is already set up.

### 0.1 Prerequisites (install these first)
- **Node.js 20+** — `node -v`
- **Stripe CLI** — `stripe version` (https://docs.stripe.com/stripe-cli)
- **AWS CLI v2**, logged in — `aws sts get-caller-identity`
- A Stripe account in **test mode**

### 0.2 Clone + install
```bash
git clone https://github.com/kenneyantoney-sudo/stripe-solution.git
cd stripe-solution
npm install
```

### 0.3 Create your `.env` (never committed)
```bash
cp .env.example .env
```
Edit `.env` and fill in YOUR test values:
```
STRIPE_SECRET_KEY=sk_test_xxx          # Dashboard > Developers > API keys
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx        # only needed for the LOCAL /webhook (optional)
CONNECTED_ACCOUNT_ID=acct_xxx          # the test restaurant account (see 0.4)
PORT=4242
```

### 0.4 Create the test "restaurant" account (for the Connect split)
Dashboard (test mode) → **Connect → Accounts → + Create** → **Express**, US →
finish the test onboarding. Copy its id (`acct_...`) into `CONNECTED_ACCOUNT_ID`.
It needs the **transfers** capability active (Express onboarding grants it).

### 0.5 Log the Stripe CLI into the same account
```bash
stripe login          # opens a browser; pick the SAME test account as your keys
```

### 0.6 (AWS path) Deploy + connect EventBridge
Only needed if Path B isn't deployed yet on this account. Full instructions are
in `README.md` → "Path B — Deploy to AWS (CDK)". Summary:
```bash
cd aws && npm install
npx cdk bootstrap aws://<YOUR_AWS_ACCOUNT_ID>/us-east-1
npx cdk deploy
# put the Stripe secret into Secrets Manager, create the Stripe EventBridge
# destination, associate the partner event source, then redeploy with
# -c partnerEventBusName=aws.partner/stripe.com/<id>
# and -c connectedAccountId=acct_xxx for the split on AWS
cd ..
```

### 0.7 Find YOUR fulfillment Lambda name (you'll need it below)
Resource names are unique per deploy. Get yours:
```bash
aws lambda list-functions --region us-east-1 \
  --query "Functions[?contains(FunctionName, 'FulfillmentFn')].FunctionName" --output text
```
Copy the result — call it `<FulfillmentFnName>` everywhere below.

---

## Part 1 — Before you hit record (every time)

### 1.1 Open three terminals in the project folder
```bash
cd stripe-solution
```

**Terminal 1 — start the server:**
```bash
npm start
```
Confirm BOTH lines print (if not, fix `.env` and restart):
```
FoodNow local demo running: http://localhost:4242
Connect split ENABLED -> acct_... (20% fee)
```
> Port already in use? Find and stop the old one:
> `lsof -nP -iTCP:4242 -sTCP:LISTEN` then `kill -9 <PID>`, then `npm start` again.

**Terminal 2 — tail the AWS fulfillment Lambda (clean output for video):**
```bash
aws logs tail <FulfillmentFnName> --follow --region us-east-1 --format short \
  | grep --line-buffered -E "FULFILL ORDER|Duplicate event"
```
This shows ONLY the meaningful lines (hides INIT/START/REPORT noise).

**Terminal 3 — leave empty** (used for the idempotency replay in Act 4).

### 1.2 Open two browser tabs
- `http://localhost:4242` — the storefront
- Stripe Dashboard → Payments (test mode): https://dashboard.stripe.com/test/payments

### 1.3 Prepare the idempotency payload (fresh id each recording)
Run this in Terminal 3 to write a payload with a guaranteed-unused event id:
```bash
EID="evt_demo_$(date +%s)"
cat > /tmp/idem-test.json <<JSON
{ "detail-type": "payment_intent.succeeded",
  "detail": { "id": "$EID", "type": "payment_intent.succeeded",
    "data": { "object": { "id": "pi_$EID", "amount": 2200, "currency": "usd" } } } }
JSON
echo "fresh event id: $EID"
```

### 1.4 Recording tips
- Record with QuickTime (File → New Screen Recording) or Cmd+Shift+5, mic on.
- Zoom terminal + browser fonts UP so text is legible.
- For Act 3, put the **browser and Terminal 2 side by side** — the
  "browser vs. AWS log" shot is the most convincing moment.
- Pause ~1 second after each money moment.
- Hide `.env`, the AWS account id, and ARNs.

### 1.5 Pre-flight checklist
- [ ] Terminal 1 shows "running" + "Connect split ENABLED"
- [ ] Terminal 2 is tailing (empty so far)
- [ ] Terminal 3 printed a fresh event id
- [ ] Storefront loads at localhost:4242
- [ ] Stripe Payments dashboard open (test mode)
- [ ] Mic on; fonts zoomed; secrets hidden

---

## Part 2 — The script (say + do)

### Act 1 — The problem (~15s)
**SAY:** "This is FoodNow, a food-delivery marketplace. A customer pays once, the
platform keeps a fee, and the restaurant gets paid. The hard part isn't taking
the card — it's making sure we only cook the food when the money truly moved,
and never twice. Here's how I solved that with Stripe and AWS."
**DO:** Show the storefront menu.

### Act 2 — Server owns the price (~30s)
**SAY:** "First rule: the browser never sets the price. When I click Order, the
browser sends only an item id. The server looks up the real amount — so nobody
can edit the page and pay one cent for a $22 order."
**DO:** Click **Order** on the **Spicy Tuna Roll Set ($22)**. Optionally show
`src/core/cart.js`.

### Act 3 — Pay + the key insight (~60s) — the heart of the demo
**SAY:** "Card details go straight to Stripe through the Payment Element — they
never touch my server. I'll pay with a test card."
**DO:** Enter `4242 4242 4242 4242`, any future expiry, any CVC/ZIP. Click **Pay**.

**SAY (on the receipt):** "I land on a receipt. But read it carefully — it says
it did *not* fulfill the order. The redirect is just a screen for the human."
**DO:** Point at the success-page wording.

**SAY (switch to Terminal 2):** "Here's the whole point. `FULFILL ORDER` just
appeared in AWS CloudWatch. My browser never called AWS. Stripe sent a
`payment_intent.succeeded` event, delivered natively to Amazon EventBridge — no
webhook server — which fired a Lambda that fulfilled the order. If the browser
had crashed right after paying, the customer still gets fed. The event cooks the
food, not the redirect."
**DO:** Point at `FULFILL ORDER — paymentIntent=pi_... amount=22.00 USD`.

### Act 4 — Idempotency (~45s)
**SAY:** "EventBridge delivers at-least-once with no ordering guarantee — so the
same event will sometimes arrive twice. I don't try to stop that. I make
processing it safe. Watch — I'll send the exact same event id twice."
**DO (Terminal 3):** run the two invokes:
```bash
aws lambda invoke --function-name <FulfillmentFnName> --region us-east-1 \
  --cli-binary-format raw-in-base64-out --payload file:///tmp/idem-test.json /tmp/out1.json
cat /tmp/out1.json   # {"fulfilled":true}

aws lambda invoke --function-name <FulfillmentFnName> --region us-east-1 \
  --cli-binary-format raw-in-base64-out --payload file:///tmp/idem-test.json /tmp/out2.json
cat /tmp/out2.json   # {"duplicate":true}
```
**SAY:** "First call: fulfilled. Second call, same id: duplicate — skipped. A
DynamoDB conditional write claims the event id, so the order is fulfilled once.
No double-cooked orders, no double payouts."

### Act 5 — The marketplace split (~45s)
**SAY:** "Finally, it's a real marketplace. That one $22 payment gets split by
Stripe Connect: FoodNow keeps a 20% fee — $4.40 — and $17.60 transfers to the
restaurant's account."
**DO:** In the Dashboard, open the $22 payment you made in Act 3 → point at
**Application fee $4.40** and **Transfer → connected account**.

### Close (~15s)
**SAY:** "So: server-set price, event-driven fulfillment, idempotent, and split
to the merchant — the same core code runs locally and on AWS, and the whole
thing was built spec-first. That's FoodNow."

---

## Part 3 — Quick reference

### What to call what
| Placeholder | How to get the real value |
|---|---|
| `<FulfillmentFnName>` | `aws lambda list-functions --region us-east-1 --query "Functions[?contains(FunctionName,'FulfillmentFn')].FunctionName" --output text` |
| `<YOUR_AWS_ACCOUNT_ID>` | `aws sts get-caller-identity --query Account --output text` |
| `acct_...` | your test connected account id from `.env` |

### The flag, explained
- `--payload file:///tmp/idem-test.json` — use this file as the event body
- `--cli-binary-format raw-in-base64-out` — payload is plain JSON (omit and it errors)
- `/tmp/out1.json` — where the Lambda response is written; `cat` shows it

### Why the idempotency test uses `aws lambda invoke`, not curl
The fulfillment Lambda has **no URL** — EventBridge invokes it, not HTTP. So we
call it the way AWS does. (curl is only for `POST /create-payment-intent`, which
the browser already does during checkout.)

### Test cards
| Scenario | Card |
|---|---|
| Success | `4242 4242 4242 4242` |
| Generic decline | `4000 0000 0000 0002` |
| 3D Secure challenge | `4000 0027 6000 3184` |

Any future expiry, any CVC, any ZIP. Full list: https://docs.stripe.com/testing

---

## Length options
- **Short (3–4 min):** Acts 1–3 only (pay + event). The single strongest message.
- **Full (6–8 min):** all five acts.

## After recording — optional cleanup
- Turn the split off for a plain demo: blank `CONNECTED_ACCOUNT_ID`, restart.
- Tear down AWS when done rehearsing: `cd aws && npx cdk destroy`.
