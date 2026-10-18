import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, type RzpPayment } from "@/lib/razorpay";
import { finalizePayment, markFailed } from "@/lib/payments";
import { fail, isUniqueViolation, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text(); // signature is over the exact raw body
  const sig = req.headers.get("x-razorpay-signature");
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.error("[webhook] Missing environment variable: RAZORPAY_WEBHOOK_SECRET");
    return fail(500, "NOT_CONFIGURED", "Webhook not configured.");
  }
  if (!sig || !verifyWebhookSignature(raw, sig)) return fail(401, "BAD_SIGNATURE", "Invalid signature.");

  let evt: { event?: string; payload?: { payment?: { entity?: RzpPayment } } };
  try {
    evt = JSON.parse(raw);
  } catch {
    return fail(400, "INVALID_JSON", "Malformed body.");
  }

  const eventId = req.headers.get("x-razorpay-event-id") ?? crypto.createHash("sha256").update(raw).digest("hex");
  try {
    await prisma.webhookEvent.create({ data: { id: eventId, event: evt.event ?? "unknown" } });
  } catch (e) {
    if (isUniqueViolation(e)) return ok({ duplicate: true }); // already handled
    console.error("[webhook] event insert failed", e instanceof Error ? e.name : "UnknownError");
    return fail(500, "DB_ERROR", "Try again.");
  }

  try {
    const p = evt.payload?.payment?.entity;
    if (p?.order_id && p.id) {
      if (["payment.captured", "payment.authorized", "order.paid"].includes(evt.event ?? "")) {
        await finalizePayment({ razorpayOrderId: p.order_id, razorpayPaymentId: p.id, source: "WEBHOOK" });
      } else if (evt.event === "payment.failed") {
        const order = await prisma.paymentOrder.findUnique({ where: { razorpayOrderId: p.order_id } });
        if (order) await markFailed(order.id, p.id, "WEBHOOK", p.error_description);
      }
    }
    return ok();
  } catch (e) {
    console.error("[webhook] processing failed", evt.event, e instanceof Error ? e.name : "UnknownError");
    await prisma.webhookEvent.delete({ where: { id: eventId } }).catch(() => undefined); // let Razorpay retry
    return fail(500, "PROCESSING_ERROR", "Try again.");
  }
}
