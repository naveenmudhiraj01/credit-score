import { prisma } from "./prisma.ts";
import { getRazorpay, type RzpPayment } from "./razorpay.ts";
import {
  emailConfigured,
  missingEmailEnv,
  sendConfirmationEmail,
  sendAdminPaymentNotificationEmail,
  sendApplicationReceivedEmail,
  sendAdminNewRegistrationEmail,
  sendReviewOutcomeEmail,
  getAdminNotificationEmail,
  sanitizeEmailError,
} from "./email.ts";
import { sheetsConfigured, upsertOrderRow } from "./sheets.ts";
import type { PaymentOrder, EmailType } from "@prisma/client";
import { validateEmail } from "./validation.ts";
import { outcomeEmailTypeFor, type OutcomeEmailType } from "./reviewWorkflow.ts";

export type FinalizeState = "PAID" | "PENDING" | "CREATED" | "FAILED" | "MISMATCH" | "NOT_FOUND";
type Source = "VERIFY" | "WEBHOOK" | "RECONCILE";
export type SheetResult = "SYNCED" | "FAILED" | "SKIPPED";
export type EmailResult = "SENT" | "FAILED" | "SKIPPED" | "IN_PROGRESS";

const EMAIL_STALE_MS = 10 * 60_000; // a SENDING claim older than this is considered crashed

/** Push the latest order state to Google Sheets (idempotent upsert). Never throws. */
export async function syncSheet(orderId: string): Promise<SheetResult> {
  if (!sheetsConfigured()) return "SKIPPED";
  try {
    const o = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!o) return "SKIPPED";
    await upsertOrderRow(o);
    await prisma.paymentOrder.update({ where: { id: orderId }, data: { sheetStatus: "SYNCED", sheetSyncedAt: new Date() } });
    return "SYNCED";
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[sheets] sync failed for order", orderId, errMsg);
    await prisma.paymentOrder.update({ where: { id: orderId }, data: { sheetStatus: "FAILED" } }).catch(() => undefined);
    return "FAILED";
  }
}

/**
 * Generic atomic email dispatcher with idempotent state tracking in EmailNotification.
 * Distinguishes SMTP acceptance (ACCEPTED) from verified delivery (DELIVERED).
 * Never leaks credentials in error logs or database records.
 */
