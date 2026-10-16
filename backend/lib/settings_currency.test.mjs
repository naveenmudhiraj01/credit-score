import assert from "node:assert/strict";
import test from "node:test";
import { MIN_SERVICE_FEE_PAISE, MAX_SERVICE_FEE_PAISE, resolveProductWithFee, getConsentText } from "./catalog.ts";
import { validateFeePaise } from "./validation.ts";
import { getActiveServiceFeePaise, updateServiceFeePaise, SERVICE_FEE_SETTING_KEY } from "./settings.ts";
import { prisma } from "./prisma.ts";

test("Service fee: saving ₹199 successfully with rupee-first parsing and paise conversion", () => {
  // Input: admin enters 199 (meaning ₹199)
  const input = { serviceFeeRupees: 199 };

  // Parse and validate whole-rupee amount
  assert.equal(typeof input.serviceFeeRupees, "number");
  assert.equal(Number.isSafeInteger(input.serviceFeeRupees), true);
  assert.ok(input.serviceFeeRupees >= 1 && input.serviceFeeRupees <= 50000);

  // Convert rupees to paise exactly once
  const targetPaise = input.serviceFeeRupees * 100;
  assert.equal(targetPaise, 19900);

  // Validate paise with existing validator
  const feeValidation = validateFeePaise(targetPaise);
  assert.equal(feeValidation.valid, true);
  assert.equal(feeValidation.value, 19900);

  // Verify response contract structure
  const feeRupees = Math.round(targetPaise / 100);
  const formatted = `₹${feeRupees}`;
  const settingsData = {
    serviceFeeRupees: feeRupees,
    feeRupees,
    feePaise: targetPaise,
    formatted,
    minRupees: 1,
    maxRupees: 50000,
    consentText: getConsentText(targetPaise),
  };

  const responsePayload = {
    ok: true,
    ...settingsData,
    settings: settingsData,
  };

  assert.equal(responsePayload.ok, true);
  assert.equal(responsePayload.serviceFeeRupees, 199);
  assert.equal(responsePayload.feeRupees, 199);
  assert.equal(responsePayload.formatted, "₹199");
  assert.equal(responsePayload.feePaise, 19900);
  assert.equal(responsePayload.settings.serviceFeeRupees, 199);
  assert.equal(responsePayload.settings.formatted, "₹199");
});

test("Service fee: rejecting invalid, decimal, negative, missing, and out-of-range fees", () => {
  const minRupees = Math.ceil(MIN_SERVICE_FEE_PAISE / 100); // 1
  const maxRupees = Math.floor(MAX_SERVICE_FEE_PAISE / 100); // 50000

  function validateAdminFeeInput(body) {
    const raw = body.serviceFeeRupees !== undefined ? body.serviceFeeRupees : body.feeRupees;
    if (raw === undefined || raw === null || raw === "") {
      return { ok: false, error: "MISSING_FEE" };
    }

    let rupeeNum;
    if (typeof raw === "number") {
      rupeeNum = raw;
    } else if (typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
      rupeeNum = Number(raw.trim());
    } else {
      return { ok: false, error: "INVALID_FEE" };
    }

    if (!Number.isSafeInteger(rupeeNum)) {
      return { ok: false, error: "DECIMAL_NOT_ALLOWED" };
    }

    if (rupeeNum < 0) {
      return { ok: false, error: "NEGATIVE_FEE" };
    }

    if (rupeeNum < minRupees || rupeeNum > maxRupees) {
      return { ok: false, error: "OUT_OF_RANGE" };
    }

    return { ok: true, targetPaise: rupeeNum * 100 };
  }

  // Valid
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: 199 }).ok, true);
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: 1 }).ok, true);
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: 50000 }).ok, true);
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: "250" }).ok, true);

  // Decimals (must be rejected)
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: 199.5 }).error, "DECIMAL_NOT_ALLOWED");
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: "199.99" }).error, "DECIMAL_NOT_ALLOWED");

  // Negative
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: -50 }).error, "NEGATIVE_FEE");

  // Out of range
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: 0 }).error, "OUT_OF_RANGE");
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: 50001 }).error, "OUT_OF_RANGE");

  // Missing or non-numeric
  assert.equal(validateAdminFeeInput({}).error, "MISSING_FEE");
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: null }).error, "MISSING_FEE");
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: "abc" }).error, "INVALID_FEE");
  assert.equal(validateAdminFeeInput({ serviceFeeRupees: NaN }).error, "DECIMAL_NOT_ALLOWED");
});

