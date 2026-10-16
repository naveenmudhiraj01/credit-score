# Order-tracking workflow — implementation report

Scope: make the customer dashboard's **"What happens next?"** timeline come from the backend/database, driven by explicit admin actions and the real email-notification state.

## 1. Architecture found (from the source, not assumed)

| Area | What exists |
|---|---|
| Backend | Next.js 15 (App Router) API routes, TypeScript, Prisma 5 + **MySQL** (`customer_onboarding`), Razorpay, nodemailer (SMTP), Google Sheets sync. No `prisma/migrations`; schema changes are applied with additive SQL scripts in `scripts/`. |
| Frontend | Separate Vite + React + Tailwind SPA (proxies `/api` to the Next backend). The backend also ships its own older Next pages (`app/admin`, `app/my-orders`, `app/register`, …) — a duplicate UI; the Vite SPA is the one wired to the new workflow. |
| Payment | `/api/payments/create` → Razorpay checkout → `/api/payments/verify` (HMAC signature) and `/api/payments/webhook`. **Only `finalizePayment()` can set an order `PAID`**: it re-fetches the payment from Razorpay, checks order id/amount/currency, captures if needed, then in one transaction sets `PAID`, `paidAt`, a 72h `reviewDeadline` and `reviewStatus=PENDING_REVIEW`. Webhooks are deduplicated by `WebhookEvent.id`; the `updateMany(status != PAID)` makes repeats no-ops. `reconcileOrder()` heals missed callbacks. |
| Email | `EmailNotification` table, unique `(orderId, emailType)`, `DeliveryStatus` PENDING/SENDING/**ACCEPTED**/DELIVERED/BOUNCED/FAILED. `sendEmailNotificationAtomic()` claims a row as SENDING (compare-and-set), never re-sends an ACCEPTED/DELIVERED one, and treats an SMTP handoff as ACCEPTED, not DELIVERED. `/api/webhooks/email` upgrades to DELIVERED/BOUNCED. |
| Admin auth | One shared password → HMAC-signed `admin_session` cookie (8h). `adminGuard()` on every `/api/admin/*`. |
| Customer ownership | `GET /api/orders/:id/dashboard` needs an order token cookie (or admin session), obtained by `POST` with the registered email/mobile. |

## 2. Gaps / bugs found (root causes)

1. **No workflow.** `/review` let an admin set *any* status with no transition rules; the UI only had "Record team response" → `RESPONDED`. No start/approve/reject/request-info; `IN_REVIEW`/`CLOSED` existed in the enum but nothing used them properly.
2. **No customer outcome email.** Nothing was sent when a review finished, so the dashboard's last step could never reflect a real notification; the frontend hard-coded step 4 as "never done".
3. **Timeline was derived in the browser** from two fields.
4. **No polling** on the dashboard (only the payment page polled).
5. **Security:** `orderAuth.ts` had a hard-coded fallback signing secret (forgeable order tokens if env was missing); the verification endpoint (email/phone guess) had **no rate limit**.
6. SLA counters ignored `IN_REVIEW`.
7. `scripts/run_sandbox_verification.cjs` encoded the old "POST notes → RESPONDED" behaviour.

## 3. What changed

**State machine** (`lib/reviewWorkflow.ts`, pure + tested)

```
PENDING_REVIEW --start--> IN_REVIEW --approve-------> APPROVED        (+email, message optional)
                                    --reject--------> REJECTED        (+email, message required)
                                    --request_info--> INFO_REQUESTED  (+email, message required)
INFO_REQUESTED --resume--> IN_REVIEW                                   (explicit admin action)
```
Legacy `RESPONDED`/`CLOSED`/`NOT_APPLICABLE` cannot be actioned. Unpaid orders cannot be actioned. Opening an order never changes anything.

**Admin API** `POST /api/admin/orders/:receipt/review` body `{ action, message?, respondedBy? }` (`lib/reviewActions.ts`): validates the transition, writes with **compare-and-set** (`WHERE reviewStatus = <validated state>`), and in the **same transaction** queues the outcome notification as `PENDING` (so a crash cannot lose it). After commit it attempts the send; the decision is never undone by an email failure. Response includes the notification state and `allowedActions`.
`POST …/retry` gained `action: "review_email"` (retries the notification for the *current* decision; refuses if already ACCEPTED/DELIVERED; stale retries for a superseded decision are skipped).

**Customer API** `GET/POST /api/orders/:receipt/dashboard` now returns a server-computed `timeline` (4 steps with `state`, `detail`, `at`), `emailDelivery`, and `customerMessage` (the text that was emailed; no internal reviewer data). Step rules (`lib/orderTimeline.ts`):
1. *Payment received and verified* — done only when `status = PAID` (set only by server-side provider verification); pending → current; failed → failed.
2. *Order submitted for review* — done when a persisted review record exists (written in the same transaction as `PAID`).
3. *Team review in progress* — upcoming until an admin **starts** it; current while `IN_REVIEW`; "action needed" while `INFO_REQUESTED`; done after a decision.
4. *Customer updated by email* — mirrors the outcome notification: preparing → **accepted (sent, delivery not confirmed)** → done **only on DELIVERED**; failed on FAILED/BOUNCED.

