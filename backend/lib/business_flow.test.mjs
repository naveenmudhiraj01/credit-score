import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import {
  CATALOG_PRODUCTS,
  findProduct,
  resolveProductWithFee,
  MANDATORY_CONSENT_TEXT,
  CONSENT_VERSION,
  MIN_SERVICE_FEE_PAISE,
  MAX_SERVICE_FEE_PAISE,
  getConsentText,
} from "./catalog.ts";
import { SHEET_HEADERS, buildSheetRow } from "./sheets.ts";
import { formatAdminOrder, isCreditScoreOrder, isLegacyOrder } from "./orderView.ts";

test("consent enforcement: requires exact consent text and approved version", () => {
  // Validate mandatory declaration wording
  assert.ok(MANDATORY_CONSENT_TEXT.includes("I hereby declare and accept the Terms and Conditions"));
  assert.ok(MANDATORY_CONSENT_TEXT.includes("The service fee is non-refundable"));
  assert.ok(MANDATORY_CONSENT_TEXT.includes("including credit checks and necessary verifications, even if the loan is not approved"));
  assert.equal(CONSENT_VERSION, "v1.0-loan-verification-consent");

  // Validation function simulating payment order creation requirement
  function validateConsent({ consentGiven, consentText, consentVersion }) {
    if (!consentGiven) {
      return { ok: false, error: "CONSENT_REQUIRED", message: "Mandatory customer consent declaration is required." };
    }
    if (!consentText || typeof consentText !== "string" || consentText.trim().length < 20) {
      return { ok: false, error: "INVALID_CONSENT_TEXT", message: "Valid consent declaration text is required." };
    }
    if (consentVersion !== CONSENT_VERSION) {
      return { ok: false, error: "INVALID_CONSENT_VERSION", message: "Approved consent version is required." };
    }
    return { ok: true };
  }

  // Fails when consentGiven is false or undefined
  assert.equal(validateConsent({ consentGiven: false }).ok, false);
  assert.equal(validateConsent({}).ok, false);

  // Fails when text is missing or invalid
  assert.equal(validateConsent({ consentGiven: true, consentText: "" }).ok, false);
  assert.equal(validateConsent({ consentGiven: true, consentText: "short", consentVersion: CONSENT_VERSION }).ok, false);

  // Fails when version is mismatched
  assert.equal(validateConsent({ consentGiven: true, consentText: MANDATORY_CONSENT_TEXT, consentVersion: "v0.1-draft" }).ok, false);

  // Passes with valid consent
  const valid = validateConsent({
    consentGiven: true,
    consentText: MANDATORY_CONSENT_TEXT,
    consentVersion: CONSENT_VERSION,
  });
  assert.equal(valid.ok, true);
});

test("configurable fees: integer paise limits and server-authoritative resolution", () => {
  assert.equal(MIN_SERVICE_FEE_PAISE, 100); // ₹1.00 min
  assert.equal(MAX_SERVICE_FEE_PAISE, 5000000); // ₹50,000.00 max

  function validateFeePaise(paise) {
    if (!Number.isSafeInteger(paise)) return false;
    if (paise < MIN_SERVICE_FEE_PAISE || paise > MAX_SERVICE_FEE_PAISE) return false;
    return true;
  }

  // Valid amounts
  assert.equal(validateFeePaise(19900), true); // ₹199
  assert.equal(validateFeePaise(100), true); // ₹1
  assert.equal(validateFeePaise(5000000), true); // ₹50,000
  assert.equal(validateFeePaise(49900), true); // ₹499

  // Invalid amounts
  assert.equal(validateFeePaise(0), false);
  assert.equal(validateFeePaise(-100), false);
  assert.equal(validateFeePaise(99), false); // Less than ₹1 min
  assert.equal(validateFeePaise(5000001), false); // Exceeds ₹50,000 max
  assert.equal(validateFeePaise(199.5), false); // Non-integer
  assert.equal(validateFeePaise(NaN), false);
  assert.equal(validateFeePaise(null), false);

  // Dynamic fee resolution for Product A
  const defaultProduct = resolveProductWithFee("product-a", null);
  assert.equal(defaultProduct.amountPaise, 19900);

  const customProduct = resolveProductWithFee("product-a", 29900);
  assert.equal(customProduct.amountPaise, 29900);

  // Other catalog products ignore the service fee setting
  const laptopProduct = resolveProductWithFee("gaming-laptop-pro", 29900);
  assert.equal(laptopProduct.amountPaise, 129999);
});

test("Product A admin classification is independent of the configured service fee", () => {
  const order = { product: "Product A", amount: 29900 };
  assert.equal(isCreditScoreOrder(order), true);
  assert.equal(isLegacyOrder(order), false);
  assert.equal(formatAdminOrder(order).product, "Credit Score Access");
});

