const dateFields = new Set(["delivery", "dueDate"]);
const moneyFields = new Set(["subtotal", "vat", "total"]);

export function excelRange(text: string): string[][] {
  return text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((row) => row.split("\t"));
}

export function pastedCell(field: string, source: string): string {
  const value = source.trim();
  if (dateFields.has(field)) {
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  if (moneyFields.has(field)) {
    const compact = value.replace(/[$\s]/g, "");
    if (compact.includes(",") && compact.includes(".")) {
      return compact.lastIndexOf(",") > compact.lastIndexOf(".")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "");
    }
    if (/^-?\d+,\d{1,2}$/.test(compact)) return compact.replace(",", ".");
    return compact.replace(/,/g, "");
  }
  return value;
}
