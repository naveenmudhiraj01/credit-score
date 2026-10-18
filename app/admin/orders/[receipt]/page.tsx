"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface OrderDetail {
  receipt: string;
  razorpayOrderId: string;
  product: string;
  customerName: string | null;
  customerEmail: string | null;
  customerMobile: string | null;
  amount: number;
  currency: string;
  status: string;
  razorpayPaymentId: string | null;
  failureReason: string | null;
  emailStatus: string | null;
  emailSentAt: string | null;
  notifications?: Array<{
    emailType: string;
    recipient: string;
    status: string;
    errorDetails: string | null;
    sentAt: string | null;
    updatedAt: string;
  }>;
  sheetStatus: string | null;
  sheetSyncedAt: string | null;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
  isLegacy?: boolean;
  attempts?: Array<{ id: number; razorpayPaymentId: string | null; status: string; source: string; error: string | null; createdAt: string }>;
}

export default function AdminOrderDetailPage() {
  const router = useRouter();
  const { receipt } = useParams<{ receipt: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${receipt}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to load order.");
      }
      setOrder(json.order ?? json.data?.order ?? null);
    } catch (e: any) {
      setError(e.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (receipt) fetchOrder();
  }, [receipt]);

  if (loading) {
    return (
      <div className="container container-narrow" style={{ paddingTop: "3rem", paddingBottom: "4rem" }}>
        <p style={{ textAlign: "center", color: "var(--text-muted)" }}>Loading order details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container container-narrow" style={{ paddingTop: "3rem", paddingBottom: "4rem" }}>
        <div className="card card-elevated" style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "1rem", color: "var(--color-danger)" }}>Error</h1>
          <p>{error}</p>
          <button onClick={fetchOrder} className="btn btn-primary btn-lg" style={{ marginTop: "1rem" }}>
            Retry
          </button>
          <Link href="/admin" className="btn btn-outline btn-lg" style={{ marginTop: "1rem", marginLeft: "0.5rem" }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container container-narrow" style={{ paddingTop: "3rem", paddingBottom: "4rem" }}>
        <p style={{ textAlign: "center", color: "var(--text-muted)" }}>Order not found.</p>
        <Link href="/admin" className="btn btn-outline btn-lg" style={{ marginTop: "1rem" }}>
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="container container-narrow" style={{ paddingTop: "3rem", paddingBottom: "4rem" }}>
      <div className="card card-elevated" style={{ textAlign: "left", padding: "2rem" }}>
        <h2 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>Order #{order.receipt}</h2>
        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <strong>Product:</strong> <span>{order.product}</span>
          {order.isLegacy && (
            <span className="badge" style={{ background: "#fef3c7", color: "#92400e", fontSize: "0.6875rem", border: "1px solid #fcd34d" }}>
              LEGACY / DEMO
            </span>
          )}
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Customer:</strong> {order.customerName || "—"}
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Email:</strong> {order.customerEmail || "—"}
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Mobile:</strong> {order.customerMobile || "—"}
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Amount:</strong> ₹{(order.amount / 100).toFixed(2)} {order.currency}
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Status:</strong> {order.status}
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Razorpay Payment ID:</strong> {order.razorpayPaymentId || "—"}
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Failure Reason:</strong> {order.failureReason || "—"}
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Email Status:</strong> {order.emailStatus === "SENT" ? "ACCEPTED (DELIVERY UNCONFIRMED)" : order.emailStatus}
        </div>
        {order.notifications?.map((notification) => (
          <div key={notification.emailType} style={{ marginBottom: "0.5rem" }}>
            <strong>{notification.emailType === "ADMIN_PAYMENT_NOTIFICATION" ? "Admin payment email" : "Customer payment email"}:</strong>{" "}
            {notification.status === "ACCEPTED" ? "ACCEPTED (DELIVERY UNCONFIRMED)" : notification.status}
            {" — "}{notification.recipient || "recipient not configured"}
            {notification.errorDetails ? ` — ${notification.errorDetails}` : ""}
          </div>
        ))}
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Google Sheets Sync:</strong> {order.sheetStatus}
        </div>
        {order.paidAt && (
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>Paid At:</strong> {new Date(order.paidAt).toLocaleString()}
          </div>
        )}
        {order.emailSentAt && (
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>SMTP Accepted At:</strong> {new Date(order.emailSentAt).toLocaleString()}
          </div>
        )}
        {order.sheetSyncedAt && (
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>Sheet Synced At:</strong> {new Date(order.sheetSyncedAt).toLocaleString()}
          </div>
        )}
        {/* Payment Attempts */}
        {order.attempts && order.attempts.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Payment Attempts</h3>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Payment ID</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Error</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {order.attempts.map((a) => (
                  <tr key={a.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{a.id}</td>
                    <td className="mono">{a.razorpayPaymentId || "—"}</td>
                    <td>{a.status}</td>
                    <td>{a.source}</td>
                    <td>{a.error || "—"}</td>
                    <td>{new Date(a.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
          <Link href="/admin" className="btn btn-outline btn-lg">Back to Dashboard</Link>
          <button onClick={() => router.refresh()} className="btn btn-primary btn-lg">Refresh</button>
        </div>
      </div>
    </div>
  );
}
