import test from "node:test";
import assert from "node:assert/strict";

import { totalAcquisition } from "../src/acquisitions/validation.ts";

function unit(overrides = {}) {
  return {
    idCon: 1,
    vin: "VIN-001",
    noMotor: "MOTOR-001",
    modeloAnio: 2026,
    marca: "VW",
    version: "BASE",
    subtotal: "100.00",
    iva: "16.00",
    total: "116.00",
    vencimiento: "2026-09-30",
    ...overrides,
  };
}

test("suma una adquisicion en centavos", () => {
  const units = [
    unit(),
    unit({ vin: "VIN-002", noMotor: "MOTOR-002", total: "58.00", subtotal: "50.00", iva: "8.00" }),
  ];

  assert.equal(totalAcquisition(units), 17400);
});
