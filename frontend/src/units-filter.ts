import type { Unit } from "./domain/types.ts";

export type UnitFilterField = "all" | "vin" | "version" | "marca" | "oc_mexrac" | "concesionario";

function matches(value: string, search: string): boolean {
  const normalizedValue = value.toLocaleUpperCase("es-MX");
  const normalizedSearch = search.trim().toLocaleUpperCase("es-MX");
  if (!normalizedSearch) return true;
  if (!normalizedSearch.includes("*")) return normalizedValue.includes(normalizedSearch);
  const expression = normalizedSearch
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(normalizedValue);
}

export function filterUnits(units: Unit[], field: UnitFilterField, search: string): Unit[] {
  return units.filter((unit) => {
    const values = field === "all"
      ? [unit.vin, unit.version, unit.marca, unit.oc_mexrac ?? "", unit.concesionario]
      : [String(unit[field] ?? "")];
    return values.some((value) => matches(value, search));
  });
}
