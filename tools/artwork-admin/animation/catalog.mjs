import vm from "node:vm";

export const ANIMATION_CATEGORIES = Object.freeze(["court-métrage", "animation 2d", "animation 3d"]);
export const MEDIA_EXTENSIONS = Object.freeze([".mp4", ".webm", ".gif", ".jpg", ".jpeg", ".png", ".webp", ".avif"]);
export const POSTER_EXTENSIONS = Object.freeze([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

export function parseAnimationCatalog(source) {
  const executable = source
    .replace(/^import[^\n]+\n/m, "")
    .replace(/export\s+const\s+animations/, "const animations");
  const entries = vm.runInNewContext(`${executable}\n;structuredClone(animations)`, {
    assetPath: (value) => value,
    structuredClone,
  }, { timeout: 1500 });
  if (!Array.isArray(entries)) throw new Error("Le catalogue Animation est invalide.");
  return entries;
}

export function serializeAnimationCatalog(entries) {
  const json = JSON.stringify(entries, null, 2).replace(
    /"(assets\/animation\/(?:[^"\\]|\\.)*)"/g,
    (quoted, encodedPath) => `assetPath(${JSON.stringify(JSON.parse(`"${encodedPath}"`))})`,
  );
  return `import { assetPath } from "../utils/assetPath";\n\nexport const animations = ${json};\n`;
}

export function normalizeAnimationDate(value) {
  const input = String(value || "").trim();
  const dayFirst = /^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/.exec(input);
  const yearFirst = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  let day;
  let month;
  let year;
  if (dayFirst) {
    day = Number(dayFirst[1]); month = Number(dayFirst[3]); year = Number(dayFirst[4]);
  } else if (yearFirst) {
    year = Number(yearFirst[1]); month = Number(yearFirst[2]); day = Number(yearFirst[3]);
  } else {
    throw new Error("La date doit respecter DD/MM/YYYY, DD-MM-YYYY ou YYYY-MM-DD.");
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error("La date n’existe pas.");
  }
  return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, year };
}

export function mediaKindFromName(fileName) {
  const extension = String(fileName || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  if ([".mp4", ".webm"].includes(extension)) return "video";
  if (extension === ".gif") return "gif";
  if ([".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(extension)) return "image";
  return "unknown";
}

export function publicAnimationType(fileName) {
  return mediaKindFromName(fileName) === "video" ? "video" : "image";
}

export function slugifyAnimation(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "animation";
}

export function validateAnimationCatalog(entries, { allowLegacyEmptyTitles = true } = {}) {
  if (!Array.isArray(entries)) throw new Error("Le catalogue Animation doit être un tableau.");
  const ids = new Set();
  const paths = new Set();
  for (const entry of entries) {
    if (!entry.id || typeof entry.id !== "string") throw new Error("ID Animation manquant.");
    if (ids.has(entry.id)) throw new Error(`ID Animation dupliqué : ${entry.id}.`);
    ids.add(entry.id);
    if ((!allowLegacyEmptyTitles || entry.title) && !String(entry.title || "").trim()) throw new Error(`Titre manquant pour ${entry.id}.`);
    if (!ANIMATION_CATEGORIES.includes(entry.category)) throw new Error(`Catégorie inconnue pour ${entry.id}.`);
    const normalized = normalizeAnimationDate(entry.date);
    if (entry.year !== normalized.year) throw new Error(`Année incohérente pour ${entry.id}.`);
    if (!entry.video?.startsWith("assets/animation/")) throw new Error(`Chemin média invalide pour ${entry.id}.`);
    if (entry.poster && !entry.poster.startsWith("assets/animation/")) throw new Error(`Chemin poster invalide pour ${entry.id}.`);
    if (!MEDIA_EXTENSIONS.includes(entry.video.toLowerCase().match(/\.[a-z0-9]+$/)?.[0])) throw new Error(`Format média invalide pour ${entry.id}.`);
    if (entry.poster && !POSTER_EXTENSIONS.includes(entry.poster.toLowerCase().match(/\.[a-z0-9]+$/)?.[0])) throw new Error(`Format poster invalide pour ${entry.id}.`);
    if (entry.type !== publicAnimationType(entry.video)) throw new Error(`Type incohérent pour ${entry.id}.`);
    if (typeof entry.alt !== "string") throw new Error(`Alt invalide pour ${entry.id}.`);
    for (const relative of [entry.video, entry.poster].filter(Boolean)) {
      const key = relative.toLowerCase();
      if (paths.has(key)) throw new Error(`Chemin Animation dupliqué : ${relative}.`);
      paths.add(key);
    }
  }
  return true;
}
