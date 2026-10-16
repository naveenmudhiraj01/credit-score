import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCheckoutSignature } from "@/lib/razorpay";
import { finalizePayment } from "@/lib/payments";
import { fail, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await readJson(req);
  } catch {
    return fail(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  const orderId = b.razorpay_order_id, paymentId = b.razorpay_payment_id, signature = b.razorpay_signature;
  if (
    typeof orderId !== "string" || !/^order_\w+$/.test(orderId) ||
    typeof paymentId !== "string" || !/^pay_\w+$/.test(paymentId) ||
    typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)
  ) return fail(422, "INVALID_PAYLOAD", "Missing or malformed payment details.");

  try {
    if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
      const order = await prisma.paymentOrder.findUnique({ where: { razorpayOrderId: orderId } });
      if (order) {
        await prisma.paymentAttempt.create({
          data: { orderId: order.id, razorpayPaymentId: paymentId, status: "FAILED", source: "VERIFY", error: "Invalid signature" },
        });
      }
      return fail(400, "SIGNATURE_INVALID", "Payment signature could not be verified.");
    }

    const r = await finalizePayment({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, signature, source: "VERIFY" });
    switch (r.state) {
      case "PAID": return ok({ status: "PAID", orderId: r.receipt });
      case "PENDING": return ok({ status: "PENDING", orderId: r.receipt }, 202);
      case "FAILED": return fail(402, "PAYMENT_FAILED", r.message ?? "Payment failed.");
      case "MISMATCH": return fail(409, "ORDER_MISMATCH", "Payment does not match this order.");
      default: return fail(404, "ORDER_NOT_FOUND", "Order not found.");
    }
  } catch (e) {
    console.error("[payments/verify] request failed", e instanceof Error ? e.name : "UnknownError");
    return fail(500, "VERIFY_ERROR", "Could not verify the payment. If you were charged, it will be reconciled automatically.");
  }
}
