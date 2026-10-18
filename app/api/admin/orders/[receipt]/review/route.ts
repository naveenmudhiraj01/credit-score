import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";
import { adminOrderSelect, formatAdminOrder } from "@/lib/orderView";
import { sendReviewOutcomeEmailOnce, syncSheet } from "@/lib/payments";
import { applyReviewAction, type ReviewDb } from "@/lib/reviewActions";
import { allowedActions } from "@/lib/reviewWorkflow";
import { fail, ok, readJson, RECEIPT_RE } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/orders/:receipt/review
 * Body: { action: "start" | "resume" | "approve" | "reject" | "request_info", message?: string, respondedBy?: string }
 *
 * One explicit admin action = one validated state transition (see lib/reviewWorkflow.ts).
 * Approve / reject / request_info also queue the customer notification in the same DB transaction and then
 * attempt to send it. The review outcome and the email outcome are stored separately: a failed email never
 * undoes the decision, and "accepted by SMTP" is reported as exactly that, not as delivered.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ receipt: string }> }) {
  const denied = adminGuard(req);
  if (denied) return denied;

  const { receipt } = await ctx.params;
  if (!RECEIPT_RE.test(receipt)) return fail(400, "INVALID_ORDER", "Invalid order number.");

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return fail(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  try {
    const result = await applyReviewAction(prisma as unknown as ReviewDb, {
      receipt,
      action: body.action,
      message: body.message ?? body.notes,
      actor: body.respondedBy ?? body.responder,
    });
    if (!result.ok) return fail(result.httpStatus, result.code, result.message);

    // The decision is committed. Everything below is best-effort and must not change the response's meaning.
    const emailResult = result.emailType ? await sendReviewOutcomeEmailOnce(result.orderId, result.emailType) : null;
    await syncSheet(result.orderId).catch(() => undefined);

    const [updated, notification] = await Promise.all([
      prisma.paymentOrder.findUnique({ where: { receipt }, select: adminOrderSelect }),
      result.emailType
        ? prisma.emailNotification.findFirst({
            where: { orderId: result.orderId, emailType: result.emailType },
            select: { emailType: true, status: true, errorDetails: true, sentAt: true, updatedAt: true },
          })
        : Promise.resolve(null),
    ]);

    let message = `Review status is now ${result.to}.`;
    if (result.emailType) {
      if (emailResult === "SENT") message += " The email was accepted by the mail server; delivery is not confirmed.";
      else if (emailResult === "IN_PROGRESS") message += " The customer email is being sent.";
      else message += " The customer email could not be sent yet; use “Retry email”.";
    }

    return ok({
      order: updated ? { ...formatAdminOrder(updated), allowedActions: allowedActions(updated.reviewStatus) } : null,
      notification,
      message,
    });
  } catch (err) {
    console.error("[admin/orders/:id/review] error:", err instanceof Error ? err.name : "UnknownError");
    return fail(500, "DB_ERROR", "Could not record the review action.");
  }
}
