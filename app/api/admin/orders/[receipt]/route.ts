import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";
import { adminOrderSelect, formatAdminOrder } from "@/lib/orderView";
import { allowedActions } from "@/lib/reviewWorkflow";
import { presentEmailStatus } from "@/lib/emailStatus";
import { fail, ok, RECEIPT_RE } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ receipt: string }> }) {
  const denied = adminGuard(req);
  if (denied) return denied;
  const { receipt } = await ctx.params;
  if (!RECEIPT_RE.test(receipt)) return fail(422, "INVALID_ORDER", "Invalid order number.");
  try {
    const order = await prisma.paymentOrder.findUnique({
      where: { receipt },
      select: {
        ...adminOrderSelect,
        attempts: {
          orderBy: { createdAt: "desc" }, take: 50,
          select: { id: true, razorpayPaymentId: true, status: true, source: true, error: true, createdAt: true },
        },
        notifications: {
          where: {
            emailType: {
              in: ["CUSTOMER_PAYMENT_CONFIRMATION", "ADMIN_PAYMENT_NOTIFICATION", "REVIEW_APPROVED", "REVIEW_REJECTED", "REVIEW_INFO_REQUESTED"],
            },
          },
          orderBy: { createdAt: "desc" },
          select: { emailType: true, recipient: true, status: true, errorDetails: true, sentAt: true, deliveredAt: true, updatedAt: true },
        },
      },
    });
    if (!order) return fail(404, "ORDER_NOT_FOUND", "Order not found.");
    return ok({
      order: {
        ...formatAdminOrder(order),
        notifications: order.notifications.map((notification) => ({
          ...notification,
          customerDisplay: presentEmailStatus(notification),
        })),
        allowedActions: allowedActions(order.reviewStatus),
      },
    });
  } catch (e) {
    console.error("[admin/orders/:id] query failed", e instanceof Error ? e.message : e);
    return fail(500, "DB_ERROR", "Could not load the order.");
  }
}
