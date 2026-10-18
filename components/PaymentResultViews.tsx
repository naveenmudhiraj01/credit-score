"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Check, X, Clock, Printer } from "lucide-react";
import CustomerShell from "@/components/CustomerShell";
import Spinner from "@/components/Spinner";
import StatusPill from "@/components/StatusPill";
import { api } from "@/lib/api";
import { fmtDate, inr } from "@/lib/format";

export function useOrderStatus(id: string | null, { refresh = false, poll = false } = {}) {
  const [state, setState] = useState<{ loading: boolean; order: any; error: string }>({
    loading: true,
    order: null,
    error: "",
  });

  useEffect(() => {
    if (!id) {
      setState({ loading: false, order: null, error: "Missing order number." });
      return;
    }
    let alive = true;
    let timer: any;
    const run = async () => {
      try {
        const d = await api<{ order: any }>(
          `/api/payments/status?order=${encodeURIComponent(id)}${refresh ? "&refresh=1" : ""}`
        );
        if (!alive) return;
        setState({ loading: false, order: d.order, error: "" });
        if (poll && d.order?.status === "PENDING") {
          timer = setTimeout(run, 10000);
        }
      } catch (e: any) {
        if (!alive) return;
        setState((s) => ({ loading: false, order: s.order, error: e.message || "Failed to load order status" }));
        if (poll && e.status !== 404) {
          timer = setTimeout(run, 10000);
        }
      }
    };
    run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, refresh, poll]);

  return state;
}

export const Loading = () => (
  <div role="status" className="flex flex-col items-center px-6 py-20 text-slate-500">
    <Spinner className="h-7 w-7 text-brand" />
    <p className="mt-3 text-sm">Checking your order…</p>
  </div>
);

export const ErrorBox = ({ message }: { message?: string }) => (
  <div role="alert" className="px-6 py-14 text-center">
    <h1 className="text-lg font-bold text-ink">We couldn&apos;t load your order</h1>
    <p className="mt-2 text-sm text-slate-600">{message}</p>
    <Link href="/" className="btn-primary btn-md mt-6 inline-flex">
      Back to home
    </Link>
  </div>
);

