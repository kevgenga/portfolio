import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { FileTransaction } from "../file-transaction.mjs";
import { buildRevealCommand, isPathInside, launchReveal } from "../reveal-file.mjs";
import { naturalPageSort, normalizeLanguageCode, parseMangaCatalog, serializeMangaCatalog, slugify, validateMangaCatalog } from "./catalog.mjs";
import { analyzeMangaCardMedia, primaryMangaMedia } from "./media-policy.mjs";

const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const LANGUAGE_PRESETS = { orig: ["Original", "ORIG"], fr: ["French", "FR"], en: ["English", "ENG"], ja: ["Japanese", "JA"], es: ["Spanish", "ES"], de: ["German", "DE"], it: ["Italian", "IT"], ko: ["Korean", "KO"], zh: ["Chinese", "ZH"] };

export class MangaAdminError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function ensure(condition, message, status = 400) { if (!condition) throw new MangaAdminError(status, message); }
function timestamp() { return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"); }
function safeSegment(value) { return slugify(value).slice(0, 80); }

export function createMangaService({ projectRoot, runtimeRoot, disableReveal = false, failurePoint = "" }) {
  const catalogPath = path.join(projectRoot, "src/content/mangas.js");
  const assetRoot = path.join(projectRoot, "public/assets/mangaka");
  const backupRoot = path.join(runtimeRoot, "backups/mangas");
  const trashRoot = path.join(runtimeRoot, "trash/mangas");
  const stagingRoot = path.join(runtimeRoot, "staging/mangas");

  function assetFile(assetPath) {
    ensure(typeof assetPath === "string" && assetPath.startsWith("assets/mangaka/"), "Chemin manga invalide.");
    const target = path.resolve(projectRoot, "public", ...assetPath.split("/"));
    ensure(isPathInside(assetRoot, target), "Le chemin manga sort du dossier autorisé.", 403);
    return target;
  }

  async function readCatalog() { return parseMangaCatalog(await readFile(catalogPath, "utf8")); }
  async function writeAtomic(content) {
    const temporary = `${catalogPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { flag: "wx" });
    try { await rename(temporary, catalogPath); } catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  async function backup(operation, slug = "catalog") {
    await mkdir(backupRoot, { recursive: true });
    const destination = path.join(backupRoot, `${timestamp()}-${safeSegment(operation)}-${safeSegment(slug)}.js`);
    await copyFile(catalogPath, destination);
    return destination;
  }
  function findManga(catalog, id) {
    const manga = catalog.find((entry) => String(entry.id) === String(id));
    ensure(manga, "Manga introuvable.", 404);
    return manga;
  }
  function mangaUsesPathElsewhere(manga, relative, { languageCode, pageIndex, mediaField } = {}) {
    for (const field of ["cover", "banner", "thumbnail", "presentation"]) {
      if (field !== mediaField && manga[field] === relative) return true;
    }
    return Object.entries(manga.languages).some(([code, language]) => language.pages.some((page, index) => page === relative && (code !== languageCode || index !== pageIndex)));
  }
  async function validateFiles(catalog) {
    validateMangaCatalog(catalog);
    for (const manga of catalog) {
      const paths = [manga.cover, manga.banner, manga.thumbnail, manga.presentation, ...Object.values(manga.languages).flatMap((language) => language.pages)].filter(Boolean);
      for (const relative of paths) {
        const target = assetFile(relative);
        try { ensure((await stat(target)).isFile(), `Fichier manga invalide : ${relative}.`); }
        catch (error) { if (error.code === "ENOENT") throw new MangaAdminError(400, `Fichier manga manquant : ${relative}.`); throw error; }
      }
    }
  }
  async function mutate(operation, slug, callback) {
    const original = await readFile(catalogPath, "utf8");
    const catalog = parseMangaCatalog(original);
    const transaction = new FileTransaction();
    const backupPath = await backup(operation, slug);
    try {
      const result = await callback(catalog, transaction);
      if (failurePoint === "before-catalog") throw new Error("Échec manga simulé.");
      await validateFiles(catalog);
      await writeAtomic(serializeMangaCatalog(catalog));
      if (failurePoint === "after-catalog") throw new Error("Échec manga simulé.");
      transaction.commit();
      return { result, backup: path.relative(projectRoot, backupPath).replaceAll("\\", "/") };
    } catch (error) {
      await writeAtomic(original).catch(() => undefined);
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }
  async function inspectAsset(relative) {
    if (!relative) return null;
    const file = assetFile(relative);
    try {
      const [info, fileStat] = await Promise.all([sharp(file, { animated: true }).metadata(), stat(file)]);
      return { path: relative, name: path.basename(file), width: info.width, height: info.height, size: fileStat.size, extension: path.extname(file).toLowerCase() };
    } catch { return { path: relative, name: path.basename(file), missing: true }; }
  }
  async function report() {
    const catalog = await readCatalog();
    const issues = [];
    const items = [];
    for (const manga of catalog) {
      const languages = {};
      for (const [code, language] of Object.entries(manga.languages || {})) {
        const missing = [];
        for (const page of language.pages || []) {
          try { await stat(assetFile(page)); } catch { missing.push(page); }
        }
        const pageDetails = await Promise.all((language.pages || []).map(inspectAsset));
        languages[code] = { ...language, pageCount: language.pages?.length || 0, pageDetails, missing };
        if (missing.length) issues.push(`${manga.title}/${code}: ${missing.length} page(s) manquante(s)`);
      }
      const counts = Object.values(languages).map((language) => language.pageCount);
      if (new Set(counts).size > 1) issues.push(`${manga.title}: nombre de pages différent selon la langue`);
      if (manga.defaultLanguage === "original") issues.push(`${manga.title}: clé historique « original » conservée (standard futur : orig)`);
      const primaryMedia = primaryMangaMedia(manga);
      const primaryMediaDetails = await inspectAsset(primaryMedia.path);
      items.push({ ...manga, languages, primaryMedia: { ...primaryMedia, details: primaryMediaDetails, analysis: analyzeMangaCardMedia(primaryMediaDetails) }, totalPages: counts.reduce((sum, count) => sum + count, 0) });
    }
    return { mangas: items, count: items.length, languageVersions: items.reduce((sum, manga) => sum + Object.keys(manga.languages).length, 0), totalPages: items.reduce((sum, manga) => sum + manga.totalPages, 0), issues, languagePresets: LANGUAGE_PRESETS };
  }
  async function decodeImage(upload, preferredName) {
    ensure(upload?.dataBase64 && upload?.fileName, "Image manquante.");
    const extension = path.extname(upload.fileName).toLowerCase();
    ensure(EXTENSIONS.has(extension), "Format d’image non autorisé.");
    const buffer = Buffer.from(upload.dataBase64, "base64");
    ensure(buffer.length > 0, "Image vide.");
    await sharp(buffer, { animated: true }).metadata().catch(() => { throw new MangaAdminError(400, "Fichier image invalide."); });
    const base = safeSegment(path.basename(preferredName || upload.fileName, path.extname(preferredName || upload.fileName)));
    return { buffer, extension, name: `${base}${extension}`, hash: createHash("sha256").update(buffer).digest("hex") };
  }
  async function uniqueDestination(directory, name) {
    let candidate = name; let index = 2;
    while (true) {
      try { await stat(path.join(directory, candidate)); candidate = `${path.basename(name, path.extname(name))}-${index++}${path.extname(name)}`; }
      catch (error) { if (error.code === "ENOENT") return candidate; throw error; }
    }
  }
  async function fileHash(file) { return createHash("sha256").update(await readFile(file)).digest("hex"); }
  async function create(payload) {
    const title = String(payload.title || "").trim(); ensure(title, "Titre obligatoire.");
    const current = await readCatalog();
    let slug = slugify(payload.slug || title); let suffix = 2;
    while (current.some((manga) => manga.slug === slug)) slug = `${slugify(payload.slug || title)}-${suffix++}`;
    const languageType = payload.languageType || "multilingual";
    const initialCode = languageType === "multilingual" ? normalizeLanguageCode(payload.languageCode || "en") : "orig";
    const preset = LANGUAGE_PRESETS[initialCode] || [initialCode.toUpperCase(), initialCode.toUpperCase()];
    const uploads = naturalPageSort(payload.pages || []).map((upload) => upload);
    ensure(uploads.length > 0, "Ajoutez au moins une page.");
    return mutate("create", slug, async (catalog, tx) => {
      const directory = path.join(assetRoot, slug, initialCode);
      const pagePaths = []; const hashes = new Set();
      for (const upload of uploads) {
        const image = await decodeImage(upload);
        ensure(!hashes.has(image.hash), `Page dupliquée : ${upload.fileName}.`, 409); hashes.add(image.hash);
        const name = await uniqueDestination(directory, image.name);
        const destination = path.join(directory, name);
        await tx.writeExclusive(destination, image.buffer);
        pagePaths.push(`assets/mangaka/${slug}/${initialCode}/${name}`);
      }
      ensure(payload.primaryImage, "L’image principale du manga est obligatoire.");
      let banner = "";
      if (payload.primaryImage) {
        const image = await decodeImage(payload.primaryImage, `banner${path.extname(payload.primaryImage.fileName)}`);
        const destination = path.join(assetRoot, slug, image.name);
        await tx.writeExclusive(destination, image.buffer);
        banner = `assets/mangaka/${slug}/${image.name}`;
      }
      const manga = {
        id: slug, slug, route: `/mangas/${slug}`, title, edition: "", banner,
        summary: String(payload.summary || ""), genre: "", role: "", year: payload.year || "",
        readingDirection: payload.readingDirection === "ltr" ? "ltr" : "rtl", defaultLanguage: initialCode,
        languages: { [initialCode]: { label: languageType === "silent" ? "Original / Silent manga" : preset[0], shortLabel: preset[1], pages: pagePaths } },
        featured: false, status: payload.status || "draft", visibility: payload.visibility || "private",
      };
      catalog.push(manga); return manga;
    });
  }
  async function update(id, payload) {
    return mutate("update", id, async (catalog) => {
      const manga = findManga(catalog, id);
      for (const field of ["title", "edition", "description", "summary", "genre", "role", "author", "year", "date", "status", "visibility", "readingDirection", "defaultReadingMode"]) {
        if (payload[field] !== undefined) manga[field] = payload[field];
      }
      if (payload.tags !== undefined) manga.tags = Array.isArray(payload.tags) ? payload.tags : [];
      if (payload.featured !== undefined) manga.featured = Boolean(payload.featured);
      if (payload.defaultLanguage !== undefined) { ensure(manga.languages[payload.defaultLanguage], "Langue par défaut absente."); manga.defaultLanguage = payload.defaultLanguage; }
      if (payload.order !== undefined) manga.order = Number(payload.order) || 0;
      return manga;
    });
  }
  async function addLanguage(id, payload) {
    const code = normalizeLanguageCode(payload.code);
    return mutate("add-language", id, async (catalog) => {
      const manga = findManga(catalog, id); ensure(!manga.languages[code], "Cette langue existe déjà.", 409);
      const preset = LANGUAGE_PRESETS[code] || [payload.label || code.toUpperCase(), payload.shortLabel || code.toUpperCase()];
      manga.languages[code] = { label: payload.label || preset[0], shortLabel: payload.shortLabel || preset[1], pages: [] };
      return manga;
    });
  }
  async function deleteLanguage(id, code) {
    return mutate("delete-language", id, async (catalog, tx) => {
      const manga = findManga(catalog, id); ensure(manga.languages[code], "Langue introuvable.", 404);
      ensure(Object.keys(manga.languages).length > 1, "Impossible de supprimer la seule langue.");
      ensure(manga.defaultLanguage !== code, "Choisissez d’abord une autre langue par défaut.");
      for (const page of manga.languages[code].pages) {
        const source = assetFile(page); const destination = path.join(trashRoot, `${timestamp()}-${safeSegment(manga.slug)}-${code}`, path.basename(source));
        await tx.move(source, destination);
      }
      delete manga.languages[code]; return manga;
    });
  }
  async function addPages(id, code, payload) {
    return mutate("add-pages", id, async (catalog, tx) => {
      const manga = findManga(catalog, id); const language = manga.languages[code]; ensure(language, "Langue introuvable.", 404);
      const uploads = naturalPageSort(payload.files || []); ensure(uploads.length, "Aucune page fournie.");
      const directory = path.join(assetRoot, manga.slug, code); const additions = [];
      const hashes = new Set(await Promise.all(language.pages.map((page) => fileHash(assetFile(page)))));
      for (const upload of uploads) {
        const image = await decodeImage(upload); ensure(!hashes.has(image.hash), `Page dupliquée : ${upload.fileName}.`, 409); hashes.add(image.hash);
        const name = await uniqueDestination(directory, image.name); const destination = path.join(directory, name);
        await tx.writeExclusive(destination, image.buffer); additions.push(`assets/mangaka/${manga.slug}/${code}/${name}`);
      }
      const position = Math.min(Math.max(Number(payload.position) || language.pages.length + 1, 1), language.pages.length + 1);
      language.pages.splice(position - 1, 0, ...additions); return manga;
    });
  }
  async function reorderPages(id, code, pages) {
    return mutate("reorder-pages", id, async (catalog) => {
      const manga = findManga(catalog, id); const language = manga.languages[code]; ensure(language, "Langue introuvable.", 404);
      ensure(Array.isArray(pages) && pages.length === language.pages.length, "Ordre de pages incomplet.");
      ensure(new Set(pages).size === pages.length && pages.every((page) => language.pages.includes(page)), "Ordre de pages invalide.");
      language.pages = [...pages]; return manga;
    });
  }
  async function deletePage(id, code, index) {
    return mutate("delete-page", id, async (catalog, tx) => {
      const manga = findManga(catalog, id); const language = manga.languages[code]; ensure(language, "Langue introuvable.", 404);
      ensure(language.pages.length > 1, "Une langue doit conserver au moins une page.");
      ensure(index >= 0 && index < language.pages.length, "Page introuvable.", 404);
      const [relative] = language.pages.splice(index, 1); const source = assetFile(relative);
      await tx.move(source, path.join(trashRoot, `${timestamp()}-${safeSegment(manga.slug)}-${code}`, path.basename(source)));
      return manga;
    });
  }
  async function replacePage(id, code, index, payload) {
    return mutate("replace-page", id, async (catalog, tx) => {
      const manga = findManga(catalog, id); const language = manga.languages[code]; ensure(language, "Langue introuvable.", 404);
      ensure(index >= 0 && index < language.pages.length, "Page introuvable.", 404);
      const oldRelative = language.pages[index]; const oldFile = assetFile(oldRelative); const image = await decodeImage(payload.file, payload.keepName ? path.basename(oldFile, path.extname(oldFile)) : undefined);
      const directory = path.dirname(oldFile); const shared = mangaUsesPathElsewhere(manga, oldRelative, { languageCode: code, pageIndex: index });
      const requestedName = payload.keepName ? `${path.basename(oldFile, path.extname(oldFile))}${image.extension}` : image.name;
      const name = shared || !payload.keepName ? await uniqueDestination(directory, requestedName) : requestedName;
      const destination = path.join(directory, name); const trash = path.join(trashRoot, `${timestamp()}-${safeSegment(manga.slug)}-${code}`, path.basename(oldFile));
      if (!shared) await tx.move(oldFile, trash); await tx.writeExclusive(destination, image.buffer);
      language.pages[index] = `assets/mangaka/${path.relative(assetRoot, destination).replaceAll("\\", "/")}`; return manga;
    });
  }
  async function replaceMedia(id, field, payload) {
    ensure(["cover", "banner", "thumbnail", "presentation"].includes(field), "Type de média invalide.");
    return mutate(`replace-${field}`, id, async (catalog, tx) => {
      const manga = findManga(catalog, id); const image = await decodeImage(payload.file, field); const directory = path.join(assetRoot, manga.slug);
      const name = await uniqueDestination(directory, image.name); const destination = path.join(directory, name);
      if (manga[field] && !mangaUsesPathElsewhere(manga, manga[field], { mediaField: field })) await tx.move(assetFile(manga[field]), path.join(trashRoot, `${timestamp()}-${safeSegment(manga.slug)}-${field}`, path.basename(manga[field])));
      await tx.writeExclusive(destination, image.buffer); manga[field] = `assets/mangaka/${manga.slug}/${name}`; return manga;
    });
  }
  async function replacePrimaryMedia(id, payload) { return replaceMedia(id, "banner", payload); }
  async function removeManga(id, confirmation) {
    return mutate("delete", id, async (catalog, tx) => {
      const index = catalog.findIndex((manga) => String(manga.id) === String(id)); ensure(index >= 0, "Manga introuvable.", 404);
      const manga = catalog[index]; ensure(confirmation === manga.slug || confirmation === manga.title, "Confirmation incorrecte.");
      const directory = path.join(assetRoot, manga.slug);
      try { await stat(directory); await tx.move(directory, path.join(trashRoot, `${timestamp()}-${safeSegment(manga.slug)}`, manga.slug)); } catch (error) { if (error.code !== "ENOENT") throw error; }
      catalog.splice(index, 1); return manga;
    });
  }
  async function reveal(id, descriptor) {
    const catalog = await readCatalog(); const manga = findManga(catalog, id); let relative;
    if (descriptor.type === "page") relative = manga.languages[descriptor.language]?.pages?.[Number(descriptor.index)];
    else if (descriptor.type === "primary") relative = primaryMangaMedia(manga).path;
    else if (["cover", "banner", "thumbnail", "presentation"].includes(descriptor.type)) relative = manga[descriptor.type];
    ensure(relative, "Média manga introuvable.", 404);
    const candidate = assetFile(relative); const actual = await realpath(candidate).catch(() => { throw new MangaAdminError(404, "Fichier manga introuvable."); });
    ensure(isPathInside(assetRoot, actual), "Fichier manga hors projet.", 403);
    const command = buildRevealCommand(actual);
    console.log(`[manga-reveal]\nid: ${manga.id}\nrelative: ${relative}\nabsolute: ${actual}\ncommand: ${command.command}\narguments: ${JSON.stringify(command.args)}`);
    return disableReveal ? { ...command, filePath: actual, simulated: true } : launchReveal(actual);
  }
  async function initialize() { await Promise.all([mkdir(backupRoot, { recursive: true }), mkdir(trashRoot, { recursive: true }), mkdir(stagingRoot, { recursive: true })]); }
  async function readAsset(relative) { return { content: await readFile(assetFile(relative)), extension: path.extname(relative).toLowerCase() }; }
  return { initialize, report, create, update, addLanguage, deleteLanguage, addPages, reorderPages, deletePage, replacePage, replaceMedia, replacePrimaryMedia, removeManga, reveal, readAsset, readCatalog, validateFiles, paths: { catalogPath, assetRoot, backupRoot, trashRoot, stagingRoot } };
}
