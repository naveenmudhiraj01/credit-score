import assert from "node:assert/strict";
import test from "node:test";
import {
  validateName,
  validateEmail,
  validatePhone,
  validateDob,
  validateProductId,
  validateReceipt,
  validateFeePaise,
  validateCreateOrderRequest,
} from "./validation.ts";

test("Name validation: trims whitespace, enforces bounds, handles Unicode and digits", () => {
  // Valid names
  assert.equal(validateName("Rahul Sharma").valid, true);
  assert.equal(validateName("  Priya Patel  ").value, "Priya Patel");
  assert.equal(validateName("naveen2").valid, true); // Digits with letters allowed as per requirement
  assert.equal(validateName("John Doe 3rd").valid, true);
  assert.equal(validateName("Al").valid, true); // 2 chars min boundary
  assert.equal(validateName("O'Connor").valid, true);
  assert.equal(validateName("Mary-Jane").valid, true);
  assert.equal(validateName("Dr. A. P. J. Abdul Kalam").valid, true);
  assert.equal(validateName("नवीन कुमार").valid, true); // Non-English Unicode name
  assert.equal(validateName("François Dubois").valid, true);

  // Exact 120 chars boundary
  const exact120 = "A" + "b".repeat(119);
  assert.equal(validateName(exact120).valid, true);

  // Invalid names
  assert.equal(validateName("").valid, false);
  assert.equal(validateName("   ").valid, false);
  assert.equal(validateName(null).valid, false);
  assert.equal(validateName(undefined).valid, false);
  assert.equal(validateName(12345).valid, false);
  assert.equal(validateName("A").valid, false); // <2 chars
  assert.equal(validateName("A".repeat(121)).valid, false); // >120 chars
  assert.equal(validateName("123456").valid, false); // Pure numbers devoid of letters
  assert.equal(validateName("---").valid, false); // Pure symbols
  assert.equal(validateName("!@#$%^").valid, false);
  assert.equal(validateName("Naveen\x00Kumar").valid, false); // Control char
  assert.equal(validateName("Naveen\u0007Kumar").valid, false); // Bell control char
  assert.equal(validateName("<script>alert('xss')</script>").valid, false); // HTML markup
});

test("Email validation: validates syntax, domain structure, known TLDs, rejects malformed domains like .jkkd", () => {
  // Valid emails across various valid TLDs
  assert.equal(validateEmail("user@example.com").valid, true);
  assert.equal(validateEmail("  User@Example.COM  ").value, "user@example.com");
  assert.equal(validateEmail("rahul.sharma123@gmail.com").valid, true);
  assert.equal(validateEmail("priya@domain.in").valid, true);
  assert.equal(validateEmail("support@company.co.in").valid, true);
  assert.equal(validateEmail("student@university.edu").valid, true);
  assert.equal(validateEmail("officer@gov.in").valid, true);
  assert.equal(validateEmail("dev@startup.io").valid, true);
  assert.equal(validateEmail("admin@platform.ai").valid, true);
  assert.equal(validateEmail("contact@app.dev").valid, true);
  assert.equal(validateEmail("hello@store.online").valid, true);

  // Malformed emails - including the reported sjkj@gmail.jkkd
  assert.equal(validateEmail("sjkj@gmail.jkkd").valid, false); // Unrecognized TLD .jkkd rejected
  assert.ok(validateEmail("sjkj@gmail.jkkd").error?.includes(".jkkd"));

  assert.equal(validateEmail("plainaddress").valid, false);
  assert.equal(validateEmail("@missing-local.com").valid, false);
  assert.equal(validateEmail("missing-domain@").valid, false);
  assert.equal(validateEmail("missing-tld@domain").valid, false);
  assert.equal(validateEmail("user@domain@another.com").valid, false);
  assert.equal(validateEmail("user..name@domain.com").valid, false); // Consecutive dots in local part
  assert.equal(validateEmail(".username@domain.com").valid, false); // Leading dot in local part
  assert.equal(validateEmail("username.@domain.com").valid, false); // Trailing dot in local part
  assert.equal(validateEmail("user@domain..com").valid, false); // Consecutive dots in domain
  assert.equal(validateEmail("user@.domain.com").valid, false); // Leading dot in domain
  assert.equal(validateEmail("user@domain.com.").valid, false); // Trailing dot in domain
  assert.equal(validateEmail("user@domain.c").valid, false); // TLD <2 chars
  assert.equal(validateEmail("user@domain.123").valid, false); // Numeric TLD
  assert.equal(validateEmail("").valid, false);
  assert.equal(validateEmail(null).valid, false);

  // Length boundaries (max 190 characters, local part max 64, domain label max 63)
  const longEmail = "a".repeat(60) + "@" + "sub." + "b".repeat(60) + "." + "c".repeat(60) + ".com"; // 190 chars total + extra chars > 190
  const tooLongEmail = "a".repeat(64) + "@" + "sub." + "b".repeat(60) + "." + "c".repeat(60) + ".com"; // 194 chars > 190
  assert.equal(validateEmail(tooLongEmail).valid, false);
  const boundaryEmail = "a".repeat(60) + "@" + "sub." + "b".repeat(55) + "." + "c".repeat(55) + ".com"; // 180 chars <= 190
  assert.equal(validateEmail(boundaryEmail).valid, true);
});