export async function sendEmailNotificationAtomic(
  orderId: string,
  emailType: EmailType,
  recipientRole: "CUSTOMER" | "ADMIN",
  senderFn: (order: PaymentOrder, resolvedRecipient: string) => Promise<{ messageId: string }>,
  options?: { requirePaid?: boolean }
): Promise<EmailResult> {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order) return "SKIPPED";
  if (options?.requirePaid && order.status !== "PAID") {
    return "SKIPPED";
  }

  let recipient = "";
  let recipientError: unknown;
  try {
    if (recipientRole === "CUSTOMER") {
      const validation = validateEmail(order.customerEmail);
      if (!validation.valid) throw new Error("Customer email address on order is missing or invalid.");
      recipient = validation.value!;
    } else {
      recipient = await getAdminNotificationEmail(async () => {
        const row = await prisma.systemSetting.findUnique({ where: { key: "admin_notification_email" } });
        return row?.value;
      });
    }
  } catch (error) {
    recipientError = error;
  }

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - EMAIL_STALE_MS);

  // Check existing notification state for idempotency
  const existing = await prisma.emailNotification.findFirst({
    where: { orderId, emailType },
  });

  if (existing) {
    if (existing.status === "ACCEPTED" || existing.status === "DELIVERED") {
      return "SENT"; // Already sent, idempotent no-op
    }
    if (existing.status === "SENDING" && existing.updatedAt > staleThreshold) {
      return "IN_PROGRESS";
    }
  }

  // Atomically claim as SENDING. The unique order/type key closes the initial-create race.
  let notificationId: string;
  try {
    if (existing) {
      const claim = await prisma.emailNotification.updateMany({
        where: {
          id: existing.id,
          status: existing.status,
          ...(existing.status === "SENDING" ? { updatedAt: { lt: staleThreshold } } : {}),
        },
        data: {
          status: "SENDING",
          recipient,
          attemptCount: { increment: 1 },
          messageId: null,
          sentAt: null,
          deliveredAt: null,
          errorDetails: null,
        },
      });
      if (claim.count !== 1) return "IN_PROGRESS";
      notificationId = existing.id;
    } else {
      const created = await prisma.emailNotification.create({
        data: {
          orderId,
          emailType,
          recipient,
          subject: emailType,
          status: "SENDING",
          attemptCount: 1,
        },
      });
      notificationId = created.id;
    }
  } catch (claimErr) {
    console.warn(`[email] claim conflict for ${emailType} order ${orderId}:`, sanitizeEmailError(claimErr));
    return "IN_PROGRESS";
  }

  const claimVersion = await prisma.emailNotification.findUnique({
    where: { id: notificationId },
    select: { updatedAt: true },
  });
  if (!claimVersion) return "IN_PROGRESS";

  let result: { messageId: string };
  try {
    if (recipientError) throw recipientError;
    const missing = missingEmailEnv();
    if (missing.length > 0) {
      throw new Error(`SMTP is not configured. Missing: ${missing.join(", ")}`);
    }

    result = await senderFn(order, recipient);
  } catch (err) {
    const sanitized = sanitizeEmailError(err);
    console.error(`[email] ${emailType} delivery failed for order ${orderId}:`, sanitized);

    let failed: { count: number };
    try {
      failed = await prisma.emailNotification.updateMany({
        where: { id: notificationId, status: "SENDING", updatedAt: claimVersion.updatedAt },
        data: {
          status: "FAILED",
          errorDetails: sanitized,
        },
      });
    } catch (error) {
      console.error(`[email] could not persist ${emailType} failure for order ${orderId}:`, sanitizeEmailError(error));
      return "FAILED";
    }
    if (failed.count !== 1) return "IN_PROGRESS";

    if (emailType === "CUSTOMER_PAYMENT_CONFIRMATION") {
      await prisma.paymentOrder.update({
        where: { id: orderId },
        data: { emailStatus: "FAILED" },
      }).catch((error) => {
        console.error("[email] customer payment failure status update failed for order", orderId, sanitizeEmailError(error));
      });
    }

    return "FAILED";
  }

  try {
    const accepted = await prisma.emailNotification.updateMany({
      where: { id: notificationId, status: "SENDING", updatedAt: claimVersion.updatedAt },
      data: {
        status: "ACCEPTED",
        messageId: result.messageId || null,
        sentAt: new Date(),
        errorDetails: null,
      },
    });
    if (accepted.count !== 1) return "IN_PROGRESS";
  } catch (error) {
    console.error(
      `[email] SMTP accepted ${emailType} for order ${orderId}, but acceptance status could not be persisted:`,
      sanitizeEmailError(error)
    );
    return "FAILED";
  }

  // Mirror on PaymentOrder for backward compatibility and Google Sheets synchronization.
  if (emailType === "CUSTOMER_PAYMENT_CONFIRMATION") {
    await prisma.paymentOrder.update({
      where: { id: orderId },
      data: { emailStatus: "SENT", emailSentAt: new Date() },
    }).catch((error) => {
      console.error("[email] customer payment status update failed for order", orderId, sanitizeEmailError(error));
    });
  }

  console.info(`[email] ${emailType} accepted by SMTP for order ${orderId}`);
  return "SENT";
}

/** Send customer application received email upon registration. */
export async function sendCustomerRegistrationEmailOnce(orderId: string): Promise<EmailResult> {
  return sendEmailNotificationAtomic(
    orderId,
    "CUSTOMER_REGISTRATION",
    "CUSTOMER",
    async (order, recipient) => sendApplicationReceivedEmail(order, recipient)
  );
}

/** Send admin new registration notification email upon customer registration. */
export async function sendAdminRegistrationEmailOnce(orderId: string): Promise<EmailResult> {
  return sendEmailNotificationAtomic(
    orderId,
    "ADMIN_REGISTRATION",
    "ADMIN",
    async (order, recipient) => sendAdminNewRegistrationEmail(order, recipient)
  );
}

/**
 * Triggers both customer and admin registration emails independently.
 * Failure of one does NOT block or prevent the other.
 */
export async function runRegistrationNotifications(orderId: string): Promise<{
  customer: EmailResult;
  admin: EmailResult;
}> {
  const [customerRes, adminRes] = await Promise.allSettled([
    sendCustomerRegistrationEmailOnce(orderId),
    sendAdminRegistrationEmailOnce(orderId),
  ]);

  const customer = customerRes.status === "fulfilled" ? customerRes.value : "FAILED";
  const admin = adminRes.status === "fulfilled" ? adminRes.value : "FAILED";
  return { customer, admin };
}

/** Send customer payment confirmation email (requires verified PAID status). */
export async function sendCustomerPaymentEmailOnce(orderId: string): Promise<EmailResult> {
  return sendEmailNotificationAtomic(
    orderId,
    "CUSTOMER_PAYMENT_CONFIRMATION",
    "CUSTOMER",
    async (order, recipient) => sendConfirmationEmail(order, recipient),
    { requirePaid: true }
  );
}

