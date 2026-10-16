import { AlertCircle, Check, Clock, FileCheck2, Mail, Search, Send, XCircle } from "lucide-react";
import { fmtDate } from "../../lib/format";

const ICONS = { paid: Check, submitted: FileCheck2, review: Search, email: Mail };
const STATE_ICON = { done: Check, failed: XCircle, attention: AlertCircle, accepted: Send };
const STATE_TEXT = {
  done: "Completed",
  current: "In progress",
  attention: "Action needed",
  accepted: "Accepted by mail server",
  failed: "Problem",
  upcoming: "Not started",
  unknown: "Awaiting update",
};

/** Vertical stepper. `steps` come from lib/review.timelineSteps (backend-computed states only). */
export default function ReviewTimeline({ steps }) {
  return (
    <ol className="cd-tl" aria-label="Order progress">
      {steps.map((st) => {
        const Icon = STATE_ICON[st.state] || ICONS[st.key] || Clock;
        const isCurrent = st.state === "current" || st.state === "attention";
        return (
          <li key={st.key} data-state={st.state} aria-current={isCurrent ? "step" : undefined}>
            <span className="cd-node" data-state={st.state}><Icon className="h-4 w-4" strokeWidth={st.state === "done" ? 3 : 2} aria-hidden="true" /></span>
            <div className="min-w-0 pt-0.5">
              <p className="cd-title text-[0.95rem] leading-snug" style={st.state === "upcoming" ? { color: "var(--cd-text-muted)" } : undefined}>
                {st.key === "email" && st.state === "accepted" ? "Email notification sent" : st.label}
              </p>
              {!(st.key === "email" && st.state === "accepted") && (
                <p className="cd-muted text-xs">
                  <span className="font-semibold">{STATE_TEXT[st.state] || STATE_TEXT.unknown}</span>
                  {st.note ? <span> — {st.note}</span> : null}
                </p>
              )}
              {st.key === "review" && st.state === "current" && st.at && (
                <p className="cd-muted mt-1 text-xs">Started {fmtDate(st.at)}</p>
              )}
              {st.key === "email" && ["accepted", "done", "failed"].includes(st.state) && (
                <p className="cd-muted mt-1 text-xs">
                  {st.at
                    ? `${st.timeLabel || "Status updated at"} ${fmtDate(st.at)}.`
                    : st.state === "accepted"
                      ? "Acceptance time unavailable."
                      : st.state === "done"
                        ? "Delivery confirmation time unavailable."
                        : "Failure time unavailable."}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
