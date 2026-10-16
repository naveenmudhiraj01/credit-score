/** Backend stores amounts in paise. */
export const inr = (paise) =>
  "₹" + (Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const inrRupees = (r) => "₹" + Number(r).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const date = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}
