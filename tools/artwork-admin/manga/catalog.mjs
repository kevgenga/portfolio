import vm from "node:vm";
import {
  getMangaPresentationDirectory,
  getMangaPresentationSection,
  MANGA_PRESENTATION_SECTION_VALUES,
} from "../../../src/content/mangaPresentation.js";

const ASSET_PREFIX = "assets/mangaka/";

export function parseMangaCatalog(source) {
  const executable = source
    .replace(/^import[^\n]+\n/m, "")
    .replace(/export\s+const\s+mangas/, "const mangas")
    .replace(/export\s+const\s+getMangaById/, "const getMangaById");
  const definitions = vm.runInNewContext(`${executable}\n;structuredClone(mangaDefinitions)`, {
    assetPath: (value) => value,
    structuredClone,
  }, { timeout: 1500 });
  if (!Array.isArray(definitions)) throw new Error("Le catalogue manga est invalide.");
  return definitions;
}

export function serializeMangaCatalog(mangas) {
  const json = JSON.stringify(mangas, null, 2).replace(
    /"(assets\/mangaka\/(?:[^"\\]|\\.)*)"/g,
    (quoted, encodedPath) => `assetPath(${JSON.stringify(JSON.parse(`"${encodedPath}"`))})`,
  );
  return `import { assetPath } from "../utils/assetPath";\n\nconst mangaDefinitions = ${json};\n\nexport const mangas = mangaDefinitions.map((manga) => {\n  const pages = manga.languages[manga.defaultLanguage].pages;\n\n  return {\n    ...manga,\n    pages,\n    pageCount: pages.length,\n  };\n});\n\nexport const getMangaById = (id) =>\n  mangas.find((manga) => String(manga.id) === String(id));\n`;
}

export function normalizeLanguageCode(code) {
  const value = String(code || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,11}$/.test(value)) throw new Error("Code de langue invalide.");
  return value;
}

export function validateMangaCatalog(mangas) {
  const ids = new Set();
  const slugs = new Set();
  const routes = new Set();
  const paths = new Set();
  for (const manga of mangas) {
    if (manga.id === undefined || manga.id === null || String(manga.id).trim() === "") throw new Error("ID manga manquant.");
    if (!manga.title?.trim()) throw new Error(`Titre manquant pour ${manga.id}.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manga.slug || "")) throw new Error(`Slug invalide pour ${manga.title}.`);
    if (ids.has(String(manga.id))) throw new Error(`ID manga dupliqué : ${manga.id}.`);
    if (slugs.has(manga.slug)) throw new Error(`Slug manga dupliqué : ${manga.slug}.`);
    if (routes.has(manga.route)) throw new Error(`Route manga dupliquée : ${manga.route}.`);
    if (
      manga.presentationSection !== undefined
      && !MANGA_PRESENTATION_SECTION_VALUES.includes(manga.presentationSection)
    ) {
      throw new Error(`Section de présentation invalide pour ${manga.title}.`);
    }
    ids.add(String(manga.id));
    slugs.add(manga.slug);
    routes.add(manga.route);
    const projectPrefix = `${ASSET_PREFIX}${getMangaPresentationDirectory(manga)}/${manga.slug}/`;
    const legacyPrefix = `${ASSET_PREFIX}${manga.slug}/`;
    const pathBelongsToProject = (value) =>
      value.startsWith(projectPrefix)
      || (manga.presentationSection === undefined && value.startsWith(legacyPrefix));
    if (!manga.languages || typeof manga.languages !== "object") throw new Error(`Langues manquantes pour ${manga.title}.`);
    if (!manga.languages[manga.defaultLanguage]) throw new Error(`Langue par défaut absente pour ${manga.title}.`);
    for (const [code, language] of Object.entries(manga.languages)) {
      normalizeLanguageCode(code);
      if (!Array.isArray(language.pages)) throw new Error(`Pages invalides pour ${manga.title}/${code}.`);
      for (const page of language.pages) {
        if (typeof page !== "string" || !page.startsWith(ASSET_PREFIX)) throw new Error(`Chemin de page invalide pour ${manga.title}/${code}.`);
        if (!pathBelongsToProject(page)) throw new Error(`Page hors du dossier de section pour ${manga.title}/${code} : ${page}.`);
        if (paths.has(page)) throw new Error(`Chemin manga dupliqué : ${page}.`);
        paths.add(page);
      }
    }
    for (const field of ["cover", "banner", "thumbnail", "presentation"]) {
      const value = manga[field];
      if (value && (typeof value !== "string" || !value.startsWith(ASSET_PREFIX))) throw new Error(`${field} invalide pour ${manga.title}.`);
      if (value && !pathBelongsToProject(value)) throw new Error(`${field} hors du dossier de section pour ${manga.title}.`);
    }
  }
  return true;
}

export {
  getMangaPresentationDirectory,
  getMangaPresentationSection,
  MANGA_PRESENTATION_SECTION_VALUES,
};

export function slugify(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "manga";
}

export function naturalPageSort(paths) {
  return [...paths].sort((left, right) => {
    const leftName = typeof left === "string" ? left : left.fileName;
    const rightName = typeof right === "string" ? right : right.fileName;
    return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" });
  });
}
