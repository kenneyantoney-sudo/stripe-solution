---
name: build-from-spec
description: Build or modify FoodNow code strictly from the specs in /specs. Use when adding a feature, changing behavior, or starting implementation — ensures spec is updated first, then code, then acceptance criteria are checked. Triggers on "implement", "build from spec", "add a requirement", "change behavior".
---

# Build From Spec (spec-driven AI DLC)

This project is **spec-driven**: `/specs` is the source of truth, not the code.
Follow this loop for any change.

## The loop
1. **Read the relevant spec first.** Start with `specs/00-overview.md`, then the
   specific file (`01-functional-requirements.md`, `02-non-functional-requirements.md`,
   `03-architecture.md`). If the request isn't covered, the spec is incomplete.
2. **Update the spec BEFORE the code.** If behavior is changing, edit the spec
   (add/modify an `FR-` or `NFR-` item) and a matching `AC-` acceptance check in
   `specs/04-acceptance-criteria.md`. Confirm the spec change with the user.
3. **Implement against the spec.** Keep money logic in `src/core` (shared by both
   paths). Touch `local/` and `aws/` only for plumbing. Comment every non-obvious line.
4. **Honor the non-negotiables** (from `02-non-functional-requirements.md`):
   - Test mode only; reject `sk_live_`.
   - Secret never in client code or git.
   - Amount set on the server; browser never trusted for price.
   - Event-driven fulfillment; verify signature locally; idempotent on `event.id`.
5. **Run `verify-demo`** to check acceptance criteria before reporting done.

## Guardrails
- Never hardcode a Stripe key or the AWS account id into committed source.
- Never commit `.env` or `sample.env`.
- Keep dependencies minimal — every dependency must be explainable in an interview.
- If a change would break a `local → AWS` mapping in `03-architecture.md`, flag it.