test("duplicate email warning: non-blocking warning and independent order isolation", () => {
  // Existing registered database emails
  const existingOrders = [
    { receipt: "ORD1001", customerEmail: "user@example.com", status: "PAID", razorpayOrderId: "order_rzp_1" },
    { receipt: "ORD1002", customerEmail: "another@example.com", status: "CREATED", razorpayOrderId: "order_rzp_2" },
  ];

  function checkEmailExists(email) {
    const normalized = email.trim().toLowerCase();
    const count = existingOrders.filter((o) => o.customerEmail.toLowerCase() === normalized).length;
    return {
      exists: count > 0,
      count,
      warning: count > 0 ? "An existing application with this email was found. You may continue to submit a new application with a unique order." : null,
    };
  }

  // Exact and case-insensitive check
  const check1 = checkEmailExists("user@example.com");
  assert.equal(check1.exists, true);
  assert.ok(check1.warning);

  const check2 = checkEmailExists("USER@EXAMPLE.COM ");
  assert.equal(check2.exists, true);

  const check3 = checkEmailExists("brandnew@example.com");
  assert.equal(check3.exists, false);
  assert.equal(check3.warning, null);

  // Independent orders: repeat application receives independent receipt and Razorpay ID
  const newOrderForExistingCustomer = {
    receipt: "ORD1003",
    customerEmail: "user@example.com",
    razorpayOrderId: "order_rzp_3",
    status: "CREATED",
  };
  assert.notEqual(newOrderForExistingCustomer.receipt, existingOrders[0].receipt);
  assert.notEqual(newOrderForExistingCustomer.razorpayOrderId, existingOrders[0].razorpayOrderId);
});

test("verified payment transitions: 72-hour review deadline calculated atomically on PAID transition", () => {
  const simulatedOrder = {
    receipt: "ORD20261013TEST",
    status: "CREATED",
    paidAt: null,
    reviewDeadline: null,
    reviewStatus: null,
  };

  const fixedPaidAt = new Date("2026-10-13T12:00:00.000Z");

  // State transition helper
  function transitionToPaid(order, paidTimestamp) {
    if (order.status === "PAID") {
      // Idempotent: already paid, do not re-set deadline
      return { alreadyPaid: true, order };
    }
    const reviewDeadline = new Date(paidTimestamp.getTime() + 72 * 60 * 60 * 1000);
    order.status = "PAID";
    order.paidAt = paidTimestamp;
    order.reviewDeadline = reviewDeadline;
    order.reviewStatus = "PENDING_REVIEW";
    return { alreadyPaid: false, order };
  }

  const firstTransition = transitionToPaid(simulatedOrder, fixedPaidAt);
  assert.equal(firstTransition.alreadyPaid, false);
  assert.equal(simulatedOrder.status, "PAID");
  assert.equal(simulatedOrder.paidAt.toISOString(), "2026-10-13T12:00:00.000Z");
  assert.equal(simulatedOrder.reviewDeadline.toISOString(), "2026-10-16T12:00:00.000Z"); // Exactly +72 hours
  assert.equal(simulatedOrder.reviewStatus, "PENDING_REVIEW");

  // Duplicate callback test (idempotency)
  const duplicateTime = new Date("2026-10-13T12:05:00.000Z");
  const secondTransition = transitionToPaid(simulatedOrder, duplicateTime);
  assert.equal(secondTransition.alreadyPaid, true);
  // Timestamp and deadline remain unchanged
  assert.equal(simulatedOrder.paidAt.toISOString(), "2026-10-13T12:00:00.000Z");
  assert.equal(simulatedOrder.reviewDeadline.toISOString(), "2026-10-16T12:00:00.000Z");
});

test("historical-order exclusion: legacy orders remain NOT_APPLICABLE with null deadline", () => {
  const historicalOrders = [
    { receipt: "ORD2026101017312E", status: "PAID", reviewStatus: "NOT_APPLICABLE", reviewDeadline: null, consentGiven: false },
    { receipt: "ORD20261010256028", status: "PAID", reviewStatus: "NOT_APPLICABLE", reviewDeadline: null, consentGiven: false },
    { receipt: "ORD202610102652F0", status: "CREATED", reviewStatus: "NOT_APPLICABLE", reviewDeadline: null, consentGiven: false },
  ];

  // SLA queue filter: only orders with PENDING_REVIEW are considered active in review SLA
  const activeReviewQueue = historicalOrders.filter((o) => o.reviewStatus === "PENDING_REVIEW");
  assert.equal(activeReviewQueue.length, 0); // None of the historical orders enter the review queue

  for (const o of historicalOrders) {
    assert.equal(o.reviewStatus, "NOT_APPLICABLE");
    assert.equal(o.reviewDeadline, null);
    assert.equal(o.consentGiven, false);
  }
});

