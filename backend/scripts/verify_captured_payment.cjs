const fs = require("node:fs");
const path = require("node:path");
const Razorpay = require("razorpay");
const { PrismaClient } = require("@prisma/client");
const crypto = require("node:crypto");

// Load .env
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const prisma = new PrismaClient();
const rzp = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function main() {
  console.log("=== INDEPENDENT PROVIDER & DATABASE VERIFICATION ===");
  const receipt = "ORD20261013AE2EDD";

  // 1. Query Database record
  console.log(`\n1. Querying Database record for receipt: ${receipt}...`);
  const dbOrder = await prisma.paymentOrder.findUnique({
    where: { receipt },
    include: { attempts: true },
  });
  console.log("  Database Order Details:");
  if (!dbOrder) {
    console.error("  Order NOT FOUND in DB!");
    return;
  }
  console.log(`    Receipt: ${dbOrder.receipt}`);
  console.log(`    Status: ${dbOrder.status}`);
  console.log(`    Amount: ${dbOrder.amount} paise`);
  console.log(`    Razorpay Order ID: ${dbOrder.razorpayOrderId}`);
  console.log(`    Razorpay Payment ID: ${dbOrder.razorpayPaymentId}`);
  console.log(`    Paid At: ${dbOrder.paidAt?.toISOString()}`);
  console.log(`    Review Status: ${dbOrder.reviewStatus}`);
  console.log(`    Review Deadline: ${dbOrder.reviewDeadline?.toISOString()}`);
  console.log(`    Email Status: ${dbOrder.emailStatus}`);
  console.log(`    Sheet Status: ${dbOrder.sheetStatus}`);
  console.log(`    Payment Attempts Count: ${dbOrder.attempts?.length}`);
  for (const a of dbOrder.attempts || []) {
    console.log(`      Attempt: id=${a.id}, payId=${a.razorpayPaymentId}, status=${a.status}, error=${a.error}`);
  }

  const paymentId = dbOrder.razorpayPaymentId;
  if (!paymentId) {
    console.log("  Order does not have a razorpayPaymentId associated yet.");
    return;
  }

  // Check SLA deadline exactly 72h
  if (dbOrder.paidAt && dbOrder.reviewDeadline) {
    const diffMs = dbOrder.reviewDeadline.getTime() - dbOrder.paidAt.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    console.log(`    Calculated SLA duration: ${diffHours} hours (Exact 72h: ${diffHours === 72})`);
  }

  // 2. Query Razorpay API directly for provider confirmation
  console.log(`\n2. Querying Razorpay API for payment: ${paymentId}...`);
  let rzpPayment = null;
  try {
    rzpPayment = await rzp.payments.fetch(paymentId);
    console.log("  Provider Payment Details:");
    console.log(`    Status: ${rzpPayment.status}`);
    console.log(`    Amount: ${rzpPayment.amount} paise (₹${rzpPayment.amount / 100})`);
    console.log(`    Currency: ${rzpPayment.currency}`);
    console.log(`    Order ID on Razorpay: ${rzpPayment.order_id}`);
    console.log(`    Method: ${rzpPayment.method}`);
    console.log(`    Captured: ${rzpPayment.captured}`);
  } catch (err) {
    console.log("  Razorpay API fetch notice:", err.error?.description || err.message);
  }

  // 3. Test authenticated webhook delivery
  console.log("\n3. Testing Authenticated Razorpay Webhook delivery...");
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "your_razorpay_webhook_secret";
  const webhookPayload = JSON.stringify({
    entity: "event",
    account_id: "acc_test",
    event: "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: rzpPayment || {
          id: paymentId,
          order_id: dbOrder.razorpayOrderId,
          amount: dbOrder.amount,
          currency: dbOrder.currency,
          status: "captured",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  });

  const webhookSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(webhookPayload)
    .digest("hex");

  const origPaidAt = dbOrder.paidAt.getTime();
  const origDeadline = dbOrder.reviewDeadline.getTime();

  // Send webhook request to running server
  const webhookRes = await fetch("http://127.0.0.1:3005/api/payments/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": webhookSignature,
      "x-razorpay-event-id": "evt_test_" + Date.now(),
    },
    body: webhookPayload,
  });

  const webhookData = await webhookRes.json();
  console.log(`  Webhook 1 HTTP Status: ${webhookRes.status}, Body: ${JSON.stringify(webhookData)}`);

  // Verify timestamps remain unchanged
  const dbAfterWebhook1 = await prisma.paymentOrder.findUnique({ where: { receipt } });
  console.log(`  paidAt unchanged: ${dbAfterWebhook1.paidAt.getTime() === origPaidAt}`);
  console.log(`  reviewDeadline unchanged: ${dbAfterWebhook1.reviewDeadline.getTime() === origDeadline}`);

  // Send duplicate webhook with identical event ID
  const dupEventId = "evt_dup_" + Date.now();
  const dupRes1 = await fetch("http://127.0.0.1:3005/api/payments/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": webhookSignature,
      "x-razorpay-event-id": dupEventId,
    },
    body: webhookPayload,
  });
  console.log(`  Webhook with Event ID ${dupEventId} HTTP Status: ${dupRes1.status}`);

  // Immediate retry of identical event ID
  const dupRes2 = await fetch("http://127.0.0.1:3005/api/payments/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": webhookSignature,
      "x-razorpay-event-id": dupEventId,
    },
    body: webhookPayload,
  });
  const dupData2 = await dupRes2.json();
  console.log(`  Duplicate Event ID Webhook HTTP Status: ${dupRes2.status}, Duplicate: ${dupData2.duplicate}`);

  const dbAfterDup = await prisma.paymentOrder.findUnique({ where: { receipt } });
  console.log(`  paidAt preserved: ${dbAfterDup.paidAt.getTime() === origPaidAt}`);
  console.log(`  reviewDeadline preserved: ${dbAfterDup.reviewDeadline.getTime() === origDeadline}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
