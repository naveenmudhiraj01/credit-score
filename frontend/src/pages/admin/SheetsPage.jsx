import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, RefreshCw } from "lucide-react";
import StatusPill from "../../components/StatusPill";
import Spinner from "../../components/Spinner";
import { api } from "../../lib/api";
import { useOrders } from "./useOrders";
import { fmtDate } from "../../lib/format";
import { SHEET_URL } from "../../config";

const TABS = [["", "All"], ["SYNCED", "Synced"], ["PENDING", "Pending"], ["FAILED", "Failed"]];

export default function SheetsPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const { loading, error, data, reload } = useOrders({ sheetStatus: tab, page, pageSize: 10 });

  const resync = async (receipt) => {
    setBusy(receipt); setMsg(null);
    try {
      const d = await api(`/api/admin/orders/${receipt}/retry`, { method: "POST", body: { action: "sheet" } });
      setMsg({ ok: d.succeeded, text: d.succeeded ? `${receipt} synced.` : `${receipt}: ${d.result}` });
    } catch (e) {
      if (e.status === 401) return nav("/admin", { replace: true });
      setMsg({ ok: false, text: e.message });
    }
    setBusy(""); reload();
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title !mb-0">Google Sheets</h1>
        {SHEET_URL && <a href={SHEET_URL} target="_blank" rel="noreferrer" className="btn-ghost !border-brand/25 font-semibold text-brand"><ExternalLink className="h-4 w-4" />Open sheet</a>}
      </div>

      <div className="card-soft">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          {TABS.map(([v, label]) => (
            <button key={label} onClick={() => { setTab(v); setPage(1); }} aria-pressed={tab === v}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${tab === v ? "bg-brand text-white " : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
          ))}
          {msg && <span role="status" className={`ml-auto self-center text-xs ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>{msg.text}</span>}
        </div>
        <div className="overflow-x-auto" role="region" aria-label="Sheet sync table" tabIndex={0}>
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead><tr className="border-b border-slate-100">
              {["Order ID", "Customer", "Email", "Status", "Email status", "Sheet status", "Last synced", "Action"].map((h, i) => <th key={i} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {data?.items?.map((o) => (
                <tr key={o.receipt} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3.5 font-medium text-ink">{o.receipt}</td>
                  <td className="px-4 py-3.5 text-slate-600">{o.customerName || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-600">{o.customerEmail || "—"}</td>
                  <td className="px-4 py-3.5"><StatusPill value={o.status === "CREATED" ? "PENDING" : o.status} /></td>
                  <td className="px-4 py-3.5"><StatusPill value={o.emailStatus} /></td>
                  <td className="px-4 py-3.5"><StatusPill value={o.sheetStatus} /></td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{fmtDate(o.sheetSyncedAt)}</td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => resync(o.receipt)} disabled={!!busy} aria-label={`Re-sync order ${o.receipt}`} className="btn-soft">
                      {busy === o.receipt ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}Re-sync
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !data && <div className="flex justify-center py-12 text-brand"><Spinner className="h-6 w-6" /></div>}
          {data?.items?.length === 0 && <p className="py-12 text-center text-sm text-slate-500">No orders to show.</p>}
          {error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}
        </div>
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
            <span>Page {data.page} of {data.totalPages}</span>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button className="btn-ghost" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