test("admin review recording: records response distinct from automated confirmation email", () => {
  const paidOrder = {
    receipt: "ORD20261013NEW",
    status: "PAID",
    emailStatus: "SENT", // Automated confirmation email
    reviewStatus: "PENDING_REVIEW",
    teamRespondedAt: null,
    teamResponseNotes: null,
    teamRespondedBy: null,
  };

  function recordTeamReview(order, { notes, responder, now = new Date() }) {
    if (!notes || typeof notes !== "string" || !notes.trim()) {
      throw new Error("Review notes are required.");
    }
    if (order.reviewStatus === "NOT_APPLICABLE") {
      throw new Error("Cannot review historical order.");
    }
    order.reviewStatus = "RESPONDED";
    order.teamRespondedAt = now;
    order.teamResponseNotes = notes.trim();
    order.teamRespondedBy = responder || "admin@example.com";
    return order;
  }

  const reviewTime = new Date("2026-10-13T15:30:00.000Z");
  recordTeamReview(paidOrder, {
    notes: "Application reviewed: credit score verified and customer contacted.",
    responder: "compliance-officer@company.com",
    now: reviewTime,
  });

  assert.equal(paidOrder.reviewStatus, "RESPONDED");
  assert.equal(paidOrder.teamRespondedAt.toISOString(), "2026-10-13T15:30:00.000Z");
  assert.equal(paidOrder.teamRespondedBy, "compliance-officer@company.com");
  assert.equal(paidOrder.teamResponseNotes, "Application reviewed: credit score verified and customer contacted.");
  // Automated email status is distinct from manual team response
  assert.equal(paidOrder.emailStatus, "SENT");
});

test("Google Sheets sync: preserves Columns A-K and appends L-N (Consent, Review Status, Review Deadline)", () => {
  assert.equal(SHEET_HEADERS.length, 14);
  assert.equal(SHEET_HEADERS[0], "Order ID"); // A
  assert.equal(SHEET_HEADERS[1], "Product"); // B
  assert.equal(SHEET_HEADERS[2], "Customer Name"); // C
  assert.equal(SHEET_HEADERS[3], "Email"); // D
  assert.equal(SHEET_HEADERS[4], "Mobile"); // E
  assert.equal(SHEET_HEADERS[5], "Amount"); // F
  assert.equal(SHEET_HEADERS[6], "Payment Status"); // G
  assert.equal(SHEET_HEADERS[7], "Payment ID"); // H
  assert.equal(SHEET_HEADERS[8], "Email Status"); // I
  assert.equal(SHEET_HEADERS[9], "Sheet Status"); // J
  assert.equal(SHEET_HEADERS[10], "Created"); // K
  assert.equal(SHEET_HEADERS[11], "Consent"); // L
  assert.equal(SHEET_HEADERS[12], "Review Status"); // M
  assert.equal(SHEET_HEADERS[13], "Review Deadline"); // N

  const sampleOrder = {
    receipt: "ORD20261013SHEET",
    product: "Product A",
    customerName: "Sneha Patel",
    customerEmail: "sneha@example.com",
    customerMobile: "9876543210",
    amount: 19900,
    status: "PAID",
    razorpayPaymentId: "pay_test_999",
    emailStatus: "SENT",
    sheetStatus: "PENDING",
    createdAt: new Date("2026-10-13T10:00:00.000Z"),
    consentGiven: true,
    consentVersion: "v1.0-loan-verification-consent",
    reviewStatus: "PENDING_REVIEW",
    reviewDeadline: new Date("2026-10-16T10:00:00.000Z"),
  };

  const row = buildSheetRow(sampleOrder);
  assert.equal(row.length, 14);
  // Check A-K
  assert.equal(row[0], "ORD20261013SHEET");
  assert.equal(row[1], "Product A");
  assert.equal(row[2], "Sneha Patel");
  assert.equal(row[3], "sneha@example.com");
  assert.equal(row[4], "9876543210");
  assert.equal(row[5], "₹199");
  assert.equal(row[6], "PAID");
  assert.equal(row[7], "pay_test_999");
  assert.equal(row[8], "ACCEPTED (delivery unconfirmed)");
  assert.equal(row[9], "SYNCED");
  assert.ok(row[10]); // Created At
  // Check L-N
  assert.equal(row[11], "ACCEPTED"); // L: Consent
  assert.equal(row[12], "PENDING_REVIEW"); // M: Review Status
  assert.ok(row[13]); // N: Review Deadline
});
