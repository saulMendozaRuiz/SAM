import test from "node:test";
import assert from "node:assert/strict";

import { centsToMoney, tryParseMoney } from "../src/ui/money.ts";

test("convierte importes de interfaz a centavos exactos", () => {
  assert.equal(tryParseMoney("1250.40"), 125040);
  assert.equal(tryParseMoney("10,5"), 1050);
  assert.equal(tryParseMoney("0"), 0);
});

test("rechaza importes ambiguos o con demasiados decimales", () => {
  assert.equal(tryParseMoney("1,000.00"), null);
  assert.equal(tryParseMoney("10.999"), null);
  assert.equal(tryParseMoney("texto"), null);
});

test("presenta centavos con dos decimales", () => {
  assert.equal(centsToMoney(125040), "1250.40");
  assert.equal(centsToMoney(5), "0.05");
});
