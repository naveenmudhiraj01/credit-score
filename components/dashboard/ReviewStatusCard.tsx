"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Timer } from "lucide-react";
import GlassCard from "./GlassCard";
import StatusBadge from "./StatusBadge";
import {
  REVIEW_COPY,
  REVIEW_FINISHED,
  REVIEW_LABEL,
  REVIEW_TARGET_HOURS,
  countdown,
  formatCountdown,
} from "@/lib/review";
import { fmtDate } from "@/lib/format";

function useNow(active: boolean, ms = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

export default function ReviewStatusCard({
  reviewStatus,
  deadline,
  customerMessage,
  className = "",
}: {
  reviewStatus: string | null | undefined;
  deadline: Date | null;
  customerMessage?: string | null;
  className?: string;
}) {
  const known = reviewStatus && Object.prototype.hasOwnProperty.call(REVIEW_LABEL, reviewStatus);
  const showTarget =
    Boolean(deadline) &&
    known &&
    !REVIEW_FINISHED.includes(reviewStatus!) &&
    reviewStatus !== "INFO_REQUESTED";
  const now = useNow(Boolean(showTarget));
  const c = showTarget ? countdown(deadline, now) : null;

  return (
    <GlassCard aria-labelledby="review-title" delay={0.1} className={className}>
      <h2 id="review-title" className="cd-title cd-h2">
        <span className="cd-h2-icon">
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        Review Status
      </h2>

      <div className="mt-4">
        {known ? (
          <StatusBadge value={reviewStatus} size="lg" />
        ) : (
          <StatusBadge value={null} size="lg" label="Status not available yet" />
        )}
      </div>
      <p className="cd-muted mt-3 text-sm leading-relaxed">
        {known && reviewStatus
          ? REVIEW_COPY[reviewStatus]
          : "Your payment is verified. We haven't received a review update for this order yet, and it will appear here once it's recorded."}
      </p>

      {customerMessage && (
        <div className="cd-callout mt-4" role="note">
          <p className="cd-muted text-xs font-semibold uppercase tracking-wide">Message from our team</p>
          <p
            className="mt-1 whitespace-pre-line break-words text-[0.95rem] leading-relaxed"
            style={{ color: "var(--cd-navy)" }}
          >
            {customerMessage}
          </p>
        </div>
      )}

      {showTarget && (
        <div className="cd-countdown mt-4">
          <p className="cd-muted flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Timer className="h-4 w-4" aria-hidden="true" />
            Target response by
          </p>
          <p className="cd-title mt-1 text-[0.95rem]">{fmtDate(deadline)}</p>
          {c && !c.overdue && (
            <>
              <p className="cd-countdown-value mt-3">
                {formatCountdown(c)} <span className="cd-muted text-sm font-semibold">remaining</span>
              </p>
              <div className="cd-bar mt-2" aria-hidden="true">
                <span style={{ width: `${Math.round(c.progress * 100)}%` }} />
              </div>
            </>
          )}
          {c?.overdue && (
            <p className="mt-3 text-sm font-medium" style={{ color: "var(--cd-warning-fg)" }}>
              The {REVIEW_TARGET_HOURS}-hour target has passed. If you haven't received an update, please contact
              support and quote your Order ID.
            </p>
          )}
        </div>
      )}
      <p className="cd-muted mt-3 text-xs">
        {REVIEW_TARGET_HOURS} hours is our target response time, not a guarantee.
      </p>
    </GlassCard>
  );
}