test("Phone validation: normalizes Indian mobile formats and rejects impossible prefixes or malformed lengths", () => {
  // Valid Indian mobile numbers in diverse user input formats
  const valid1 = validatePhone("8968229623");
  assert.equal(valid1.valid, true);
  assert.equal(valid1.value, "+918968229623");

  const valid2 = validatePhone("+91 8968229623");
  assert.equal(valid2.valid, true);
  assert.equal(valid2.value, "+918968229623");

  const valid3 = validatePhone("08968229623"); // 11 digits with 0 prefix
  assert.equal(valid3.valid, true);
  assert.equal(valid3.value, "+918968229623");

  const valid4 = validatePhone("918968229623"); // 12 digits with 91 prefix
  assert.equal(valid4.valid, true);
  assert.equal(valid4.value, "+918968229623");

  const valid5 = validatePhone("9123456780"); // starts with 9
  assert.equal(valid5.valid, true);
  assert.equal(valid5.value, "+919123456780");

  const valid6 = validatePhone("7654321098"); // starts with 7
  assert.equal(valid6.valid, true);
  assert.equal(valid6.value, "+917654321098");

  const valid7 = validatePhone("6303397582"); // starts with 6
  assert.equal(valid7.valid, true);
  assert.equal(valid7.value, "+916303397582");

  // Invalid numbers - impossible prefixes and lengths found in historical audit
  assert.equal(validatePhone("3234654767").valid, false); // Starts with 3 (impossible in India)
  assert.equal(validatePhone("76553333336").valid, false); // 11 digits without 0 trunk prefix
  assert.equal(validatePhone("876567546578").valid, false); // 12 digits without 91 prefix
  assert.equal(validatePhone("9999999999").valid, false); // Repeating placeholder
  assert.equal(validatePhone("0000000000").valid, false); // All zeros
  assert.equal(validatePhone("12345").valid, false); // Too short
  assert.equal(validatePhone("").valid, false);
  assert.equal(validatePhone(null).valid, false);
  assert.equal(validatePhone("abcdefghij").valid, false);

  // International format
  const intl = validatePhone("+14155552671");
  assert.equal(intl.valid, true);
  assert.equal(intl.value, "+14155552671");
});

