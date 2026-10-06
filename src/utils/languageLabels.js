// Add a language here to make it available in both Admin and MangaReader.
export const supportedMangaLanguages = Object.freeze([
  { code: "en", label: "English", adminLabelFr: "Anglais", shortLabel: "ENG", dir: "ltr" },
  { code: "fr", label: "Français", adminLabelFr: "Français", shortLabel: "FR", dir: "ltr" },
  { code: "ja", label: "日本語", adminLabelFr: "Japonais", shortLabel: "JA", dir: "ltr" },
  { code: "es", label: "Español", adminLabelFr: "Espagnol", shortLabel: "ES", dir: "ltr" },
  { code: "it", label: "Italiano", adminLabelFr: "Italien", shortLabel: "IT", dir: "ltr" },
  { code: "de", label: "Deutsch", adminLabelFr: "Allemand", shortLabel: "DE", dir: "ltr" },
  { code: "pt", label: "Português", adminLabelFr: "Portugais", shortLabel: "PT", dir: "ltr" },
  { code: "vi", label: "Tiếng Việt", adminLabelFr: "Vietnamien", shortLabel: "VI", dir: "ltr" },
  { code: "ar", label: "العربية", adminLabelFr: "Arabe", shortLabel: "AR", dir: "rtl" },
  { code: "ko", label: "한국어", adminLabelFr: "Coréen", shortLabel: "KO", dir: "ltr" },
  { code: "zh-Hans", label: "简体中文", adminLabelFr: "Chinois simplifié", shortLabel: "ZH-HANS", dir: "ltr" },
  { code: "zh-Hant", label: "繁體中文", adminLabelFr: "Chinois traditionnel", shortLabel: "ZH-HANT", dir: "ltr" },
  { code: "id", label: "Bahasa Indonesia", adminLabelFr: "Indonésien", shortLabel: "ID", dir: "ltr" },
  { code: "th", label: "ไทย", adminLabelFr: "Thaï", shortLabel: "TH", dir: "ltr" },
  { code: "ru", label: "Русский", adminLabelFr: "Russe", shortLabel: "RU", dir: "ltr" },
  { code: "orig", label: "Original", adminLabelFr: "Original", shortLabel: "ORIG", dir: "auto" },
].map((language) => Object.freeze(language)));

// Legacy catalog keys are recognized for display only, never rewritten.
const LEGACY_CODES = Object.freeze({ english: "en", french: "fr", japanese: "ja", original: "orig" });

const normalizedCode = (code) => typeof code === "string" ? code.trim().toLowerCase() : "";

export function getLanguageDetails(code) {
  const normalized = normalizedCode(code);
  const displayCode = Object.hasOwn(LEGACY_CODES, normalized) ? LEGACY_CODES[normalized] : normalized;
  return supportedMangaLanguages.find((language) => language.code.toLowerCase() === displayCode);
}

// New entries accept registry codes only. Legacy labels/keys are not new codes.
export function normalizeSupportedLanguageCode(code) {
  const language = supportedMangaLanguages.find((item) => item.code.toLowerCase() === normalizedCode(code));
  if (!language) throw new Error("Choisissez une langue prise en charge dans le sélecteur.");
  return language.code;
}

export function getLanguageDirection(code) {
  return getLanguageDetails(code)?.dir || "auto";
}

export function getLanguageLabel(code, fallback = "") {
  const language = getLanguageDetails(code);
  // Preserve descriptions such as "Original / Silent manga".
  if (language && language.code !== "orig") return language.label;
  if (typeof fallback === "string" && fallback.trim()) return fallback;
  return language?.label || normalizedCode(code).toUpperCase();
}
