import { formatMoney } from "../ui/format.ts";
import { centsToMoney } from "../ui/money.ts";
import type {
  FinancingFormState,
  FinancingPayload,
  FinancingScheduleRow,
} from "../domain/types.ts";

export { escapeHtml, formatMoney, localIsoDate } from "../ui/format.ts";
export { centsToMoney } from "../ui/money.ts";

export function moneyToCents(value: unknown, field = "importe"): number {
  const text = String(value ?? "")
    .trim()
    .replace(/[$,\s]/g, "");

  if (!/^\d+(\.\d{0,2})?$/.test(text)) {
    throw new Error(`${field} debe ser un importe válido con máximo dos decimales.`);
  }

  const [integer, decimals = ""] = text.split(".");
  const cents = Number(integer) * 100 + Number(decimals.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${field} es demasiado grande.`);
  }

  return cents;
}

export function bindMoneyInput(input: HTMLInputElement, onChange: () => void = () => {}): void {
  const showEditableValue = () => {
    try {
      input.value = centsToMoney(moneyToCents(input.value || "0"));
    } catch {
      input.value = "0.00";
    }
  };

  const showFormattedValue = (notify = true) => {
    try {
      input.value = formatMoney(moneyToCents(input.value || "0") / 100);
    } catch {
      input.value = "$0.00";
    }
    if (notify) onChange();
  };

  input.addEventListener("focus", () => {
    showEditableValue();
    input.select();
  });
  input.addEventListener("blur", () => showFormattedValue());
  showFormattedValue(false);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function addNaturalMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const absoluteMonth = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function generateSchedule({
  couponAmount,
  couponCount,
  firstDueDate,
  balloonAmount,
  balloonDueDate,
}: {
  couponAmount: string;
  couponCount: string;
  firstDueDate: string;
  balloonAmount: string;
  balloonDueDate: string;
}): FinancingScheduleRow[] {
  const totalCouponCents = moneyToCents(couponAmount, "Monto de cupones");
  const totalBalloonCents = moneyToCents(balloonAmount || "0", "Monto balloon");
  const count = Number(couponCount);

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("La cantidad de cupones debe ser un entero positivo.");
  }

  if (!firstDueDate) {
    throw new Error("Captura el primer vencimiento.");
  }

  if (totalCouponCents <= 0) {
    throw new Error("El monto de cupones debe ser mayor que cero.");
  }

  const base = Math.floor(totalCouponCents / count);
  const remainder = totalCouponCents - base * count;
  const rows: FinancingScheduleRow[] = [];

  for (let index = 0; index < count; index += 1) {
    rows.push({
      serie_pago: index + 1,
      vencimiento: addNaturalMonths(firstDueDate, index),
      monto: centsToMoney(base + (index === count - 1 ? remainder : 0)),
      is_balloon: 0,
    });
  }

  if (totalBalloonCents > 0) {
    rows.push({
      serie_pago: count,
      vencimiento: balloonDueDate || rows.at(-1)!.vencimiento,
      monto: centsToMoney(totalBalloonCents),
      is_balloon: 1,
    });
  }

  return rows;
}

export function validateFinancing(state: FinancingFormState): FinancingPayload {
  const couponCents = moneyToCents(state.montoCupones || "0", "Monto de cupones");
  const balloonCents = moneyToCents(state.montoBalloon || "0", "Monto balloon");
  const financingCents = couponCents + balloonCents;

  const selected = state.applications
    .filter((item) => moneyToCents(item.amount || "0") > 0);

  const units = selected
    .filter((item) => item.entity === "CON" && Number(item.unit_id) > 0)
    .map((item) => ({
      unit_id: Number(item.unit_id),
      monto_asignado: centsToMoney(moneyToCents(item.amount, "Monto asignado")),
      pago_directo_con: Boolean(item.directPayment),
    }));

  const applications = selected
    .filter((item) => item.entity === "FIN")
    .map((item) => ({
      obligacion_id: Number(item.obligacion_id),
      monto: centsToMoney(moneyToCents(item.amount, "Monto amparado")),
    }));

  const schedule: FinancingScheduleRow[] = state.schedule.map((row) => {
    const cents = moneyToCents(row.monto, "Monto del calendario");
    return {
      serie_pago: Number(row.serie_pago),
      vencimiento: row.vencimiento,
      monto: centsToMoney(cents),
      is_balloon: Number(row.is_balloon) === 1 ? 1 : 0,
    };
  });

  return {
    id_fin: Number(state.idFin),
    folio: state.folio.trim(),
    emision: state.emision,
    monto_cupones: centsToMoney(couponCents),
    monto_balloon: centsToMoney(balloonCents),
    aplicaciones: applications,
    unidades: units,
    calendario: schedule,
    comentarios: state.comments.trim() || null,
    total: centsToMoney(financingCents),
  };
}
