import { Link } from "react-router-dom";
import { BRAND } from "../../config";
import "../../styles/dashboard.css";

/** Page frame: skip link, glass header (brand, title, order reference), calm gradient background, footer. */
export default function DashboardShell({ orderRef, children }) {
  return (
    <div className="cd-root">
      <a href="#main" className="cd-skip">Skip to main content</a>
      <header className="cd-header">
        <div className="cd-container flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="cd-title shrink-0 text-lg">{BRAND}</Link>
            <span aria-hidden="true" className="hidden h-5 w-px bg-slate-300 sm:block" />
            <span className="cd-muted hidden truncate text-sm font-semibold sm:block">Customer Dashboard</span>
          </div>
          {orderRef && (
            <span className="cd-chip" title={orderRef}>
              <span className="cd-muted font-medium">Order</span>
              <span className="cd-mono">{orderRef}</span>
            </span>
          )}
        </div>
        <p className="cd-container cd-muted pb-2 text-xs font-semibold sm:hidden">Customer Dashboard</p>
      </header>
      <main id="main" tabIndex={-1} className="cd-container flex-1 py-6 sm:py-10 outline-none">{children}</main>
      <footer className="cd-muted border-t py-6 text-center text-xs" style={{ borderColor: "var(--cd-divider)" }}>
        © {new Date().getFullYear()} {BRAND}. Payments processed securely by Razorpay.
      </footer>
    </div>
  );
}
