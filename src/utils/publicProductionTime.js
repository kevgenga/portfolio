import { validateProductionTime } from "./productionTime.js";
import { getTranslations } from "../i18n/locale.js";
import { productionTimeBadgeSettings } from "../content/productionTimeBadgeSettings.js";

// Read-only boundary for optional/historical metadata. Admin validation stays
// strict; a malformed public indicator is omitted instead of breaking a page.
export function readProductionTime(value) {
  try { return validateProductionTime(value); } catch { return null; }
}

// Invalid configuration falls back to a neutral badge, never a fake duration.
export function getProductionTimeBadgeAppearance(value, settings = productionTimeBadgeSettings) {
  const time = readProductionTime(value);
  if (!time) return null;
  const { medium, long } = settings?.thresholds || {};
  const validThresholds = Number.isSafeInteger(medium) && medium > 0
    && Number.isSafeInteger(long) && long > medium;
  const tier = settings?.colorMode === "tiered" && validThresholds
    ? time.minutes < medium ? "short" : time.minutes < long ? "medium" : "long"
    : "neutral";
  const placement = ["top-right", "bottom-right", "metadata"].includes(settings?.placement)
    ? settings.placement : "top-right";
  return { tier, placement };
}

export function formatProductionTime(value, locale = "en", text = getTranslations(locale).productionTime) {
  const time = readProductionTime(value);
  if (!time) return "";
  const hours = Math.floor(time.minutes / 60), minutes = time.minutes % 60;
  if (locale === "ja") return `${hours ? `${hours}${text.units.hour}` : ""}${minutes ? `${minutes}${text.units.minute}` : ""}`;
  return [hours ? `${hours} ${text.units.hour}` : "", minutes ? hours && locale === "fr" ? String(minutes).padStart(2, "0") : `${minutes} ${text.units.minute}` : ""].filter(Boolean).join(" ");
}

export function getProductionTimePresentation(value, locale, text, context = "individual", { pageNumber, memberCount } = {}) {
  const time = readProductionTime(value);
  if (!time || !text) return null;
  const estimated = time.kind === "estimated";
  const labels = text[context] || text.individual;
  const label = labels?.[time.kind];
  if (!label) return null;
  const duration = formatProductionTime(time, locale, text);
  const display = `${estimated ? text.approximate : ""}${duration}`;
  const prefix = pageNumber !== undefined ? text.pageNumber(pageNumber) : context === "group" ? text.memberCount(memberCount) : "";
  const accessible = `${prefix ? `${prefix} · ` : ""}${label}${text.separator}${display}${estimated ? "" : ` — ${text.measured}`}`;
  return { label, display, accessible, measured: estimated ? "" : text.measured, prefix, kind: time.kind };
}

export function getPublicArtworkProductionGroups(groups, artworkId, publicArtworks) {
  if (!Array.isArray(groups) || !Array.isArray(publicArtworks)) return [];
  const ids = new Map();
  for (const artwork of publicArtworks) ids.set(artwork.id, (ids.get(artwork.id) || 0) + 1);
  return groups.flatMap(group => {
    if (!group || typeof group.id !== "string" || groups.filter(g => g?.id === group.id).length !== 1
      || !Array.isArray(group.artworkIds) || !group.artworkIds.includes(artworkId)
      || !group.artworkIds.length || new Set(group.artworkIds).size !== group.artworkIds.length
      || !group.artworkIds.every(id => ids.get(id) === 1)) return [];
    const time = readProductionTime(group.time);
    // No private names, historical/hidden members or collective-to-individual
    // substitution. Overlapping groups stay separate, never summed.
    return time ? [{ id: group.id, time, memberCount: group.artworkIds.length }] : [];
  });
}

export function createMangaProductionTimeLookup(manga, base = import.meta.env?.BASE_URL || "/") {
  const normalize = path => typeof path === "string" ? path.startsWith(base) ? path.slice(base.length) : path : null;
  const p = manga?.productionTime;
  if (!Array.isArray(p?.pages) || !Array.isArray(p?.bindings)) return () => null;
  const paths = new Map(), bindings = new Map(), drawings = new Map();
  for (const language of Object.values(manga.languages || {})) for (const path of Array.isArray(language?.pages) ? language.pages : []) {
    const key = normalize(path); paths.set(key, (paths.get(key) || 0) + 1);
  }
  for (const page of p.pages) if (typeof page?.id === "string") {
    if (drawings.has(page.id)) drawings.set(page.id, null); else drawings.set(page.id, readProductionTime(page.time));
  }
  for (const binding of p.bindings) {
    const path = normalize(binding?.path);
    if (typeof path !== "string" || !path.startsWith("assets/mangaka/")) continue;
    if (bindings.has(path)) bindings.set(path, null); else bindings.set(path, binding.pageId);
  }
  return path => {
    const key = normalize(path);
    return paths.get(key) === 1 && bindings.get(key) ? drawings.get(bindings.get(key)) || null : null;
  };
}
