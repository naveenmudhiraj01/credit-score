import { cleanActor, planTransition, type OutcomeEmailType, type ReviewAction, type ReviewStatusValue } from "./reviewWorkflow.ts";

/**
 * Minimal slice of the Prisma client used here, so the transition logic can be exercised with an in-memory
 * fake in tests. Callers pass the real client (`prisma as unknown as ReviewDb`).
 */
export interface ReviewDb {
  paymentOrder: {
    findUnique(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
  emailNotification: { upsert(args: any): Promise<any> };
  $transaction<T>(fn: (tx: ReviewDb) => Promise<T>): Promise<T>;
}

export type ApplyResult =
  | { ok: true; orderId: string; receipt: string; action: ReviewAction; from: ReviewStatusValue; to: ReviewStatusValue; emailType: OutcomeEmailType | null }
  | { ok: false; httpStatus: number; code: string; message: string };

/**
 * Applies one explicit admin review action:
 *  - validates the transition against the persisted state,
 *  - writes the new state with compare-and-set (so two concurrent clicks cannot both win),
 *  - and, in the SAME transaction, queues the outcome notification as PENDING so a crash after commit
 *    can never leave a decision without a notification record.
 * It does not send email; the caller does that after the commit (and it is retryable).
 */
export async function applyReviewAction(
  db: ReviewDb,
  input: { receipt: string; action: unknown; message?: unknown; actor?: unknown; now?: Date },
): Promise<ApplyResult> {
  const order = await db.paymentOrder.findUnique({
    where: { receipt: input.receipt },
    select: { id: true, receipt: true, status: true, reviewStatus: true, customerEmail: true },
  });
  if (!order) return { ok: false, httpStatus: 404, code: "ORDER_NOT_FOUND", message: "Order not found." };

  const plan = planTransition(order.status, order.reviewStatus, input.action, input.message);
  if (!plan.ok) return plan;

  const now = input.now ?? new Date();
  const actor = cleanActor(input.actor);

  const data =
    plan.action === "start"
      ? { reviewStatus: plan.to, reviewStartedAt: now, reviewStartedBy: actor }
      : plan.action === "resume"
        ? { reviewStatus: plan.to }
        : { reviewStatus: plan.to, teamRespondedAt: now, teamRespondedBy: actor, teamResponseNotes: plan.message || null };

  const won = await db.$transaction(async (tx) => {
    const r = await tx.paymentOrder.updateMany({
      where: { id: order.id, status: "PAID", reviewStatus: plan.from }, // compare-and-set on the state we validated
      data,
    });
    if (r.count !== 1) return false;
    if (plan.email) {
      const recipient = order.customerEmail ?? "";
      await tx.emailNotification.upsert({
        where: { orderId_emailType: { orderId: order.id, emailType: plan.email } },
        create: { orderId: order.id, emailType: plan.email, recipient, subject: plan.email, status: "PENDING" },
        // A new decision starts a fresh notification cycle; the previous cycle's send state must not suppress it.
        update: { status: "PENDING", recipient, messageId: null, sentAt: null, deliveredAt: null, errorDetails: null, attemptCount: 0 },
      });
    }
    return true;
  });

  if (!won) {
    return { ok: false, httpStatus: 409, code: "CONFLICT", message: "This order was just changed by someone else. Reload and try again." };
  }
  return { ok: true, orderId: order.id, receipt: order.receipt, action: plan.action, from: plan.from, to: plan.to, emailType: plan.email };
}
