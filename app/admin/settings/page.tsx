"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { ADMIN_EMAIL, BRAND, SHEET_URL } from "@/lib/config";
import Spinner from "@/components/Spinner";

interface ItemProps {
  k: string;
  v?: string | null;
}

const Item = ({ k, v }: ItemProps) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-3 text-[13px] last:border-0">
    <dt className="text-slate-600">{k}</dt>
    <dd className="break-all text-right font-medium text-ink">{v || "Not set"}</dd>
  </div>
);

export default function SettingsPage() {
  const router = useRouter();
  const [feeSettings, setFeeSettings] = useState<any>(null);
  const [loadingFee, setLoadingFee] = useState(true);
  const [savingFee, setSavingFee] = useState(false);
  const [feeInputRupees, setFeeInputRupees] = useState("");
  const [feeMsg, setFeeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSettings = async () => {
    try {
      setLoadingFee(true);
      const res = await api<any>("/api/admin/settings");
      const settings = res.settings || res;
      if (res.ok && (settings.serviceFeeRupees !== undefined || settings.feeRupees !== undefined)) {
        const rupees = settings.serviceFeeRupees ?? settings.feeRupees;
        const formatted = settings.formatted || `₹${rupees}`;
        const normalized = {
          ...settings,
          serviceFeeRupees: rupees,
          feeRupees: rupees,
          formatted,
        };
        setFeeSettings(normalized);
        setFeeInputRupees(String(rupees));
      }
    } catch (e: any) {
      if (e.status === 401) {
        router.replace("/admin");
        return;
      }
      setFeeMsg({ type: "error", text: "Failed to load fee settings: " + (e.message || "Unknown error") });
    } finally {
      setLoadingFee(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (feeMsg?.type === "success") {
      const timer = setTimeout(() => {
        setFeeMsg(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [feeMsg]);

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingFee) return;
    setFeeMsg(null);

    const trimmed = String(feeInputRupees).trim();
    if (!trimmed) {
      setFeeMsg({ type: "error", text: "Please enter a service fee amount." });
      return;
    }

    const num = Number(trimmed);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      setFeeMsg({ type: "error", text: "Service fee must be a valid whole-rupee amount (decimals not allowed)." });
      return;
    }

    if (num < 1 || num > 50000) {
      setFeeMsg({ type: "error", text: "Service fee must be between ₹1 and ₹50,000." });
      return;
    }

    try {
      setSavingFee(true);
      const res = await api<any>("/api/admin/settings", {
        method: "POST",
        body: { serviceFeeRupees: num },
      });
      if (res.ok) {
        const settings = res.settings || res;
        const rupees = settings.serviceFeeRupees ?? settings.feeRupees ?? num;
        const formatted = settings.formatted || `₹${rupees}`;
        const normalized = {
          ...settings,
          serviceFeeRupees: rupees,
          feeRupees: rupees,
          formatted,
        };
        setFeeSettings(normalized);
        setFeeInputRupees(String(rupees));
        setFeeMsg({
          type: "success",
          text: `Service fee updated to ${formatted}.`,
        });
      }
    } catch (e: any) {
      setFeeMsg({ type: "error", text: e.message || "Failed to update service fee." });
    } finally {
      setSavingFee(false);
    }
  };

  const logout = async () => {
    try {
      await api("/api/admin/login", { method: "DELETE" });
    } catch {
      // ignore
    }
    router.replace("/admin");
  };

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      {/* Service Fee Configuration Card */}
      <div className="card-soft max-w-xl p-5 mb-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-ink">Service fee</h2>
            <p className="text-xs text-slate-600">The fee charged to customers at checkout.</p>
          </div>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
            {feeSettings ? feeSettings.formatted : "..."}
          </span>
        </div>

        {loadingFee ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-5 w-5 text-brand" />
          </div>
        ) : (
          <form onSubmit={handleSaveFee} className="mt-4 space-y-4">
            <div>
              <label htmlFor="serviceFeeRupees" className="block text-sm font-medium text-slate-700">
                Fee amount (₹)
              </label>
              <div className="mt-1 relative flex items-center max-w-xs">
                <span className="absolute left-3 text-sm font-semibold text-slate-500">₹</span>
                <input
                  id="serviceFeeRupees"
                  name="serviceFeeRupees"
                  type="number"
                  step="1"
                  min="1"
                  max="50000"
                  value={feeInputRupees}
                  onChange={(e) => setFeeInputRupees(e.target.value)}
                  disabled={savingFee}
                  className="field pl-8 font-medium"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Allowed range: ₹1 to ₹50,000.</p>
            </div>

            {feeMsg && (
              <div
                role={feeMsg.type === "success" ? "status" : "alert"}
                className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                  feeMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {feeMsg.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
                )}
                <span>{feeMsg.text}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={savingFee || loadingFee}
                className="btn btn-primary btn-md px-5"
              >
                {savingFee ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {savingFee ? "Saving..." : "Save fee"}
              </button>
              {feeSettings?.updatedAt && (
                <span className="text-xs text-slate-500">
                  Last updated: {new Date(feeSettings.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      <div className="card-soft max-w-xl px-5 py-2">
        <dl>
          <Item k="Brand" v={BRAND} />
          <Item k="Admin" v={ADMIN_EMAIL} />
          <Item k="Google Sheet" v={SHEET_URL} />
        </dl>
      </div>
      <button onClick={logout} className="btn btn-danger-ghost btn-md mt-6">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}
