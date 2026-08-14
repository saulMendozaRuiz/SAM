import { invoke } from "@tauri-apps/api/core";

function debugTables(callback) {
  if (import.meta.env.DEV) {
    callback();
  }
}

function toIsoDate(date) {
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

export async function diagnoseDatabase() {
  const diagnosis = await invoke("diagnostico_bd");

  debugTables(() => {
    console.group("SAM DATABASE");
    console.table(diagnosis);
    console.groupEnd();
  });

  if (diagnosis.integridad !== "ok") {
    throw new Error(
      `SQLite integrity check failed: ${diagnosis.integridad}`,
    );
  }

  if (!diagnosis.foreign_keys) {
    throw new Error(
      "SQLite foreign keys are disabled",
    );
  }

  return diagnosis;
}

export async function loadReports(
  cutoffDate,
  horizonDate,
) {
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
    invoke("resumen_deuda"),
    invoke("unidades_sin_cobertura_total"),
    invoke("vencimientos", {
      fechaCorte: effectiveCutoff,
      fechaHasta: effectiveHorizon,
    }),
  ]);

  const reports = {
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

export async function prepareSam() {
  const [diagnosis, reports] =
    await Promise.all([
      diagnoseDatabase(),
      loadReports(),
    ]);

  return {
    diagnosis,
    reports,
  };
}

export async function verifyDatabaseLight() {
  const result = await invoke(
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

export async function loadUnits() {
  return invoke("listar_unidades");
}

export async function loadConcessionaires() {
  return invoke("listar_concesionarios");
}

export async function loadFinancialInstitutions() {
  return invoke("listar_financieras");
}

export async function loadObligations() {
  return invoke("listar_obligaciones");
}

export async function loadFinancing() {
  return invoke("listar_financiamientos");
}

export async function loadPaymentCalendar(
  fechaDesde,
  fechaHasta,
) {
  return invoke("listar_calendario", {
    fechaDesde,
    fechaHasta,
  });
}

export async function loadLedger(
  fechaDesde,
  fechaHasta,
) {
  return invoke("listar_ledger", {
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
}) {
  return invoke("registrar_abono", {
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

export async function confirmAcquisition(units) {
  return invoke("confirmar_adquisicion", {
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

export async function loadFinanceableObligations() {
  return invoke("listar_obligaciones_financiables");
}

export async function confirmFinancing(payload) {
  return invoke("confirmar_financiamiento", {
    entrada: {
      id_fin: Number(payload.id_fin),
      folio: payload.folio,
      emision: payload.emision,
      monto_cupones: String(payload.monto_cupones),
      monto_balloon: String(payload.monto_balloon),
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

export async function cancelFinancing(idFinto, motivo) {
  return invoke("cancelar_financiamiento", {
    idFinto: Number(idFinto),
    motivo,
  });
}