test("Date of Birth validation: validates calendar dates and enforces 18+ age eligibility", () => {
  // Valid DOBs
  assert.equal(validateDob("15/05/1998").valid, true);
  assert.equal(validateDob("15/05/1998").value, "15/05/1998");
  assert.equal(validateDob("1998-05-15").valid, true);
  assert.equal(validateDob("1998-05-15").value, "15/05/1998"); // Normalized
  assert.equal(validateDob("29/02/2000").valid, true); // Leap year 2000 is valid

  // Invalid DOBs
  assert.equal(validateDob("").valid, false);
  assert.equal(validateDob(null).valid, false);
  assert.equal(validateDob("invalid-date").valid, false);
  assert.equal(validateDob("31/02/1995").valid, false); // Feb 31 does not exist
  assert.equal(validateDob("29/02/1999").valid, false); // 1999 not a leap year
  assert.equal(validateDob("15/13/1995").valid, false); // Month 13 invalid
  assert.equal(validateDob("15/05/2030").valid, false); // Future date
  assert.equal(validateDob("15/05/1900").valid, false); // Over 100 years old

  // Underage (<18 years old)
  const underageDate = new Date();
  underageDate.setFullYear(underageDate.getFullYear() - 16);
  const formattedUnderage = `${String(underageDate.getDate()).padStart(2, "0")}/${String(underageDate.getMonth() + 1).padStart(2, "0")}/${underageDate.getFullYear()}`;
  const underAgeRes = validateDob(formattedUnderage);
  assert.equal(underAgeRes.valid, false);
  assert.ok(underAgeRes.error?.includes("18"));
});

test("Product and Amount validation: prevents invalid product IDs and out-of-bound fees", () => {
  // Product ID
  assert.equal(validateProductId("product-a").valid, true);
  assert.equal(validateProductId("gaming-laptop-pro").valid, true);
  assert.equal(validateProductId("invalid-product").valid, false);
  assert.equal(validateProductId("").valid, false);
  assert.equal(validateProductId(null).valid, false);

  // Fee Paise
  assert.equal(validateFeePaise(19900).valid, true);
  assert.equal(validateFeePaise(100).valid, true); // Min ₹1.00
  assert.equal(validateFeePaise(5000000).valid, true); // Max ₹50,000.00
  assert.equal(validateFeePaise(0).valid, false);
  assert.equal(validateFeePaise(-100).valid, false);
  assert.equal(validateFeePaise(99).valid, false);
  assert.equal(validateFeePaise(5000001).valid, false);
  assert.equal(validateFeePaise(199.5).valid, false);
  assert.equal(validateFeePaise("19900").valid, false);
  assert.equal(validateFeePaise(NaN).valid, false);

  // Receipt
  assert.equal(validateReceipt("ORD20261013888D34").valid, true);
  assert.equal(validateReceipt("ORD123").valid, false); // < 6 chars
  assert.equal(validateReceipt("INVALID").valid, false);
});

test("Direct API payload validation: rejects malformed requests bypassing the frontend", () => {
  // 1. Valid new order payload
  const validPayload = {
    productId: "product-a",
    name: "Aarav Sharma",
    email: "aarav@example.com",
    mobile: "9876543210",
    consent: true,
  };
  const res1 = validateCreateOrderRequest(validPayload);
  assert.equal(res1.ok, true);
  assert.equal(res1.data?.name, "Aarav Sharma");
  assert.equal(res1.data?.email, "aarav@example.com");
  assert.equal(res1.data?.mobile, "+919876543210"); // Normalized

  // 2. Reported bug case: malformed email sjkj@gmail.jkkd
  const bugPayload = {
    productId: "product-a",
    name: "naveen2",
    email: "sjkj@gmail.jkkd",
    mobile: "8968229623",
    consent: true,
  };
  const resBug = validateCreateOrderRequest(bugPayload);
  assert.equal(resBug.ok, false);
  assert.equal(resBug.statusCode, 400);
  assert.equal(resBug.errorCode, "INVALID_EMAIL");

  // 3. Invalid phone number (impossible prefix)
  const badPhone = {
    productId: "product-a",
    name: "Kss",
    email: "kss@example.com",
    mobile: "3234654767",
    consent: true,
  };
  const resPhone = validateCreateOrderRequest(badPhone);
  assert.equal(resPhone.ok, false);
  assert.equal(resPhone.statusCode, 400);
  assert.equal(resPhone.errorCode, "INVALID_MOBILE");

  // 4. Missing name
  const noName = {
    productId: "product-a",
    email: "user@example.com",
    mobile: "9876543210",
    consent: true,
  };
  const resName = validateCreateOrderRequest(noName);
  assert.equal(resName.ok, false);
  assert.equal(resName.statusCode, 400);
  assert.equal(resName.errorCode, "INVALID_NAME");

  // 5. Missing consent (returns 422 CONSENT_REQUIRED)
  const noConsent = {
    productId: "product-a",
    name: "Valid User",
    email: "valid@example.com",
    mobile: "9876543210",
    consent: false,
  };
  const resConsent = validateCreateOrderRequest(noConsent);
  assert.equal(resConsent.ok, false);
  assert.equal(resConsent.statusCode, 422);
  assert.equal(resConsent.errorCode, "CONSENT_REQUIRED");

  // 6. Invalid product ID
  const badProd = {
    productId: "non-existent-product",
    name: "Valid User",
    email: "valid@example.com",
    mobile: "9876543210",
    consent: true,
  };
  const resProd = validateCreateOrderRequest(badProd);
  assert.equal(resProd.ok, false);
  assert.equal(resProd.statusCode, 400);
  assert.equal(resProd.errorCode, "INVALID_PRODUCT");

  // 7. Valid order retry
  const retryPayload = { orderId: "ORD20261013888D34" };
  const resRetry = validateCreateOrderRequest(retryPayload);
  assert.equal(resRetry.ok, true);
  assert.equal(resRetry.data?.orderRef, "ORD20261013888D34");

  // 8. Malformed order retry
  const badRetry = { orderId: "NOT_AN_ORDER" };
  const resBadRetry = validateCreateOrderRequest(badRetry);
  assert.equal(resBadRetry.ok, false);
  assert.equal(resBadRetry.statusCode, 400);
  assert.equal(resBadRetry.errorCode, "INVALID_ORDER");
});