/** Send admin payment notification email (requires verified PAID status). */
export async function sendAdminPaymentEmailOnce(orderId: string): Promise<EmailResult> {
  return sendEmailNotificationAtomic(
    orderId,
    "ADMIN_PAYMENT_NOTIFICATION",
    "ADMIN",
    async (order, recipient) => sendAdminPaymentNotificationEmail(order, recipient),
    { requirePaid: true }
  );
}

/**
 * Sends (or retries) the customer notification for the order's CURRENT review decision.
 * Idempotent: an already ACCEPTED/DELIVERED notification is never re-sent, concurrent senders are
 * serialised by the SENDING claim, and a stale retry (the order has since moved to a different
 * decision) is skipped. Never throws.
 */
export async function sendReviewOutcomeEmailOnce(orderId: string, emailType: OutcomeEmailType): Promise<EmailResult> {
  try {
    const current = await prisma.paymentOrder.findUnique({ where: { id: orderId }, select: { reviewStatus: true } });
    if (!current || outcomeEmailTypeFor(current.reviewStatus) !== emailType) return "SKIPPED";
    return await sendEmailNotificationAtomic(
      orderId,
      emailType,
      "CUSTOMER",
      async (order, recipient) => sendReviewOutcomeEmail(emailType, order, recipient),
      { requirePaid: true },
    );
  } catch (err) {
    console.error(`[email] ${emailType} processing failed for order ${orderId}:`, sanitizeEmailError(err));
    return "FAILED";
  }
}

/** Backward-compatible alias for customer payment confirmation. Never throws. */
export async function sendEmailOnce(orderId: string): Promise<EmailResult> {
  return sendCustomerPaymentEmailOnce(orderId);
}

/**
 * Executes post-payment side-effects independently:
 * 1. Customer payment confirmation email
 * 2. Admin payment notification email
 * 3. Google Sheets synchronization
 */
export async function runSideEffects(orderId: string) {
  const results = await Promise.allSettled([
    sendCustomerPaymentEmailOnce(orderId),
    sendAdminPaymentEmailOnce(orderId),
  ]);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const notification = index === 0 ? "CUSTOMER_PAYMENT_CONFIRMATION" : "ADMIN_PAYMENT_NOTIFICATION";
      console.error(`[email] ${notification} processing failed for order ${orderId}:`, sanitizeEmailError(result.reason));
    }
  });
  await syncSheet(orderId); // after email so the sheet reflects email status
}

export async function sideEffectsOutstanding(o: PaymentOrder): Promise<boolean> {
  const sheetPending = sheetsConfigured() && o.sheetStatus !== "SYNCED";
  if (!emailConfigured()) return sheetPending;

  const notifications = await prisma.emailNotification.findMany({
    where: {
      orderId: o.id,
      emailType: { in: ["CUSTOMER_PAYMENT_CONFIRMATION", "ADMIN_PAYMENT_NOTIFICATION"] },
    },
    select: { emailType: true, status: true, updatedAt: true },
  });
  const customer = notifications.find((n) => n.emailType === "CUSTOMER_PAYMENT_CONFIRMATION");
  const admin = notifications.find((n) => n.emailType === "ADMIN_PAYMENT_NOTIFICATION");
  const isComplete = (notification: typeof customer) =>
    notification?.status === "ACCEPTED" || notification?.status === "DELIVERED";
  const customerPending = Boolean(o.customerEmail) &&
    (customer ? !isComplete(customer) : o.emailStatus !== "SENT");
  const adminPending = !isComplete(admin);

  return sheetPending || customerPending || adminPending;
}

/**
 * The only place an order becomes PAID. Asks Razorpay for the authoritative payment
 * state and checks order id, amount and currency before touching the database.
 * Safe to call repeatedly (verify endpoint + webhooks + reconcile + retries).
 */
