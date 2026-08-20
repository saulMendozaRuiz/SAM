import test from "node:test";
import assert from "node:assert/strict";

import { filterUnits } from "../src/units-filter.ts";

const units = [
  { vin: "VIN-ASD", version: "Mirage GLX", marca: "Mitsubishi", oc_mexrac: "504", concesionario: "Centro" },
  { vin: "ASD-002", version: "Sport", marca: "Audi", oc_mexrac: "900", concesionario: "Norte" },
];

test("filtra sin distinguir mayusculas", () => {
  assert.equal(filterUnits(units, "marca", "mitsubishi").length, 1);
});

test("interpreta los comodines de inicio y final", () => {
  assert.equal(filterUnits(units, "vin", "*asd").length, 1);
  assert.equal(filterUnits(units, "vin", "asd*").length, 1);
  assert.equal(filterUnits(units, "all", "*rage*").length, 1);
});
