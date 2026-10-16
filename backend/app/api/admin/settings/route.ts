import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";
import { fail, ok, readJson } from "@/lib/http";
import { getActiveServiceFeePaise, updateServiceFeePaise, SERVICE_FEE_SETTING_KEY } from "@/lib/settings";
import { MIN_SERVICE_FEE_PAISE, MAX_SERVICE_FEE_PAISE, CONSENT_VERSION, getConsentText } from "@/lib/catalog";
import { validateFeePaise } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function settingsResponse(data: Record<string, unknown>) {
  const response = ok(data);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(req: NextRequest) {
  // Public or admin: allow read so customer and admin frontends can display active fee and consent text,
  // but protect modifications behind adminGuard.
  const currentFee = await getActiveServiceFeePaise();
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SERVICE_FEE_SETTING_KEY },
  });

  const feeRupees = Math.round(currentFee / 100);
  const formatted = `₹${feeRupees}`;
  const minRupees = Math.ceil(MIN_SERVICE_FEE_PAISE / 100);
  const maxRupees = Math.floor(MAX_SERVICE_FEE_PAISE / 100);

  const settingsData = {
    serviceFeeRupees: feeRupees,
    feeRupees,
    feePaise: currentFee,
    formatted,
    minRupees,
    maxRupees,
    minPaise: MIN_SERVICE_FEE_PAISE,
    maxPaise: MAX_SERVICE_FEE_PAISE,
    consentVersion: CONSENT_VERSION,
    consentText: getConsentText(currentFee),
    updatedAt: setting?.updatedAt ?? null,
    updatedBy: setting?.updatedBy ?? null,
  };

  return settingsResponse({
    ...settingsData,
    settings: settingsData,
  });
}

export async function POST(req: NextRequest) {
  const denied = adminGuard(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return fail(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  let targetPaise: number | undefined;

  // Accept frontend field serviceFeeRupees as the primary rupee-first contract
  const rawRupeeValue = body.serviceFeeRupees !== undefined ? body.serviceFeeRupees : body.feeRupees;

  if (rawRupeeValue !== undefined && rawRupeeValue !== null && rawRupeeValue !== "") {
    let rupeeNum: number;
    if (typeof rawRupeeValue === "number") {
      rupeeNum = rawRupeeValue;
    } else if (typeof rawRupeeValue === "string" && /^-?\d+(\.\d+)?$/.test(rawRupeeValue.trim())) {
      rupeeNum = Number(rawRupeeValue.trim());
    } else {
      return fail(400, "INVALID_FEE", "Service fee must be a valid whole-rupee amount.");
    }

    if (!Number.isSafeInteger(rupeeNum)) {
      return fail(400, "INVALID_FEE", "Service fee must be a valid whole-rupee amount (decimals not allowed).");
    }

    if (rupeeNum < 0) {
      return fail(400, "INVALID_FEE", "Service fee cannot be negative.");
    }

    const minRupees = Math.ceil(MIN_SERVICE_FEE_PAISE / 100);
    const maxRupees = Math.floor(MAX_SERVICE_FEE_PAISE / 100);
    if (rupeeNum < minRupees || rupeeNum > maxRupees) {
      return fail(400, "OUT_OF_RANGE", `Service fee must be between ₹${minRupees} and ₹${maxRupees.toLocaleString("en-IN")}.`);
    }

    // Convert rupees to paise exactly once for existing paise-based validation and storage helpers
    targetPaise = rupeeNum * 100;
  } else if (typeof body.feePaise === "number") {
    // Explicit paise input (backward compatibility)
    if (!Number.isSafeInteger(body.feePaise)) {
      return fail(400, "INVALID_FEE", "Fee in paise must be a valid integer.");
    }
    targetPaise = body.feePaise;
  } else {
    return fail(400, "MISSING_FEE", "Service fee in rupees (serviceFeeRupees) is required.");
  }

  const feeValidation = validateFeePaise(targetPaise);
  if (!feeValidation.valid) {
    return fail(400, "INVALID_FEE", feeValidation.error || "Fee value rejected.");
  }

  const result = await updateServiceFeePaise(feeValidation.value!, "admin");
  if (!result.success) {
    return fail(400, "FEE_UPDATE_FAILED", result.error || "Fee update rejected.");
  }

  const feeRupees = Math.round(result.feePaise / 100);
  const formatted = `₹${feeRupees}`;
  const minRupees = Math.ceil(MIN_SERVICE_FEE_PAISE / 100);
  const maxRupees = Math.floor(MAX_SERVICE_FEE_PAISE / 100);

  const updatedSetting = await prisma.systemSetting.findUnique({
    where: { key: SERVICE_FEE_SETTING_KEY },
  });

  const settingsData = {
    serviceFeeRupees: feeRupees,
    feeRupees,
    feePaise: result.feePaise,
    formatted,
    minRupees,
    maxRupees,
    minPaise: MIN_SERVICE_FEE_PAISE,
    maxPaise: MAX_SERVICE_FEE_PAISE,
    consentVersion: CONSENT_VERSION,
    consentText: getConsentText(result.feePaise),
    updatedAt: updatedSetting?.updatedAt ?? new Date(),
    updatedBy: updatedSetting?.updatedBy ?? "admin",
  };

  return settingsResponse({
    ...settingsData,
    settings: settingsData,
  });
}
