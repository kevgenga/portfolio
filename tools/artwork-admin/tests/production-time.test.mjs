import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";
import { applyProductionTimePatch, productionTimeFromInputs, splitProductionTime, validateProductionTime } from "../../../src/utils/productionTime.js";

test("strict optional production time, including a catalog parsed in another realm", () => {
  for (const minutes of [1, 45, 150, 750, 3000, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(validateProductionTime({ minutes, kind: "actual" }), { minutes, kind: "actual" });
  }
  assert.deepEqual(validateProductionTime(vm.runInNewContext('({minutes:150,kind:"estimated"})')), { minutes: 150, kind: "estimated" });
  for (const minutes of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "150", null]) {
    assert.throws(() => validateProductionTime({ minutes, kind: "actual" }));
  }
  for (const value of [undefined, null, [], "150", { minutes: 15 }, { kind: "actual" },
    { minutes: 150, kind: "other" }, { minutes: 150, kind: "actual", extra: true }]) {
    assert.throws(() => validateProductionTime(value));
  }
});

test("exact hours/minutes conversion without a 24-hour ceiling", () => {
  for (const [h, m, total] of [["0", "45", 45], ["1", "15", 75], ["2", "30", 150], ["12", "30", 750], ["48", "15", 2895]]) {
    assert.deepEqual(productionTimeFromInputs(h, m, "estimated"), { minutes: total, kind: "estimated" });
    const fields = splitProductionTime({ minutes: total, kind: "estimated" });
    assert.deepEqual(productionTimeFromInputs(fields.hours, fields.minutes, fields.kind), { minutes: total, kind: "estimated" });
  }
  const maximum = { minutes: Number.MAX_SAFE_INTEGER, kind: "actual" };
  const fields = splitProductionTime(maximum);
  assert.deepEqual(productionTimeFromInputs(fields.hours, fields.minutes, fields.kind), maximum);
  for (const [h, m] of [["0", "0"], ["-1", "5"], ["1.5", "0"], ["1", "60"], ["", "20"], ["1", ""], ["hello", "1"], ["9007199254740991", "1"]]) {
    assert.throws(() => productionTimeFromInputs(h, m, "actual"));
  }
});

test("empty inputs preserve time, kind-only edits preserve minutes, deletion is explicit", () => {
  const original = { id: "sample", image: "untouched.jpg", productionTime: { minutes: 150, kind: "actual" } };
  assert.deepEqual(productionTimeFromInputs("", "", "estimated", original.productionTime), { minutes: 150, kind: "estimated" });
  assert.equal(productionTimeFromInputs("", "", "actual"), undefined);
  assert.deepEqual(applyProductionTimePatch(original, {}), original);
  assert.deepEqual(applyProductionTimePatch(original, { productionTime: null }), { id: "sample", image: "untouched.jpg" });
  assert.deepEqual(applyProductionTimePatch(original, { productionTime: { minutes: 195, kind: "estimated" } }).productionTime, { minutes: 195, kind: "estimated" });
  assert.equal(original.productionTime.minutes, 150);
  assert.throws(() => applyProductionTimePatch(original, { productionTime: undefined }));
});

test("shared helper remains a portable ESM module through Vite", async () => {
  const source = await readFile(new URL("../../../src/utils/productionTime.js", import.meta.url), "utf8");
  const transformed = await transformWithEsbuild(source, "productionTime.js", { loader: "js" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString("base64")}`);
  assert.deepEqual(module.productionTimeFromInputs("2", "30", "actual"), { minutes: 150, kind: "actual" });
});
