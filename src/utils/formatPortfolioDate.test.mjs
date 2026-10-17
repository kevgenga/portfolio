import assert from "node:assert/strict";
import test from "node:test";
import { formatPortfolioDate, formatPortfolioDateLines } from "./formatPortfolioDate.js";

test("Illustration ribbon uses natural EN/FR/JA components without changing full dates", () => {
  for (const value of ["13-10-2026", "13/10/2026", "2026-10-13"]) {
    assert.deepEqual(formatPortfolioDateLines(value, "fr"), ["13 octobre", "2026"]);
    assert.deepEqual(formatPortfolioDateLines(value, "en"), ["October 13", "2026"]);
    assert.deepEqual(formatPortfolioDateLines(value, "ja"), ["2026年", "10月13日"]);
    assert.equal(formatPortfolioDate(value, "en"), "13 October 2026");
    assert.equal(formatPortfolioDate(value, "fr"), "13 octobre 2026");
    assert.equal(formatPortfolioDate(value, "ja"), "2026年10月13日");
  }
});

test("short/long months, one-digit days, leap years and years are not hardcoded", () => {
  assert.deepEqual(formatPortfolioDateLines("01-09-2025", "fr"), ["1 septembre", "2025"]);
  assert.deepEqual(formatPortfolioDateLines("09-09-2031", "en"), ["September 9", "2031"]);
  assert.deepEqual(formatPortfolioDateLines("29-02-2024", "ja"), ["2024年", "2月29日"]);
  assert.deepEqual(formatPortfolioDateLines("02-05-2001", "en"), ["May 2", "2001"]);
});

test("absent and invalid dates create no ribbon content or replacement text", () => {
  for (const value of [undefined, null, 123, "", " ", "wrong", "31-02-2026", "29-02-2025", "2026-13-01", "0/01/2026", "2026/01/01"]) for (const locale of ["en", "fr", "ja"]) {
    assert.deepEqual(formatPortfolioDateLines(value, locale), []);
    assert.equal(formatPortfolioDate(value, locale), "");
  }
});
