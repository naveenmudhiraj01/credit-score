"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";

interface OrderDetail {
  orderId: string;
  product: string;
  amount: number;
  currency: string;
  status: "CREATED" | "PENDING" | "PAID" | "FAILED";
  paymentId: string | null;
  paidAt: string | null;
  failureReason: string | null;
  retryable: boolean;
}

function MyOrdersContent() {
  const searchParams = useSearchParams();
  const initialOrder = searchParams.get("order") || "";

  const [orderQuery, setOrderQuery] = useState(initialOrder);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchOrder = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/status?order=${encodeURIComponent(id.trim())}&refresh=1`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Order not found.");
      }
      setOrder(json.data.order);
    } catch (e: any) {
      setError(e.message || "Failed to find order.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrder) {
      fetchOrder(initialOrder);
    }
  }, [initialOrder]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrder(orderQuery);
  };

  return (
    <div className="container" style={{ paddingTop: "2.5rem", paddingBottom: "4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontWeight: 800 }}>My Orders</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Track your verification and payment status in real-time.
          </p>
        </div>
        <Link href="/register" className="btn btn-primary">
          + New Registration
        </Link>
      </div>

      {/* Search Input Card */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Enter your Order ID (e.g. ORD20261010AB12CD)..."
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Searching..." : "Track Order"}
          </button>
        </form>
      </div>

      {error && (
        <div style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", color: "var(--color-danger-text)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "2rem" }}>
          {error}
        </div>
      )}

      {/* Orders Table (matches project.png Screen 5) */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Product</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Payment Verified At</th>
              <th style={{ textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {order ? (
              <tr>
                <td className="mono" style={{ fontWeight: 600 }}>{order.orderId}</td>
                <td>{order.product}</td>
                <td style={{ fontWeight: 700 }}>₹{(order.amount / 100).toFixed(2)}</td>
                <td>
                  <span
                    className={`badge ${
                      order.status === "PAID"
                        ? "badge-paid"
                        : order.status === "PENDING"
                        ? "badge-pending"
                        : order.status === "FAILED"
                        ? "badge-failed"
                        : "badge-created"
                    }`}
                  >
                    {order.status}
                  </span>
                </td>
                <td>
                  {order.paidAt ? new Date(order.paidAt).toLocaleString() : "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    onClick={() => setModalOpen(true)}
                    className="btn btn-secondary btn-sm"
                  >
                    View
                  </button>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)" }}>
                  {loading
                    ? "Loading order status..."
                    : initialOrder
                    ? "Searching for order..."
                    : "Enter an Order ID above to track your order details."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for viewing order details */}
      {modalOpen && order && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Order Details</h3>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-muted)" }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.9375rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Order Reference:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{order.orderId}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Product:</span>
                <span>{order.product}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Amount:</span>
                <span style={{ fontWeight: 700 }}>₹{(order.amount / 100).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>Current Status:</span>
                <span className={`badge ${order.status === "PAID" ? "badge-paid" : "badge-pending"}`}>{order.status}</span>
              </div>
              {order.paymentId && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Razorpay Payment ID:</span>
                  <span className="mono">{order.paymentId}</span>
                </div>
              )}
              {order.failureReason && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-danger)" }}>
                  <span>Failure Reason:</span>
                  <span>{order.failureReason}</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button onClick={() => setModalOpen(false)} className="btn btn-secondary">
                Close
              </button>
              {order.status === "PAID" && (
                <Link href={`/payment-success?order=${order.orderId}&paymentId=${order.paymentId || ""}`} className="btn btn-primary">
                  View Full Receipt
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyOrdersPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: "4rem", textAlign: "center" }}>Loading orders...</div>}>
      <MyOrdersContent />
    </Suspense>
  );
}
