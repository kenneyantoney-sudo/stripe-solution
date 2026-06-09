---
name: verify-demo
description: Verify the FoodNow Stripe demo against its acceptance criteria (specs/04-acceptance-criteria.md). Use before a rehearsal or interview to confirm both the local path and the AWS synth are healthy. Triggers on "verify the demo", "is the demo ready", "check acceptance criteria", "pre-interview check".
---

# Verify Demo

Walk the acceptance criteria in `specs/04-acceptance-criteria.md` and report a
pass/fail checklist. Do NOT deploy to AWS or charge real money — this is test
mode and read-only checks plus a guided local run.

## Automated checks (safe to run)
1. **Secrets hygiene (AC-7)**
   - `git ls-files | grep -E '(^|/)\.env$|sample\.env'` → must be EMPTY.
   - `.gitignore` contains `.env` and `sample.env`.
   - `grep -rn "sk_test_\|sk_live_" src local aws --include=*.js --include=*.ts`
     → must find NO real keys (placeholders in `.env.example` are fine).
2. **Local server boots (AC-1)**
   - `npm install` then boot with dummy env vars; expect the "running" log line.
3. **AWS synth (AC-6)**
   - `cd aws && npx cdk synth --quiet` → succeeds.
   - `cd aws && npx cdk synth --quiet -c partnerEventBusName=aws.partner/stripe.com/ed_test`
     then confirm the template contains a `payment_intent.succeeded` rule.

## Guided manual checks (tell the user to do these)
4. **Happy path (AC-1):** with real test keys in `.env`, run `npm start` and, in
   another terminal, `stripe listen --forward-to localhost:4242/webhook`. Pay with
   `4242 4242 4242 4242`. Expect `FULFILL ORDER ...` in the server terminal.
5. **Idempotency (AC-4):** `stripe events resend <evt_id>` → expect
   "Duplicate event ... ignored", no second FULFILL.
6. **Connect split (AC-5):** set `CONNECTED_ACCOUNT_ID`, restart, pay, and inspect
   the PaymentIntent in the Stripe Dashboard for a 20% application fee.

## Output
Print a checklist mapping each `AC-#` to PASS / FAIL / MANUAL, with the exact
command to fix any failure.
