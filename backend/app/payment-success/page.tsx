"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type PaymentOrder = {
  orderId: string;
  product: string;
  amount: number;
  currency: string;
  status: string;
  emailStatus?: string;
  paymentId: string | null;
  paidAt: string | null;
};

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order") ?? "";
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) {
      setError("Missing order identifier.");
      return;
    }
    let active = true;
    fetch(`/api/payments/status?order=${encodeURIComponent(orderId)}&refresh=1`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Could not load payment status.");
        return data.order as PaymentOrder;
      })
      .then((value) => { if (active) setOrder(value); })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Could not load payment status.");
      });
    return () => { active = false; };
  }, [orderId]);

  if (error) return <main><h1>Payment status unavailable</h1><p>{error}</p><Link href="/">Return home</Link></main>;
  if (!order) return <main><p>Checking payment status…</p></main>;
  if (order.status !== "PAID") {
    return (
      <main>
        <h1>Payment {order.status.toLowerCase()}</h1>
        <p>Your payment is not yet confirmed. Please check back shortly.</p>
        <Link href="/">Return home</Link>
      </main>
    );
  }

  return (
    <div className="container container-narrow" style={{ paddingTop: "2.5rem", paddingBottom: "3rem" }}>
      <div className="card card-elevated" style={{ padding: "2.5rem", textAlign: "center" }}>
        <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 style={{ fontSize: "1.875rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "0.75rem" }}>
          Payment Successful!
        </h1>

        <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
          Thank you for choosing FFA Finserv.
        </p>

        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "460px", margin: "0 auto 1.75rem" }}>
          {order.emailStatus === "DELIVERED"
            ? "Your service order is confirmed and email delivery has been confirmed."
            : order.emailStatus === "SENT" || order.emailStatus === "ACCEPTED"
              ? "Your service order is confirmed. The confirmation email was accepted by the mail server; delivery to your inbox is not yet confirmed."
              : order.emailStatus === "FAILED" || order.emailStatus === "BOUNCED"
              ? "Your payment succeeded, but the confirmation email could not be sent. Please contact support with your order reference."
              : order.emailStatus === "PENDING" || order.emailStatus === "SENDING"
                ? "Your service order is confirmed. The confirmation email is still being processed."
                : "Your payment is confirmed. Email delivery status is unavailable; contact support if you need help."}
        </p>

        <div style={{ background: "var(--bg-surface-muted)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", overflow: "hidden", textAlign: "left", marginBottom: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Order Reference</span>
            <span style={{ fontWeight: 700, color: "var(--color-primary)", fontSize: "0.9375rem" }}>{order.orderId}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Order Status</span>
            <span style={{ fontWeight: 700, color: "#16a34a", fontSize: "0.875rem" }}>Payment Confirmed</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Service</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem" }}>{order.product || "Loan Assistance Service"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Amount Paid</span>
            <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>₹{(order.amount / 100).toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Payment ID</span>
            <span style={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{order.paymentId ?? "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.875rem 1.25rem" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Date</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{order.paidAt ? new Date(order.paidAt).toLocaleString("en-IN") : "—"}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/my-orders" className="btn btn-primary">
            Check Order Status
          </Link>
          <Link href="/" className="btn btn-outline">
            Return Home
          </Link>
        </div>

        <p style={{ marginTop: "1.25rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Please retain this order reference for future communication regarding your service request.
        </p>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return <Suspense fallback={<main><p>Loading payment status…</p></main>}><PaymentSuccessContent /></Suspense>;
}
