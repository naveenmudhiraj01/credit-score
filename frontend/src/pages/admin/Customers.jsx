import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import Spinner from "../../components/Spinner";
import { api } from "../../lib/api";
import { fmtDate, inr } from "../../lib/format";

/** Customers are derived from orders (the backend has no customers endpoint): latest ≤500 orders grouped by email. */
export default function Customers() {
  const nav = useNavigate();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = [];
        for (let page = 1; page <= 10; page++) {
          const d = await api(`/api/admin/orders?page=${page}&pageSize=50`);
          all.push(...d.items);
          if (page >= d.totalPages) break;
        }
        if (alive) setOrders(all);
      } catch (e) {
        if (!alive) return;
        if (e.status === 401) nav("/admin", { replace: true });
        else setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [nav]);

  const customers = useMemo(() => {
    const map = new Map();
    for (const o of orders || []) {
      const key = (o.customerEmail || o.customerMobile || o.receipt).toLowerCase();
      const c = map.get(key) || { key, name: o.customerName, email: o.customerEmail, mobile: o.customerMobile, orders: 0, paid: 0, spent: 0, last: o.createdAt };
      c.orders += 1;
      if (o.status === "PAID") { c.paid += 1; c.spent += o.amount; }
      c.name = c.name || o.customerName;
      if (new Date(o.createdAt) > new Date(c.last)) c.last = o.createdAt;
      map.set(key, c);
    }
    const term = q.trim().toLowerCase();
    return [...map.values()]
      .filter((c) => !term || [c.name, c.email, c.mobile].some((v) => v?.toLowerCase().includes(term)))
      .sort((a, b) => new Date(b.last) - new Date(a.last));
  }, [orders, q]);

  return (
    <div>
      <h1 className="page-title">Customers</h1>
      <div className="card-soft">
        <div className="relative border-b border-slate-100 p-4">
          <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" aria-label="Search customers" className="field pl-9" />
        </div>
        <div className="overflow-x-auto" role="region" aria-label="Customers table" tabIndex={0}>
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead><tr className="border-b border-slate-100">
              {["Customer", "Email", "Mobile", "Orders", "Total paid", "Last order"].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3.5 font-medium text-ink">{c.name || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-600">{c.email || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-600">{c.mobile || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-600">{c.paid}/{c.orders} paid</td>
                  <td className="px-4 py-3.5 text-slate-900">{inr(c.spent)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{fmtDate(c.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders && !error && <div className="flex justify-center py-12 text-brand"><Spinner className="h-6 w-6" /></div>}
          {orders && customers.length === 0 && <p className="py-12 text-center text-sm text-slate-500">No customers found.</p>}
          {error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
