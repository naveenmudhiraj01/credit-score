import Link from "next/link";
import { BRAND } from "@/config";

/** Wide layout for the catalogue (the single-product flow keeps the compact CustomerShell). */
export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="text-lg font-bold tracking-tight text-ink">
            {BRAND}
          </Link>
          <Link
            href="/dashboard"
            className="btn btn-secondary btn-sm"
          >
            View Order Status
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">{children}</div>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {BRAND}. Payments processed securely by Razorpay.
      </footer>
    </div>
  );
}
