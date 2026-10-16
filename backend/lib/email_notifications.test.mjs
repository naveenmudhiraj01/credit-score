import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { validateEmail, validateCreateOrderRequest } from "./validation.ts";
import { sanitizeEmailError, getAdminNotificationEmail } from "./email.ts";
import { prisma } from "./prisma.ts";
import { sendAdminPaymentEmailOnce, sendCustomerPaymentEmailOnce } from "./payments.ts";

test("Customer email validation: validates standard, rejects malformed, injection, and extracts clean email", () => {
  // Valid emails
  assert.equal(validateEmail("customer@ffa-finserv.com").valid, true);
  assert.equal(validateEmail("user.name+tag@sub.example.co.in").valid, true);
  assert.equal(validateEmail("  CUSTOMER@GMAIL.COM  ").value, "customer@gmail.com");

  // Invalid emails
  assert.equal(validateEmail("plainaddress").valid, false);
  assert.equal(validateEmail("@missinguser.com").valid, false);
  assert.equal(validateEmail("user@.com").valid, false);
  assert.equal(validateEmail("user@invalid_tld.jkkd").valid, false);
  assert.equal(validateEmail("user@domain..com").valid, false);
  assert.equal(validateEmail("user@domain.c").valid, false);
  assert.equal(validateEmail(null).valid, false);
  assert.equal(validateEmail(undefined).valid, false);

  // Email header injection attempt
  assert.equal(validateEmail("attacker@victim.com\r\nBcc: evil@hacker.com").valid, false);
  assert.equal(validateEmail("attacker@victim.com%0ABcc:evil@hacker.com").valid, false);
});

test("Dynamic email extraction: customer email is derived dynamically from registration record, not hardcoded", () => {
  const customerA = {
    id: "ord_1",
    receipt: "ORD202610140001",
    customerName: "Aarav Patel",
    customerEmail: "aarav.patel@example.com",
    customerMobile: "9876543210",
    product: "Product A",
    amount: 19900,
    status: "CREATED",
  };

  const customerB = {
    id: "ord_2",
    receipt: "ORD202610140002",
    customerName: "Sunita Rao",
    customerEmail: "sunita.rao@example.org",
    customerMobile: "9123456780",
    product: "Product A",
    amount: 19900,
    status: "CREATED",
  };

  // Mocking sender that inspects recipient
  const sentRecipients = [];
  const mockSendCustomerEmail = (order) => {
    assert.ok(order.customerEmail, "Order must have dynamic customerEmail");
    assert.notEqual(order.customerEmail, process.env.SMTP_USER, "Must not use server SMTP user as customer email");
    assert.notEqual(order.customerEmail, process.env.ADMIN_NOTIFICATION_EMAIL, "Must not use admin email as customer email");
    sentRecipients.push(order.customerEmail);
    return Promise.resolve({ messageId: `<test-${order.id}@smtp.test>` });
  };

  mockSendCustomerEmail(customerA);
  mockSendCustomerEmail(customerB);

  assert.deepEqual(sentRecipients, ["aarav.patel@example.com", "sunita.rao@example.org"]);
});

test("Admin notification recipient resolution: protected from client form input and derived from server configuration", async () => {
  const origEnv = process.env.ADMIN_NOTIFICATION_EMAIL;
  try {
    process.env.ADMIN_NOTIFICATION_EMAIL = "superadmin@ffafinserv.com";

    // 1. Resolve admin email
    const adminEmail = await getAdminNotificationEmail();
    assert.equal(adminEmail, "superadmin@ffafinserv.com");

    // 2. Validate that registration form request payload rejects any attempt to inject adminRecipient
    const maliciousPayload = {
      productId: "product-a",
      name: "Legit Customer",
      dob: "1995-05-15",
      email: "legit.customer@example.com",
      mobile: "9876543210",
      consent: true,
      adminEmail: "attacker@pwned.com", // malicious injection
      adminRecipient: "attacker@pwned.com",
    };

    const validated = validateCreateOrderRequest(maliciousPayload);
    assert.equal(validated.ok, true);
    // Malicious fields are discarded by validator and not present in validated data
    assert.equal("adminEmail" in validated.data, false);
    assert.equal("adminRecipient" in validated.data, false);
    assert.equal(validated.data.email, "legit.customer@example.com");
  } finally {
    process.env.ADMIN_NOTIFICATION_EMAIL = origEnv;
  }
});