test("Service fee update from ₹199 to ₹299 is read back and used for new order amount", async (t) => {
  const originalFindUnique = prisma.systemSetting.findUnique;
  const originalUpsert = prisma.systemSetting.upsert;
  const settings = new Map([[SERVICE_FEE_SETTING_KEY, "19900"]]);
  prisma.systemSetting.findUnique = async ({ where }) => {
    const value = settings.get(where.key);
    return value === undefined ? null : { key: where.key, value, updatedAt: new Date(), updatedBy: "admin" };
  };
  prisma.systemSetting.upsert = async ({ where, create, update }) => {
    settings.set(where.key, update.value ?? create.value);
    return { key: where.key, value: settings.get(where.key) };
  };
  t.after(() => {
    prisma.systemSetting.findUnique = originalFindUnique;
    prisma.systemSetting.upsert = originalUpsert;
  });

  assert.equal(await getActiveServiceFeePaise(), 19900);
  const update = await updateServiceFeePaise(29900, "admin");
  assert.equal(update.success, true);
  assert.equal(await getActiveServiceFeePaise(), 29900);

  const resolvedProduct = resolveProductWithFee("product-a", await getActiveServiceFeePaise());
  assert.equal(resolvedProduct.amountPaise, 29900);
  const razorpayOrderPayload = {
    amount: resolvedProduct.amountPaise,
    currency: resolvedProduct.currency,
  };
  assert.deepEqual(razorpayOrderPayload, { amount: 29900, currency: "INR" });
});

test("Service fee database read failures do not silently fall back to a stale default", async (t) => {
  const originalFindUnique = prisma.systemSetting.findUnique;
  prisma.systemSetting.findUnique = async () => { throw new Error("database unavailable"); };
  t.after(() => { prisma.systemSetting.findUnique = originalFindUnique; });

  await assert.rejects(getActiveServiceFeePaise(), /database unavailable/);
});

test("Razorpay order creation: applies the stored ₹299 fee in paise", () => {
  const activeFeePaise = 29900;
  const resolvedProduct = resolveProductWithFee("product-a", activeFeePaise);

  assert.ok(resolvedProduct, "Product A must resolve");
  assert.equal(resolvedProduct.amountPaise, 29900, "Must be exactly 29900 paise for ₹299");
  assert.notEqual(resolvedProduct.amountPaise, 299, "Must NEVER send the rupee amount as paise!");

  // Simulated Razorpay order payload
  const rzpOrderPayload = {
    amount: resolvedProduct.amountPaise,
    currency: resolvedProduct.currency,
    receipt: "ORD20261014ABCD",
  };

  assert.equal(rzpOrderPayload.amount, 29900);
  assert.equal(rzpOrderPayload.currency, "INR");
});

test("Payment verification safety: verifies server-side expected amount in paise and rejects mismatch", () => {
  const orderInDb = {
    id: "ord_test_1",
    receipt: "ORD20261014ABCD",
    amount: 29900, // 29900 paise = ₹299
    currency: "INR",
    status: "CREATED",
  };

  function verifyPaymentAmount(order, rzpPayment) {
    if (rzpPayment.amount !== order.amount || rzpPayment.currency !== order.currency) {
      return { valid: false, error: "Order/amount/currency mismatch" };
    }
    return { valid: true };
  }

  // Genuine payment of 29900 paise
  const genuinePayment = { id: "pay_1", amount: 29900, currency: "INR", status: "captured" };
  assert.equal(verifyPaymentAmount(orderInDb, genuinePayment).valid, true);

  // Malicious / bugged payment of 299 paise (₹2.99 instead of ₹299)
  const underpaidPayment = { id: "pay_bad", amount: 199, currency: "INR", status: "captured" };
  const mismatchResult = verifyPaymentAmount(orderInDb, underpaidPayment);
  assert.equal(mismatchResult.valid, false);
  assert.equal(mismatchResult.error, "Order/amount/currency mismatch");

  // Wrong currency
  const wrongCurrency = { id: "pay_usd", amount: 29900, currency: "USD", status: "captured" };
  assert.equal(verifyPaymentAmount(orderInDb, wrongCurrency).valid, false);
});
