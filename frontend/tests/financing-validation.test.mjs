import test from "node:test";
import assert from "node:assert/strict";

import {
  addNaturalMonths,
  generateSchedule,
  moneyToCents,
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
