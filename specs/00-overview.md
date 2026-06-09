# FoodNow Payments — Spec Overview

> Spec-driven development: these specs are the **source of truth**. Code is
> generated and reviewed against them. If behavior and spec disagree, the
> spec wins (update the spec first, then the code).

## Problem
FoodNow is a food-delivery marketplace on AWS. A customer pays once. The
platform retains a fee; the restaurant and driver get paid. We must:

- Charge a **server-set** amount (never trust the browser for price).
- Treat **Stripe as the system of record**.
- Run **fulfillment off events**, not off the browser redirect.
- Be **idempotent** so a duplicate/replayed event never double-fulfills.
- Keep secrets out of code (env locally, Secrets Manager on AWS).
- **Test mode only.**

## Two runnable paths, one core
| | Path A (local) | Path B (AWS) |
|---|---|---|
| API | Express route | API Gateway + Lambda |
| Events | `stripe listen` → `/webhook` | Stripe → **EventBridge** (native) |
| Idempotency | in-memory Set | DynamoDB conditional write |
| Secret | `.env` | Secrets Manager |

The **money logic is shared** (`src/core`). Only the plumbing differs.

## Spec index
- [01-functional-requirements.md](01-functional-requirements.md)
- [02-non-functional-requirements.md](02-non-functional-requirements.md)
- [03-architecture.md](03-architecture.md)
- [04-acceptance-criteria.md](04-acceptance-criteria.md)
