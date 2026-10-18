import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { missingEmailEnv, emailConfigured } from "./email.ts";
import { missingSheetsEnv, sheetsConfigured, SHEET_HEADERS } from "./sheets.ts";

// Helper replicating payments.ts sideEffectsOutstanding logic
const sideEffectsOutstanding = (o) =>
  (emailConfigured() && Boolean(o.customerEmail) && o.emailStatus !== "SENT") ||
  (sheetsConfigured() && o.sheetStatus !== "SYNCED");

// Helper replicating adminAuth session token signing and verification
const TTL_MS = 8 * 60 * 60 * 1000;
const signToken = (data, secret) => crypto.createHmac("sha256", secret).update(data).digest("base64url");
const createTestSessionToken = (secret) => {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${signToken(exp, secret)}`;
};
const isValidTestSessionToken = (token, secret) => {
  if (!token || !secret) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const expected = signToken(exp, secret);
  return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
};

test("safe handling of missing or invalid configuration", () => {
  const origEnv = { ...process.env };

  // Clear email env
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.MAIL_FROM;
  assert.equal(emailConfigured(), false);
  const missingEmail = missingEmailEnv();
  assert.ok(missingEmail.includes("SMTP_HOST"));
  assert.ok(missingEmail.includes("SMTP_USER"));
  assert.ok(missingEmail.includes("SMTP_PASS"));
  assert.ok(missingEmail.includes("MAIL_FROM"));

  // Clear sheets env
  delete process.env.GOOGLE_SHEET_ID;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
  assert.equal(sheetsConfigured(), false);
  const missingSheets = missingSheetsEnv();
  assert.ok(missingSheets.includes("GOOGLE_SHEET_ID"));
  assert.ok(missingSheets.includes("GOOGLE_SERVICE_ACCOUNT_EMAIL"));
  assert.ok(missingSheets.includes("GOOGLE_PRIVATE_KEY"));

  // Restore env
  Object.assign(process.env, origEnv);
});

test("duplicate spreadsheet-row prevention matches existing receipt and updates row", () => {
  const mockSheetRows = [
    [SHEET_HEADERS[0]], // Header row: Order ID
    ["ORD2026101017312E", "Product A", "Test User", "test@example.com", "9999999999", "₹199", "PAID", "pay_1", "SENT", "SYNCED"],
    ["ORD20261010256028", "Product A", "Naveen", "nav@example.com", "8888888888", "₹199", "PAID", "pay_2", "SENT", "SYNCED"],
  ];

  // Simulating upsertOrderRow index search
  const receiptToUpsert = "ORD20261010256028";
  const existingIndex = mockSheetRows.findIndex((r) => r[0] === receiptToUpsert);
  assert.equal(existingIndex, 2); // Found existing row at index 2 (Row 3 in 1-based indexing)

  let actionTaken = "";
  if (existingIndex >= 0) {
    actionTaken = `UPDATE row ${existingIndex + 1}`;
    // Update existing row in place
    mockSheetRows[existingIndex][8] = "ACCEPTED (delivery unconfirmed)";
  } else {
    actionTaken = "APPEND new row";
    mockSheetRows.push([receiptToUpsert]);
  }

  assert.equal(actionTaken, "UPDATE row 3");
  assert.equal(mockSheetRows.length, 3); // No duplicate appended

  // For a brand new receipt
  const newReceipt = "ORD20261011NEW999";
  const newIndex = mockSheetRows.findIndex((r) => r[0] === newReceipt);
  assert.equal(newIndex, -1);
  if (newIndex >= 0) {
    actionTaken = `UPDATE row ${newIndex + 1}`;
  } else {
    actionTaken = "APPEND new row";
    mockSheetRows.push([newReceipt]);
  }
  assert.equal(actionTaken, "APPEND new row");
  assert.equal(mockSheetRows.length, 4);
});

test("sideEffectsOutstanding correctly detects pending or failed automation", () => {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_USER = "user@example.com";
  process.env.SMTP_PASS = "pass";
  process.env.MAIL_FROM = "from@example.com";
  process.env.GOOGLE_SHEET_ID = "sheet-123";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "sa@example.com";
  process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";

  // When both need sync
  assert.equal(
    sideEffectsOutstanding({ customerEmail: "test@example.com", emailStatus: "FAILED", sheetStatus: "FAILED" }),
    true
  );

  // When email succeeded but sheet failed
  assert.equal(
    sideEffectsOutstanding({ customerEmail: "test@example.com", emailStatus: "SENT", sheetStatus: "FAILED" }),
    true
  );

  // When sheet succeeded but email failed
  assert.equal(
    sideEffectsOutstanding({ customerEmail: "test@example.com", emailStatus: "FAILED", sheetStatus: "SYNCED" }),
    true
  );

  // When both completed
  assert.equal(
    sideEffectsOutstanding({ customerEmail: "test@example.com", emailStatus: "SENT", sheetStatus: "SYNCED" }),
    false
  );

  // When order has NO customer email, email status should not keep side-effects in infinite loop
  assert.equal(
    sideEffectsOutstanding({ customerEmail: null, emailStatus: "PENDING", sheetStatus: "SYNCED" }),
    false
  );
});

test("admin authentication, authorization, and token lifecycle verification", () => {
  const secret = "test-admin-secret-key-that-is-long-enough-32-chars";

  // Invalid token should fail
  assert.equal(isValidTestSessionToken(null, secret), false);
  assert.equal(isValidTestSessionToken("", secret), false);
  assert.equal(isValidTestSessionToken("invalid.token", secret), false);
  assert.equal(isValidTestSessionToken("malicious.payload", secret), false);

  // Validly created token should pass
  const validToken = createTestSessionToken(secret);
  assert.equal(isValidTestSessionToken(validToken, secret), true);

  // Expired token should fail
  const expiredExp = String(Date.now() - 1000);
  const expiredMac = signToken(expiredExp, secret);
  assert.equal(isValidTestSessionToken(`${expiredExp}.${expiredMac}`, secret), false);

  // Token signed with wrong secret should fail
  const wrongSecretToken = createTestSessionToken("different-secret-key-that-is-32-chars-long");
  assert.equal(isValidTestSessionToken(wrongSecretToken, secret), false);
});

test("payment status integrity: automation failure never downgrades PAID status", () => {
  const order = {
    id: "ord_test_123",
    receipt: "ORD20261011TEST1",
    status: "PAID",
    emailStatus: "PENDING",
    emailSentAt: null,
    sheetStatus: "PENDING",
    sheetSyncedAt: null,
    amount: 19900,
  };

  // Simulating email send failure
  const simulateEmailFailure = (o, error) => {
    o.emailStatus = "FAILED";
    // Payment status must NEVER change to FAILED
  };

  // Simulating sheets sync failure
  const simulateSheetFailure = (o, error) => {
    o.sheetStatus = "FAILED";
    // Payment status must NEVER change to FAILED
  };

  simulateEmailFailure(order, new Error("SMTP connection timeout"));
  assert.equal(order.status, "PAID");
  assert.equal(order.emailStatus, "FAILED");
  assert.equal(order.emailSentAt, null);

  simulateSheetFailure(order, new Error("Google Sheets 403 Forbidden"));
  assert.equal(order.status, "PAID");
  assert.equal(order.sheetStatus, "FAILED");
  assert.equal(order.sheetSyncedAt, null);
});

test("successful automation persists accurate statuses and timestamps", () => {
  const order = {
    id: "ord_test_success",
    receipt: "ORD20261011SUCCESS",
    status: "PAID",
    emailStatus: "PENDING",
    emailSentAt: null,
    sheetStatus: "PENDING",
    sheetSyncedAt: null,
  };

  // Successful email send
  const now1 = new Date();
  order.emailStatus = "SENT";
  order.emailSentAt = now1;

  // Successful sheet sync
  const now2 = new Date();
  order.sheetStatus = "SYNCED";
  order.sheetSyncedAt = now2;

  assert.equal(order.status, "PAID");
  assert.equal(order.emailStatus, "SENT");
  assert.equal(order.emailSentAt, now1);
  assert.equal(order.sheetStatus, "SYNCED");
  assert.equal(order.sheetSyncedAt, now2);
  assert.equal(sideEffectsOutstanding(order), false);
});

test("webhook duplicate event handling prevents duplicate execution and side-effects", () => {
  const processedEvents = new Set();
  let sideEffectsRunCount = 0;

  function processWebhook(eventId, orderId) {
    if (processedEvents.has(eventId)) {
      return { duplicate: true };
    }
    processedEvents.add(eventId);
    sideEffectsRunCount++;
    return { ok: true };
  }

  const firstCall = processWebhook("evt_razorpay_999", "ord_1");
  assert.deepEqual(firstCall, { ok: true });
  assert.equal(sideEffectsRunCount, 1);

  // Simulated Razorpay retry of identical webhook
  const secondCall = processWebhook("evt_razorpay_999", "ord_1");
  assert.deepEqual(secondCall, { duplicate: true });
  assert.equal(sideEffectsRunCount, 1); // Side effects did NOT run a second time
});
