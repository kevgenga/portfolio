import assert from "node:assert/strict";
import test from "node:test";
import { getLanguageDetails, getLanguageDirection, getLanguageLabel, normalizeSupportedLanguageCode, supportedMangaLanguages } from "./languageLabels.js";

test("known language codes override old persisted labels without changing data", () => {
  const languages = { en: { label: "English" }, fr: { label: "French" }, ja: { label: "Japanese" } };
  const before = structuredClone(languages);
  assert.deepEqual(Object.entries(languages).map(([code, language]) => getLanguageLabel(code, language.label)), ["English", "Français", "日本語"]);
  assert.deepEqual(languages, before);
});

test("legacy keys and display normalization preserve their original identifiers", () => {
  assert.equal(getLanguageLabel("english"), "English");
  assert.equal(getLanguageLabel("french", "French"), "Français");
  assert.equal(getLanguageLabel(" JA ", "Japanese"), "日本語");
});

test("unknown and original languages keep a safe, meaningful fallback", () => {
  assert.equal(getLanguageLabel("es", "Español"), "Español");
  assert.equal(getLanguageLabel("es"), "Español");
  assert.equal(getLanguageLabel("xx", "Custom language"), "Custom language");
  assert.equal(getLanguageLabel("xx"), "XX");
  assert.equal(getLanguageLabel("orig", "Original / Silent manga"), "Original / Silent manga");
  assert.equal(getLanguageLabel("original"), "Original");
  assert.equal(getLanguageLabel(undefined), "");
  assert.equal(getLanguageLabel(null, "Custom language"), "Custom language");
  assert.equal(getLanguageLabel("constructor"), "CONSTRUCTOR");
  assert.equal(getLanguageLabel("__proto__"), "__PROTO__");
});

test("supported codes are canonical while human labels are refused as new identifiers", () => {
  for (const language of supportedMangaLanguages) {
    assert.equal(normalizeSupportedLanguageCode(language.code), language.code);
    assert.equal(getLanguageLabel(language.code), language.label);
    assert.equal(getLanguageDetails(language.code).code, language.code);
  }
  assert.equal(normalizeSupportedLanguageCode(" ZH-hANS "), "zh-Hans");
  assert.equal(normalizeSupportedLanguageCode("ZH-HANT"), "zh-Hant");
  assert.equal(normalizeSupportedLanguageCode(" JA "), "ja");
  for (const invalid of ["ESPAGNOL", "JAPANESE", "FRANCAIS", "English", "日本語", "Español", "العربية", "中文", "en--US", "../ja", "zh", "", null, {}]) {
    assert.throws(() => normalizeSupportedLanguageCode(invalid), /sélecteur/);
  }
});

test("RTL applies only to the label and legacy aliases remain display-only", () => {
  assert.equal(getLanguageDirection("ar"), "rtl");
  assert.equal(getLanguageDirection("ja"), "ltr");
  assert.equal(getLanguageDirection("unknown"), "auto");
  assert.equal(getLanguageDetails("english").code, "en");
  assert.equal(getLanguageDetails("original").code, "orig");
  assert.throws(() => normalizeSupportedLanguageCode("english"));
});