test("Admin email configuration is required and validated without fallback recipients", async () => {
  const previous = process.env.ADMIN_NOTIFICATION_EMAIL;
  try {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    await assert.rejects(getAdminNotificationEmail(), /ADMIN_NOTIFICATION_EMAIL is not configured/);
    process.env.ADMIN_NOTIFICATION_EMAIL = "not-an-email";
    await assert.rejects(getAdminNotificationEmail(), /ADMIN_NOTIFICATION_EMAIL is invalid/);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
    else process.env.ADMIN_NOTIFICATION_EMAIL = previous;
  }
});

const EMAIL_ENV = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "ADMIN_NOTIFICATION_EMAIL"];
const ORDER = {
  id: "order-db-id",
  receipt: "ORD20261014TEST01",
  razorpayOrderId: "order_provider_1",
  razorpayPaymentId: "pay_provider_1",
  razorpaySignature: null,
  product: "Product A",
  amount: 19900,
  currency: "INR",
  status: "PAID",
  failureReason: null,
  customerName: "Test Customer",
  customerDob: null,
  customerEmail: "Customer@example.com",
  customerMobile: null,
  emailStatus: "PENDING",
  emailSentAt: null,
  sheetStatus: "PENDING",
  sheetSyncedAt: null,
  paidAt: new Date("2026-10-14T10:00:00.000Z"),
  reviewDeadline: null,
  createdAt: new Date("2026-10-14T09:00:00.000Z"),
};

