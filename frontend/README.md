# Customer Onboarding – React + Tailwind frontend

Matches the "Frontend View Flow" design and talks to the Next.js backend (`backend-complete`).

Product link → in-app customer details → `/redirect` → Razorpay → success / pending / failed → (email + Sheets by backend) → Admin dashboard.

## Run

```bash
npm install
cp .env.example .env
npm run dev              # http://localhost:5173  (proxies /api -> http://localhost:3000)
```
Start the backend on port 3000 (`npm run dev` in the Next.js project) at the same time.

## Routes

| Route | Screen |
|---|---|
| `/products` (and `/`) | Product catalogue: search, category chips, sort, "Details" + "Buy Now" |
| `/products/:slug`, `/:slug` | Product landing page – "Get Started" opens the in-app details form |
| `/redirect?product=product-a` | Customer details → confirmation → Razorpay checkout |
| `/payment-success?order=ORD…` | 5. Payment success |
| `/payment-pending`, `/payment-failed` | Pending (auto-polls) / failed (Try Again) states |
| `/order/ORD…` | "View Order Details" receipt |
| `/dashboard?order=ORD…` | Customer dashboard (receipt, review status, next steps, support). See `BACKEND_REQUIREMENTS_customer_dashboard.md` |
| `/dashboard?order=ORD…` | Customer dashboard (receipt, review status, next steps, support). See `BACKEND_REQUIREMENTS_customer_dashboard.md` |
| `/admin/login`, `/admin` | 8. Dashboard (stats, search, filter, table, pagination) |
| `/admin/orders`, `/payments`, `/customers`, `/sheets`, `/settings` | Sidebar pages |

Screens 6 (email) and 7 (Google Sheets) are produced by the backend.

## Production

Serve the built `dist/` and the backend on the **same domain** (e.g. nginx: `/api/*` → Next.js, everything
else → `dist/index.html`). Same-origin is required because the admin cookie is `SameSite=Strict`.
Add Razorpay webhook: `https://yourdomain.com/api/payments/webhook`.

## Products & payment (from the reference app)

- Catalogue data: `src/data/products.json` (30 products imported from the reference `db.json`, plus Product A). Prices are treated as **₹ INR**.
- Payment uses the backend flow (`/api/payments/create` → Razorpay checkout → `/api/payments/verify`), **not** the reference's
  client-only `initiatePayment`: the browser sends `productId` and customer details, never the amount. Pricing lives in the backend `lib/catalog.ts`.
- **Backend patch required** (see `backend-patch.zip`): copy `lib/catalog.ts` and `app/api/payments/create/route.ts` over your backend.
  When you change a price/product, edit it in both `products.json` (display) and `lib/catalog.ts` (what is charged).
- Customer name, email, and mobile are collected in the in-app form and passed to the backend when the payment order is created.
- The reference's Redux cart/login/seller dashboards were not ported: the backend creates one product per order.

## Adding another product
Add it to `products.json` and `lib/catalog.ts` (same slug).
Add an entry to `PRODUCTS` in `src/config.js` (its URL becomes `/<slug>`). The backend currently has a single
product (`lib/razorpay.ts → PRODUCT`), so amounts for new products must be added there too.
