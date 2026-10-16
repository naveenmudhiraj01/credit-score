# Customer dashboard – backend requirements (not implemented in this ZIP)

The frontend dashboard (`/dashboard?order=ORD…`) is complete, but the backend was not part of the
supplied project, so server-side authorization and the extra data fields below could not be built or tested here.

## Gap found
`GET /api/payments/status?order=ORD…` is public and keyed only by the order ID.
- An order ID is **not** proof of ownership. IDs look like `ORD` + date + 6 hex characters (about 16M values per day), so they can be enumerated.
- That endpoint currently returns only: `orderId, status, amount, paymentId, paidAt, product, failureReason, retryable`. The dashboard therefore cannot show customer name, review status, review deadline or order history from it.
- Do **not** add those fields to this public endpoint.

## Smallest non-breaking secure design
1. **Per-order access token.** When `/api/payments/create` creates an order, generate a random 32-byte token, store only its hash on the order, and set the raw token in an `httpOnly; Secure; SameSite=Lax; Path=/api` cookie. (Never localStorage.)
2. **New read endpoint** `GET /api/orders/:id/dashboard`. Return data only when the cookie token matches the stored hash (constant-time compare). Otherwise return `404` (not 403) so order IDs cannot be probed. Rate-limit by IP.
3. **Other devices / returning customers.** Send a magic link by the existing email system containing the same kind of token; exchanging it sets the cookie. Orders created before this change have no token and keep the current limited public view until claimed.
4. Existing endpoints, `/order/:id`, webhooks, admin auth and payment verification stay unchanged.

## Response contract the frontend already understands (all optional)
```
order: {
  orderId, product, amount (paise), currency, status ("PAID" only after backend verification),
  paymentId, paidAt,
  customerName, customerEmail,          // email may be returned masked
  reviewStatus: "PENDING_REVIEW" | "RESPONDED" | "NOT_APPLICABLE",
  reviewDeadline                        // persisted once at first verified payment (paidAt + 72h); never recalculated
}
```
- If `reviewDeadline` is absent the frontend derives paidAt + 72h; a persisted value is preferred.
- "In Review" is not an existing status. Add it to the enum only if the business wants it.
- Never return: Razorpay order/signature, client IP, consent audit, team notes, tokens.
- **Order history** needs an authenticated customer scope (magic-link session). Return only orders for the authenticated email, each as `{orderId, product, createdAt, amount, status}`. The frontend has no history section until this exists.

## Support contact
Set `VITE_SUPPORT_EMAIL` in the frontend `.env`. When empty, the support card shows a neutral "contact details unavailable" message (nothing is invented) and a console warning is logged in dev builds.

## Tests to run once built
Wrong/missing cookie → 404; another customer's cookie → 404; paid order → full payload; pending/failed → never `PAID`;
refresh keeps the same `reviewDeadline`; webhook + verify still idempotent; old orders still load via `/order/:id`.
