import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, Search } from "lucide-react";
import StatusPill from "../../components/StatusPill";
import Spinner from "../../components/Spinner";
import OrderDrawer from "./OrderDrawer";
import { useOrders } from "./useOrders";
import { inr } from "../../lib/format";

const STATS = [
  ["Total Orders", "total", "text-ink"],
  ["Paid", "paid", "text-ink"],
  ["Pending", "pending", "text-amber-600"],
  ["Failed", "failed", "text-red-500"],
];
const PAGE_SIZE = 10;

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field mt-1">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Pagination({ page, totalPages, total, onPage }) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const nums = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  const cell = "flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-slate-500">
      <span className="text-slate-600">{total} order{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className={`${cell} border-slate-200 disabled:opacity-40`}><ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /></button>
        {nums.map((n) => (
          <button key={n} onClick={() => onPage(n)} aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined} className={`${cell} ${n === page ? "border-brand/30 bg-blue-100 text-brand" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{n}</button>
        ))}
        <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page" className={`${cell} border-slate-200 disabled:opacity-40`}><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </div>
    </div>
  );
}

/**
 * Stats cards + search/filter + orders table + pagination + detail drawer.
 * `fixed` pins backend filters (e.g. { status: "PAID" } for the Payments page).
 */
export default function OrdersPanel({ fixed = {}, showStats = false, emptyText = "No orders found." }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [filters, setFilters] = useState({ status: "", emailStatus: "", sheetStatus: "", reviewStatus: "", ops: "", view: "active" });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const { loading, error, data, reload } = useOrders({ q: dq, ...filters, ...fixed, page, pageSize: PAGE_SIZE });
  // Badge counts only the filters inside the popover (the order-view dropdown is a separate control).
  const activeFilters = Object.entries(filters).filter(([k, v]) => k !== "view" && v).length;
  const stats = data?.stats;

  return (
    <>
      {showStats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map(([label, key, tone]) => (
            <div key={key} className="card-soft p-5">
              <p className="text-sm text-slate-600">{label}</p>
              <p className={`mt-2 text-2xl font-bold ${tone}`}>{stats ? stats[key] : "–"}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-4">
        <div className="card-soft relative flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by order ID, customer or email…" aria-label="Search orders" className="field pl-9" />
          </div>
          <select
            aria-label="Order view"
            value={filters.view || "active"}
            onChange={(e) => setFilter("view")(e.target.value)}
            className="field !w-auto text-xs font-semibold"
          >
            <option value="active">Active orders</option>
            <option value="all">All orders</option>
            <option value="legacy">Legacy orders</option>
          </select>
          <button onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} className="btn-ghost !border-brand/25 px-4 font-semibold text-brand">
            <Filter className="h-4 w-4" aria-hidden="true" />Filter{activeFilters > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] text-white">{activeFilters}</span>}
          </button>

          {showFilters && (
            <div className="absolute right-4 top-full z-20 mt-1 w-64 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              {!fixed.status && <Select label="Payment status" value={filters.status} onChange={setFilter("status")} options={["CREATED", "PENDING", "PAID", "FAILED"]} />}
              <Select label="Email status" value={filters.emailStatus} onChange={setFilter("emailStatus")} options={["PENDING", "SENDING", "SENT", "FAILED"]} />
              <Select label="Sheet status" value={filters.sheetStatus} onChange={setFilter("sheetStatus")} options={["PENDING", "SYNCED", "FAILED"]} />
              <Select label="Review SLA status" value={filters.reviewStatus} onChange={setFilter("reviewStatus")} options={["PENDING_REVIEW", "IN_REVIEW", "INFO_REQUESTED", "APPROVED", "REJECTED", "RESPONDED", "NOT_APPLICABLE"]} />
              <button className="text-xs font-medium text-slate-500 underline" onClick={() => { setFilters({ status: "", emailStatus: "", sheetStatus: "", reviewStatus: "", ops: "", view: "active" }); setPage(1); }}>Clear filters</button>
            </div>
          )}
        </div>

        <div className="card-soft">
        <div className="overflow-x-auto" role="region" aria-label="Orders table" tabIndex={0}>
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100">
                {["Order ID", "Product", "Customer", "Amount", "Status", "Review SLA", "Payment ID", "Actions"].map((h) => <th key={h} className="th">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data?.items?.map((o) => {
                const attention = o.status === "PAID" && (o.emailStatus === "FAILED" || o.sheetStatus === "FAILED");
                return (
                  <tr key={o.receipt} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink">{o.receipt}</td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span>{o.product}</span>
                        {o.isLegacy && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Legacy
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{o.customerName || o.customerEmail || "—"}</td>
                    <td className="px-4 py-3.5 text-ink">{inr(o.amount)}</td>
                    <td className="px-4 py-3.5"><StatusPill value={o.status === "CREATED" ? "PENDING" : o.status} /></td>
                    <td className="px-4 py-3.5">
                      {o.reviewStatus && o.reviewStatus !== "NOT_APPLICABLE" ? (
                        <StatusPill value={o.reviewStatus} />
                      ) : o.reviewStatus === "NOT_APPLICABLE" ? (
                        <span className="text-slate-500 text-xs">N/A</span>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{o.razorpayPaymentId || "–"}</td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => setSelected(o.receipt)} aria-label={`View order ${o.receipt}${attention ? " (email or sheet sync failed)" : ""}`} className="btn-soft">
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && !data && <div className="flex justify-center py-12 text-brand"><Spinner className="h-6 w-6" /></div>}
          {!loading && !error && data?.items?.length === 0 && <p className="py-12 text-center text-sm text-slate-500">{emptyText}</p>}
          {error && (
            <div className="py-10 text-center text-sm text-red-500">
              {error} <button className="ml-2 font-semibold underline" onClick={reload}>Retry</button>
            </div>
          )}
        </div>

        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
        </div>
      </div>

      {selected && <OrderDrawer receipt={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </>
  );
}
