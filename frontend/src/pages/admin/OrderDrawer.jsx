import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Mail, RefreshCw, Sheet, X } from "lucide-react";
import StatusPill from "../../components/StatusPill";
import Spinner from "../../components/Spinner";
import { api } from "../../lib/api";
import { fmtDate, inr } from "../../lib/format";

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-[13px]">
    <dt className="text-slate-500">{k}</dt>
    <dd className="break-all text-right font-medium text-slate-900">{v || "—"}</dd>
  </div>
);

export default function OrderDrawer({ receipt, onClose, onChanged }) {
  const nav = useNavigate();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // { ok, text }
  const [reviewMsg, setReviewMsg] = useState(null); // { ok, text } for the review workflow block
  const [message, setMessage] = useState(""); // customer-facing message for the next decision
  const [reviewer, setReviewer] = useState(""); // self-declared reviewer label (the admin login is a shared password)

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/admin/orders/${receipt}`);
      setOrder(d.order);
    } catch (e) {
      if (e.status === 401) nav("/admin", { replace: true });
      else setError(e.message);
    }
  }, [receipt, nav]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action) => {
    setBusy(action); setMsg(null);
    try {
      const d = await api(`/api/admin/orders/${receipt}/retry`, { method: "POST", body: { action } });
      setMsg({ ok: d.succeeded, text: d.succeeded ? `Done (${d.result}).` : `Did not succeed: ${d.result}.` });
    } catch (e) {
      if (e.status === 401) return nav("/admin", { replace: true });
      setMsg({ ok: false, text: e.message });
    }
    setBusy("");
    await load();
    onChanged?.();
  };

  const DECISIONS = {
    approve: { label: "Approve", needsMessage: false, confirm: "Approve this order and email the customer?" },
    reject: { label: "Reject", needsMessage: true, confirm: "Reject this order and email the customer the reason?" },
    request_info: { label: "Request information", needsMessage: true, confirm: "Ask the customer for more information by email?" },
  };

  /** One explicit review action → POST /review. The backend validates the transition; the UI only offers what it allows. */
  const act = async (action) => {
    const d = DECISIONS[action];
    if (d?.needsMessage && !message.trim()) { setReviewMsg({ ok: false, text: "A message for the customer is required for this action." }); return; }
    if (d && !window.confirm(d.confirm)) return;
    setBusy(`review:${action}`); setReviewMsg(null);
    try {
      const res = await api(`/api/admin/orders/${receipt}/review`, {
        method: "POST",
        body: { action, message: message.trim() || undefined, respondedBy: reviewer.trim() || undefined },
      });
      setReviewMsg({ ok: true, text: res.message });
      if (d) setMessage("");
    } catch (e) {
      if (e.status === 401) return nav("/admin", { replace: true });
      setReviewMsg({ ok: false, text: e.message });
    }
    setBusy("");
    await load();
    onChanged?.();
  };

  const Action = ({ id, Icon, label, disabled }) => (
    <button onClick={() => run(id)} disabled={!!busy || disabled} className="btn-ghost">
      {busy === id ? <Spinner className="h-4 w-4" /> : <Icon className="h-4 w-4" />}{label}
    </button>
  );

  const allowed = order?.allowedActions || [];
  const OUTCOME_TYPE = { APPROVED: "REVIEW_APPROVED", REJECTED: "REVIEW_REJECTED", INFO_REQUESTED: "REVIEW_INFO_REQUESTED" };
  const outcomeType = order?.status === "PAID" ? OUTCOME_TYPE[order.reviewStatus] : undefined;
  const outcome = outcomeType ? order?.notifications?.find((n) => n.emailType === outcomeType) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Order ${receipt}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-card sm:rounded-l-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-500">Order</p>
            <h2 className="text-lg font-bold text-ink">{receipt}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
        {!order && !error && <div className="flex justify-center py-16 text-brand"><Spinner className="h-6 w-6" /></div>}

        {order && (
          <>
            <div className="mt-3"><StatusPill value={order.status} /></div>
            <dl className="mt-4">
              <Row k="Product" v={<span className="inline-flex items-center gap-1.5">{order.product}{order.isLegacy && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Legacy</span>}</span>} />
              <Row k="Amount" v={inr(order.amount)} />
              <Row k="Customer" v={order.customerName} />
              <Row k="Email" v={order.customerEmail} />
              <Row k="Mobile" v={order.customerMobile} />
              <Row k="Razorpay order" v={order.razorpayOrderId} />
              <Row k="Payment ID" v={order.razorpayPaymentId} />
              <Row k="Created" v={fmtDate(order.createdAt)} />
              <Row k="Paid at" v={fmtDate(order.paidAt)} />
              {order.failureReason && <Row k="Failure reason" v={order.failureReason} />}
            </dl>

            <h3 className="mt-6 text-sm font-semibold text-ink">Email and Google Sheet</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <p className="text-slate-500">Confirmation email</p>
                <div className="mt-1"><StatusPill value={order.emailStatus} /></div>
                <p className="mt-1 text-[11px] text-slate-500">{order.emailSentAt ? fmtDate(order.emailSentAt) : "Not sent"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <p className="text-slate-500">Google Sheet</p>
                <div className="mt-1"><StatusPill value={order.sheetStatus} /></div>
                <p className="mt-1 text-[11px] text-slate-500">{order.sheetSyncedAt ? fmtDate(order.sheetSyncedAt) : "Not synced"}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Action id="email" Icon={Mail} label="Send confirmation email" disabled={order.status !== "PAID" || order.emailStatus === "SENT"} />
              <Action id="sheet" Icon={Sheet} label="Re-sync sheet" />
              <Action id="recheck" Icon={RefreshCw} label="Recheck payment" disabled={order.status === "PAID"} />
            </div>
            {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}

            {/* Consent Audit Section */}
            <h3 className="mt-6 text-sm font-semibold text-slate-900">Consent & Declaration Audit</h3>
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[13px]">
              <Row k="Consent Accepted" v={order.consentGiven ? "Yes (Mandatory acceptance recorded)" : "Not Recorded / Legacy"} />
              <Row k="Consent Version" v={order.consentVersion || "—"} />
              <Row k="Timestamp" v={order.consentTimestamp ? fmtDate(order.consentTimestamp) : "—"} />
              <Row k="Client IP" v={order.consentIp || "—"} />
              {order.consentText && (
                <div className="mt-2 pt-2 border-t border-slate-200/60 text-xs">
                  <p className="font-semibold text-slate-700">Accepted Terms Text:</p>
                  <p className="mt-1 p-2 rounded bg-white text-slate-600 border border-slate-200/80 italic text-[11px] leading-relaxed">
                    "{order.consentText}"
                  </p>
                </div>
              )}
            </div>

            {/* Team Review SLA Section */}
            <h3 className="mt-6 text-sm font-semibold text-slate-900">Team Review & 72h SLA</h3>
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[13px]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Review Status</span>
                <StatusPill value={order.reviewStatus} />
              </div>
              <Row k="Review Deadline" v={order.reviewDeadline ? fmtDate(order.reviewDeadline) : "N/A"} />
              
              {(order.reviewStatus === "PENDING_REVIEW" || order.reviewStatus === "IN_REVIEW") && order.reviewDeadline && (
                <div className="mt-2 rounded p-2 text-xs bg-amber-50 text-amber-900 border border-amber-200">
                  {new Date() > new Date(order.reviewDeadline) ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-red-600"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Overdue: 72-hour review deadline has passed.</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" />Target response within 72 hours of payment (due by {fmtDate(order.reviewDeadline)}).
                    </span>
                  )}
                </div>
              )}

              {order.reviewStartedAt && <Row k="Review started" v={`${fmtDate(order.reviewStartedAt)}${order.reviewStartedBy ? ` · ${order.reviewStartedBy}` : ""}`} />}
              {order.teamRespondedAt && <Row k="Decision recorded" v={`${fmtDate(order.teamRespondedAt)}${order.teamRespondedBy ? ` · ${order.teamRespondedBy}` : ""}`} />}
              {order.teamResponseNotes && ["APPROVED", "REJECTED", "INFO_REQUESTED", "RESPONDED"].includes(order.reviewStatus) && (
                <div className="mt-2 rounded bg-white p-2 text-xs text-slate-700 border border-slate-200">
                  <p className="font-semibold text-slate-800">Message to customer</p>
                  <p className="mt-1 whitespace-pre-line break-words">{order.teamResponseNotes}</p>
                </div>
              )}

              {outcomeType && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">Customer email</span>
                    <StatusPill value={outcome?.status || "PENDING"} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {outcome?.customerDisplay
                      ? `${outcome.customerDisplay.detail}${outcome.customerDisplay.at ? ` ${outcome.customerDisplay.timeLabel} ${fmtDate(outcome.customerDisplay.at)}.` : ""}`
                      : "The email has not been sent yet."}
                  </p>
                  {outcome?.errorDetails && <p className="mt-1 break-words text-[10px] text-slate-400">Admin diagnostics: {outcome.errorDetails}</p>}
                  {(!outcome || ["PENDING", "FAILED", "BOUNCED"].includes(outcome.status)) && (
                    <div className="mt-2"><Action id="review_email" Icon={Mail} label="Retry email" /></div>
                  )}
                </div>
              )}

              {order.reviewStatus === "NOT_APPLICABLE" && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Created before the review workflow was active. Excluded from the review queue.
                </p>
              )}

              {order.status === "PAID" && order.reviewStatus !== "NOT_APPLICABLE" && (
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                  {allowed.length === 0 && <p className="text-[11px] text-slate-500">No further review actions are available for this order.</p>}

                  {(allowed.includes("start") || allowed.includes("resume")) && (
                    <>
                      <p className="text-[11px] text-slate-500">Opening an order does not start its review. Start it explicitly when someone begins working on it.</p>
                      <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Your name (optional, recorded with the action)" aria-label="Reviewer name" className="field text-xs py-1.5" maxLength={120} />
                      {allowed.includes("start") && (
                        <button type="button" onClick={() => act("start")} disabled={!!busy} className="btn-primary w-full py-1.5 text-xs font-semibold">
                          {busy === "review:start" ? "Starting…" : "Start review"}
                        </button>
                      )}
                      {allowed.includes("resume") && (
                        <button type="button" onClick={() => act("resume")} disabled={!!busy} className="btn-primary w-full py-1.5 text-xs font-semibold">
                          {busy === "review:resume" ? "Resuming…" : "Resume review (customer has replied)"}
                        </button>
                      )}
                    </>
                  )}

                  {allowed.some((a) => DECISIONS[a]) && (
                    <>
                      <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Your name (optional, recorded with the decision)" aria-label="Reviewer name" className="field text-xs py-1.5" maxLength={120} />
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Message to the customer (included in the email). Required to reject or request information."
                        aria-label="Message to the customer"
                        maxLength={2000}
                        className="field text-xs py-1.5 min-h-[72px]"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        {allowed.filter((a) => DECISIONS[a]).map((a) => (
                          <button key={a} type="button" onClick={() => act(a)} disabled={!!busy}
                            className={`${a === "approve" ? "btn-primary" : "btn-ghost"} px-2 py-1.5 text-[11px] font-semibold`}>
                            {busy === `review:${a}` ? "Saving…" : DECISIONS[a].label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {reviewMsg && <p role="status" className={`text-xs ${reviewMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{reviewMsg.text}</p>}
                </div>
              )}
            </div>

            <h3 className="mt-6 text-sm font-semibold text-slate-900">Payment attempts</h3>
            {order.attempts?.length ? (
              <ul className="mt-2 space-y-2">
                {order.attempts.map((a) => (
                  <li key={a.id} className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="flex items-center justify-between"><StatusPill value={a.status} /><span className="text-slate-500">{a.source} · {fmtDate(a.createdAt)}</span></div>
                    {a.razorpayPaymentId && <p className="mt-1 text-slate-600">{a.razorpayPaymentId}</p>}
                    {a.error && <p className="mt-1 text-red-500">{a.error}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-slate-500">No attempts yet.</p>}
          </>
        )}
      </aside>
    </div>
  );
}
