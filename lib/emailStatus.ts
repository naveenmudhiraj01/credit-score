export type EmailNotificationStatus = {
  status: string;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  updatedAt?: Date | null;
};

export type EmailStatusPresentation = {
  label: string;
  state: "current" | "accepted" | "done" | "failed" | "unknown";
  detail: string;
  at: string | null;
  timeLabel: string | null;
};

const iso = (date?: Date | null) =>
  date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;

/** Customer-safe presentation of a persisted email notification state. */
export function presentEmailStatus(notification: EmailNotificationStatus): EmailStatusPresentation {
  switch (notification.status) {
    case "PENDING":
      return { label: "Customer email pending", state: "current", detail: "The email is queued for sending.", at: null, timeLabel: null };
    case "SENDING":
      return { label: "Customer email sending", state: "current", detail: "The email is being sent.", at: null, timeLabel: null };
    case "ACCEPTED":
      return {
        label: "Customer email accepted",
        state: "accepted",
        detail: "Accepted by the mail server. Inbox delivery is not confirmed.",
        at: iso(notification.sentAt),
        timeLabel: "Accepted at",
      };
    case "DELIVERED":
      return {
        label: "Customer email delivered",
        state: "done",
        detail: "Delivery confirmed.",
        at: iso(notification.deliveredAt),
        timeLabel: "Delivered at",
      };
    case "BOUNCED":
      return {
        label: "Email delivery failed",
        state: "failed",
        detail: "The recipient's mail server rejected the email. Please contact support if you need assistance.",
        at: iso(notification.updatedAt),
        timeLabel: "Failure recorded at",
      };
    case "FAILED":
      return notification.sentAt
        ? {
            label: "Email delivery failed",
            state: "failed",
            detail: "The mail server accepted the email, but a later delivery failure was reported. Please contact support if you need assistance.",
            at: iso(notification.updatedAt),
            timeLabel: "Failure recorded at",
          }
        : {
            label: "Email sending failed",
            state: "failed",
            detail: "We couldn't send the email. Please contact support if you need assistance.",
            at: iso(notification.updatedAt),
            timeLabel: "Failure recorded at",
          };
    default:
      return {
        label: "Customer email status unavailable",
        state: "unknown",
        detail: "The email status could not be determined. Please contact support if you need assistance.",
        at: null,
        timeLabel: null,
      };
  }
}
