import { AlertCircle, CheckCircle2, Clock, Hourglass, HelpCircle, MinusCircle, Search, XCircle } from "lucide-react";
import { REVIEW_LABEL } from "@/lib/review";

// Every state has an icon AND a text label so meaning never relies on colour alone.
const MAP: Record<string, { tone: string; Icon: any; label: string }> = {
  PAID: { tone: "success", Icon: CheckCircle2, label: "Paid" },
  PENDING: { tone: "warning", Icon: Clock, label: "Pending" },
  FAILED: { tone: "error", Icon: XCircle, label: "Failed" },
  PENDING_REVIEW: { tone: "info", Icon: Hourglass, label: REVIEW_LABEL.PENDING_REVIEW },
  IN_REVIEW: { tone: "info", Icon: Search, label: REVIEW_LABEL.IN_REVIEW },
  INFO_REQUESTED: { tone: "warning", Icon: AlertCircle, label: REVIEW_LABEL.INFO_REQUESTED },
  APPROVED: { tone: "success", Icon: CheckCircle2, label: REVIEW_LABEL.APPROVED },
  REJECTED: { tone: "error", Icon: XCircle, label: REVIEW_LABEL.REJECTED },
  RESPONDED: { tone: "success", Icon: CheckCircle2, label: REVIEW_LABEL.RESPONDED },
  CLOSED: { tone: "neutral", Icon: MinusCircle, label: REVIEW_LABEL.CLOSED },
  NOT_APPLICABLE: { tone: "neutral", Icon: MinusCircle, label: REVIEW_LABEL.NOT_APPLICABLE },
};

export default function StatusBadge({
  value,
  size = "md",
  label,
}: {
  value: string | null | undefined;
  size?: "md" | "lg";
  label?: string;
}) {
  const m =
    (value && MAP[value]) || {
      tone: "neutral",
      Icon: HelpCircle,
      label: value ? String(value).replace(/_/g, " ").toLowerCase() : "Unavailable",
    };
  return (
    <span className={`cd-badge cd-badge--${m.tone} ${size === "lg" ? "cd-badge--lg" : ""}`}>
      <m.Icon className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
      {label || m.label}
    </span>
  );
}
