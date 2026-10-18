import { outcomeEmailTypeFor } from "./reviewWorkflow.ts";
import { presentEmailStatus } from "./emailStatus.ts";

/**
 * Builds the customer-facing "What happens next?" timeline from persisted data only.
 * Nothing is derived from what the browser believes; the frontend just renders this.
 *
 * Step states:
 *   done      – confirmed complete
 *   current   – in progress
 *   attention – waiting on the customer (information requested)
 *   accepted  – email handed to the SMTP server; delivery NOT confirmed
 *   failed    – payment failed, or the email could not be sent / bounced
 *   upcoming  – not started
 */
export type TimelineState = "done" | "current" | "attention" | "accepted" | "failed" | "upcoming" | "unknown";
export type TimelineStep = { key: "paid" | "submitted" | "review" | "email"; label: string; state: TimelineState; detail: string; at: string | null; timeLabel?: string | null };
export type EmailDelivery = "NONE" | "PENDING" | "ACCEPTED" | "DELIVERED" | "BOUNCED" | "FAILED";

export type TimelineOrder = {
  status: string;
  reviewStatus?: string | null;
  paidAt?: Date | null;
  reviewStartedAt?: Date | null;
  teamRespondedAt?: Date | null;
};
export type TimelineNotification = { emailType: string; status: string; deliveredAt?: Date | null; sentAt?: Date | null; updatedAt?: Date | null } | null | undefined;

const iso = (d?: Date | null) => (d ? d.toISOString() : null);

/** Maps the raw DeliveryStatus of the outcome email to a coarse, honest customer-facing value. */
export function emailDeliveryOf(order: TimelineOrder, n: TimelineNotification): EmailDelivery {
  const expected = outcomeEmailTypeFor(order.reviewStatus);
  if (!expected) return "NONE";
  if (!n || n.emailType !== expected) return "PENDING"; // decision made, notification not yet created/processed
  switch (n.status) {
    case "ACCEPTED": return "ACCEPTED";
    case "DELIVERED": return "DELIVERED";
    case "BOUNCED": return "BOUNCED";
    case "FAILED": return "FAILED";
    default: return "PENDING"; // PENDING | SENDING
  }
}

export function buildTimeline(order: TimelineOrder, notification?: TimelineNotification): { steps: TimelineStep[]; emailDelivery: EmailDelivery } {
  const paid = order.status === "PAID";
  const rs = order.reviewStatus ?? "NOT_APPLICABLE";
  const emailDelivery = paid ? emailDeliveryOf(order, notification) : "NONE";

  // 1. Payment — only PAID (set exclusively by server-side verification with the provider) completes it.
  const payment: TimelineStep = paid
    ? { key: "paid", label: "Payment received and verified", state: "done", detail: "Verified with the payment provider.", at: iso(order.paidAt) }
    : order.status === "PENDING"
      ? { key: "paid", label: "Payment received and verified", state: "current", detail: "Your payment is still being confirmed.", at: null }
      : order.status === "FAILED"
        ? { key: "paid", label: "Payment received and verified", state: "failed", detail: "The payment was not completed.", at: null }
        : { key: "paid", label: "Payment received and verified", state: "upcoming", detail: "Waiting for payment.", at: null };

  // 2. Submitted — a persisted review record exists (written in the same transaction that marks the order PAID).
  const submitted = paid && rs !== "NOT_APPLICABLE";
  const submittedStep: TimelineStep = {
    key: "submitted",
    label: "Order submitted for review",
    state: submitted ? "done" : "upcoming",
    detail: submitted ? "Your order is in our review queue." : paid ? "No team review is recorded for this order." : "Starts after payment is verified.",
    at: submitted ? iso(order.paidAt) : null,
  };

  // 3. Review — in progress only after an admin explicitly starts it.
  let review: TimelineStep;
  if (!paid || rs === "NOT_APPLICABLE") {
    review = { key: "review", label: "Team review in progress", state: "upcoming", detail: "Not started.", at: null };
  } else if (rs === "PENDING_REVIEW") {
    review = { key: "review", label: "Team review in progress", state: "upcoming", detail: "Waiting for our team to begin the review.", at: null };
  } else if (rs === "IN_REVIEW") {
    review = { key: "review", label: "Team review in progress", state: "current", detail: "Our team is reviewing your order.", at: iso(order.reviewStartedAt) };
  } else if (rs === "INFO_REQUESTED") {
    review = { key: "review", label: "Team review in progress", state: "attention", detail: "We need some more information from you.", at: iso(order.teamRespondedAt) };
  } else {
    // APPROVED | REJECTED | RESPONDED | CLOSED
    review = { key: "review", label: "Team review in progress", state: "done", detail: "Review completed.", at: iso(order.teamRespondedAt) };
  }

  // 4. Email — mirrors the outcome notification's real state; "accepted" is never shown as "delivered".
  let email: TimelineStep = { key: "email", label: "Customer updated by email", state: "upcoming", detail: "After the review is completed.", at: null };
  if (paid && outcomeEmailTypeFor(rs)) {
    switch (emailDelivery) {
      default:
        email = notification?.emailType === outcomeEmailTypeFor(rs)
          ? { ...email, ...presentEmailStatus(notification), key: "email" }
          : { ...email, state: "current", detail: "Preparing your email update.", at: null };
    }
  } else if (paid && (rs === "RESPONDED" || rs === "CLOSED")) {
    email = { ...email, state: "current", detail: "A response was recorded. Please check your registered email.", at: null };
  }

  return { steps: [payment, submittedStep, review, email], emailDelivery };
}
