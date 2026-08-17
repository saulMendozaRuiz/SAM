const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatMoney(value) {
  const number = Number(value ?? 0);
  return currencyFormatter.format(Number.isFinite(number) ? number : 0);
}

export function moneyToCents(value, field = "importe") {
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

export function centsToMoney(cents) {
  return `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, "0")}`;
}

export function bindMoneyInput(input, onChange = () => {}) {
  const showEditableValue = () => {
    try {
      input.value = centsToMoney(moneyToCents(input.value || "0"));
    } catch {
      input.value = "0.00";
    }
  };

  const showFormattedValue = () => {
    try {
      input.value = formatMoney(moneyToCents(input.value || "0") / 100);
    } catch {
      input.value = "$0.00";
    }
    onChange();
  };

  input.addEventListener("focus", () => {
    showEditableValue();
    input.select();
  });
  input.addEventListener("blur", showFormattedValue);
  showFormattedValue();
}

export function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function addNaturalMonths(isoDate, months) {
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
}) {
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
  const rows = [];

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
      vencimiento: balloonDueDate || rows.at(-1).vencimiento,
      monto: centsToMoney(totalBalloonCents),
      is_balloon: 1,
    });
  }

  return rows;
}

export function validateFinancing(state) {
  if (!Number(state.idFin)) throw new Error("Selecciona una financiera.");
  if (!state.folio.trim()) throw new Error("Captura el folio del financiamiento.");
  if (!state.emision) throw new Error("Captura la fecha de emisión.");

  const couponCents = moneyToCents(state.montoCupones, "Monto de cupones");
  const balloonCents = moneyToCents(state.montoBalloon || "0", "Monto balloon");
  const financingCents = couponCents + balloonCents;

  const selected = state.applications
    .filter((item) => item.selected || moneyToCents(item.amount || "0") > 0)
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

  if (!units.length && !applications.length) throw new Error("Selecciona al menos una unidad u obligación.");
  if (units.length && applications.length) throw new Error("No mezcles unidades y refinanciamientos en la misma operación.");

  const appliedCents = selected.reduce(
    (sum, item) => sum + moneyToCents(item.amount),
    0,
  );

  if (appliedCents !== financingCents) {
    throw new Error(
      `Las aplicaciones suman ${formatMoney(appliedCents / 100)}, pero el financiamiento es ${formatMoney(financingCents / 100)}.`,
    );
  }

  for (const application of applications) {
    const source = state.applications.find(
      (item) => Number(item.obligacion_id) === application.obligacion_id,
    );
    const applied = moneyToCents(application.monto);
    const available = moneyToCents(String(source.saldo));

    if (applied > available) {
      throw new Error(`La obligación ${application.obligacion_id} no tiene saldo suficiente.`);
    }
  }

  if (!state.schedule.length) throw new Error("Genera el calendario antes de confirmar.");

  let ordinaryCents = 0;
  let scheduleBalloonCents = 0;
  let balloonRows = 0;

  const schedule = state.schedule.map((row) => {
    if (!row.vencimiento) throw new Error(`El renglón ${row.serie_pago} no tiene vencimiento.`);
    const cents = moneyToCents(row.monto, "Monto del calendario");
    if (cents <= 0) throw new Error("Todos los renglones del calendario deben ser positivos.");

    if (Number(row.is_balloon) === 1) {
      balloonRows += 1;
      scheduleBalloonCents += cents;
    } else {
      ordinaryCents += cents;
    }

    return {
      serie_pago: Number(row.serie_pago),
      vencimiento: row.vencimiento,
      monto: centsToMoney(cents),
      is_balloon: Number(row.is_balloon),
    };
  });

  if (ordinaryCents !== couponCents) throw new Error("La suma de cupones no coincide con MONTO_CUPONES.");
  if (scheduleBalloonCents !== balloonCents) throw new Error("El balloon del calendario no coincide.");
  if ((balloonCents > 0 && balloonRows !== 1) || (balloonCents === 0 && balloonRows !== 0)) {
    throw new Error("El calendario balloon es inconsistente.");
  }

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