export async function finalizePayment(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature?: string;
  source: Source;
}): Promise<{ state: FinalizeState; receipt?: string; message?: string }> {
  const { razorpayOrderId, razorpayPaymentId, signature, source } = args;
  const order = await prisma.paymentOrder.findUnique({ where: { razorpayOrderId } });
  if (!order) return { state: "NOT_FOUND" };

  if (order.status === "PAID") {
    if (await sideEffectsOutstanding(order)) await runSideEffects(order.id); // heal failed email/sheet
    return { state: "PAID", receipt: order.receipt };
  }

  const rzp = getRazorpay();
  let payment = (await rzp.payments.fetch(razorpayPaymentId)) as unknown as RzpPayment;

  if (payment.order_id !== razorpayOrderId || payment.amount !== order.amount || payment.currency !== order.currency) {
    await prisma.paymentAttempt.create({
      data: { orderId: order.id, razorpayPaymentId, status: "FAILED", source, error: "Order/amount/currency mismatch" },
    });
    return { state: "MISMATCH", receipt: order.receipt };
  }

  if (payment.status === "authorized") {
    try {
      payment = (await rzp.payments.capture(razorpayPaymentId, order.amount, order.currency)) as unknown as RzpPayment;
    } catch (e) {
      // A concurrent verify/webhook may have captured it first: trust Razorpay's current state.
      payment = (await rzp.payments.fetch(razorpayPaymentId)) as unknown as RzpPayment;
      if (payment.status !== "captured") throw e;
    }
  }

  if (payment.status === "failed" || payment.status === "refunded") {
    const reason = payment.status === "refunded" ? "Payment was refunded" : payment.error_description;
    await markFailed(order.id, razorpayPaymentId, source, reason);
    return { state: "FAILED", receipt: order.receipt, message: reason };
  }
  if (payment.status !== "captured") {
    await markPending(order.id, razorpayPaymentId, source);
    return { state: "PENDING", receipt: order.receipt };
  }

  const first = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const r = await tx.paymentOrder.updateMany({
      where: { id: order.id, status: { not: "PAID" } },
      data: {
        status: "PAID",
        razorpayPaymentId,
        razorpaySignature: signature ?? null,
        paidAt: now,
        reviewDeadline: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        reviewStatus: "PENDING_REVIEW",
        failureReason: null,
        // Fill gaps from the payer's checkout details; never overwrite form data.
        ...(order.customerEmail ? {} : { customerEmail: payment.email?.toLowerCase() ?? null }),
        ...(order.customerMobile ? {} : { customerMobile: payment.contact ?? null }),
      },
    });
    if (r.count === 1) {
      await tx.paymentAttempt.create({ data: { orderId: order.id, razorpayPaymentId, status: "PAID", source } });
    }
    return r.count === 1;
  });

  await runSideEffects(order.id);
  return { state: "PAID", receipt: order.receipt, message: first ? undefined : "already processed" };
}

/** Payment exists but is not captured yet. Never overwrites PAID. */
export async function markPending(orderId: string, paymentId: string, source: Source) {
  const r = await prisma.paymentOrder.updateMany({
    where: { id: orderId, status: { in: ["CREATED", "FAILED"] } },
    data: { status: "PENDING" },
  });
  if (r.count === 1) {
    await prisma.paymentAttempt.create({ data: { orderId, razorpayPaymentId: paymentId, status: "PENDING", source } });
    await syncSheet(orderId);
  }
}

export async function markFailed(orderId: string, paymentId: string, source: Source, reason?: string) {
  const reasonText = reason?.slice(0, 480);
  await prisma.$transaction([
    prisma.paymentOrder.updateMany({
      where: { id: orderId, status: { not: "PAID" } }, // never downgrade a paid order
      data: { status: "FAILED", failureReason: reasonText ?? "Payment failed" },
    }),
    prisma.paymentAttempt.create({ data: { orderId, razorpayPaymentId: paymentId, status: "FAILED", source, error: reasonText } }),
  ]);
  await syncSheet(orderId);
}

/**
 * Ask Razorpay what actually happened to an order and bring MySQL in line.
 * Covers: customer charged but the browser never called /verify and the webhook was missed.
 */
export async function reconcileOrder(receipt: string): Promise<{ state: FinalizeState; receipt?: string; message?: string }> {
  const order = await prisma.paymentOrder.findUnique({ where: { receipt } });
  if (!order) return { state: "NOT_FOUND" };
  if (order.status === "PAID") {
    if (await sideEffectsOutstanding(order)) await runSideEffects(order.id);
    return { state: "PAID", receipt };
  }

  const list = (await getRazorpay().orders.fetchPayments(order.razorpayOrderId)) as unknown as { items?: RzpPayment[] };
  const items = list.items ?? [];
  const winner = items.find((p) => p.status === "captured") ?? items.find((p) => p.status === "authorized");
  if (winner) return finalizePayment({ razorpayOrderId: order.razorpayOrderId, razorpayPaymentId: winner.id, source: "RECONCILE" });

  const failed = items.find((p) => p.status === "failed");
  if (failed && order.status !== "FAILED" && !items.some((p) => p.status === "created")) {
    await markFailed(order.id, failed.id, "RECONCILE", failed.error_description);
    return { state: "FAILED", receipt, message: failed.error_description };
  }
  return { state: order.status === "PENDING" ? "PENDING" : order.status === "FAILED" ? "FAILED" : "CREATED", receipt };
}
