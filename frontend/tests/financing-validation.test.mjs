import test from "node:test";
import assert from "node:assert/strict";

import {
  addNaturalMonths,
  distributeProportionally,
  generateSchedule,
  moneyToCents,
  validateFinancing,
} from "../src/financing/validation.ts";

test("convierte moneda formateada a centavos", () => {
  assert.equal(moneyToCents("$1,250.40"), 125040);
  assert.throws(() => moneyToCents("10.999"));
  assert.throws(() => moneyToCents("-1"));
});

test("respeta el ultimo dia en meses naturales", () => {
  assert.equal(addNaturalMonths("2025-01-31", 1), "2025-02-28");
  assert.equal(addNaturalMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addNaturalMonths("2025-01-31", 2), "2025-03-31");
});

test("reparte centavos sin perder el residuo", () => {
  const schedule = generateSchedule({
    couponAmount: "100.00",
    couponCount: "3",
    firstDueDate: "2025-01-31",
    balloonAmount: "20.00",
    balloonDueDate: "2025-04-30",
  });

  assert.deepEqual(schedule.slice(0, 3).map((row) => row.monto), [
    "33.33",
    "33.33",
    "33.34",
  ]);
  assert.deepEqual(schedule.slice(0, 3).map((row) => row.vencimiento), [
    "2025-01-31",
    "2025-02-28",
    "2025-03-31",
  ]);
  assert.equal(schedule.at(-1).monto, "20.00");
  assert.equal(schedule.at(-1).is_balloon, 1);
});

test("distribuye el financiamiento proporcionalmente y conserva cada centavo", () => {
  const shares = distributeProportionally(100_000_00, [257_400_00, 257_400_00, 257_400_00]);
  assert.deepEqual(shares, [3_333_334, 3_333_333, 3_333_333]);
  assert.equal(shares.reduce((sum, cents) => sum + cents, 0), 100_000_00);
});

test("exige cupones positivos y una fecha inicial", () => {
  assert.throws(() =>
    generateSchedule({
      couponAmount: "100.00",
      couponCount: "0",
      firstDueDate: "2025-01-01",
      balloonAmount: "0",
      balloonDueDate: "",
    }),
  );
  assert.throws(() =>
    generateSchedule({
      couponAmount: "100.00",
      couponCount: "1",
      firstDueDate: "",
      balloonAmount: "0",
      balloonDueDate: "",
    }),
  );
});

test("separa capital T0 del total nominal de pagarés", () => {
  const payload = validateFinancing({
    applications: [{
      obligacion_id: 1,
      entity: "CON",
      entity_id: 1,
      acreedor: "CONCESIONARIO",
      unit_id: 1,
      vin: "VIN-1",
      oc_mexrac: "504",
      vencimiento: "2026-09-01",
      monto_original: 100000,
      saldo: 100000,
      selected: true,
      amount: "1000.00",
      directPayment: true,
    }],
    schedule: [{ serie_pago: 1, vencimiento: "2026-10-01", monto: "1150.00", is_balloon: 0 }],
    scheduleSignature: null,
    idFin: "1",
    folio: "F-1",
    emision: "2026-08-21",
    capitalT0: "1000.00",
    montoCupones: "1150.00",
    montoBalloon: "0.00",
    comments: "",
  });

  assert.equal(payload.capital_t0, "1000.00");
  assert.equal(payload.total, "1150.00");
  assert.equal(payload.unidades[0].monto_asignado, "1000.00");
});
