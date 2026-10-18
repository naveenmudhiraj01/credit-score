import { NextRequest } from "next/server";
import { Prisma, type PaymentStatus, type EmailStatus, type SheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";
import { adminOrderSelect, formatAdminOrder, LEGACY_PRODUCTS } from "@/lib/orderView";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAY = ["CREATED", "PENDING", "PAID", "FAILED"];
const EMAIL = ["PENDING", "SENDING", "SENT", "FAILED"];
const SHEET = ["PENDING", "SYNCED", "FAILED"];
const REVIEW = ["PENDING_REVIEW", "IN_REVIEW", "INFO_REQUESTED", "APPROVED", "REJECTED", "RESPONDED", "CLOSED", "NOT_APPLICABLE"];
const failedOps: Prisma.PaymentOrderWhereInput = { status: "PAID", OR: [{ emailStatus: "FAILED" }, { sheetStatus: "FAILED" }] };

export async function GET(req: NextRequest) {
  const denied = adminGuard(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().slice(0, 100);
  const status = sp.get("status") ?? "";
  const emailStatus = sp.get("emailStatus") ?? "";
  const sheetStatus = sp.get("sheetStatus") ?? "";
  const reviewStatus = sp.get("reviewStatus") ?? "";
  const view = sp.get("view") ?? "active"; // "active" (default) | "all" | "legacy"
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.get("pageSize")) || 10));

  // Legacy / demo exclusion filter for default active view
  const legacyCondition: Prisma.PaymentOrderWhereInput =
    view === "all"
      ? {}
      : view === "legacy"
      ? { product: { in: Array.from(LEGACY_PRODUCTS) } }
      : { product: { notIn: Array.from(LEGACY_PRODUCTS) } };

  const where: Prisma.PaymentOrderWhereInput = {
    AND: [
      legacyCondition,
      PAY.includes(status) ? { status: status as PaymentStatus } : {},
      EMAIL.includes(emailStatus) ? { emailStatus: emailStatus as EmailStatus } : {},
      SHEET.includes(sheetStatus) ? { sheetStatus: sheetStatus as SheetStatus } : {},
      REVIEW.includes(reviewStatus) ? { reviewStatus: reviewStatus as any } : {},
      sp.get("ops") === "failed" ? failedOps : {},
      q ? { OR: [
        { receipt: { contains: q } }, { razorpayOrderId: { contains: q } }, { razorpayPaymentId: { contains: q } },
        { customerEmail: { contains: q } }, { customerName: { contains: q } },
      ] } : {},
    ],
  };

  try {
    const [items, total, grouped, needsAttention, pendingReviewCount, overdueReviewCount] = await Promise.all([
      prisma.paymentOrder.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: adminOrderSelect,
      }),
      prisma.paymentOrder.count({ where }),
      prisma.paymentOrder.groupBy({ by: ["status"], where: legacyCondition, _count: { _all: true } }),
      prisma.paymentOrder.count({ where: { AND: [legacyCondition, failedOps] } }),
      prisma.paymentOrder.count({ where: { status: "PAID", reviewStatus: { in: ["PENDING_REVIEW", "IN_REVIEW"] } } }), // awaiting a decision (INFO_REQUESTED is waiting on the customer)
      prisma.paymentOrder.count({ where: { status: "PAID", reviewStatus: { in: ["PENDING_REVIEW", "IN_REVIEW"] }, reviewDeadline: { lt: new Date() } } }),
    ]);
    const c = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    return ok({
      stats: {
        total: grouped.reduce((n, g) => n + g._count._all, 0),
        paid: c("PAID"), pending: c("CREATED") + c("PENDING"), failed: c("FAILED"),
        failedOperations: needsAttention, // paid orders whose email or sheet sync failed
        pendingReview: pendingReviewCount,
        overdueReview: overdueReviewCount,
      },
      items: items.map(formatAdminOrder),
      page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
      view,
    });
  } catch (e) {
    console.error("[admin/orders] query failed", e instanceof Error ? e.name : "UnknownError");
    return fail(500, "DB_ERROR", "Could not load orders.");
  }
}
