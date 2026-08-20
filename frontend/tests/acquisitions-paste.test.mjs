import test from "node:test";
import assert from "node:assert/strict";

import { excelRange, pastedCell } from "../src/acquisitions/paste.ts";

test("conserva filas y columnas de un rango de Excel", () => {
  assert.deepEqual(excelRange("VIN-1\tM-1\r\nVIN-2\tM-2\r\n"), [
    ["VIN-1", "M-1"],
    ["VIN-2", "M-2"],
  ]);
});

test("normaliza fechas e importes comunes de Excel", () => {
  assert.equal(pastedCell("dueDate", "19/08/2026"), "2026-08-19");
  assert.equal(pastedCell("total", "$1,234.56"), "1234.56");
  assert.equal(pastedCell("total", "1.234,56"), "1234.56");
});
