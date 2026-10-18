"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

/** GET /api/admin/orders with automatic redirect to the login page on 401. */
export function useOrders(params: Record<string, any>) {
  const router = useRouter();
  const [state, setState] = useState<{ loading: boolean; error: string; data: any }>({
    loading: true,
    error: "",
    data: null,
  });
  const seq = useRef(0);
  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const qs = new URLSearchParams();
      Object.entries(JSON.parse(key)).forEach(([k, v]) => {
        if (v !== "" && v != null) qs.set(k, String(v));
      });
      const data = await api(`/api/admin/orders?${qs}`);
      if (mine === seq.current) setState({ loading: false, error: "", data });
    } catch (e: any) {
      if (mine !== seq.current) return;
      if (e.status === 401) {
        router.replace("/admin");
        return;
      }
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [key, router]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
