import Link from "next/link";
import { BRAND } from "@/config";

/** Mobile-first white card centred on a soft background (matches the customer screens). */
export default function CustomerShell({
  children,
  header = false,
}: {
  children: React.ReactNode;
  header?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-surface px-3 py-6 sm:items-center sm:py-10">
      <main className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-200">
        {header && (
          <div className="flex items-center border-b border-slate-100 px-5 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight text-ink">
              {BRAND}
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
