import { invoke } from "@tauri-apps/api/core";
import { messageDialog } from "./ui/message.ts";
import type {
  AcquisitionConfirmed,
  AcquisitionInput,
  AuthenticatedUser,
  CalendarItem,
  Concessionaire,
  FinanceableObligation,
  FinancialInstitution,
  Financing,
  FinancingConfirmed,
  FinancingPayload,
  Obligation,
  Reports,
  Unit,
} from "./domain/types.ts";

export class ReportedMutationError extends Error {}

async function invokeMutation<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    await messageDialog(error);
    throw new ReportedMutationError();
  }
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<AuthenticatedUser> {
  return invoke<AuthenticatedUser>("autenticar_usuario", {
    usuario: username,
    contrasena: password,
  });
}

export async function loadReports(): Promise<Reports> {
  const [debtSummary, uncoveredUnits, dueDates] = await Promise.all([
    invoke<Reports["debtSummary"]>("resumen_deuda"),
    invoke<Reports["uncoveredUnits"]>("unidades_sin_cobertura_total"),
    invoke<Reports["dueDates"]>("vencimientos"),
  ]);
  return { debtSummary, uncoveredUnits, dueDates };
}

export async function loadUnits(): Promise<Unit[]> {
  return invoke<Unit[]>("listar_unidades");
}

export async function correctConcessionaireDueDate(
  unitid: number,
  vencimiento: string,
  usuario: string,
  contrasena: string,
): Promise<void> {
  return invokeMutation<void>("corregir_vencimiento_con", { unitid, vencimiento, usuario, contrasena });
}

export async function loadConcessionaires(): Promise<Concessionaire[]> {
  return invoke<Concessionaire[]>("listar_concesionarios");
}

export async function createConcessionaire(entrada: {
  name: string;
  cluster: string;
  rfc: string;
  comentarios: string;
}): Promise<number> {
  return invokeMutation<number>("crear_concesionario", { entrada });
}

export async function loadFinancialInstitutions(): Promise<FinancialInstitution[]> {
  return invoke<FinancialInstitution[]>("listar_financieras");
}

export async function createFinancialInstitution(entrada: {
  razon_social: string;
  rfc: string;
  comentarios: string;
}): Promise<number> {
  return invokeMutation<number>("crear_financiera", { entrada });
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
  return invoke<CalendarItem[]>("listar_calendario", { fechaDesde, fechaHasta });
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
  return invokeMutation<{ id_abono: number; monto: number; aplicaciones: number }>("registrar_abono", {
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
  return invokeMutation<AcquisitionConfirmed>("confirmar_adquisicion", {
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
  return invokeMutation<FinancingConfirmed>("confirmar_financiamiento", {
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
  return invokeMutation<void>("cancelar_financiamiento", {
    idFinto: Number(idFinto),
    motivo,
  });
}
