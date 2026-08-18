import type { AcquisitionInput } from "../domain/types.ts";
export { formatMoney, localIsoDate } from "../ui/format.ts";
export { centsToMoney, tryParseMoney as moneyToCents } from "../ui/money.ts";
import { tryParseMoney as moneyToCents } from "../ui/money.ts";

export function totalAcquisition(units: AcquisitionInput[]): number {
  return units.reduce((accumulator, unit) => {
    return accumulator + (moneyToCents(unit.total) ?? 0);
  }, 0);
}
