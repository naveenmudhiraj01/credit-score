import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, RECEIPT_RE } from "@/lib/http";
import {
  createOrderToken,
  formatDashboardOrder,
  isAuthorizedForOrder,
} from "@/lib/orderAuth";
import { outcomeEmailTypeFor } from "@/lib/reviewWorkflow";
import { createFailureLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guessing the registered email/mobile for an order ID: cap failures per (IP, order) and per order overall.
const perClient = createFailureLimiter({ max: 5, windowMs: 15 * 60_000 });
const perOrder = createFailureLimiter({ max: 15, windowMs: 15 * 60_000 });
const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/** The notification belonging to the order's current review decision (if any), for the timeline's last step. */
async function loadOutcomeNotification(order: { id: string; reviewStatus: string; status: string }) {
  const emailType = order.status === "PAID" ? outcomeEmailTypeFor(order.reviewStatus) : null;
  if (!emailType) return null;
  return prisma.emailNotification.findFirst({
    where: { orderId: order.id, emailType },
    select: { emailType: true, status: true, deliveredAt: true, sentAt: true, updatedAt: true },
  });
}

/**
 * GET /api/orders/[receipt]/dashboard
 * Secure order-ID based lookup for customer dashboard.
 * - Searches backend database for exact order ID.
 * - Enforces authorization: admin or valid customer order token.
 * - If unauthenticated/unverified, returns 401 with requiresVerification: true without leaking PII.
 * - Returns 404 if order does not exist.
 * - Never modifies or fabricates orders.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ receipt: string }> }) {
  const { receipt } = await ctx.params;
  const cleanReceipt = (receipt || "").trim().toUpperCase();

  if (!RECEIPT_RE.test(cleanReceipt)) {
    return fail(422, "INVALID_ORDER", "Invalid order number format.");
  }

  try {
    const order = await prisma.paymentOrder.findUnique({
      where: { receipt: cleanReceipt },
    });

    if (!order) {
      return fail(404, "ORDER_NOT_FOUND", `Order ${cleanReceipt} not found.`);
    }

    const authorized = isAuthorizedForOrder(req, order);
    if (!authorized) {
      return fail(401, "UNAUTHORIZED", "Verification required to view customer details for this order.", {
        requiresVerification: true,
        orderId: order.receipt,
      });
    }

    return ok({ order: formatDashboardOrder(order, await loadOutcomeNotification(order)) });
  } catch (e) {
    console.error("[orders/:receipt/dashboard] query failed", e instanceof Error ? e.message : e);
    return fail(500, "DB_ERROR", "Could not load order details.");
  }
}

/**
 * POST /api/orders/[receipt]/dashboard
 * Verify ownership of an order using registered email or mobile number.
 * Upon successful match, returns the order details and sets an authorized order access cookie.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ receipt: string }> }) {
  const { receipt } = await ctx.params;
  const cleanReceipt = (receipt || "").trim().toUpperCase();

  if (!RECEIPT_RE.test(cleanReceipt)) {
    return fail(422, "INVALID_ORDER", "Invalid order number format.");
  }

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return fail(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const clientKey = `${clientIp(req)}|${cleanReceipt}`;
  const orderKey = cleanReceipt;
  if (perClient.isBlocked(clientKey) || perOrder.isBlocked(orderKey)) {
    return fail(429, "TOO_MANY_ATTEMPTS", "Too many verification attempts. Please wait a few minutes and try again.");
  }

  const rawInput = String(body.emailOrPhone || body.verificationInput || "").trim();
  if (!rawInput) {
    return fail(400, "MISSING_VERIFICATION", "Please enter your registered email or mobile number.");
  }

  try {
    const order = await prisma.paymentOrder.findUnique({
      where: { receipt: cleanReceipt },
    });

    if (!order) {
      return fail(404, "ORDER_NOT_FOUND", `Order ${cleanReceipt} not found.`);
    }

    const inputLower = rawInput.toLowerCase();
    const inputDigits = rawInput.replace(/\D/g, "");

    const orderEmailLower = (order.customerEmail || "").trim().toLowerCase();
    const orderMobileDigits = (order.customerMobile || "").replace(/\D/g, "");

    const emailMatches = orderEmailLower && inputLower === orderEmailLower;
    const phoneMatches =
      orderMobileDigits &&
      inputDigits.length >= 10 &&
      (orderMobileDigits === inputDigits ||
        orderMobileDigits.endsWith(inputDigits) ||
        inputDigits.endsWith(orderMobileDigits.slice(-10)));

    if (!emailMatches && !phoneMatches) {
      perClient.recordFailure(clientKey);
      perOrder.recordFailure(orderKey);
      return fail(
        403,
        "VERIFICATION_FAILED",
        "Verification failed. The entered email or phone number does not match this order."
      );
    }

    perClient.reset(clientKey);
    const token = createOrderToken(order.receipt, order.customerEmail || "");
    const res = ok({ order: formatDashboardOrder(order, await loadOutcomeNotification(order)), token });

    res.cookies.set(`order_token_${order.receipt}`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return res;
  } catch (e) {
    console.error("[orders/:receipt/dashboard/verify] verification error", e instanceof Error ? e.message : e);
    return fail(500, "DB_ERROR", "Could not complete verification.");
  }
}