export function Details({ rows }: { rows: [string, any][] }) {
  return (
    <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/60 text-left text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-5 py-3">
          <dt className="text-slate-600">{k}</dt>
          <dd className="break-all text-right font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const receiptRows = (order: any): [string, any][] => [
  ["Order number", order.orderId],
  ["Product", order.product],
  [order.status === "PAID" ? "Amount paid" : "Amount", inr(order.amount)],
  ["Payment ID", order.paymentId || "—"],
  ["Date", fmtDate(order.paidAt)],
];

const pathFor = (status: string) =>
  status === "PAID" ? "payment-success" : status === "PENDING" ? "payment-pending" : "payment-failed";

export function Circle({ tone, children }: { tone: "green" | "amber" | "red"; children: React.ReactNode }) {
  const bg = { green: "bg-[#2fb872]", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  return (
    <span
      aria-hidden="true"
      className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-sm ring-8 ring-slate-50"
    >
      <span className={`flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-white ${bg}`}>
        {children}
      </span>
    </span>
  );
}

export function useBounce(order: any, expected: string) {
  const router = useRouter();
  const wrong = order && pathFor(order.status) !== expected;
  useEffect(() => {
    if (wrong) router.replace(`/${pathFor(order.status)}?order=${order.orderId}`);
  }, [wrong, order, router]);
  return wrong;
}

export function SuccessView() {
  const sp = useSearchParams();
  const id = sp?.get("order") || null;
  const { loading, order, error } = useOrderStatus(id);
  const wrong = useBounce(order, "payment-success");

  return (
    <CustomerShell>
      {loading || wrong ? (
        <Loading />
      ) : !order ? (
        <ErrorBox message={error} />
      ) : (
        <div className="px-6 py-3 text-center sm:px-7">
          <Circle tone="green">
            <Check className="h-9 w-9" strokeWidth={3} />
          </Circle>
          <h1 className="mt-6 text-2xl font-bold text-ink">Payment Successful!</h1>
          <p className="mt-3 text-sm font-medium text-slate-800">Thank you for choosing FFA Finserv.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 max-w-sm mx-auto">
            Your service order has been registered successfully. A confirmation email will be sent to your registered
            email address.
          </p>
          <Details
            rows={[
              ["Order Reference", order.orderId],
              ["Order Status", "Payment Confirmed"],
              ["Service", order.product || "Loan Assistance Service"],
              ["Amount Paid", inr(order.amount)],
              ["Payment ID", order.paymentId || "—"],
              ["Date", fmtDate(order.paidAt)],
            ]}
          />
          <div className="mt-6 flex flex-col gap-2.5">
            <Link href={`/dashboard?order=${encodeURIComponent(order.orderId)}`} className="btn-primary btn-lg w-full">
              View Order Details
            </Link>
            <Link href="/" className="btn-secondary btn-md w-full">
              Back to Home
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">Please retain your Order Reference for future communications.</p>
        </div>
      )}
    </CustomerShell>
  );
}

export function PendingView() {
  const sp = useSearchParams();
  const id = sp?.get("order") || null;
  const { loading, order, error } = useOrderStatus(id, { refresh: true, poll: true });
  const wrong = useBounce(order, "payment-pending");

  return (
    <CustomerShell>
      {loading || wrong ? (
        <Loading />
      ) : !order ? (
        <ErrorBox message={error} />
      ) : (
        <div className="px-6 py-10 text-center sm:px-7">
          <Circle tone="amber">
            <Clock className="h-9 w-9" />
          </Circle>
          <h1 className="mt-6 text-2xl font-bold text-ink">Payment is being confirmed</h1>
          <p role="status" className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">
            Your bank hasn&apos;t confirmed the payment yet. This page updates automatically — please don&apos;t pay again.
          </p>
          <Details rows={[["Order ID", order.orderId], ["Amount", inr(order.amount)], ["Status", "Confirming…"]]} />
          <p className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Spinner className="h-4 w-4" />Checking every few seconds
          </p>
        </div>
      )}
    </CustomerShell>
  );
}

export function FailedView() {
  const sp = useSearchParams();
  const id = sp?.get("order") || null;
  const { loading, order, error } = useOrderStatus(id, { refresh: true });
  const wrong = useBounce(order, "payment-failed");

  return (
    <CustomerShell>
      {loading || wrong ? (
        <Loading />
      ) : !order ? (
        <ErrorBox message={error} />
      ) : (
        <div className="px-6 py-10 text-center sm:px-7">
          <Circle tone="red">
            <X className="h-9 w-9" strokeWidth={3} />
          </Circle>
          <h1 className="mt-6 text-2xl font-bold text-ink">Payment failed</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">
            {order.failureReason ||
              "Your payment could not be completed. You have not been charged, or any amount debited will be refunded."}
          </p>
          <Details rows={[["Order ID", order.orderId], ["Amount", inr(order.amount)]]} />
          {order.retryable && (
            <Link href={`/redirect?order=${order.orderId}`} className="btn-primary btn-lg mt-5 w-full">
              Try again
            </Link>
          )}
        </div>
      )}
    </CustomerShell>
  );
}

export function OrderDetailView() {
  const params = useParams();
  const id = (params?.id as string) || null;
  const { loading, order, error } = useOrderStatus(id);

  return (
    <CustomerShell header>
      {loading ? (
        <Loading />
      ) : !order ? (
        <ErrorBox message={error} />
      ) : (
        <div className="px-6 py-8">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-ink">Order details</h1>
            <StatusPill value={order.status} />
          </div>
          <Details rows={receiptRows(order)} />
          {order.retryable && (
            <Link href={`/redirect?order=${order.orderId}`} className="btn-primary btn-lg no-print mt-5 w-full">
              Complete payment
            </Link>
          )}
          <button type="button" onClick={() => window.print()} className="btn-secondary btn-md no-print mt-3 w-full">
            <Printer className="h-4 w-4" aria-hidden="true" />Print receipt
          </button>
        </div>
      )}
    </CustomerShell>
  );
}
