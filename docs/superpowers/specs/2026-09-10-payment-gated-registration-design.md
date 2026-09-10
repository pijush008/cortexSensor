# Payment-Gated Registration — Design

**Date:** 2026-09-10
**Status:** Approved for planning
**Scope:** `backend/src/modules/{auth,billing}`, `frontend/src/app/(auth)/register`

## Goal

Complete the sign-up flow end to end:

1. Registering opens a payment page.
2. A confirmed payment activates the organization.
3. The new admin receives a welcome email naming their plan and its expiry.
4. That admin creates projects, and creates contractor and authority users who
   can sign in but see only the project they are attached to.

## What already exists

Most of the requested behaviour is built. Establishing this first keeps the plan
honest about what is actually new work.

| Behaviour | Where | State |
|---|---|---|
| Project scoping by role | `projects.service.ts:44-46` | Works. contractor sees `contractorId` matches, authority `authorityId`, admin `createdBy`, superadmin all |
| Cross-tenant isolation | `test/isolation.test.ts` | 9 tests covering projects, devices, reports, exports, telemetry |
| Admin creates contractor/authority | `POST /register/:userType` | Works, session-authed; org taken from session, never the body |
| Login blocked until paid | `auth.service.ts:96` | Works |
| Webhook → activate | `billing.service.ts:219-239` | Works; sets `active`, `currentPeriodEnd`, calls `activateOwnerAfterPayment` |
| Signature verification | `provider.ts:60`, `razorpay.provider.ts:70` | Works; HMAC over the raw body, constant-time |
| Plans with prices and expiry | `billing_plans`, `subscriptions.currentPeriodEnd` | 4 plans seeded; Starter = 499900 paise |

**Genuinely missing:** the checkout call itself, the payment page, and the
welcome email.

## Decisions taken

| Decision | Choice |
|---|---|
| When the user row is created | At registration, `pending`; the verified webhook activates it. Unchanged from today |
| Payment provider | Razorpay **test mode**, real integration |
| Welcome email delivery | Real SMTP via Gmail app password |
| Amount | The existing Starter plan, changed later by editing the row |

## 1. The blocker: checkout needs a session that cannot exist yet

`POST /billing/checkout` is guarded by `authenticate` + `requireTenant` +
`requirePermission("BILLING_MANAGE")`. A newly registered admin cannot log in —
`auth.service.ts:96` refuses until payment confirms. They need a session to pay
and a payment to get a session.

Separately, that route is a **stub**: it returns 501 with the message
"Checkout requires a payment provider adapter." `PaymentProvider` declares only
`isConfigured`, `verifySignature` and `parseEvent` — there is no order creation
anywhere.

**Resolution.** Registration returns a short-lived signed **checkout token**,
following the existing purpose-scoped token pattern in `utils/jwt.ts`
(`signPasswordResetToken` / `verifyPasswordResetToken`):

- Claims: `subscriptionId`, `purpose: "checkout"`, 30-minute expiry.
- Verified by a new `verifyCheckoutToken`, which rejects any token whose
  `purpose` is not `checkout`, so an access token cannot be substituted.
- Consumed by a new **unauthenticated** `POST /billing/checkout/start`.

The token authorises exactly one thing: starting payment for one subscription.
It carries no session, grants no read access, and expires. The existing
authenticated `/billing/checkout` stays as-is for in-app renewals.

## 2. Provider gains order creation

Extend the interface:

```ts
createOrder(input: {
  amountPaise: number;
  currency: string;
  receipt: string;
}): Promise<{ orderId: string; amountPaise: number; currency: string }>;
```

`RazorpayProvider` implements it against the Orders API using
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. `GenericHmacProvider` throws
"provider does not support checkout", so an unconfigured deployment still
refuses rather than pretends — the property the billing routes already hold.

`/billing/checkout/start` then returns `{ orderId, keyId, amountPaise,
currency, planName }`. `keyId` is the publishable key; the secret never leaves
the server.

## 3. Amount

A new `DEFAULT_SIGNUP_PLAN` config value, defaulting to `starter`. The service
reads `billing_plans` by that code and uses `priceMonthly` as the order amount.

Changing the price later is an UPDATE on that row. No code change and no
redeploy, which is what "set any amount for now, I will update it later"
requires.

## 4. Frontend flow

`register/page.tsx` today ends on a static instruction list. It becomes:

