import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, RECEIPT_RE } from "@/lib/http";
import { reconcileOrder } from "@/lib/payments";
import { isAuthorizedForOrder, maskEmail } from "@/lib/orderAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lastRefresh = new Map<string, number>(); // per-instance throttle for Razorpay lookups
const REFRESH_GAP_MS = 15_000;

// Public, minimal: used by the success/failed/pending pages. Returns no customer PII.
// ?refresh=1 asks Razorpay for the real state first (throttled) so a pending page can resolve itself.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("order") ?? "";
  if (!RECEIPT_RE.test(id)) return fail(422, "INVALID_ORDER", "Invalid order number.");
  try {
    if (req.nextUrl.searchParams.get("refresh") === "1") {
      const last = lastRefresh.get(id) ?? 0;
      if (Date.now() - last > REFRESH_GAP_MS) {
        lastRefresh.set(id, Date.now());
        if (lastRefresh.size > 500) lastRefresh.clear();
        try { await reconcileOrder(id); } catch (e) {
          console.error("[payments/status] reconcile failed", e instanceof Error ? e.name : "UnknownError");
        }
      }
    }
    const o = await prisma.paymentOrder.findUnique({ where: { receipt: id } });
    if (!o) return fail(404, "ORDER_NOT_FOUND", "Order not found.");

    const authorized = isAuthorizedForOrder(req, o);
    const paymentEmailNotification = authorized
      ? await prisma.emailNotification.findFirst({
          where: { orderId: o.id, emailType: "CUSTOMER_PAYMENT_CONFIRMATION" },
          select: { status: true },
        })
      : null;

    return ok({
      order: {
        orderId: o.receipt, product: o.product, amount: o.amount, currency: o.currency, status: o.status,
        paymentId: o.status === "PAID" ? o.razorpayPaymentId : null, paidAt: o.paidAt,
        createdAt: o.createdAt,
        failureReason: o.status === "FAILED" ? o.failureReason : null,
        retryable: o.status === "CREATED" || o.status === "FAILED", // call /api/payments/create with { orderId }
        ...(authorized
          ? {
              customerName: o.customerName || "—",
              customerEmail: maskEmail(o.customerEmail),
              emailStatus: paymentEmailNotification?.status ?? o.emailStatus,
              reviewStatus: o.status === "PAID" ? o.reviewStatus || "PENDING_REVIEW" : "NOT_APPLICABLE",
              reviewDeadline: o.status === "PAID" ? o.reviewDeadline || (o.paidAt ? new Date(o.paidAt.getTime() + 72 * 60 * 60 * 1000) : null) : null,
            }
          : {}),
      },
    });
  } catch (e) {
    console.error("[payments/status] query failed", e instanceof Error ? e.name : "UnknownError");
    return fail(500, "DB_ERROR", "Could not load the order.");
  }
}
