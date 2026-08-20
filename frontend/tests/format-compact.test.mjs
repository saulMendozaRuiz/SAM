import test from "node:test";
import assert from "node:assert/strict";

import { formatCompactMoney } from "../src/ui/format.ts";

test("elige la magnitud monetaria mediante potencias de mil", () => {
  assert.equal(formatCompactMoney(999), "$999.00");
  assert.equal(formatCompactMoney(1_500), "$1.5 K");
  assert.equal(formatCompactMoney(72_807_763.1), "$72.81 M");
  assert.equal(formatCompactMoney(1_250_000_000), "$1.25 B");
});
