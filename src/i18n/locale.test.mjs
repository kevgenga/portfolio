import assert from "node:assert/strict";
import test from "node:test";
import { getContentTranslations, getTranslations, readStoredLocale, resolveInitialLocale, storeLocale } from "./locale.js";
import { fr, frContent } from "./translations/fr.js";
import { ja, jaContent } from "./translations/ja.js";
import { formatPortfolioDate } from "../utils/formatPortfolioDate.js";

test("URL language overrides storage and browser preference", () => {
  assert.equal(resolveInitialLocale({ search: "?lang=ja", stored: "en", browserLanguage: "en-US" }), "ja");
  assert.equal(resolveInitialLocale({ search: "?lang=en", stored: "ja", browserLanguage: "ja-JP" }), "en");
  assert.equal(resolveInitialLocale({ search: "?lang=fr", stored: "ja", browserLanguage: "ja-JP" }), "fr");
});

test("stored language, browser preference and English fallback", () => {
  assert.equal(resolveInitialLocale({ search: "", stored: "ja", browserLanguage: "en-US" }), "ja");
  assert.equal(resolveInitialLocale({ search: "", stored: "fr", browserLanguage: "ja-JP" }), "fr");
  assert.equal(resolveInitialLocale({ search: "", stored: null, browserLanguage: "ja-JP" }), "ja");
  assert.equal(resolveInitialLocale({ search: "?lang=xx", stored: null, browserLanguage: "fr-FR" }), "en");
});

test("selected language persists and survives storage failures", () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    storeLocale("ja");
    assert.equal(readStoredLocale(), "ja");
    storeLocale("fr");
    assert.equal(readStoredLocale(), "fr");
    globalThis.window.localStorage = { getItem: () => { throw new Error("unavailable"); }, setItem: () => { throw new Error("unavailable"); } };
    assert.equal(readStoredLocale(), null);
    assert.doesNotThrow(() => storeLocale("en"));
  } finally {
    globalThis.window = previousWindow;
  }
});

test("Japanese translations fall back to English without exposing keys", () => {
  assert.equal(getTranslations("ja").navigation.about, "プロフィール");
  assert.equal(getTranslations("ja").contact.successEmail, "kevin.lao@hotmail.fr");
  assert.equal(getTranslations("unknown").navigation.about, "About");
});

const assertTranslatedKeys = (reference, translation, path = "") => {
  for (const [key, value] of Object.entries(reference)) {
    const nextPath = path ? `${path}.${key}` : key;
    assert.ok(Object.hasOwn(translation, key), `Missing French translation: ${nextPath}`);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      assertTranslatedKeys(value, translation[key], nextPath);
    }
  }
};

test("French covers the Japanese UI and content keys without replacing official titles", () => {
  assertTranslatedKeys(ja, fr);
  assertTranslatedKeys(jaContent, frContent);
  assert.equal(getTranslations("fr").navigation.about, "À propos");
  assert.equal(getTranslations("fr").contact.successEmail, "kevin.lao@hotmail.fr");
  assert.match(getContentTranslations("fr").mangaSummaries.ahes, /Ahès/);
});

test("portfolio dates use the selected locale", () => {
  assert.equal(formatPortfolioDate("09-08-2025", "en"), "9 August 2025");
  assert.equal(formatPortfolioDate("09-08-2025", "ja"), "2025年8月9日");
  assert.equal(formatPortfolioDate("09-08-2025", "fr"), "9 août 2025");
  assert.equal(formatPortfolioDate("invalid", "ja"), "");
  assert.equal(formatPortfolioDate("invalid", "fr"), "");
});
