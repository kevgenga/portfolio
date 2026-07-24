import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "../sharp-runtime.mjs";
import { FileTransaction } from "../file-transaction.mjs";
import { buildRevealCommand, isPathInside, launchReveal } from "../reveal-file.mjs";
import {
  getMangaPresentationDirectory,
  getMangaPresentationSection,
  MANGA_PRESENTATION_SECTION_VALUES,
  naturalPageSort,
  normalizeLanguageCode,
  parseMangaCatalog,
  serializeMangaCatalog,
  slugify,
  validateMangaCatalog,
} from "./catalog.mjs";
import { analyzeMangaCardMedia, primaryMangaMedia } from "./media-policy.mjs";

const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const LANGUAGE_PRESETS = { orig: ["Original", "ORIG"], fr: ["French", "FR"], en: ["English", "ENG"], ja: ["Japanese", "JA"], es: ["Spanish", "ES"], de: ["German", "DE"], it: ["Italian", "IT"], ko: ["Korean", "KO"], zh: ["Chinese", "ZH"] };

export class MangaAdminError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function ensure(condition, message, status = 400) { if (!condition) throw new MangaAdminError(status, message); }
function safeSegment(value) { return slugify(value).slice(0, 80); }

export function createMangaService({
  projectRoot,
  runtimeRoot,
  disableReveal = false,
  failurePoint = "",
  onMutation = null,
  now = () => new Date(),
  renameImpl = rename,
}) {
  const catalogPath = path.join(projectRoot, "src/content/mangas.js");
  const assetRoot = path.join(projectRoot, "public/assets/mangaka");
  const backupRoot = path.join(runtimeRoot, "backups/mangas");
  const runtimeTrashRoot = path.join(runtimeRoot, "trash");
  const trashRoot = path.join(runtimeRoot, "trash/mangas");
  const stagingRoot = path.join(runtimeRoot, "staging/mangas");
  const operationTimestamp = () => now().toISOString().replaceAll(":", "-").replaceAll(".", "-");

  function sectionDirectory(section) {
    ensure(MANGA_PRESENTATION_SECTION_VALUES.includes(section), "Section de présentation invalide.");
    return getMangaPresentationDirectory({ presentationSection: section });
  }

  function projectPrefix(manga) {
    const structured = `assets/mangaka/${getMangaPresentationDirectory(manga)}/${manga.slug}`;
    if (manga.presentationSection !== undefined) return structured;
    const legacy = `assets/mangaka/${manga.slug}`;
    const references = [
      manga.cover,
      manga.banner,
      manga.thumbnail,
      manga.presentation,
      ...Object.values(manga.languages || {}).flatMap((language) => language.pages || []),
    ].filter(Boolean);
    return references.some((value) => value.startsWith(`${legacy}/`)) ? legacy : structured;
  }

  function projectDirectory(manga) {
    return path.join(projectRoot, "public", ...projectPrefix(manga).split("/"));
  }

  function rewriteProjectPaths(manga, previousPrefix, nextPrefix) {
    for (const field of ["cover", "banner", "thumbnail", "presentation"]) {
      if (manga[field]?.startsWith(`${previousPrefix}/`)) {
        manga[field] = `${nextPrefix}${manga[field].slice(previousPrefix.length)}`;
      }
    }
    for (const language of Object.values(manga.languages || {})) {
      language.pages = language.pages.map((page) =>
        page.startsWith(`${previousPrefix}/`)
          ? `${nextPrefix}${page.slice(previousPrefix.length)}`
          : page);
    }
  }

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
    const destination = path.join(backupRoot, `${operationTimestamp()}-${safeSegment(operation)}-${safeSegment(slug)}.js`);
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
    const transaction = new FileTransaction({ renameImpl });
    const backupPath = await backup(operation, slug);
    let catalogWritten = false;
    try {
      const result = await callback(catalog, transaction);
      if (failurePoint === "before-catalog") throw new Error("Échec manga simulé.");
      await validateFiles(catalog);
      const serialized = serializeMangaCatalog(catalog);
      await writeAtomic(failurePoint === "invalid-catalog" ? "export const mangas = [;\n" : serialized);
      catalogWritten = true;
      await validateFiles(await readCatalog());
      if (failurePoint === "after-catalog") throw new Error("Échec manga simulé.");
      transaction.commit();
      onMutation?.();
      return { result, backup: path.relative(projectRoot, backupPath).replaceAll("\\", "/") };
    } catch (error) {
      const rollbackErrors = [];
      if (catalogWritten) {
        try { await writeAtomic(original); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      try { await transaction.rollback(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      if (rollbackErrors.length) {
        throw new AggregateError([error, ...rollbackErrors], "La transaction Manga Admin a échoué et son rollback est incomplet.");
      }
      throw error;
    }
  }

  async function ensureMangaTrashRoot() {
    await mkdir(runtimeRoot, { recursive: true });
    const actualRuntimeRoot = await realpath(runtimeRoot);
    await mkdir(runtimeTrashRoot, { recursive: true });
    const actualRuntimeTrashRoot = await realpath(runtimeTrashRoot);
    ensure(isPathInside(actualRuntimeRoot, actualRuntimeTrashRoot), "La racine de corbeille sort du dossier technique autorisé.", 403);
    await mkdir(trashRoot, { recursive: true });
    const actualTrashRoot = await realpath(trashRoot);
    ensure(isPathInside(actualRuntimeTrashRoot, actualTrashRoot), "La corbeille Manga sort de sa racine autorisée.", 403);
    return actualTrashRoot;
  }

  async function generateUniqueUnusedTrashPath(label) {
    const actualTrashRoot = await ensureMangaTrashRoot();
    const baseName = `${operationTimestamp()}-${safeSegment(label)}`;
    for (let suffix = 1; ; suffix += 1) {
      const candidate = path.join(actualTrashRoot, suffix === 1 ? baseName : `${baseName}-${suffix}`);
      ensure(isPathInside(actualTrashRoot, candidate), "Destination de corbeille invalide.", 403);
      try {
        await lstat(candidate);
      } catch (error) {
        if (error.code === "ENOENT") {
          return candidate;
        }
        throw error;
      }
    }
  }

  async function destinationExists(destination) {
    try {
      await lstat(destination);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  function translateTrashMoveError(error, occupied = false) {
    if (error instanceof MangaAdminError) return error;
    if (error.code === "ENOENT") return new MangaAdminError(404, "Suppression impossible : le dossier source du manga n’existe plus.");
    if (occupied || error.code === "EEXIST" || error.code === "ENOTEMPTY") return new MangaAdminError(409, "Suppression impossible : la destination de corbeille existe déjà.");
    if (error.code === "EPERM" || error.code === "EBUSY") return new MangaAdminError(423, "Windows refuse l’accès au dossier source. Vérifiez ses permissions et fermez les fichiers ou aperçus qui l’utilisent, puis réessayez.");
    if (error.code === "EACCES") return new MangaAdminError(403, "Permission refusée lors du déplacement vers la corbeille Manga.");
    if (["EINVAL", "ENAMETOOLONG", "ENOTDIR"].includes(error.code)) return new MangaAdminError(400, "Le chemin de suppression Manga est invalide.");
    return error;
  }

  async function moveMangaToTrash(transaction, source, label) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const destination = await generateUniqueUnusedTrashPath(label);
      try {
        await transaction.move(source, destination);
        return destination;
      } catch (error) {
        const occupied = await destinationExists(destination);
        if (occupied && ["EEXIST", "ENOTEMPTY", "EPERM", "EACCES"].includes(error.code)) continue;
        throw translateTrashMoveError(error, occupied);
      }
    }
    throw new MangaAdminError(409, "Impossible de générer une destination de corbeille Manga unique.");
  }
  async function inspectAsset(relative) {
    if (!relative) return null;
    const file = assetFile(relative);
    const image = sharp(file, { animated: true });
    try {
      const [info, fileStat] = await Promise.all([image.metadata(), stat(file)]);
      return { path: relative, name: path.basename(file), width: info.width, height: info.height, size: fileStat.size, extension: path.extname(file).toLowerCase() };
    } catch {
      return { path: relative, name: path.basename(file), missing: true };
    } finally {
      image.destroy();
    }
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
      items.push({
        ...manga,
        presentationSection: getMangaPresentationSection(manga),
        languages,
        primaryMedia: { ...primaryMedia, details: primaryMediaDetails, analysis: analyzeMangaCardMedia(primaryMediaDetails) },
        totalPages: counts.reduce((sum, count) => sum + count, 0),
      });
    }
    return {
      mangas: items,
      count: items.length,
      sectionCounts: Object.fromEntries(MANGA_PRESENTATION_SECTION_VALUES.map((section) => [
        section,
        items.filter((manga) => manga.presentationSection === section).length,
      ])),
      languageVersions: items.reduce((sum, manga) => sum + Object.keys(manga.languages).length, 0),
      totalPages: items.reduce((sum, manga) => sum + manga.totalPages, 0),
      issues,
      languagePresets: LANGUAGE_PRESETS,
    };
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
    const presentationSection = payload.presentationSection || "completed";
    const presentationDirectory = sectionDirectory(presentationSection);
    const current = await readCatalog();
    let slug = slugify(payload.slug || title); let suffix = 2;
    while (current.some((manga) => manga.slug === slug || String(manga.id) === slug)) {
      slug = `${slugify(payload.slug || title)}-${suffix++}`;
    }
    const languageType = payload.languageType || "multilingual";
    const initialCode = languageType === "multilingual" ? normalizeLanguageCode(payload.languageCode || "en") : "orig";
    const preset = LANGUAGE_PRESETS[initialCode] || [initialCode.toUpperCase(), initialCode.toUpperCase()];
    const uploads = naturalPageSort(payload.pages || []).map((upload) => upload);
    ensure(uploads.length > 0, "Ajoutez au moins une page.");
    return mutate("create", slug, async (catalog, tx) => {
      const projectRootDirectory = path.join(assetRoot, presentationDirectory, slug);
      const directory = path.join(projectRootDirectory, initialCode);
      const pagePaths = []; const hashes = new Set();
      for (const upload of uploads) {
        const image = await decodeImage(upload);
        ensure(!hashes.has(image.hash), `Page dupliquée : ${upload.fileName}.`, 409); hashes.add(image.hash);
        const name = await uniqueDestination(directory, image.name);
        const destination = path.join(directory, name);
        await tx.writeExclusive(destination, image.buffer);
        pagePaths.push(`assets/mangaka/${presentationDirectory}/${slug}/${initialCode}/${name}`);
      }
      ensure(payload.primaryImage, "L’image principale du manga est obligatoire.");
      let banner = "";
      if (payload.primaryImage) {
        const image = await decodeImage(payload.primaryImage, `banner${path.extname(payload.primaryImage.fileName)}`);
        const destination = path.join(projectRootDirectory, image.name);
        await tx.writeExclusive(destination, image.buffer);
        banner = `assets/mangaka/${presentationDirectory}/${slug}/${image.name}`;
      }
      const manga = {
        id: slug, slug, route: `/mangas/${slug}`, title, edition: "", banner,
        presentationSection,
        summary: String(payload.summary || ""), genre: "", role: "", year: payload.year || "",
        readingDirection: payload.readingDirection === "ltr" ? "ltr" : "rtl", defaultLanguage: initialCode,
        languages: { [initialCode]: { label: languageType === "silent" ? "Original / Silent manga" : preset[0], shortLabel: preset[1], pages: pagePaths } },
        featured: false, status: payload.status || "draft", visibility: payload.visibility || "private",
      };
      catalog.push(manga); return manga;
    });
  }
  async function update(id, payload) {
    return mutate("update", id, async (catalog, tx) => {
      const manga = findManga(catalog, id);
      if (payload.presentationSection !== undefined) {
        const nextSection = payload.presentationSection;
        const nextDirectoryName = sectionDirectory(nextSection);
        const previousPrefix = projectPrefix(manga);
        const nextPrefix = `assets/mangaka/${nextDirectoryName}/${manga.slug}`;
        if (previousPrefix !== nextPrefix) {
          const sourceDirectory = projectDirectory(manga);
          const destinationDirectory = path.join(assetRoot, nextDirectoryName, manga.slug);
          const actualSource = await realpath(sourceDirectory).catch(() => {
            throw new MangaAdminError(404, "Dossier physique du manga introuvable.");
          });
          ensure(isPathInside(assetRoot, actualSource), "Le dossier source sort des assets Manga.", 403);
          try {
            await stat(destinationDirectory);
            throw new MangaAdminError(409, "Un dossier existe déjà dans la section cible.");
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          await tx.move(actualSource, destinationDirectory);
          rewriteProjectPaths(manga, previousPrefix, nextPrefix);
        }
        manga.presentationSection = nextSection;
      }
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
        const source = assetFile(page); const destination = path.join(trashRoot, `${operationTimestamp()}-${safeSegment(manga.slug)}-${code}`, path.basename(source));
        await tx.move(source, destination);
      }
      delete manga.languages[code]; return manga;
    });
  }
  async function addPages(id, code, payload) {
    return mutate("add-pages", id, async (catalog, tx) => {
      const manga = findManga(catalog, id); const language = manga.languages[code]; ensure(language, "Langue introuvable.", 404);
      const uploads = naturalPageSort(payload.files || []); ensure(uploads.length, "Aucune page fournie.");
      const directory = path.join(projectDirectory(manga), code); const additions = [];
      const hashes = new Set(await Promise.all(language.pages.map((page) => fileHash(assetFile(page)))));
      for (const upload of uploads) {
        const image = await decodeImage(upload); ensure(!hashes.has(image.hash), `Page dupliquée : ${upload.fileName}.`, 409); hashes.add(image.hash);
        const name = await uniqueDestination(directory, image.name); const destination = path.join(directory, name);
        await tx.writeExclusive(destination, image.buffer); additions.push(`${projectPrefix(manga)}/${code}/${name}`);
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
      await tx.move(source, path.join(trashRoot, `${operationTimestamp()}-${safeSegment(manga.slug)}-${code}`, path.basename(source)));
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
      const destination = path.join(directory, name); const trash = path.join(trashRoot, `${operationTimestamp()}-${safeSegment(manga.slug)}-${code}`, path.basename(oldFile));
      if (!shared) await tx.move(oldFile, trash); await tx.writeExclusive(destination, image.buffer);
      language.pages[index] = `assets/mangaka/${path.relative(assetRoot, destination).replaceAll("\\", "/")}`; return manga;
    });
  }
  async function replaceMedia(id, field, payload) {
    ensure(["cover", "banner", "thumbnail", "presentation"].includes(field), "Type de média invalide.");
    return mutate(`replace-${field}`, id, async (catalog, tx) => {
      const manga = findManga(catalog, id); const image = await decodeImage(payload.file, field); const directory = projectDirectory(manga);
      const name = await uniqueDestination(directory, image.name); const destination = path.join(directory, name);
      if (manga[field] && !mangaUsesPathElsewhere(manga, manga[field], { mediaField: field })) await tx.move(assetFile(manga[field]), path.join(trashRoot, `${operationTimestamp()}-${safeSegment(manga.slug)}-${field}`, path.basename(manga[field])));
      await tx.writeExclusive(destination, image.buffer); manga[field] = `${projectPrefix(manga)}/${name}`; return manga;
    });
  }
  async function replacePrimaryMedia(id, payload) { return replaceMedia(id, "banner", payload); }
  async function inspectMangaRemoval(catalog, id, confirmation) {
    const index = catalog.findIndex((manga) => String(manga.id) === String(id));
    ensure(index >= 0, "Manga introuvable.", 404);
    const manga = catalog[index];
    ensure(confirmation === manga.slug || confirmation === manga.title, "Confirmation incorrecte.");
    const expectedSection = getMangaPresentationSection(manga);
    const expectedDirectory = sectionDirectory(expectedSection);
    const expectedRoot = path.join(assetRoot, expectedDirectory);
    const expectedPrefix = `assets/mangaka/${expectedDirectory}/${manga.slug}/`;
    const references = [
      manga.cover,
      manga.banner,
      manga.thumbnail,
      manga.presentation,
      ...Object.values(manga.languages || {}).flatMap((language) => language.pages || []),
    ].filter(Boolean);
    ensure(references.every((relative) => relative.startsWith(expectedPrefix)), "Suppression refusée : un média sort du dossier de section attendu.", 403);
    const directory = projectDirectory(manga);
    ensure(isPathInside(expectedRoot, directory), "Suppression refusée : dossier hors de la section attendue.", 403);
    const actualRoot = await realpath(expectedRoot).catch((error) => {
      if (error.code === "ENOENT") throw new MangaAdminError(404, "Suppression impossible : la section physique du manga n’existe plus.");
      throw error;
    });
    const actualDirectory = await realpath(directory).catch((error) => {
      if (error.code === "ENOENT") throw new MangaAdminError(404, "Suppression impossible : le dossier source du manga n’existe plus.");
      throw error;
    });
    ensure(isPathInside(actualRoot, actualDirectory), "Suppression refusée : le dossier physique sort de sa section.", 403);
    return { manga, actualDirectory, expectedSection };
  }

  async function removeManga(id, confirmation) {
    const preparedCatalog = await readCatalog();
    const prepared = await inspectMangaRemoval(preparedCatalog, id, confirmation);
    await ensureMangaTrashRoot();
    return mutate("delete", id, async (catalog, tx) => {
      const current = await inspectMangaRemoval(catalog, id, confirmation);
      ensure(current.actualDirectory === prepared.actualDirectory, "Le dossier source du manga a changé pendant la suppression.", 409);
      await moveMangaToTrash(tx, current.actualDirectory, `${current.expectedSection}-${current.manga.slug}`);
      const index = catalog.findIndex((manga) => String(manga.id) === String(id));
      catalog.splice(index, 1);
      return current.manga;
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