1. Submit registration → response carries `checkoutToken`.
2. Call `/billing/checkout/start` → `{ orderId, keyId, amountPaise }`.
3. Load Razorpay `checkout.js` and open the modal.
4. On modal close, move to a **"confirming payment"** state that polls
   `GET /billing/entitlement` until the subscription reads `active`.

Step 4 is deliberate. Razorpay's browser callback is **not** treated as proof of
payment; `billing.routes.ts:30-32` already states the rule — "a browser coming
back from a checkout page proves nothing — it can be replayed or forged". The
browser only learns *when* activation happened; the webhook is what causes it.

The poll needs a bound: stop after 2 minutes and show "payment is still being
confirmed — you will receive an email", because a webhook can be delayed and an
endless spinner is worse than a clear hand-off.

## 5. Welcome email

Sent from the activation branch in `billing.service.ts` immediately after
`activateOwnerAfterPayment(subscription.adminId)` at line 239 — the single place
where a subscription becomes active, so no other path can activate an account
silently.

Contents: company name, plan name, amount paid, **valid till**
(`currentPeriodEnd`, already set on the same update at line 229), and a sign-in
link.

Failure to send must **not** fail the webhook. Razorpay retries non-2xx
responses, and retrying a delivered activation because an SMTP hiccup occurred
would re-run the activation path. Send failures are logged, matching how
`sendEmail` is already treated in the registration path.

## 6. Contractor and authority users

Working today; one addition. When an admin creates a member, accept an optional
`projectId` and set `projects.contractorId` / `projects.authorityId` in the same
transaction, so a member is never briefly created with access to nothing.

**Known limitation, deliberately not changed:** an admin sees projects they
created (`createdBy`), not every project in the organization. With one admin per
organization these are identical. If a second admin should see the first's
projects, the scope test becomes tenant membership rather than `createdBy` —
a larger change to make separately.

## 7. Testing the webhook locally

Razorpay cannot POST to `localhost`. Two paths, both supported:

- **Tunnel:** `cloudflared tunnel --url http://localhost:3001`, then register
  that URL in the Razorpay dashboard. Exercises the real delivery path.
- **Dev CLI:** a script that builds a `payment.succeeded` payload for a given
  subscription, signs it with `RAZORPAY_WEBHOOK_SECRET`, and POSTs it to the
  local webhook. Exercises the same verification and activation code without a
  tunnel. Refuses to run when `NODE_ENV=production`.

## 8. Configuration required

None of this functions without credentials that are currently absent. `.env`
has no billing keys at all, and `GMAIL_ACCOUNT` / `EMAIL_FROM` are empty
strings — the backend logs "outbound mail is not configured" on every
registration today.

```
BILLING_ENABLED=true
BILLING_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…
DEFAULT_SIGNUP_PLAN=starter
GMAIL_ACCOUNT=…
GMAIL_PASSWORD=…            # 16-character app password, needs 2FA on the account
EMAIL_FROM=…
```

These are added to `backend/.env` by the operator, never committed and never
pasted into a chat transcript. `.env.example` gains the two new keys with
placeholder values.

## 9. Sequencing

| # | Phase | Gate |
|---|---|---|
| 1 | `createOrder` on the provider interface + Razorpay implementation | Unit tests with a stubbed HTTP client |
| 2 | Checkout token (`sign`/`verify`) + `POST /billing/checkout/start` | Test: wrong purpose rejected, expired rejected, valid returns an order |
| 3 | Welcome email on activation | Test: activation sends once; a send failure does not fail the webhook |
| 4 | Dev webhook replay CLI | Manual: run it, subscription goes active |
| 5 | Frontend checkout + confirming state | Manual run through with Razorpay test cards |
| 6 | Optional `projectId` when creating a member | Test: member sees that project and no other |

## 10. Verification

- `npx tsc --noEmit` at 0 and the backend suite green after every phase.
- A new `test/registration-payment-flow.test.ts` covering register → pending →
  signed webhook → active → email queued.
- The existing `isolation.test.ts` must stay green: it is the guard that a
  contractor cannot reach another project.
- End to end by hand with a Razorpay test card, once credentials exist.

## 11. Out of scope

- Changing when the user row is created.
- Plan selection at sign-up; every registration uses `DEFAULT_SIGNUP_PLAN`.
- Invoices, proration, upgrades, cancellation UI. The lifecycle handlers exist;
  no UI is added for them here.
- Letting a second admin see the first admin's projects (§6).
- The register rate-limit bug: buckets key on the frontend container's IP, so
  all users share one 5-per-hour limit. Real, separate, fixed on its own.
