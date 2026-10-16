import { NextRequest, after } from "next/server";
import crypto from "node:crypto";
import net from "node:net";
import { prisma } from "@/lib/prisma";
import { findProduct, resolveProductWithFee, CONSENT_VERSION, getConsentText } from "@/lib/catalog";
import { getActiveServiceFeePaise } from "@/lib/settings";
import { getRazorpay } from "@/lib/razorpay";
import { fail, ok, readJson, RECEIPT_RE } from "@/lib/http";
import { syncSheet, runRegistrationNotifications } from "@/lib/payments";
import { createOrderToken } from "@/lib/orderAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { validateCreateOrderRequest } from "@/lib/validation";

function sanitizeClientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = req.headers.get("x-real-ip")?.trim();
  const candidate = forwarded || direct;
  if (candidate && net.isIP(candidate)) {
    return candidate.slice(0, 45);
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return fail(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  // Validate request payload using centralized production validator
  const validation = validateCreateOrderRequest(body);
  if (!validation.ok) {
    return fail(
      validation.statusCode || 400,
      validation.errorCode || "VALIDATION_ERROR",
      validation.errorMessage || "Invalid request payload."
    );
  }

  const { orderRef, productId, name, dob, email, mobile } = validation.data!;
  const rawProduct = orderRef ? undefined : findProduct(productId);


  // Authoritative dynamic service fee resolution
  const activeFeePaise = await getActiveServiceFeePaise();
  const product = rawProduct ? resolveProductWithFee(rawProduct, activeFeePaise) : undefined;

  const payload = (o: { receipt: string; razorpayOrderId: string; amount: number; currency: string; product: string; customerEmail?: string | null }) => {
    const token = createOrderToken(o.receipt, o.customerEmail || "");
    const res = ok({
      orderId: o.receipt,
      razorpayOrderId: o.razorpayOrderId,
      amount: o.amount,
      currency: o.currency,
      product: o.product,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      orderToken: token,
    });
    res.cookies.set(`order_token_${o.receipt}`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  };

  try {
    // Explicit order retry: ONLY when orderId was explicitly passed in request
    if (orderRef) {
      if (!RECEIPT_RE.test(orderRef)) return fail(422, "INVALID_ORDER", "Invalid order number.");
      const existing = await prisma.paymentOrder.findUnique({ where: { receipt: orderRef } });
      if (!existing) return fail(404, "ORDER_NOT_FOUND", "Order not found.");
      if (existing.status === "PAID") return fail(409, "ALREADY_PAID", "This order is already paid.", { orderId: existing.receipt });
      if (existing.status === "PENDING")
        return fail(409, "PAYMENT_PENDING", "Your payment is being confirmed. Please check back shortly.", { orderId: existing.receipt });
      return payload(existing);
    }

    if (!product) return fail(422, "INVALID_PRODUCT", "Select a valid product.");

    // Generate unique application order receipt
    const receipt = `ORD${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const rzpOrder = await getRazorpay().orders.create({
      amount: product.amountPaise,
      currency: product.currency,
      receipt,
      notes: { product: product.name, productId: product.id },
    });

    const consentText = getConsentText(product.amountPaise);
    const consentIp = sanitizeClientIp(req);
    const consentTimestamp = new Date();

    const order = await prisma.paymentOrder.create({
      data: {
        receipt,
        razorpayOrderId: rzpOrder.id,
        product: product.name,
        amount: product.amountPaise,
        currency: product.currency,
        customerName: name,
        customerDob: dob ?? null,
        customerEmail: email,
        customerMobile: mobile,
        consentGiven: true,
        consentVersion: CONSENT_VERSION,
        consentText: consentText,
        consentTimestamp: consentTimestamp,
        consentIp: consentIp ?? null,
        reviewStatus: "NOT_APPLICABLE", // transitions to PENDING_REVIEW only upon verified capture
      },
    });

    after(async () => {
      await Promise.allSettled([
        syncSheet(order.id),
        runRegistrationNotifications(order.id),
      ]);
    });
    return payload(order);
  } catch (e) {
    const err = e as { message?: string; statusCode?: number; error?: { description?: string } };
    console.error("[payments/create] request failed", err.statusCode ?? "", e instanceof Error ? e.message : e);
    if (err.message?.startsWith("Missing environment variable"))
      return fail(500, "NOT_CONFIGURED", "Payments are not configured on the server.");
    return fail(502, "ORDER_CREATE_FAILED", "Could not start the payment. Please try again.");
  }
}
