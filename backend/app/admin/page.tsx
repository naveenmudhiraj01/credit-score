"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AdminOrder {
  receipt: string;
  razorpayOrderId: string;
  product: string;
  customerName: string | null;
  customerEmail: string | null;
  customerMobile: string | null;
  amount: number;
  currency: string;
  status: "CREATED" | "PENDING" | "PAID" | "FAILED";
  razorpayPaymentId: string | null;
  failureReason: string | null;
  emailStatus: "PENDING" | "SENDING" | "SENT" | "FAILED";
  emailSentAt: string | null;
  sheetStatus: "PENDING" | "SYNCED" | "FAILED";
  sheetSyncedAt: string | null;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
  isLegacy?: boolean;
  consentGiven?: boolean;
  consentVersion?: string | null;
  consentTimestamp?: string | null;
  reviewStatus?: "PENDING_REVIEW" | "IN_REVIEW" | "INFO_REQUESTED" | "APPROVED" | "REJECTED" | "RESPONDED" | "CLOSED" | "NOT_APPLICABLE";
  reviewDeadline?: string | null;
  teamRespondedAt?: string | null;
  teamResponseNotes?: string | null;
  teamRespondedBy?: string | null;
}

interface AdminStats {
  total: number;
  paid: number;
  pending: number;
  failed: number;
  failedOperations: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [stats, setStats] = useState<AdminStats>({ total: 0, paid: 0, pending: 0, failed: 0, failedOperations: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sheetFilter, setSheetFilter] = useState("");
  const [viewFilter, setViewFilter] = useState("active");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (sheetFilter) params.set("sheetStatus", sheetFilter);
    if (viewFilter) params.set("view", viewFilter);

    try {
      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to load admin orders.");
      }
      setOrders(data.items ?? data.data?.items ?? []);
      if (data.stats ?? data.data?.stats) {
        setStats(data.stats ?? data.data?.stats);
      }
    } catch (e: any) {
      setError(e.message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, sheetFilter, viewFilter, router]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleLogout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="container-wide" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Administrator Console
            </span>
          </div>
          <h1 style={{ fontSize: "2rem", fontWeight: 800 }}>Operations Dashboard</h1>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button onClick={fetchOrders} className="btn btn-secondary btn-sm" disabled={loading}>
            🔄 Refresh
          </button>
          <button onClick={handleLogout} className="btn btn-outline btn-sm" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
            Log out
          </button>
        </div>
      </div>

      {/* Metric Cards Grid (matches project.png Screen 6 & frontend.png Screen 8) */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total Orders</div>
          <div className="metric-value">{stats.total}</div>
          <div className="metric-sub" style={{ color: "var(--text-muted)" }}>Lifetime recorded orders</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Paid &amp; Verified</div>
          <div className="metric-value" style={{ color: "var(--color-success)" }}>{stats.paid}</div>
          <div className="metric-sub">
            <span>✓ Verified via Razorpay</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Pending Orders</div>
          <div className="metric-value" style={{ color: "var(--color-warning)" }}>{stats.pending}</div>
          <div className="metric-sub" style={{ color: "var(--color-warning-text)" }}>
            <span>⏳ Awaiting completion</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Failed Orders</div>
          <div className="metric-value" style={{ color: "var(--color-danger)" }}>
            {stats.failed}
          </div>
          <div className="metric-sub" style={{ color: "var(--text-muted)" }}>
            <span>Payment failures</span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card" style={{ marginBottom: "1.75rem", padding: "1.25rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by customer name, email, order ID, or payment ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ minWidth: "160px" }}>
            <select
              className="form-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Payment Statuses</option>
              <option value="PAID">PAID</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
              <option value="CREATED">CREATED</option>
            </select>
          </div>

          <div style={{ minWidth: "160px" }}>
            <select
              className="form-input"
              value={sheetFilter}
              onChange={(e) => setSheetFilter(e.target.value)}
            >
              <option value="">All Sheet Syncs</option>
              <option value="SYNCED">SYNCED</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>

