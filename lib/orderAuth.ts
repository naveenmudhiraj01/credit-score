import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { buildTimeline, type TimelineNotification } from "./orderTimeline.ts";

/** Fails closed in production: a publicly known fallback secret would let anyone forge order tokens. */
const getSecret = () => {
  const secret = process.env.ORDER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ORDER_SESSION_SECRET (or ADMIN_SESSION_SECRET) must be set in production.");
  }
  return "customer-order-auth-secret-key-min-32-chars"; // development / tests only
};

function isValidAdminSession(token?: string | null): boolean {
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const expected = crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(exp)
    .digest("base64url");
  return (
    mac.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  );
}

/**
 * Creates a signed HMAC token granting access to a specific order receipt.
 */
export function createOrderToken(receipt: string, emailOrId: string = ""): string {
  const normalizedReceipt = receipt.trim().toUpperCase();
  const normalizedIdentity = emailOrId.trim().toLowerCase();
  const payload = `${normalizedReceipt}:${normalizedIdentity}`;
  const mac = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${normalizedReceipt}.${mac}`;
}

/**
 * Validates whether a token matches the specified order receipt.
 */
export function verifyOrderToken(receipt: string, emailOrId: string = "", token?: string | null): boolean {
  if (!token) return false;
  try {
    const expected = createOrderToken(receipt, emailOrId);
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Checks whether an incoming request is authorized to view an order's full customer details.
 * Authorized if:
 * 1. Request is from a verified Administrator (admin_session cookie).
 * 2. Request contains a valid order token in cookie (order_token_<receipt>) or header (x-order-token).
 */
export function isAuthorizedForOrder(
  req: NextRequest,
  order: { receipt: string; customerEmail?: string | null }
): boolean {
  // 1. Admin authorization check
  const adminCookie = req.cookies.get("admin_session")?.value;
  if (isValidAdminSession(adminCookie)) {
    return true; // Admin is fully authorized
  }

  // 2. Token authorization check
  const normalizedReceipt = order.receipt.trim().toUpperCase();
  const cookieName = `order_token_${normalizedReceipt}`;
  const tokenFromCookie = req.cookies.get(cookieName)?.value;
  const tokenFromHeader = req.headers.get("x-order-token");
  const token = tokenFromCookie || tokenFromHeader;

  if (token && verifyOrderToken(normalizedReceipt, order.customerEmail || "", token)) {
    return true;
  }

  // Also check combined customer_orders cookie if present
  const combinedCookie = req.cookies.get("customer_orders")?.value;
  if (combinedCookie) {
    try {
      const tokens: string[] = JSON.parse(combinedCookie);
      if (Array.isArray(tokens)) {
        for (const t of tokens) {
          if (verifyOrderToken(normalizedReceipt, order.customerEmail || "", t)) {
            return true;
          }
        }
      }
    } catch {
      // ignore malformed cookie
    }
  }

  return false;
}

/**
 * Masks an email for privacy (e.g., "hima@gmail.com" -> "h***a@gmail.com").
 */
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes("@")) return "—";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Masks a mobile number for privacy (e.g., "+919876543210" -> "******3210").
 */
export function maskMobile(mobile?: string | null): string {
  if (!mobile) return "—";
  const clean = mobile.replace(/\D/g, "");
  if (clean.length < 4) return "******";
  return `******${clean.slice(-4)}`;
}

/**
 * Formats order for dashboard display, avoiding sensitive secrets/tokens.
 */
export function formatDashboardOrder(order: {
  receipt: string;
  product: string;
  amount: number;
  currency: string;
  status: string;
  razorpayPaymentId?: string | null;
  paidAt?: Date | null;
  createdAt: Date;
  failureReason?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerMobile?: string | null;
  reviewStatus?: string | null;
  reviewDeadline?: Date | null;
  reviewStartedAt?: Date | null;
  teamRespondedAt?: Date | null;
  teamResponseNotes?: string | null;
}, notification?: TimelineNotification) {
  const isPaid = order.status === "PAID";
  const deadline =
    order.reviewDeadline ||
    (order.paidAt ? new Date(order.paidAt.getTime() + 72 * 60 * 60 * 1000) : null);

  const reviewStatus = isPaid ? order.reviewStatus || "PENDING_REVIEW" : "NOT_APPLICABLE";
  const { steps, emailDelivery } = buildTimeline({ ...order, reviewStatus }, notification);
  const showMessage = isPaid && (reviewStatus === "APPROVED" || reviewStatus === "REJECTED" || reviewStatus === "INFO_REQUESTED");

  return {
    orderId: order.receipt,
    product: order.product,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    paymentId: isPaid ? order.razorpayPaymentId || null : null,
    paidAt: order.paidAt || null,
    createdAt: order.createdAt,
    failureReason: order.status === "FAILED" ? order.failureReason || null : null,
    customerName: order.customerName || "—",
    customerEmail: maskEmail(order.customerEmail),
    customerMobile: maskMobile(order.customerMobile),
    reviewStatus,
    reviewStartedAt: isPaid ? order.reviewStartedAt || null : null,
    reviewDeadline: isPaid ? deadline : null,
    // Server-computed "What happens next?" steps and the real state of the outcome email.
    timeline: steps,
    emailDelivery,
    // The admin's message to the customer for the latest decision (same text that is emailed). Never internal data.
    customerMessage: showMessage ? order.teamResponseNotes || null : null,
    retryable: order.status === "CREATED" || order.status === "FAILED",
  };
}
