/**
 * Pure review-status logic for the customer dashboard (no React / DOM).
 * Everything is derived from persisted backend fields; nothing is assumed complete because the page is open.
 */

export const REVIEW_TARGET_HOURS = 72;
const HOUR = 3600 * 1000;

// Review states the backend reports (the backend owns the workflow; these are display strings only).
export const REVIEW_LABEL = {
  PENDING_REVIEW: "Pending review",
  IN_REVIEW: "In review",
  INFO_REQUESTED: "More information needed",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  RESPONDED: "Responded",
  CLOSED: "Closed",
  NOT_APPLICABLE: "Not applicable",
};

export const REVIEW_COPY = {
  PENDING_REVIEW: "Your payment is verified and your details are queued for our team to review.",
  IN_REVIEW: "Our team has started reviewing your order.",
  INFO_REQUESTED: "Our team needs some more information from you to continue. See the message below.",
  APPROVED: "Our team has completed the review and approved your order.",
  REJECTED: "Our team has completed the review and was unable to approve your order.",
  RESPONDED: "Our team has recorded a response for your order. Please check your registered email for details.",
  CLOSED: "This review has been closed.",
  NOT_APPLICABLE: "No team review is recorded for this order.",
};

/** Review states in which the 72-hour response target is no longer relevant. */
export const REVIEW_FINISHED = ["APPROVED", "REJECTED", "RESPONDED", "CLOSED", "NOT_APPLICABLE"];

export function maskEmail(e) {
  const [user, domain] = String(e || "").split("@");
  return user && domain ? `${user[0]}${"*".repeat(Math.max(2, user.length - 1))}@${domain}` : "";
}

const validDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Persisted deadline wins. Otherwise paidAt + 72h — a pure function of a stored timestamp, so a refresh never restarts it.
 * Returns a Date or null.
 */
export function reviewDeadline(order) {
  const persisted = validDate(order?.reviewDeadline);
  if (persisted) return persisted;
  const paidAt = validDate(order?.paidAt);
  return paidAt ? new Date(paidAt.getTime() + REVIEW_TARGET_HOURS * HOUR) : null;
}

/** Remaining-time breakdown against a deadline. `progress` is the elapsed share (0..1) of the 72h window. */
export function countdown(deadline, now = Date.now()) {
  if (!deadline) return null;
  const end = deadline.getTime();
  const remaining = end - now;
  const progress = Math.min(1, Math.max(0, 1 - remaining / (REVIEW_TARGET_HOURS * HOUR)));
  if (remaining <= 0) return { overdue: true, days: 0, hours: 0, minutes: 0, progress: 1 };
  const totalMinutes = Math.floor(remaining / 60000);
  return { overdue: false, days: Math.floor(totalMinutes / 1440), hours: Math.floor((totalMinutes % 1440) / 60), minutes: totalMinutes % 60, progress };
}

export function formatCountdown(c) {
  if (!c || c.overdue) return "";
  const parts = [];
  const total = c.days * 24 + c.hours;
  if (total > 0) parts.push(`${total}h`);
  parts.push(`${c.minutes}m`);
  return parts.join(" ");
}

const STEP_LABELS = [
  ["paid", "Payment received and verified"],
  ["submitted", "Order submitted for review"],
  ["review", "Team review in progress"],
  ["email", "Customer updated by email"],
];

/**
 * Timeline steps for "What happens next?". The backend computes them from persisted data
 * (payment verification, review status, notification state), so this only maps them for display:
 * done | current | attention | accepted | failed | upcoming. If the backend sent no timeline we claim nothing ("unknown").
 */
export function timelineSteps(order) {
  if (Array.isArray(order?.timeline) && order.timeline.length) {
    return order.timeline.map((s) => ({ key: s.key, label: s.label, state: s.state, note: s.detail || undefined, at: s.at || null, timeLabel: s.timeLabel || null }));
  }
  return STEP_LABELS.map(([key, label]) => ({ key, label, state: "unknown" }));
}

export const POLL_INTERVAL_MS = 20000;

/**
 * How often the dashboard should re-ask the backend for progress (null = stop).
 * Stops once nothing more can change without an explicit admin action: failed payment, or a final decision whose email is delivered.
 */
export function pollIntervalMs(order) {
  if (!order) return null;
  if (order.status === "FAILED") return null;
  const finalDecision = order.reviewStatus === "APPROVED" || order.reviewStatus === "REJECTED";
  if (order.status === "PAID" && finalDecision && order.emailDelivery === "DELIVERED") return null;
  return POLL_INTERVAL_MS;
}
