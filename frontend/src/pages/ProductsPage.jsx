import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import PageShell from "../components/PageShell";
import { DEFAULT_PRODUCT, findProduct, PRODUCTS, startPurchase } from "../data/catalog";
import { inrRupees } from "../lib/format";
import creditScoreImage from "../assets/credit-score.png";
import { useServiceFee } from "../hooks/useServiceFee";

/** Landing page: Screen 1 — FFA FINSERV Landing Page */
export default function ProductsPage() {
  const nav = useNavigate();
  const product = findProduct(DEFAULT_PRODUCT) || PRODUCTS[0];
  const { feeRupees, isLoading: feeLoading, hasError: feeError } = useServiceFee();
  const feeUnavailable = feeLoading || feeError;
  const feeLabel = feeLoading ? "Loading…" : feeError ? "Unavailable" : inrRupees(feeRupees);

  return (
    <PageShell>
      <section className="grid items-center gap-8 md:grid-cols-2 md:gap-12 py-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse"></span>
            Financial Assistance Services
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl md:text-5xl leading-tight">
            Not Getting a Loan?<br />
            <span className="text-blue-600">Low Credit Score?</span><br />
            No Problem!
          </h1>

          <p className="mt-5 text-base sm:text-lg font-medium leading-relaxed text-slate-700">
            Apply for Instant Loan Assistance in Less Than 30 Seconds*
          </p>

          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-sm font-medium text-slate-500">Service Fee:</span>
            <span className="text-3xl font-bold text-ink">{feeLabel}</span>
            <span className="text-xs text-slate-500">(inclusive of taxes)</span>
          </div>
          {feeError && <p role="status" className="mt-2 text-xs text-red-600">Unable to load the current service fee. Please refresh and try again.</p>}

          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={() => startPurchase(product, nav)}
              disabled={feeUnavailable}
              className="btn-primary text-base font-bold py-3.5 px-6 sm:max-w-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              APPLY FOR SERVICE →
            </button>

            <button
              type="button"
              onClick={() => nav("/dashboard")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-400 hover:text-brand"
            >
              View Order Status
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-1.5 text-xs text-slate-500">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand shrink-0" aria-hidden="true" />
              Secure 256-bit payment verification via Razorpay
            </p>
            <p className="text-[11px] text-slate-400">
              * Dedicated assistance team reviews applications within 72 hours.
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 opacity-20 blur-xl"></div>
          <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">FFA FINSERV</span>
                <h3 className="text-lg font-bold text-ink">Loan Assistance Service</h3>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                Active Verification
              </span>
            </div>

            <ul className="mt-5 space-y-3.5 text-sm text-slate-600">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">✓</span>
                <span>Fast application in under 30 seconds</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">✓</span>
                <span>Assistance for low credit score profiles</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">✓</span>
                <span>Instant payment receipt &amp; automated order tracking</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">✓</span>
                <span>Dedicated support review within 72 hours</span>
              </li>
            </ul>

            <div className="mt-6 rounded-xl bg-slate-50 p-4 border border-slate-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Service Fee</div>
                <div className="text-xl font-bold text-ink">{feeLabel}</div>
              </div>
              <button
                type="button"
                onClick={() => startPurchase(product, nav)}
                disabled={feeUnavailable}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                APPLY NOW →
              </button>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
