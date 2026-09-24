import { defaultLocale, uiText } from "../content/ui.js";
import { fr, frContent } from "./translations/fr.js";
import { ja, jaContent } from "./translations/ja.js";

const STORAGE_KEY = "portfolio-language";
export const locales = [
  { code: "en", label: "English", shortLabel: "EN", flag: "🇬🇧" },
  { code: "ja", label: "日本語", shortLabel: "日本語", flag: "🇯🇵" },
  { code: "fr", label: "Français", shortLabel: "FR", flag: "🇫🇷" },
];

const mergeTranslations = (reference, translation) => Object.fromEntries(
  Object.entries(reference).map(([key, value]) => [
    key,
    value && typeof value === "object" && !Array.isArray(value)
      ? mergeTranslations(value, translation?.[key])
      : translation?.[key] ?? value,
  ]),
);

export const getTranslations = (locale) => {
  const translation = locale === "ja" ? ja : locale === "fr" ? fr : null;
  return translation ? mergeTranslations(uiText.en, translation) : uiText.en;
};

export const getContentTranslations = (locale) => locale === "ja" ? jaContent : locale === "fr" ? frContent : null;

export const resolveInitialLocale = ({ search, stored, browserLanguage }) => {
  const urlLocale = new URLSearchParams(search).get("lang");
  if (urlLocale === "en" || urlLocale === "ja" || urlLocale === "fr") return urlLocale;
  if (stored === "en" || stored === "ja" || stored === "fr") return stored;
  return browserLanguage?.toLowerCase().startsWith("ja") ? "ja" : defaultLocale;
};

export const readStoredLocale = () => {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
};

export const storeLocale = (locale) => {
  try { window.localStorage.setItem(STORAGE_KEY, locale); } catch { /* Storage is optional. */ }
};
