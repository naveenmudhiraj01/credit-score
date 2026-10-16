const TONES = {
  PAID: "bg-emerald-100 text-emerald-700",
  SENT: "bg-emerald-100 text-emerald-700",
  SYNCED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-600",
  CREATED: "bg-amber-100 text-amber-600",
  SENDING: "bg-amber-100 text-amber-600",
  PENDING_REVIEW: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-indigo-100 text-indigo-700",
  INFO_REQUESTED: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-600",
  ACCEPTED: "bg-sky-100 text-sky-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  BOUNCED: "bg-red-100 text-red-600",
  RESPONDED: "bg-emerald-100 text-emerald-700",
  NOT_APPLICABLE: "bg-slate-100 text-slate-500",
  FAILED: "bg-red-100 text-red-500",
};

export default function StatusPill({ value }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${TONES[value] || "bg-slate-100 text-slate-600"}`}>
      {value ? String(value).replace(/_/g, " ") : "—"}
    </span>
  );
}
