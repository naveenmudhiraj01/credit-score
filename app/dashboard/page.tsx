"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CalendarCheck, Clock, Lock, Route, Search, ShieldCheck } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import GlassCard from "@/components/dashboard/GlassCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import OrderReceipt from "@/components/dashboard/OrderReceipt";
import ReviewStatusCard from "@/components/dashboard/ReviewStatusCard";
import ReviewTimeline from "@/components/dashboard/ReviewTimeline";
import SupportCard from "@/components/dashboard/SupportCard";
import { PrimaryButton } from "@/components/dashboard/Buttons";
import { ErrorState, LoadingState } from "@/components/dashboard/States";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";
import { receiptRows } from "@/components/PaymentResultViews";
import { maskEmail, pollIntervalMs, reviewDeadline, timelineSteps } from "@/lib/review";

function printReceipt() {
  document.body.classList.add("printing-receipt");
  const done = () => {
    document.body.classList.remove("printing-receipt");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

function CustomerDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryOrderId = searchParams?.get("order")?.trim() || "";

  const [orderQueryInput, setOrderQueryInput] = useState(queryOrderId);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [verificationRequired, setVerificationRequired] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [verifyInput, setVerifyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const recentOrder = typeof window !== "undefined" ? localStorage.getItem("last_customer_order_id") : null;

  useEffect(() => {
    if (activeOrder?.orderId) {
      try {
        localStorage.setItem("last_customer_order_id", activeOrder.orderId);
      } catch {}
    }
  }, [activeOrder]);

  const pollMs = pollIntervalMs(activeOrder);
  const activeId = activeOrder?.orderId;
  useEffect(() => {
    if (!activeId || !pollMs) return undefined;
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const res = await api<{ order: any }>(`/api/orders/${encodeURIComponent(activeId)}/dashboard`);
        if (!cancelled && res?.order?.orderId === activeId) setActiveOrder(res.order);
      } catch {}
    };
    const timer = setInterval(refresh, pollMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeId, pollMs]);

  const loadOrder = async (orderIdToLoad: string) => {
    const target = (orderIdToLoad || "").trim().toUpperCase();
    if (!target) return;

    setLoading(true);
    setSearchError("");
    setVerificationRequired(false);
    setPendingOrderId("");
    setVerifyError("");

    try {
      const res = await api<{ ok: boolean; order: any }>(`/api/orders/${encodeURIComponent(target)}/dashboard`);
      if (res?.ok && res.order) {
        setActiveOrder(res.order);
        router.replace(`/dashboard?order=${encodeURIComponent(res.order.orderId)}`);
      } else {
        setSearchError("Order could not be loaded.");
      }
    } catch (err: any) {
      if (err.data?.requiresVerification) {
        setPendingOrderId(target);
        setVerificationRequired(true);
        setVerifyInput("");
        setVerifyError("");
      } else if (err.status === 404) {
        setSearchError(`Order ${target} not found. Please verify the order ID.`);
      } else if (err.status === 422) {
        setSearchError("Invalid order number format. Example: ORD20261014CAD629");
      } else {
        setSearchError(err.message || "Could not retrieve order details.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queryOrderId) {
      setOrderQueryInput(queryOrderId);
      loadOrder(queryOrderId);
    }
  }, [queryOrderId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = orderQueryInput.trim().toUpperCase();
    if (!clean) {
      setSearchError("Please enter an order ID to search.");
      return;
    }
    loadOrder(clean);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = verifyInput.trim();
    if (!cleanInput) {
      setVerifyError("Please enter the registered email or mobile number.");
      return;
    }

    setVerifying(true);
    setVerifyError("");

    try {
      const res = await api<{ ok: boolean; order: any }>(`/api/orders/${encodeURIComponent(pendingOrderId)}/dashboard`, {
        method: "POST",
        body: { emailOrPhone: cleanInput },
      });
      if (res?.ok && res.order) {
        setActiveOrder(res.order);
        setVerificationRequired(false);
        setPendingOrderId("");
        setVerifyInput("");
        router.replace(`/dashboard?order=${encodeURIComponent(res.order.orderId)}`);
      } else {
        setVerifyError("Verification failed. The details do not match this order.");
      }
    } catch (err: any) {
      setVerifyError(err.message || "Verification failed. The entered details do not match this order.");
    } finally {
      setVerifying(false);
    }
  };

  let body;
  if (loading) {
    body = <LoadingState />;
  } else if (verificationRequired) {
    body = (
      <GlassCard as="section" className="!p-6 sm:!p-8 max-w-lg mx-auto text-center border-brand/30 shadow-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-brand mb-3">
          <Lock className="h-6 w-6 text-brand" aria-hidden="true" />
        </div>
        <h2 className="cd-title text-xl font-bold">Security Verification Required</h2>
        <p className="cd-muted mt-2 text-xs leading-relaxed">
          Order <span className="font-mono font-bold text-ink">{pendingOrderId}</span> was found in our system. To
          protect customer privacy, please enter the registered email ID or mobile number linked with this order.
        </p>
        <form onSubmit={handleVerifySubmit} className="mt-5 space-y-3">
          <input
            type="text"
            id="verify-input"
            placeholder="Registered email or mobile number"
            value={verifyInput}
            onChange={(e) => setVerifyInput(e.target.value)}
            disabled={verifying}
            className="field text-sm font-medium"
            required
          />
          {verifyError && (
            <div
              role="alert"
              className="text-xs font-semibold text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200"
            >
              {verifyError}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setVerificationRequired(false);
                setPendingOrderId("");
              }}
              className="btn btn-ghost btn-sm flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="btn btn-primary btn-sm flex-1"
            >
              {verifying ? <Spinner className="h-3.5 w-3.5" /> : null}
              {verifying ? "Verifying..." : "Verify & View Order"}
            </button>
          </div>
        </form>
      </GlassCard>
    );
  } else if (!activeOrder) {
    body = (
      <GlassCard as="section" className="!p-6 sm:!p-8 max-w-xl mx-auto text-center" delay={0.05}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-brand mb-4">
          <Search className="h-6 w-6 text-brand" aria-hidden="true" />
        </div>
        <h1 className="cd-title text-2xl font-bold">Track Your Order</h1>
        <p className="cd-muted mt-2 text-sm leading-relaxed">
          Enter an Order ID above to view the customer details, payment verification receipt, and 72-hour review
          timeline.
        </p>
        {recentOrder && (
          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
            <span>Recent order: </span>
            <button
              type="button"
              onClick={() => {
                setOrderQueryInput(recentOrder);
                loadOrder(recentOrder);
              }}
              className="font-semibold text-brand underline hover:text-brand-dark"
            >
              {recentOrder}
            </button>
          </div>
        )}
      </GlassCard>
    );
  } else if (activeOrder.status !== "PAID") {
    const isPending = activeOrder.status === "PENDING";
    body = (
      <ErrorState
        icon={isPending ? Clock : AlertCircle}
        tone={isPending ? "warning" : "error"}
        title={isPending ? "Payment is being confirmed" : "Payment not completed"}
        action={
          <PrimaryButton
            to={`/${isPending ? "payment-pending" : "payment-failed"}?order=${encodeURIComponent(
              activeOrder.orderId
            )}`}
          >
            {isPending ? "Check payment status" : "View payment details"}
          </PrimaryButton>
        }
      >
        <span className="mb-3 block">
          <StatusBadge value={isPending ? "PENDING" : activeOrder.status || "FAILED"} size="lg" />
        </span>
        Your receipt and review status will become active once payment is verified.
      </ErrorState>
    );
  } else {
    const name = activeOrder.customerName;
    const deadline = reviewDeadline(activeOrder);
    const rows: [string, any][] = [
      ...receiptRows(activeOrder),
      ["Currency", activeOrder.currency || "INR"],
      ...(name ? [["Customer", name] as [string, any]] : []),
      ...(activeOrder.customerEmail ? [["Email", maskEmail(activeOrder.customerEmail)] as [string, any]] : []),
      ...(activeOrder.customerMobile ? [["Mobile", activeOrder.customerMobile] as [string, any]] : []),
    ];

    body = (
      <div className="space-y-6">
        <GlassCard as="section" lift={false} aria-labelledby="welcome-title" className="!p-6 sm:!p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 id="welcome-title" className="cd-title break-words text-2xl sm:text-3xl">
                {name && name !== "—" ? `Welcome, ${name}` : "Welcome"}
              </h1>
              <p className="cd-muted mt-2 max-w-xl text-[0.95rem] leading-relaxed">
                Thank you for your order. You can track the progress of your order here, from payment confirmation to our
                team&apos;s review.
              </p>
            </div>
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end"
              aria-label="Current order status"
            >
              <StatusBadge value="PAID" size="lg" />
              {activeOrder.reviewStatus ? (
                <StatusBadge value={activeOrder.reviewStatus} size="lg" />
              ) : (
                <StatusBadge value={null} size="lg" label="Review: not available yet" />
              )}
            </div>
          </div>
        </GlassCard>

        <div className="grid gap-6 lg:grid-cols-5">
          <OrderReceipt
            order={activeOrder}
            rows={rows}
            onPrint={printReceipt}
            className="lg:col-span-3 lg:row-span-2 lg:row-start-1"
          />
          <ReviewStatusCard
            reviewStatus={activeOrder.reviewStatus}
            deadline={deadline}
            customerMessage={activeOrder.customerMessage}
            className="lg:col-span-2 lg:col-start-4 lg:row-start-1"
          />

          <GlassCard className="lg:col-span-5 lg:row-start-3" aria-labelledby="next-title" delay={0.15}>
            <h2 id="next-title" className="cd-title cd-h2">
              <span className="cd-h2-icon">
                <Route className="h-4 w-4" aria-hidden="true" />
              </span>
              What happens next?
            </h2>
            <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:gap-10">
              <div>
                <div className="cd-callout">
                  <p className="text-[0.95rem] leading-relaxed" style={{ color: "var(--cd-navy)" }}>
                    Thank you for your order. Your payment and order details have been received. Our team will review
                    your submitted information and get back to you within 72 hours. Please check your registered email for
                    updates or any additional instructions.
                  </p>
                </div>
                {!activeOrder.reviewStatus && (
                  <p className="cd-muted mt-4 flex items-start gap-2 text-xs">
                    <CalendarCheck className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                    Review progress will appear here as it is updated.
                  </p>
                )}
              </div>
              <ReviewTimeline steps={timelineSteps(activeOrder)} />
            </div>
          </GlassCard>

          <SupportCard orderId={activeOrder.orderId} className="lg:col-span-2 lg:col-start-4 lg:row-start-2" />
        </div>
      </div>
    );
  }

  return (
    <DashboardShell orderRef={activeOrder?.orderId}>
      <div className="mb-6 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              id="order-search-input"
              placeholder="Search by Order ID (e.g. ORD20261014CAD629)..."
              value={orderQueryInput}
              onChange={(e) => setOrderQueryInput(e.target.value)}
              disabled={loading}
              className="field pl-10 text-sm font-medium"
            />
          </div>
          <button
            type="submit"
            id="order-search-button"
            disabled={loading}
            className="btn btn-primary btn-md w-full sm:w-auto px-6 shrink-0 flex items-center justify-center gap-2"
          >
            {loading ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            {loading ? "Searching..." : "Search Order"}
          </button>
        </form>

        {searchError && (
          <div
            role="alert"
            className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700 border border-red-200 flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {body}
    </DashboardShell>
  );
}

export default function CustomerDashboardPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CustomerDashboardContent />
    </Suspense>
  );
}
