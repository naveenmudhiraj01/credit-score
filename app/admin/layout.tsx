"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sheet,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { ADMIN_EMAIL, BRAND } from "@/config";
import AdminLogin from "@/components/admin/AdminLogin";
import Spinner from "@/components/Spinner";

const NAV = [
  { to: "/admin", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Orders", Icon: ClipboardList },
  { to: "/admin/payments", label: "Payments", Icon: CreditCard },
  { to: "/admin/customers", label: "Customers", Icon: Users },
  { to: "/admin/sheets", label: "Google Sheets", Icon: Sheet },
  { to: "/admin/settings", label: "Settings", Icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");

  useEffect(() => {
    let alive = true;
    api("/api/admin/login")
      .then(() => {
        if (alive) setAuthStatus("authenticated");
      })
      .catch(() => {
        if (alive) {
          setAuthStatus("unauthenticated");
          if (pathname !== "/admin" && pathname !== "/admin/login") {
            router.replace("/admin");
          }
        }
      });
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthStatus("unauthenticated");
      router.replace("/admin");
    };
    window.addEventListener("admin-unauthorized", onUnauthorized);
    return () => window.removeEventListener("admin-unauthorized", onUnauthorized);
  }, [router]);

  const logout = async () => {
    try {
      await api("/api/admin/login", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setAuthStatus("unauthenticated");
    router.replace("/admin");
  };

  if (authStatus === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900" role="status">
        <Spinner className="h-8 w-8 text-white" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (authStatus === "unauthenticated") {
    return <AdminLogin onLoginSuccess={() => setAuthStatus("authenticated")} />;
  }

  const isLinkActive = (to: string, exact?: boolean) => {
    if (exact) return pathname === to;
    return pathname === to || pathname?.startsWith(to + "/");
  };

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-navy-900 text-slate-300">
      <div className="px-6 pb-4 pt-6 text-lg font-bold tracking-tight text-white">{BRAND}</div>
      <nav aria-label="Admin" className="flex-1 space-y-1.5 px-3">
        {NAV.map(({ to, label, Icon, exact }) => {
          const active = isLinkActive(to, exact);
          return (
            <Link
              key={to}
              href={to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-brand text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-400/80 text-xs font-bold text-white">
          A
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">Admin</p>
          <p className="truncate text-[11px] text-slate-400">{ADMIN_EMAIL}</p>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
          className="btn btn-icon btn-sm text-slate-400 hover:text-white hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-surface lg:flex">
      <div className="hidden lg:block lg:sticky lg:top-0 lg:h-screen">{sidebar}</div>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between bg-navy-900 px-4 py-3 text-white lg:hidden">
          <span className="text-sm font-bold">{BRAND}</span>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="btn btn-icon btn-sm text-white hover:bg-white/10"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        <main className="p-4 sm:p-7">{children}</main>
      </div>
    </div>
  );
}
