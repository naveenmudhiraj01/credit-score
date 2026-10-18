import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrderToken, verifyOrderToken, maskEmail, maskMobile, formatDashboardOrder } from "./orderAuth.ts";
import { prisma } from "./prisma.ts";

test("orderAuth helper utilities", () => {
  const receipt = "ORD20261014CAD629";
  const email = "hima@gmail.com";

  // Token creation & verification
  const token = createOrderToken(receipt, email);
  assert.ok(token.startsWith(receipt + "."), "Token should start with receipt prefix");
  assert.equal(verifyOrderToken(receipt, email, token), true, "Valid token should verify");
  assert.equal(verifyOrderToken(receipt, "other@gmail.com", token), false, "Mismatched identity should fail");
  assert.equal(verifyOrderToken("ORD20261014OTHER1", email, token), false, "Mismatched receipt should fail");
  assert.equal(verifyOrderToken(receipt, email, null), false, "Null token should fail");

  // Masking helpers
  assert.equal(maskEmail("hima@gmail.com"), "h***a@gmail.com");
  assert.equal(maskEmail("john.doe@company.org"), "j***e@company.org");
  assert.equal(maskMobile("+919876543210"), "******3210");
  assert.equal(maskMobile("9876543210"), "******3210");

  // Format dashboard order (avoids sensitive secrets, derives deadline)
  const dummyOrder = {
    receipt,
    product: "Loan Assistance Service",
    amount: 19900,
    currency: "INR",
    status: "PAID",
    razorpayPaymentId: "pay_123456",
    paidAt: new Date("2026-10-14T10:00:00Z"),
    createdAt: new Date("2026-10-14T09:55:00Z"),
    reviewStartedAt: new Date("2026-10-14T11:00:00Z"),
    reviewDeadline: new Date("2026-10-17T10:00:00Z"),
    customerName: "Karan",
    customerEmail: "hima@gmail.com",
    customerMobile: "9876543210",
    reviewStatus: "IN_REVIEW",
  };
  const formatted = formatDashboardOrder(dummyOrder);
  assert.equal(formatted.orderId, receipt);
  assert.equal(formatted.customerName, "Karan");
  assert.equal(formatted.customerEmail, "h***a@gmail.com");
  assert.equal(formatted.customerMobile, "******3210");
  assert.equal(formatted.paymentId, "pay_123456");
  assert.equal(formatted.reviewStatus, "IN_REVIEW");
  assert.equal(formatted.reviewStartedAt.toISOString(), "2026-10-14T11:00:00.000Z");
  assert.equal(formatted.reviewDeadline.toISOString(), "2026-10-17T10:00:00.000Z");
  assert.deepEqual(
    formatted.timeline.find((step) => step.key === "review"),
    {
      key: "review",
      label: "Team review in progress",
      state: "current",
      detail: "Our team is reviewing your order.",
      at: "2026-10-14T11:00:00.000Z",
    },
  );
});

test("Customer dashboard formatter safely handles missing historical review timestamps", () => {
  const formatted = formatDashboardOrder({
    receipt: "ORD20261014OLD001",
    product: "Product A",
    amount: 19900,
    currency: "INR",
    status: "PAID",
    createdAt: new Date("2026-10-14T09:55:00Z"),
    paidAt: null,
    reviewStatus: "NOT_APPLICABLE",
  });

  assert.equal(formatted.reviewStartedAt, null);
  assert.equal(formatted.reviewDeadline, null);
});

test("Database order lookup for ORD20261014CAD629", async () => {
  const order = await prisma.paymentOrder.findUnique({
    where: { receipt: "ORD20261014CAD629" },
  });

  assert.ok(order, "Order ORD20261014CAD629 must exist in database");
  assert.equal(order.receipt, "ORD20261014CAD629");
  assert.equal(order.status, "PAID");
  assert.equal(order.customerName, "karan");
  assert.equal(order.customerEmail, "hima@gmail.com");
  assert.equal(order.amount, 19900);
});

test("Database non-existent order returns null without creating rows", async () => {
  const countBefore = await prisma.paymentOrder.count();
  const notFound = await prisma.paymentOrder.findUnique({
    where: { receipt: "ORD20261014000000" },
  });
  const countAfter = await prisma.paymentOrder.count();

  assert.equal(notFound, null, "Non-existent order should return null");
  assert.equal(countBefore, countAfter, "Lookup must be strictly read-only; no orders created");
});
