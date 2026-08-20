const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function displayValue(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? "—"
    : escapeHtml(value);
}

export function formatMoney(value: unknown): string {
  const number = Number(value ?? 0);
  return currencyFormatter.format(Number.isFinite(number) ? number : 0);
}

export function formatCompactMoney(value: unknown): string {
  const parsed = Number(value ?? 0);
  const number = Number.isFinite(parsed) ? parsed : 0;
  const absolute = Math.abs(number);
  const suffixes = ["", "K", "M", "B", "T"];
  const magnitude = absolute < 1
    ? 0
    : Math.min(Math.floor(Math.log10(absolute) / 3), suffixes.length - 1);
  const scaled = number / 1_000 ** magnitude;
  const formatted = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: magnitude === 0 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(scaled);
  return `${formatted}${suffixes[magnitude] ? ` ${suffixes[magnitude]}` : ""}`;
}

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
