// @ts-nocheck -- Módulo legado; se migrará por secciones sin ocultar errores en código nuevo.
export { formatMoney, localIsoDate } from "../ui/format.ts";
export { centsToMoney, tryParseMoney as moneyToCents } from "../ui/money.ts";
import { tryParseMoney as moneyToCents } from "../ui/money.ts";

export function validateUnits(units) {
  if (units.length === 0) {
    return "Agrega al menos una unidad.";
  }

  const vins = new Set();
  const motors = new Set();

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const label = `Unidad ${index + 1}`;

    if (!unit.idCon) {
      return "Selecciona un concesionario.";
    }

    if (!unit.vin) {
      return `${label}: captura el VIN.`;
    }

    if (vins.has(unit.vin)) {
      return `El VIN ${unit.vin} está repetido en la adquisición.`;
    }

    vins.add(unit.vin);

    if (unit.noMotor) {
      if (motors.has(unit.noMotor)) {
        return `El número de motor ${unit.noMotor} está repetido en la adquisición.`;
      }

      motors.add(unit.noMotor);
    }

    if (
      !Number.isInteger(unit.modeloAnio) ||
      unit.modeloAnio <= 0
    ) {
      return `${label}: captura un modelo/año válido.`;
    }

    if (!unit.marca) {
      return `${label}: captura la marca.`;
    }

    if (!unit.version) {
      return `${label}: captura la versión.`;
    }

    if (!unit.vencimiento) {
      return `${label}: captura el vencimiento.`;
    }

    const subtotal = moneyToCents(unit.subtotal);
    const iva = moneyToCents(unit.iva);
    const total = moneyToCents(unit.total);

    if (
      subtotal === null ||
      iva === null ||
      total === null
    ) {
      return `${label}: captura importes válidos.`;
    }

    if (total <= 0) {
      return `${label}: el total debe ser positivo.`;
    }

    if (subtotal + iva !== total) {
      return `${label}: subtotal más IVA no coincide con el total.`;
    }
  }

  return "";
}

export function totalAcquisition(units) {
  return units.reduce((accumulator, unit) => {
    return accumulator + (moneyToCents(unit.total) ?? 0);
  }, 0);
}
