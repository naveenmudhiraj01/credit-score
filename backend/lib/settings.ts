import { prisma } from "./prisma.ts";
import { DEFAULT_SERVICE_FEE_PAISE, MIN_SERVICE_FEE_PAISE, MAX_SERVICE_FEE_PAISE } from "./catalog.ts";

export const SERVICE_FEE_SETTING_KEY = "service_fee_paise";

/** Retrieves the active onboarding service fee in integer paise from MySQL SystemSetting. */
export async function getActiveServiceFeePaise(): Promise<number> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: SERVICE_FEE_SETTING_KEY },
    });
    if (row && row.value) {
      const parsed = parseInt(row.value, 10);
      if (Number.isSafeInteger(parsed) && parsed >= MIN_SERVICE_FEE_PAISE && parsed <= MAX_SERVICE_FEE_PAISE) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("[settings] Failed to read service fee from DB:", err instanceof Error ? err.message : err);
    throw err;
  }
  return DEFAULT_SERVICE_FEE_PAISE;
}

/** Updates the active onboarding service fee in MySQL SystemSetting under admin authorization. */
export async function updateServiceFeePaise(newFeePaise: number, updatedBy?: string): Promise<{ success: boolean; feePaise: number; error?: string }> {
  if (!Number.isSafeInteger(newFeePaise) || newFeePaise < MIN_SERVICE_FEE_PAISE || newFeePaise > MAX_SERVICE_FEE_PAISE) {
    return {
      success: false,
      feePaise: await getActiveServiceFeePaise(),
      error: `Fee must be an integer between ₹${(MIN_SERVICE_FEE_PAISE / 100).toFixed(2)} and ₹${(MAX_SERVICE_FEE_PAISE / 100).toFixed(2)}.`,
    };
  }

  try {
    await prisma.systemSetting.upsert({
      where: { key: SERVICE_FEE_SETTING_KEY },
      create: {
        key: SERVICE_FEE_SETTING_KEY,
        value: String(newFeePaise),
        description: "Active onboarding service fee in integer paise",
        updatedBy: updatedBy ?? "ADMIN",
      },
      update: {
        value: String(newFeePaise),
        updatedBy: updatedBy ?? "ADMIN",
      },
    });
    return { success: true, feePaise: newFeePaise };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[settings] Failed to save service fee to DB:", errMsg);
    return { success: false, feePaise: await getActiveServiceFeePaise(), error: "Database error while updating fee." };
  }
}
