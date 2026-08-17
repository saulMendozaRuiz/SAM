export function tryParseMoney(value: unknown): number | null {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [integerPart, decimalPart = ""] = normalized.split(".");
  const cents = Number(integerPart) * 100 + Number(decimalPart.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}
