export function normalizeAlternativeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function usesCustomAlternativeText(title, alt) {
  return Boolean(String(alt || "").trim()) && normalizeAlternativeText(title) !== normalizeAlternativeText(alt);
}
