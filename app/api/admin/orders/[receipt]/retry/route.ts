import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";
import { adminOrderSelect } from "@/lib/orderView";
import { emailConfigured, missingEmailEnv } from "@/lib/email";
import { missingSheetsEnv, sheetsConfigured } from "@/lib/sheets";
import { reconcileOrder, sendEmailOnce, sendReviewOutcomeEmailOnce, syncSheet } from "@/lib/payments";
import { outcomeEmailTypeFor } from "@/lib/reviewWorkflow";
import { fail, ok, readJson, RECEIPT_RE } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: { action: "email" | "review_email" | "sheet" | "recheck" } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ receipt: string }> }) {
  const denied = adminGuard(req);
  if (denied) return denied;
  const { receipt } = await ctx.params;
  if (!RECEIPT_RE.test(receipt)) return fail(422, "INVALID_ORDER", "Invalid order number.");

  let action: unknown;
  try { action = (await readJson(req)).action; } catch { return fail(400, "INVALID_JSON", "Request body must be valid JSON."); }

  try {
    const order = await prisma.paymentOrder.findUnique({ where: { receipt } });
    if (!order) return fail(404, "ORDER_NOT_FOUND", "Order not found.");

    let result: string;
    if (action === "email") {
      if (order.status !== "PAID") return fail(409, "NOT_PAID", "Emails are only sent for verified paid orders.");
      if (!order.customerEmail) return fail(422, "NO_CUSTOMER_EMAIL", "This order has no customer email address.");
      if (!emailConfigured()) return fail(409, "NOT_CONFIGURED", `Email is not configured. Missing: ${missingEmailEnv().join(", ")}`);
      if (order.emailStatus === "SENT") return fail(409, "ALREADY_SENT", "The confirmation email was already sent.");
      result = await sendEmailOnce(order.id);
      if (result === "IN_PROGRESS") return fail(409, "IN_PROGRESS", "An email is already being sent for this order.");
      await syncSheet(order.id); // keep the sheet's email status current
    } else if (action === "review_email") {
      // Retries the notification for the order's CURRENT review decision (approved / rejected / info requested).
      const emailType = outcomeEmailTypeFor(order.reviewStatus);
      if (order.status !== "PAID" || !emailType) return fail(409, "NO_NOTIFICATION", "This order has no review decision to notify the customer about.");
      if (!order.customerEmail) return fail(422, "NO_CUSTOMER_EMAIL", "This order has no customer email address.");
      if (!emailConfigured()) return fail(409, "NOT_CONFIGURED", `Email is not configured. Missing: ${missingEmailEnv().join(", ")}`);
      const existing = await prisma.emailNotification.findFirst({ where: { orderId: order.id, emailType }, select: { status: true } });
      if (existing?.status === "ACCEPTED" || existing?.status === "DELIVERED") return fail(409, "ALREADY_SENT", "This notification was already sent.");
      result = await sendReviewOutcomeEmailOnce(order.id, emailType);
      if (result === "IN_PROGRESS") return fail(409, "IN_PROGRESS", "An email is already being sent for this order.");
    } else if (action === "sheet") {
      if (!sheetsConfigured()) return fail(409, "NOT_CONFIGURED", `Google Sheets is not configured. Missing: ${missingSheetsEnv().join(", ")}`);
      result = await syncSheet(order.id);
    } else if (action === "recheck") {
      result = (await reconcileOrder(receipt)).state; // asks Razorpay; only a captured payment can make it PAID
    } else {
      return fail(422, "INVALID_ACTION", 'action must be "email", "review_email", "sheet" or "recheck".');
    }

    const updated = await prisma.paymentOrder.findUnique({ where: { receipt }, select: adminOrderSelect });
    const smtpAccepted = (action === "email" || action === "review_email") && result === "SENT";
    const success = result === "SENT" || result === "SYNCED" || action === "recheck";
    return ok(
      {
        result: smtpAccepted ? "ACCEPTED_UNCONFIRMED" : result,
        succeeded: smtpAccepted ? false : success,
        deliveryConfirmed: smtpAccepted ? false : undefined,
        order: updated,
      },
      smtpAccepted ? 202 : success ? 200 : 502,
    );
  } catch (e) {
    console.error("[admin/retry] operation failed", action, e instanceof Error ? e.name : "UnknownError");
    return fail(500, "RETRY_ERROR", "The retry could not be completed.");
  }
}
