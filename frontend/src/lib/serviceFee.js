export function parseServiceFeeRupees(response) {
  const value =
    response?.serviceFeeRupees ??
    response?.feeRupees ??
    response?.settings?.serviceFeeRupees ??
    response?.settings?.feeRupees;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
