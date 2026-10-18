/**
 * Pure review-workflow rules (no database, no I/O) so they can be unit-tested and shared.
 *
 *   PENDING_REVIEW --start--> IN_REVIEW --approve------> APPROVED       (+ REVIEW_APPROVED email)
 *                                       --reject-------> REJECTED       (+ REVIEW_REJECTED email, message required)
 *                                       --request_info-> INFO_REQUESTED (+ REVIEW_INFO_REQUESTED email, message required)
 *   INFO_REQUESTED --resume--> IN_REVIEW   (explicit admin action once the customer has replied)
 *
 * Legacy RESPONDED / CLOSED / NOT_APPLICABLE orders are not part of the workflow and cannot be actioned.
 * Nothing here ever runs because a page was opened: every transition needs an explicit admin action.
 */

export type ReviewStatusValue =
  | "NOT_APPLICABLE"
  | "PENDING_REVIEW"
  | "IN_REVIEW"
  | "INFO_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "RESPONDED"
  | "CLOSED";

export type ReviewAction = "start" | "resume" | "approve" | "reject" | "request_info";
export type OutcomeEmailType = "REVIEW_APPROVED" | "REVIEW_REJECTED" | "REVIEW_INFO_REQUESTED";

export const REVIEW_ACTIONS: readonly ReviewAction[] = ["start", "resume", "approve", "reject", "request_info"];
export const MAX_MESSAGE_LENGTH = 2000;

type Rule = {
  from: readonly ReviewStatusValue[];
  to: ReviewStatusValue;
  email?: OutcomeEmailType;
  messageRequired: boolean;
};

const RULES: Record<ReviewAction, Rule> = {
  start: { from: ["PENDING_REVIEW"], to: "IN_REVIEW", messageRequired: false },
  resume: { from: ["INFO_REQUESTED"], to: "IN_REVIEW", messageRequired: false },
  approve: { from: ["IN_REVIEW"], to: "APPROVED", email: "REVIEW_APPROVED", messageRequired: false },
  reject: { from: ["IN_REVIEW"], to: "REJECTED", email: "REVIEW_REJECTED", messageRequired: true },
  request_info: { from: ["IN_REVIEW"], to: "INFO_REQUESTED", email: "REVIEW_INFO_REQUESTED", messageRequired: true },
};

export const isReviewAction = (v: unknown): v is ReviewAction =>
  typeof v === "string" && (REVIEW_ACTIONS as readonly string[]).includes(v);

/** Which outcome email belongs to a review status (null if that status sends none). */
export function outcomeEmailTypeFor(status: string | null | undefined): OutcomeEmailType | null {
  switch (status) {
    case "APPROVED": return "REVIEW_APPROVED";
    case "REJECTED": return "REVIEW_REJECTED";
    case "INFO_REQUESTED": return "REVIEW_INFO_REQUESTED";
    default: return null;
  }
}

/** Actions an admin may take from a given review status (used by the admin UI and the API alike). */
export function allowedActions(status: string | null | undefined): ReviewAction[] {
  return REVIEW_ACTIONS.filter((a) => (RULES[a].from as readonly string[]).includes(String(status)));
}

/** Customer-facing text: trimmed, control characters removed, length-capped. Returns "" if nothing usable. */
export function cleanMessage(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

/** Short free-text reviewer label. NOTE: with a single shared admin password this is self-declared, not authenticated. */
export function cleanActor(raw: unknown): string {
  const v = typeof raw === "string" ? raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim().slice(0, 120) : "";
  return v || "admin";
}

export type TransitionPlan =
  | { ok: true; action: ReviewAction; from: ReviewStatusValue; to: ReviewStatusValue; email: OutcomeEmailType | null; message: string }
  | { ok: false; httpStatus: number; code: string; message: string };

export function planTransition(
  paymentStatus: string,
  current: string | null | undefined,
  action: unknown,
  rawMessage?: unknown,
): TransitionPlan {
  if (!isReviewAction(action)) {
    return { ok: false, httpStatus: 422, code: "INVALID_ACTION", message: `action must be one of: ${REVIEW_ACTIONS.join(", ")}.` };
  }
  if (paymentStatus !== "PAID") {
    return { ok: false, httpStatus: 409, code: "NOT_PAID", message: "Review actions are only permitted for verified paid orders." };
  }
  const rule = RULES[action];
  if (!(rule.from as readonly string[]).includes(String(current))) {
    return {
      ok: false,
      httpStatus: 409,
      code: "INVALID_TRANSITION",
      message: `Cannot ${action.replace("_", " ")} an order whose review status is ${current ?? "unknown"}.`,
    };
  }
  const message = cleanMessage(rawMessage);
  if (rule.messageRequired && !message) {
    return { ok: false, httpStatus: 422, code: "MESSAGE_REQUIRED", message: "A message for the customer is required for this action." };
  }
  return { ok: true, action, from: current as ReviewStatusValue, to: rule.to, email: rule.email ?? null, message };
}
