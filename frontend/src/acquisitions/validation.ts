const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

export function formatMoney(value) {
  const number = Number(value);

  return currencyFormatter.format(
    Number.isFinite(number) ? number : 0,
  );
}

export function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function moneyToCents(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [integerPart, decimalPart = ""] = normalized.split(".");

  const cents =
    Number(integerPart) * 100 +
    Number(decimalPart.padEnd(2, "0"));

  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToMoney(cents) {
  return (cents / 100).toFixed(2);
}

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