          <div style={{ minWidth: "180px" }}>
            <select
              className="form-input"
              value={viewFilter}
              onChange={(e) => setViewFilter(e.target.value)}
            >
              <option value="active">Active Orders (Credit Score)</option>
              <option value="all">All Orders (incl. Legacy/Demo)</option>
              <option value="legacy">Legacy / Demo Orders</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {/* Orders Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Product</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Payment ID</th>
              <th>Email</th>
              <th>Sheet Sync</th>
              <th>Date</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  Loading records...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  No orders found matching your criteria.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.receipt}>
                  <td className="mono" style={{ fontWeight: 600 }}>{o.receipt}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>{o.product}</span>
                      {o.isLegacy && (
                        <span className="badge" style={{ background: "#fef3c7", color: "#92400e", fontSize: "0.6875rem", border: "1px solid #fcd34d" }}>
                          LEGACY / DEMO
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div>{o.customerName || "—"}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {o.customerEmail || o.customerMobile || "—"}
                    </div>
                  </td>
                  <td style={{ fontWeight: 700 }}>₹{(o.amount / 100).toFixed(2)}</td>
                  <td>
                    <span
                      className={`badge ${
                        o.status === "PAID"
                          ? "badge-paid"
                          : o.status === "PENDING"
                          ? "badge-pending"
                          : o.status === "FAILED"
                          ? "badge-failed"
                          : "badge-created"
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: "0.8125rem" }}>
                    {o.razorpayPaymentId || "—"}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        o.emailStatus === "SENT"
                          ? "badge-sent"
                          : o.emailStatus === "FAILED"
                          ? "badge-failed"
                          : "badge-pending"
                      }`}
                    >
                      {o.emailStatus === "SENT" ? "ACCEPTED (UNCONFIRMED)" : o.emailStatus}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        o.sheetStatus === "SYNCED"
                          ? "badge-synced"
                          : o.sheetStatus === "FAILED"
                          ? "badge-failed"
                          : "badge-pending"
                      }`}
                    >
                      {o.sheetStatus}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      onClick={() => setSelectedOrder(o)}
                      className="btn btn-secondary btn-sm"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                Order #{selectedOrder.receipt}
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-muted)" }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.9375rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>Product:</span>
                <span style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  {selectedOrder.product}
                  {selectedOrder.isLegacy && (
                    <span className="badge" style={{ background: "#fef3c7", color: "#92400e", fontSize: "0.6875rem", border: "1px solid #fcd34d" }}>
                      LEGACY / DEMO
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Customer Name:</span>
                <span style={{ fontWeight: 600 }}>{selectedOrder.customerName || "N/A"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Email:</span>
                <span>{selectedOrder.customerEmail || "N/A"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Mobile:</span>
                <span>{selectedOrder.customerMobile || "N/A"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Razorpay Order ID:</span>
                <span className="mono">{selectedOrder.razorpayOrderId}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Payment ID:</span>
                <span className="mono">{selectedOrder.razorpayPaymentId || "None"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>Payment Status:</span>
                <span className={`badge ${selectedOrder.status === "PAID" ? "badge-paid" : "badge-pending"}`}>{selectedOrder.status}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Email Notification:</span>
                <span className={`badge ${selectedOrder.emailStatus === "SENT" ? "badge-sent" : "badge-pending"}`}>
                  {selectedOrder.emailStatus === "SENT" ? "ACCEPTED (UNCONFIRMED)" : selectedOrder.emailStatus}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Google Sheets Sync:</span>
                <span className={`badge ${selectedOrder.sheetStatus === "SYNCED" ? "badge-synced" : "badge-pending"}`}>{selectedOrder.sheetStatus}</span>
              </div>
              {selectedOrder.paidAt && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Paid At:</span>
                  <span>{new Date(selectedOrder.paidAt).toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Consent Accepted:</span>
                <span>{selectedOrder.consentGiven ? `Yes (${selectedOrder.consentVersion || "v1.0"})` : "Not Recorded / Legacy"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Review SLA Status:</span>
                <span className="badge">{selectedOrder.reviewStatus || "NOT_APPLICABLE"}</span>
              </div>
              {selectedOrder.reviewDeadline && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>72h Review Deadline:</span>
                  <span>{new Date(selectedOrder.reviewDeadline).toLocaleString()}</span>
                </div>
              )}
              {selectedOrder.teamRespondedAt && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Team Responded At:</span>
                  <span>{new Date(selectedOrder.teamRespondedAt).toLocaleString()}</span>
                </div>
              )}
              {selectedOrder.failureReason && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-danger)" }}>
                  <span>Failure Reason:</span>
                  <span>{selectedOrder.failureReason}</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: "2rem", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setSelectedOrder(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
