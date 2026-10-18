# Unified Customer Onboarding & Order Tracking Application

A unified, production-ready full-stack application built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Prisma ORM**, and **MySQL**.

This project consolidates the former React + Vite frontend and Next.js backend into a single cohesive repository, serving the customer portal, administrative dashboard, and backend APIs from the same origin.

---

## Architecture Overview

```text
order-tracking-workflow/
├── app/
│   ├── layout.tsx                   # Root HTML shell, fonts, branding & styling
│   ├── page.tsx                     # Landing page (FFA FINSERV Loan Assistance)
│   ├── products/
│   │   ├── page.tsx                 # Products catalog overview
│   │   └── [slug]/page.tsx          # Product detail view
│   ├── [slug]/page.tsx              # Root product slug alias (/product-a)
│   ├── redirect/page.tsx            # Step 1: Registration Form -> Step 2: Payment Gateway
│   ├── register/page.tsx            # Registration route alias
│   ├── payment-success/page.tsx     # Payment confirmation & verified order summary
│   ├── payment-pending/page.tsx     # Polling state while bank confirms transaction
│   ├── payment-failed/page.tsx      # Failure explanation & retry options
│   ├── order/[id]/page.tsx          # Standalone printable receipt
│   ├── dashboard/page.tsx           # Customer Order Tracking Dashboard (72-hr review timeline)
│   ├── my-orders/page.tsx           # Customer orders lookup alias
│   ├── admin/
│   │   ├── layout.tsx               # Admin layout with secure session guard & sidebar
│   │   ├── page.tsx                 # Admin dashboard overview & stats
│   │   ├── orders/page.tsx          # Order management & status drawer
│   │   ├── payments/page.tsx        # Verified payments ledger
│   │   ├── customers/page.tsx       # Aggregated customer transaction history
│   │   ├── sheets/page.tsx          # Google Sheets sync status & retry controls
│   │   └── settings/page.tsx        # Dynamic service-fee configuration
│   ├── api/
│   │   ├── admin/...                # Admin authentication, review, retry & settings APIs
│   │   ├── customers/check-email    # Non-blocking customer email existence check
│   │   ├── health                   # Service health check endpoint
│   │   ├── orders/[receipt]/dashboard # Public order dashboard API with privacy mask
│   │   ├── payments/...             # Payment creation, verification & webhook handlers
│   │   └── webhooks/email           # SMTP delivery webhook listener
│   └── globals.css                  # Global styles, Tailwind directives & print rules
├── components/                      # Reusable UI components, modals, shells & badges
├── data/                            # Product catalog definitions and session state
├── hooks/                           # Custom React hooks (useOrders, useServiceFee)
├── lib/                             # Core business logic, validation, email, review SLA, payments
├── prisma/                          # Prisma schema and database migrations
├── public/                          # Static assets (images, logos)
├── scripts/                         # Maintenance and seed scripts
├── .env.example                     # Environment template with all required keys
├── next.config.mjs                  # Next.js configuration
├── package.json                     # Unified dependencies, scripts & test suites
├── postcss.config.mjs               # PostCSS configuration
├── tailwind.config.js               # Tailwind CSS theme, colors and responsive breakpoints
└── tsconfig.json                    # TypeScript compiler configuration
```

---

## Features

- **Unified Origin**: Single domain for frontend customer UI, admin portal, and REST API endpoints.
- **Fast 2-Step Customer Flow**:
  1. *Step 1 — Application*: Real-time validated input (Aadhaar name, 18+ DOB, Indian mobile, sanitized email, mandatory consent modal).
  2. *Step 2 — Checkout*: Integrated Razorpay modal checkout with server-side HMAC signature verification.
- **Customer Order Tracking Dashboard**:
  - Live lookup with privacy protections (phone/email verification when accessed across sessions).
  - 72-Hour review SLA countdown timer with dynamic polling.
  - Printable verified payment receipt.
- **Full Admin Suite**:
  - Secure password-authenticated admin session.
  - Interactive drawer to review applications, approve, reject, or request additional information.
  - One-click Google Sheets re-sync for ledger entries.
  - Dynamic service-fee editor (whole rupee bounds ₹1 to ₹50,000).
- **Comprehensive Test Suite**: 92 automated unit and integration tests covering all critical paths.

---

## Getting Started

### 1. Prerequisites

- **Node.js**: v20 or higher (v24 LTS recommended)
- **MySQL**: 8.0+ running locally or in cloud
- **Razorpay**: Test or Live API key pair

### 2. Installation

Install all unified dependencies from the project root:

```bash
npm install
```

### 3. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and configure your settings:

```env
# Database
DATABASE_URL="mysql://USER:PASSWORD@localhost:3307/customer_onboarding"

# Razorpay
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="your_razorpay_secret"
RAZORPAY_WEBHOOK_SECRET="your_webhook_secret"

# Admin Authentication (Generate session secret with: openssl rand -base64 32)
ADMIN_PASSWORD="your_admin_password"
ADMIN_SESSION_SECRET="your_32_byte_session_secret"

# Branding & Public Contacts
NEXT_PUBLIC_BRAND_NAME="FFA FINSERV"
NEXT_PUBLIC_ADMIN_EMAIL="admin@example.com"
NEXT_PUBLIC_SUPPORT_EMAIL="support@example.com"
```

### 4. Database Setup & Prisma Generation

Generate the Prisma Client:

```bash
npm run prisma:generate
```

Push or apply schema migrations:

```bash
npx prisma db push
```

### 5. Running the Application Locally

Start the Next.js development server:

```bash
npm run dev
```

The application will be accessible at:
- **Customer Portal**: `http://localhost:3000`
- **Customer Registration**: `http://localhost:3000/redirect` or `http://localhost:3000/register`
- **Customer Dashboard**: `http://localhost:3000/dashboard`
- **Admin Portal**: `http://localhost:3000/admin`
- **Health Check**: `http://localhost:3000/api/health`

---

## Testing & Quality Assurance

### Run Unit & Integration Tests (92 Tests)

```bash
npm test
```

### TypeScript Validation

```bash
npm run typecheck
```

### Production Build Verification

```bash
npm run build
```

---

## Production Deployment

### Building & Starting for Production

```bash
npm run build
npm run start
```

### Razorpay Webhook Configuration

In your Razorpay Dashboard, set the Webhook URL to:
```text
https://your-domain.com/api/payments/webhook
```
Select the following events:
- `payment.captured`
- `payment.failed`
- `order.paid`

Ensure the secret entered matches `RAZORPAY_WEBHOOK_SECRET` in `.env`.