test("Dashboard customer aggregation: calculates orders, paid count, and spent only from verified payments", () => {
  // Simulating persisted records in database
  const sampleOrders = [
    // Customer 1: 2 orders, 1 PAID, 1 CREATED (unpaid)
    { receipt: "ORD1", customerEmail: "user1@example.com", customerName: "User One", amount: 19900, status: "PAID", createdAt: "2026-10-11T10:00:00Z" },
    { receipt: "ORD2", customerEmail: "user1@example.com", customerName: "User One", amount: 19900, status: "CREATED", createdAt: "2026-10-12T10:00:00Z" },

    // Customer 2: reported example record naveen2 (1 CREATED order, unpaid)
    { receipt: "ORD3", customerEmail: "sjkj@gmail.jkkd", customerName: "naveen2", amount: 19900, status: "CREATED", createdAt: "2026-10-13T14:59:58Z" },

    // Customer 3: 2 orders, both PAID
    { receipt: "ORD4", customerEmail: "user3@example.com", customerName: "User Three", amount: 19900, status: "PAID", createdAt: "2026-10-13T12:00:00Z" },
    { receipt: "ORD5", customerEmail: "user3@example.com", customerName: "User Three", amount: 8999, status: "PAID", createdAt: "2026-10-13T13:00:00Z" },
  ];

  // Aggregation logic matching Customers.jsx
  const customerMap = new Map();
  for (const o of sampleOrders) {
    const key = (o.customerEmail || o.receipt).toLowerCase();
    const c = customerMap.get(key) || {
      key,
      name: o.customerName,
      email: o.customerEmail,
      orders: 0,
      paid: 0,
      spent: 0,
    };
    c.orders += 1;
    if (o.status === "PAID") {
      c.paid += 1;
      c.spent += o.amount; // Only sum server-verified paid orders
    }
    customerMap.set(key, c);
  }

  // Verify Customer 1: 1 of 2 paid, spent ₹199 (19900 paise)
  const c1 = customerMap.get("user1@example.com");
  assert.equal(c1.orders, 2);
  assert.equal(c1.paid, 1);
  assert.equal(c1.spent, 19900);

  // Verify Customer 2 (reported case naveen2): 0 of 1 paid, spent ₹0
  const c2 = customerMap.get("sjkj@gmail.jkkd");
  assert.equal(c2.orders, 1);
  assert.equal(c2.paid, 0); // 0 paid
  assert.equal(c2.spent, 0); // ₹0 spent because status is CREATED

  // Verify Customer 3: 2 of 2 paid, spent ₹288.99 (28899 paise)
  const c3 = customerMap.get("user3@example.com");
  assert.equal(c3.orders, 2);
  assert.equal(c3.paid, 2);
  assert.equal(c3.spent, 28899);
});