**Frontend** renders the backend timeline (no inference), adds the new states/badges, shows the customer message, and **polls every 20 s** while the tab is visible (stops for failed payments or a final decision whose email is DELIVERED). Admin drawer: Start / Resume / Approve / Reject / Request information with confirm dialogs, message box, outcome-email status and **Retry email**.

**Hardening:** no public fallback signing secret in production; failure limiter on the email/phone verification (5 per IP+order, 15 per order / 15 min, per instance).

## 4. Database migration (additive, idempotent)

`prisma/schema.prisma` + `scripts/migrate_review_workflow.cjs`:
- `PaymentOrder.reviewStatus` enum += `APPROVED`, `REJECTED`, `INFO_REQUESTED`
- `EmailNotification.emailType` enum += `REVIEW_APPROVED`, `REVIEW_REJECTED`, `REVIEW_INFO_REQUESTED`
- `PaymentOrder.reviewStartedAt DATETIME(3) NULL`, `reviewStartedBy VARCHAR(120) NULL`

Existing columns/rows are untouched (existing enum values are kept in place; new ones appended). Reused existing fields: `teamRespondedAt/By` (decision time/reviewer), `teamResponseNotes` (message to customer), `reviewDeadline`, the `EmailNotification` table.

## 5. Setup steps (manual)

1. **Back up the database.**
2. `cd backend && npm install`
3. `CONFIRM_BACKUP=yes node scripts/migrate_review_workflow.cjs`
4. `npx prisma generate` (restart the server)
5. Make sure `ADMIN_SESSION_SECRET` (or `ORDER_SESSION_SECRET`) is set in production. No other new env vars. Your `.env` files were not touched.
6. Frontend: `cd frontend && npm install && npm run build`.
7. For *Delivered* (not just *Accepted*) to ever appear, point your email provider's delivery webhooks at `/api/webhooks/email` (that route already exists). With plain SMTP only, step 4 will honestly stay at "sent, delivery not confirmed".

## 6. Tests

Run in this environment:
- Backend `tsc --noEmit`: clean. Backend `next build`: all routes compile (incl. the new ones).
- Backend tests: **22 new tests pass** (`lib/review_workflow.test.mjs`) covering: allowed/invalid transitions, required messages, unpaid orders, explicit-start rule, atomic decision + notification, concurrent double-submit (exactly one wins), repeat info-request cycle, timeline for every payment/review/email state, ownership (own token OK, other customer's token rejected, admin OK, forged admin cookie rejected), fail-closed secret, rate limiter, outcome-email idempotency (repeat/concurrent sends → one email), SMTP failure → FAILED then retry sends once, stale retry skipped, ACCEPTED never reported as DELIVERED.
  Full backend suite: 65 of 67 pass. The 2 failures are the *existing* "Database order lookup…" tests that need a live MySQL; they failed identically before my changes.
- Frontend: 16/16 unit tests pass; production build passes; rendered the timeline/status card/badges to HTML for every state and asserted output.

**Not run here (no MySQL, no Prisma engine binary, no Razorpay/SMTP — the sandbox blocks `binaries.prisma.sh`):**
the migration script, live API calls against a real database, a real Razorpay payment, real SMTP delivery, and a browser end-to-end click-through. The transactional logic was exercised against an in-memory fake of the Prisma calls it uses, not against MySQL. Please run the migration on a copy first and walk the scenarios below once.

Manual acceptance check (≈10 min): pay in Razorpay test mode → dashboard shows steps 1–2 done, step 3 not started → admin opens the order (nothing changes) → Start review → dashboard flips to "In progress" within ~20 s → Approve/Reject/Request info → email arrives, step 4 shows "sent, not yet confirmed" → disable SMTP and repeat to see FAILED + Retry → refresh/logout/login: statuses persist.

## 7. Known limitations / decisions I need from you

- **Reviewer identity is self-declared.** Admin login is one shared password, so "who reviewed" is a free-text name (default `admin`), not an authenticated identity. Per-admin accounts are a separate change.
- **"Request information" loop:** I assumed the customer replies by email and an admin presses **Resume review**. If you want an in-app reply/upload, that needs a new endpoint and table.
- **Rejected orders:** only an email is sent; no refund logic (not present in your codebase). Tell me if rejection should trigger a Razorpay refund.
- **No scheduler exists**, so a notification that failed is retried by an admin ("Retry email"), not automatically. A cron calling the same `sendReviewOutcomeEmailOnce()` would add auto-retry.
- Customer order tokens are deterministic HMACs (30-day cookie, not revocable). Not changed, to avoid logging customers out; worth moving to per-session tokens later.
- The in-memory rate limiter is per server instance; use an edge/WAF limit if you run several instances.
- `BACKEND_REQUIREMENTS_customer_dashboard.md` in the frontend is now outdated (it predates this backend); it's safe to delete.
- Existing orders: `PAID` orders already `PENDING_REVIEW` can be started normally; historical `NOT_APPLICABLE` orders stay out of the workflow.
