import test from "node:test";
import assert from "node:assert/strict";

import { acquisitionRowsFromCsv } from "../src/acquisitions/csv.ts";

test("convierte CSV a las mismas filas de la captura manual", () => {
  const rows = acquisitionRowsFromCsv(
    'vin,no_motor,modelo_anio,marca,version,subtotal,iva,total,vencimiento,comentarios\n' +
    'VIN-1,M-1,2026,VW,"Versión, Demo",100.00,16.00,116.00,30/09/2026,"Sin daño"',
  );

  assert.deepEqual(rows, [{
    vin: "VIN-1", engine: "M-1", year: "2026", brand: "VW", version: "Versión, Demo",
    subtotal: "100.00", vat: "16.00", total: "116.00", dueDate: "2026-09-30", comments: "Sin daño",
  }]);
});

test("rechaza archivos sin las columnas obligatorias", () => {
  assert.throws(() => acquisitionRowsFromCsv("vin,marca\nVIN-1,VW"), /Faltan columnas obligatorias/);
});
