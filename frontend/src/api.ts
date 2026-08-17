import { invoke } from "@tauri-apps/api/core";
import type {
  AcquisitionConfirmed,
  AcquisitionInput,
  CalendarItem,
  Concessionaire,
  DatabaseLightCheck,
  FinanceableObligation,
  FinancialInstitution,
  Financing,
  FinancingConfirmed,
  FinancingPayload,
  LedgerEntry,
  Obligation,
  Reports,
  Unit,
} from "./domain/types.ts";

function debugTables(callback: () => void): void {
  if (import.meta.env.DEV) {
    callback();
  }
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function defaultReportDates() {
  const cutoffDate = new Date();
  const horizonDate = new Date(cutoffDate);

  horizonDate.setFullYear(
    horizonDate.getFullYear() + 1,
  );

  return {
    cutoffDate: toIsoDate(cutoffDate),
    horizonDate: toIsoDate(horizonDate),
  };
}

export async function loadReports(
  cutoffDate?: string,
  horizonDate?: string,
): Promise<Reports> {
  const defaultDates = defaultReportDates();

  const effectiveCutoff =
    cutoffDate ?? defaultDates.cutoffDate;

  const effectiveHorizon =
    horizonDate ?? defaultDates.horizonDate;

  const [
    debtSummary,
    uncoveredUnits,
    dueDates,
  ] = await Promise.all([
    invoke<Reports["debtSummary"]>("resumen_deuda"),
    invoke<Reports["uncoveredUnits"]>("unidades_sin_cobertura_total"),
    invoke<Reports["dueDates"]>("vencimientos", {
      fechaCorte: effectiveCutoff,
      fechaHasta: effectiveHorizon,
    }),
  ]);

  const reports: Reports = {
    cutoffDate: effectiveCutoff,
    horizonDate: effectiveHorizon,
    debtSummary,
    uncoveredUnits,
    dueDates,
  };

  debugTables(() => {
    console.group("SAM REPORTS");
    console.log("DEBT SUMMARY");
    console.table(debtSummary);
    console.log("VEHICLES WITHOUT FULL COVERAGE");
    console.table(uncoveredUnits);
    console.log("DUE DATES");
    console.table(dueDates);
    console.groupEnd();
  });

  return reports;
}

export async function verifyDatabaseLight(): Promise<DatabaseLightCheck> {
  const result = await invoke<DatabaseLightCheck>(
    "verificar_bd_ligera",
  );

  if (!result.foreign_keys) {
    throw new Error(
      "SQLite tiene desactivadas las llaves foráneas.",
    );
  }

  if (result.violaciones_llaves) {
    throw new Error(
      "SQLite contiene violaciones de llaves foráneas.",
    );
  }

  return result;
}

export async function loadUnits(): Promise<Unit[]> {
  return invoke<Unit[]>("listar_unidades");
}

export async function loadConcessionaires(): Promise<Concessionaire[]> {
  return invoke<Concessionaire[]>("listar_concesionarios");
}

export async function loadFinancialInstitutions(): Promise<FinancialInstitution[]> {
  return invoke<FinancialInstitution[]>("listar_financieras");
}

export async function loadObligations(): Promise<Obligation[]> {
  return invoke<Obligation[]>("listar_obligaciones");
}

export async function loadFinancing(): Promise<Financing[]> {
  return invoke<Financing[]>("listar_financiamientos");
}

export async function loadPaymentCalendar(
  fechaDesde: string,
  fechaHasta: string,
): Promise<CalendarItem[]> {
  return invoke<CalendarItem[]>("listar_calendario", {
    fechaDesde,
    fechaHasta,
  });
}

export async function loadLedger(
  fechaDesde: string,
  fechaHasta: string,
): Promise<LedgerEntry[]> {
  return invoke<LedgerEntry[]>("listar_ledger", {
    fechaDesde,
    fechaHasta,
  });
}

export async function registerPayment({
  fecha,
  monto,
  referencia,
  aplicaciones,
  comentarios = null,
}: {
  fecha: string;
  monto: string | number;
  referencia: string;
  aplicaciones: Array<{ obligacionId: number; monto: string | number }>;
  comentarios?: string | null;
}) {
  return invoke<{ id_abono: number; monto: number; aplicaciones: number }>("registrar_abono", {
    fecha,
    monto: String(monto),
    referencia,
    aplicaciones: aplicaciones.map(
      (aplicacion) => ({
        obligacion_id:
          Number(aplicacion.obligacionId),
        monto: String(aplicacion.monto),
      }),
    ),
    comentarios,
  });
}

export async function confirmAcquisition(units: AcquisitionInput[]): Promise<AcquisitionConfirmed> {
  return invoke<AcquisitionConfirmed>("confirmar_adquisicion", {
    unidades: units.map((unit) => ({
      id_con: Number(unit.idCon),
      vin: unit.vin.trim(),
      no_motor: unit.noMotor?.trim() || null,
      modelo_anio: Number(unit.modeloAnio),
      marca: unit.marca.trim(),
      version: unit.version.trim(),
      oc_mexrac: unit.ocMexrac?.trim() || null,
      folio_factura:
        unit.folioFactura?.trim() || null,
      subtotal: String(unit.subtotal),
      iva: String(unit.iva),
      total: String(unit.total),
      entrega_patio: unit.entregaPatio || null,
      vencimiento: unit.vencimiento,
      comentarios:
        unit.comentarios?.trim() || null,
    })),
  });
}

export async function loadFinanceableObligations(): Promise<FinanceableObligation[]> {
  return invoke<FinanceableObligation[]>("listar_obligaciones_financiables");
}

export async function confirmFinancing(payload: FinancingPayload): Promise<FinancingConfirmed> {
  return invoke<FinancingConfirmed>("confirmar_financiamiento", {
    entrada: {
      id_fin: Number(payload.id_fin),
      folio: payload.folio,
      emision: payload.emision,
      monto_cupones: String(payload.monto_cupones),
      monto_balloon: String(payload.monto_balloon),
      unidades: (payload.unidades ?? []).map((item) => ({
        unit_id: Number(item.unit_id),
        monto_asignado: String(item.monto_asignado),
        pago_directo_con: Boolean(item.pago_directo_con),
      })),
      aplicaciones: payload.aplicaciones.map((item) => ({
        obligacion_id: Number(item.obligacion_id),
        monto: String(item.monto),
      })),
      calendario: payload.calendario.map((item) => ({
        serie_pago: Number(item.serie_pago),
        vencimiento: item.vencimiento,
        monto: String(item.monto),
        is_balloon: Number(item.is_balloon),
      })),
      comentarios: payload.comentarios ?? null,
    },
  });
}

export async function cancelFinancing(idFinto: number, motivo: string): Promise<void> {
  return invoke<void>("cancelar_financiamiento", {
    idFinto: Number(idFinto),
    motivo,
  });
}