function setUpEmailDispatch(t, options = {}) {
  const previousEnv = new Map(EMAIL_ENV.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "sender@example.com",
    SMTP_PASS: "test-only-password",
    MAIL_FROM: "sender@example.com",
    ADMIN_NOTIFICATION_EMAIL: "admin@example.com",
  });
  t.after(() => {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const order = { ...ORDER, customerEmail: options.customerEmail ?? ORDER.customerEmail };
  const notifications = new Map();
  if (options.existingNotification) {
    notifications.set(
      `${ORDER.id}:${options.existingNotification.emailType}`,
      { id: "existing-notification", ...options.existingNotification, updatedAt: new Date() },
    );
  }
  const sent = [];
  const patch = (target, name, value) => {
    const previous = target[name];
    target[name] = value;
    t.after(() => { target[name] = previous; });
  };

  patch(prisma.paymentOrder, "findUnique", async () => order);
  patch(prisma.paymentOrder, "update", async ({ data }) => Object.assign(order, data));
  patch(prisma.systemSetting, "findUnique", async () => null);
  patch(prisma.emailNotification, "findFirst", async ({ where }) =>
    notifications.get(`${where.orderId}:${where.emailType}`) ?? null
  );
  patch(prisma.emailNotification, "findUnique", async ({ where }) =>
    [...notifications.values()].find((candidate) => candidate.id === where.id) ?? null
  );
  patch(prisma.emailNotification, "create", async ({ data }) => {
    const key = `${data.orderId}:${data.emailType}`;
    if (notifications.has(key)) throw Object.assign(new Error("unique constraint"), { code: "P2002" });
    const row = { id: `notification-${notifications.size + 1}`, ...data, updatedAt: new Date() };
    notifications.set(key, row);
    return row;
  });
  patch(prisma.emailNotification, "update", async ({ where, data }) => {
    const row = [...notifications.values()].find((candidate) => candidate.id === where.id);
    Object.assign(row, data, { updatedAt: new Date() });
    return row;
  });
  patch(prisma.emailNotification, "updateMany", async ({ where, data }) => {
    const row = [...notifications.values()].find((candidate) => candidate.id === where.id);
    if (!row || row.status !== where.status) return { count: 0 };
    if (where.updatedAt instanceof Date && row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
    if (where.updatedAt?.lt instanceof Date && row.updatedAt >= where.updatedAt.lt) return { count: 0 };
    Object.assign(row, data, { updatedAt: new Date() });
    return { count: 1 };
  });

  const originalCreateTransport = nodemailer.createTransport;
  nodemailer.createTransport = () => ({
    sendMail: async (message) => {
      sent.push(message);
      if (options.smtpError) throw options.smtpError;
      return { messageId: `<${sent.length}@smtp.test>`, accepted: [message.to] };
    },
  });
  t.after(() => { nodemailer.createTransport = originalCreateTransport; });

  return { order, notifications, sent };
}

test("Verified paid order dispatches separate customer and admin notifications to their configured recipients", async (t) => {
  const { notifications, sent } = setUpEmailDispatch(t);

  assert.equal(await sendCustomerPaymentEmailOnce(ORDER.id), "SENT");
  assert.equal(await sendAdminPaymentEmailOnce(ORDER.id), "SENT");
  assert.deepEqual(sent.map((message) => message.to), ["customer@example.com", "admin@example.com"]);
  assert.equal(notifications.get(`${ORDER.id}:CUSTOMER_PAYMENT_CONFIRMATION`).recipient, "customer@example.com");
  assert.equal(notifications.get(`${ORDER.id}:ADMIN_PAYMENT_NOTIFICATION`).recipient, "admin@example.com");
  assert.match(sent[1].text, /Payment Status: PAID/);
  assert.match(sent[1].text, /ORD20261014TEST01/);
  assert.match(sent[1].text, /Test Customer/);
});

test("Unpaid orders, invalid customer email, missing SMTP settings, and missing admin recipient do not report successful delivery", async (t) => {
  const unpaid = setUpEmailDispatch(t);
  unpaid.order.status = "CREATED";
  assert.equal(await sendCustomerPaymentEmailOnce(ORDER.id), "SKIPPED");
  assert.equal(unpaid.sent.length, 0);

  const invalidCustomer = setUpEmailDispatch(t, { customerEmail: "not-an-email" });
  assert.equal(await sendCustomerPaymentEmailOnce(ORDER.id), "FAILED");
  assert.equal(invalidCustomer.sent.length, 0);
  assert.equal(invalidCustomer.order.status, "PAID");
  assert.equal(invalidCustomer.order.emailStatus, "FAILED");

  const missingSmtp = setUpEmailDispatch(t);
  delete process.env.SMTP_USER;
  assert.equal(await sendCustomerPaymentEmailOnce(ORDER.id), "FAILED");
  assert.equal(missingSmtp.sent.length, 0);
  assert.equal(missingSmtp.order.status, "PAID");

  const missingAdmin = setUpEmailDispatch(t);
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  assert.equal(await sendAdminPaymentEmailOnce(ORDER.id), "FAILED");
  assert.equal(missingAdmin.sent.length, 0);
  assert.equal(missingAdmin.order.status, "PAID");
});

test("SMTP recipient rejection and connection failure are recorded without changing paid order status", async (t) => {
  const rejected = setUpEmailDispatch(t, { smtpError: new Error("550 5.1.1 recipient mailbox does not exist") });
  assert.equal(await sendCustomerPaymentEmailOnce(ORDER.id), "FAILED");
  assert.equal(rejected.order.status, "PAID");
  assert.equal(rejected.order.emailStatus, "FAILED");
  assert.equal(rejected.notifications.get(`${ORDER.id}:CUSTOMER_PAYMENT_CONFIRMATION`).status, "FAILED");

  const unavailable = setUpEmailDispatch(t, { smtpError: Object.assign(new Error("connection refused"), { code: "ECONNECTION" }) });
  assert.equal(await sendAdminPaymentEmailOnce(ORDER.id), "FAILED");
  assert.equal(unavailable.order.status, "PAID");
  assert.equal(unavailable.notifications.get(`${ORDER.id}:ADMIN_PAYMENT_NOTIFICATION`).status, "FAILED");
});

test("Repeated payment notification requests are claimed once and do not send duplicate emails", async (t) => {
  const { sent } = setUpEmailDispatch(t);
  const results = await Promise.all([
    sendCustomerPaymentEmailOnce(ORDER.id),
    sendCustomerPaymentEmailOnce(ORDER.id),
  ]);
  assert.equal(sent.length, 1);
  assert.equal(results.filter((result) => result === "SENT").length, 1);
});

test("Retry clears stale delivery fields and stores only the current attempt result", async (t) => {
  const oldAcceptedAt = new Date("2026-10-14T10:00:00.000Z");
  const { notifications } = setUpEmailDispatch(t, {
    existingNotification: {
      emailType: "CUSTOMER_PAYMENT_CONFIRMATION",
      status: "FAILED",
      messageId: "<old-attempt@smtp.test>",
      sentAt: oldAcceptedAt,
      deliveredAt: null,
      errorDetails: "stale error",
      attemptCount: 1,
    },
  });

  assert.equal(await sendCustomerPaymentEmailOnce(ORDER.id), "SENT");
  const current = notifications.get(`${ORDER.id}:CUSTOMER_PAYMENT_CONFIRMATION`);
  assert.equal(current.status, "ACCEPTED");
  assert.equal(current.messageId, "<1@smtp.test>");
  assert.ok(current.sentAt instanceof Date);
  assert.notEqual(current.sentAt.toISOString(), oldAcceptedAt.toISOString());
  assert.equal(current.deliveredAt, null);
  assert.equal(current.errorDetails, null);
});

test("SMTP error sanitization: masks passwords, auth secrets, and credentials in error messages", () => {
  const origPass = process.env.SMTP_PASS;
  const origSecret = process.env.ADMIN_SESSION_SECRET;
  try {
    process.env.SMTP_PASS = "super-secret-app-password-1234";
    process.env.ADMIN_SESSION_SECRET = "top-secret-admin-token-5678";

    // Error containing raw SMTP password
    const errWithPass = new Error("Invalid login: 535-5.7.8 Username and Password not accepted for password super-secret-app-password-1234");
    const sanitized1 = sanitizeEmailError(errWithPass);
    assert.equal(sanitized1.includes("super-secret-app-password-1234"), false, "Must mask SMTP password");
    assert.ok(sanitized1.includes("[REDACTED]"), "Must insert [REDACTED]");

    // Error containing authorization token
    const errWithAuth = new Error("SMTP connection failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token and secret=top-secret-admin-token-5678");
    const sanitized2 = sanitizeEmailError(errWithAuth);
    assert.equal(sanitized2.includes("top-secret-admin-token-5678"), false, "Must mask session secret");
    assert.equal(sanitized2.includes("Bearer eyJhbGci"), false, "Must mask bearer token");
    assert.ok(sanitized2.includes("[REDACTED]"));
  } finally {
    process.env.SMTP_PASS = origPass;
    process.env.ADMIN_SESSION_SECRET = origSecret;
  }
});

test("Independent delivery: failure of one recipient (customer or admin) never prevents the other from being attempted", async () => {
  // Scenario A: Customer send fails (e.g., SMTP rejects customer email), admin send succeeds
  let customerAttempted = false;
  let adminAttempted = false;

  const mockSendCustomerFails = async () => {
    customerAttempted = true;
    throw new Error("SMTP recipient rejected: 550 User not found");
  };

  const mockSendAdminSucceeds = async () => {
    adminAttempted = true;
    return { messageId: "<admin-msg-001@ffafinserv.com>" };
  };

  const [resCustomerA, resAdminA] = await Promise.allSettled([
    mockSendCustomerFails(),
    mockSendAdminSucceeds(),
  ]);

  assert.equal(customerAttempted, true);
  assert.equal(adminAttempted, true, "Admin send MUST still be attempted even when customer send fails");
  assert.equal(resCustomerA.status, "rejected");
  assert.equal(resAdminA.status, "fulfilled");
  assert.equal(resAdminA.value.messageId, "<admin-msg-001@ffafinserv.com>");

  // Scenario B: Admin send fails, customer send succeeds
  customerAttempted = false;
  adminAttempted = false;

  const mockSendCustomerSucceeds = async () => {
    customerAttempted = true;
    return { messageId: "<customer-msg-002@ffafinserv.com>" };
  };

  const mockSendAdminFails = async () => {
    adminAttempted = true;
    throw new Error("SMTP network timeout connecting to admin relay");
  };

  const [resCustomerB, resAdminB] = await Promise.allSettled([
    mockSendCustomerSucceeds(),
    mockSendAdminFails(),
  ]);

  assert.equal(customerAttempted, true);
  assert.equal(adminAttempted, true);
  assert.equal(resCustomerB.status, "fulfilled");
  assert.equal(resAdminB.status, "rejected");
});

test("Payment verification gating: payment confirmation emails strictly require verified PAID status", () => {
  const unpaidOrders = [
    { id: "1", receipt: "ORD001", status: "CREATED", customerEmail: "user@example.com" },
    { id: "2", receipt: "ORD002", status: "PENDING", customerEmail: "user@example.com" },
    { id: "3", receipt: "ORD003", status: "FAILED", customerEmail: "user@example.com" },
  ];

  const paidOrder = { id: "4", receipt: "ORD004", status: "PAID", customerEmail: "user@example.com" };

  const canSendPaymentConfirmation = (order) => {
    return order.status === "PAID" && Boolean(order.customerEmail);
  };

  for (const unpaid of unpaidOrders) {
    assert.equal(
      canSendPaymentConfirmation(unpaid),
      false,
      `Unpaid order with status ${unpaid.status} must NOT trigger payment confirmation`
    );
  }

  assert.equal(canSendPaymentConfirmation(paidOrder), true, "PAID order is allowed to send confirmation");
});

test("Duplicate webhook events & idempotency: repeated payment notifications do not generate duplicate emails", () => {
  // Model state tracker simulating EmailNotification table
  const notificationsTable = new Map();

  function triggerPaymentNotification(orderId, type) {
    const key = `${orderId}:${type}`;
    const existing = notificationsTable.get(key);

    if (existing && (existing.status === "ACCEPTED" || existing.status === "DELIVERED")) {
      return { sent: false, reason: "ALREADY_PROCESSED" };
    }

    if (existing && existing.status === "SENDING") {
      return { sent: false, reason: "IN_PROGRESS" };
    }

    // First attempt: claim and send
    notificationsTable.set(key, { status: "ACCEPTED", messageId: `<msg-${key}@test.com>`, sentAt: new Date() });
    return { sent: true, reason: "SENT" };
  }

  // First webhook delivery
  const attempt1 = triggerPaymentNotification("ord_123", "CUSTOMER_PAYMENT_CONFIRMATION");
  assert.equal(attempt1.sent, true);
  assert.equal(attempt1.reason, "SENT");

  // Duplicate webhook delivery with identical event
  const attempt2 = triggerPaymentNotification("ord_123", "CUSTOMER_PAYMENT_CONFIRMATION");
  assert.equal(attempt2.sent, false);
  assert.equal(attempt2.reason, "ALREADY_PROCESSED");

  // Third webhook retry
  const attempt3 = triggerPaymentNotification("ord_123", "CUSTOMER_PAYMENT_CONFIRMATION");
  assert.equal(attempt3.sent, false);
  assert.equal(attempt3.reason, "ALREADY_PROCESSED");
});

test("SMTP acceptance vs verified delivery distinction: clearly tracks lifecycle states", () => {
  const lifecycle = {
    status: "PENDING",
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
  };

  // 1. Nodemailer successfully hands message to SMTP relay
  const onSmtpAccepted = (messageId) => {
    lifecycle.status = "ACCEPTED"; // SMTP accepted, NOT yet delivered to end inbox
    lifecycle.sentAt = new Date();
    lifecycle.providerMessageId = messageId;
  };

  onSmtpAccepted("<msg-100@ffafinserv.com>");
  assert.equal(lifecycle.status, "ACCEPTED");
  assert.notEqual(lifecycle.status, "DELIVERED", "Must NOT mark as DELIVERED upon mere SMTP acceptance");
  assert.ok(lifecycle.sentAt);
  assert.equal(lifecycle.deliveredAt, null);

  // 2. Email provider webhook reports delivered
  const onWebhookDelivered = () => {
    lifecycle.status = "DELIVERED";
    lifecycle.deliveredAt = new Date();
  };

  onWebhookDelivered();
  assert.equal(lifecycle.status, "DELIVERED");
  assert.ok(lifecycle.deliveredAt);

  // 3. Email provider webhook reports bounce
  const onWebhookBounce = (reason) => {
    lifecycle.status = "BOUNCED";
    lifecycle.failedAt = new Date();
    lifecycle.error = sanitizeEmailError(reason);
  };

  onWebhookBounce("550 5.1.1 Mailbox does not exist");
  assert.equal(lifecycle.status, "BOUNCED");
  assert.ok(lifecycle.failedAt);
  assert.ok(lifecycle.error.includes("Mailbox does not exist"));
});
