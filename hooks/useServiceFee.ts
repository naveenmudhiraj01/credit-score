"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseServiceFeeRupees } from "@/lib/serviceFee";

export function useServiceFee() {
  const [feeRupees, setFeeRupees] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    api("/api/admin/settings")
      .then((response: any) => {
        const fee = parseServiceFeeRupees(response);
        if (fee === null) throw new Error("Invalid service fee response.");
        if (active) setFeeRupees(fee);
      })
      .catch(() => {
        if (active) setHasError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    feeRupees,
    isLoading: feeRupees === null && !hasError,
    hasError,
  };
}
