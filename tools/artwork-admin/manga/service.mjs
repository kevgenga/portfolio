import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "../sharp-runtime.mjs";
import { FileTransaction } from "../file-transaction.mjs";
import { createPresentationSettingsStore } from "../presentation-settings.mjs";
import { buildRevealCommand, isPathInside, launchReveal } from "../reveal-file.mjs";
import {
  getMangaPresentationDirectory,
  getMangaPresentationSection,
  MANGA_PRESENTATION_SECTION_VALUES,
  naturalPageSort,
  normalizeStorageFolder,
  parseMangaCatalog,
  serializeMangaCatalog,
  slugify,
  validateMangaCatalog,
} from "./catalog.mjs";
import {
  analyzeMangaCardMedia,
  MANGA_CARD_IMAGE_FIELDS,
  primaryMangaMedia,
} from "./media-policy.mjs";
import { getLanguageDetails, normalizeSupportedLanguageCode, supportedMangaLanguages } from "../../../src/utils/languageLabels.js";
import { associateDrawings, dissociateDrawing, duplicateProductionDrawing, forgetProductionPaths, getProductionDrawing, moveProductionPath, replaceProductionDrawing, setPageTime, setProjectTime } from "./production-time.mjs";
import { prepareMangaProductionBatch } from "./production-time.mjs";
import { verifyProductionConfirmation } from "../production-groups.mjs";

const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

export class MangaAdminError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function ensure(condition, message, status = 400) { if (!condition) throw new MangaAdminError(status, message); }
function newLanguageCode(value) {
  try { return normalizeSupportedLanguageCode(value); }
  catch (error) { throw new MangaAdminError(400, error.message); }
}
function safeSegment(value) { return slugify(value).slice(0, 80); }
function validateInput(payload) {
  ensure(payload && typeof payload === "object" && !Array.isArray(payload), "Données Manga invalides.");
  for (const field of ["title", "edition", "description", "summary", "genre", "role", "author", "date", "slug"]) {
    if (payload[field] !== undefined) ensure(typeof payload[field] === "string", `Champ ${field} invalide.`);
  }
  if (payload.title !== undefined) ensure(payload.title.trim(), "Titre obligatoire.");
  for (const [field, values] of Object.entries({ status: ["", "published", "draft", "archived"], visibility: ["public", "private"], readingDirection: ["rtl", "ltr"], defaultReadingMode: ["", "vertical", "horizontal"], languageType: ["multilingual", "original", "silent"] })) {
    if (payload[field] !== undefined) ensure(values.includes(payload[field]), `Valeur ${field} invalide.`);
  }
  if (payload.year !== undefined) ensure(typeof payload.year === "string" || (typeof payload.year === "number" && Number.isFinite(payload.year)), "Année invalide.");
  if (payload.order !== undefined) ensure(Number.isFinite(Number(payload.order)), "Ordre d’affichage invalide.");
  if (payload.featured !== undefined) ensure(typeof payload.featured === "boolean", "Valeur featured invalide.");
  if (payload.tags !== undefined) ensure(Array.isArray(payload.tags) && payload.tags.every((tag) => typeof tag === "string"), "Tags invalides.");
}

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
  const presentationSettingsPath = path.join(projectRoot, "src/content/mangaPresentation.js");
  const assetRoot = path.join(projectRoot, "public/assets/mangaka");
  const backupRoot = path.join(runtimeRoot, "backups/mangas");
  const runtimeTrashRoot = path.join(runtimeRoot, "trash");
  const trashRoot = path.join(runtimeRoot, "trash/mangas");
  const stagingRoot = path.join(runtimeRoot, "staging/mangas");
  const operationTimestamp = () => now().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  let mutationQueue = Promise.resolve();

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

  function pageStorageFolder(manga, page) {
    const prefix = `${projectPrefix(manga)}/`;
    ensure(page.startsWith(prefix), `Page hors du dossier du manga : ${page}.`);
    const directory = path.posix.dirname(page.slice(prefix.length));
    return directory === "." ? "" : normalizeStorageFolder(directory);
  }

  function analyzeLanguageStorage(manga, code) {
    const language = manga.languages[code];
    ensure(language, "Langue introuvable.", 404);
    const configured = language.storageFolder === undefined
      ? null
      : normalizeStorageFolder(language.storageFolder);
    const counts = new Map();
    for (const page of language.pages) {
      const folder = pageStorageFolder(manga, page);
      counts.set(folder, (counts.get(folder) || 0) + 1);
    }
    if (!counts.size) {
      return {
        folder: configured ?? normalizeStorageFolder(code),
        source: configured === null ? "language-code" : "configuration",
        ambiguous: false,
        candidates: [],
      };
    }
    const maximum = Math.max(...counts.values());
    const candidates = [...counts.entries()]
      .filter(([, count]) => count === maximum)
      .map(([folder]) => folder);
    const firstPageFolder = pageStorageFolder(manga, language.pages[0]);
    const configurationResolvesTie = configured !== null && candidates.includes(configured);
    const folder = configurationResolvesTie
      ? configured
      : candidates.includes(firstPageFolder)
        ? firstPageFolder
        : candidates[0];
    return { folder, source: "existing-pages", ambiguous: candidates.length > 1 && !configurationResolvesTie, candidates };
  }

  function languageDirectory(manga, folder) {
    return folder
      ? path.join(projectDirectory(manga), ...folder.split("/"))
      : projectDirectory(manga);
  }

  function languagePagePath(manga, folder, name) {
    return `${projectPrefix(manga)}/${folder ? `${folder}/` : ""}${name}`;
  }

  async function resolvePageFile(manga, relative) {
    ensure(!relative.split(/[\\/]/).some((segment) => segment === "." || segment === ".." || segment.includes("\0")), "Chemin de page source interdit.", 403);
    const folder = pageStorageFolder(manga, relative);
    const source = assetFile(relative);
    await ensureAssetDirectory(path.dirname(source));
    ensure(!(await lstat(source).catch((error) => {
      if (error.code === "ENOENT") throw new MangaAdminError(404, "Le fichier source de la page est introuvable.");
      throw error;
    })).isSymbolicLink(), "Un lien symbolique ne peut pas être utilisé comme page source.", 403);
    let actualSource, actualDirectory, actualProject, actualRoot;
    try {
      [actualSource, actualDirectory, actualProject, actualRoot] = await Promise.all([
        realpath(source), realpath(languageDirectory(manga, folder)), realpath(projectDirectory(manga)), realpath(assetRoot),
      ]);
    } catch (error) {
      if (error.code === "ENOENT") throw new MangaAdminError(404, "Le fichier source de la page est introuvable.");
      throw error;
    }
    ensure(isPathInside(actualRoot, actualProject), "Dossier manga hors des assets autorisés.", 403);
    ensure(actualDirectory === actualProject || isPathInside(actualProject, actualDirectory), "Dossier de langue hors du manga.", 403);
    ensure(path.dirname(actualSource) === actualDirectory, "La page source sort de son dossier de langue.", 403);
    ensure((await stat(actualSource)).isFile(), "La page source n’est pas un fichier.");
    return { folder, source, actualSource, actualDirectory };
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
    for (const binding of manga.productionTime?.bindings || []) {
      if (binding.path.startsWith(`${previousPrefix}/`)) binding.path = `${nextPrefix}${binding.path.slice(previousPrefix.length)}`;
    }
  }

  function assetFile(assetPath) {
    ensure(typeof assetPath === "string" && assetPath.startsWith("assets/mangaka/"), "Chemin manga invalide.");
    ensure(!assetPath.split(/[\\/]/).some((part) => part === "." || part === ".." || part.includes("\0")), "Chemin manga interdit.", 403);
    const target = path.resolve(projectRoot, "public", ...assetPath.split("/"));
    ensure(isPathInside(assetRoot, target), "Le chemin manga sort du dossier autorisé.", 403);
    return target;
  }

  async function ensureAssetDirectory(directory) {
    ensure(directory === assetRoot || isPathInside(assetRoot, directory), "Dossier hors des assets Manga.", 403);
    // Check existing ancestors before mkdir/write: reject Windows junctions too.
    let current = projectRoot;
    for (const part of path.relative(projectRoot, directory).split(path.sep)) {
      current = path.join(current, part);
      let info;
      try { info = await lstat(current); } catch (error) { if (error.code === "ENOENT") break; throw error; }
      ensure(info.isDirectory() && !info.isSymbolicLink(), "Dossier Manga invalide ou lié à un autre emplacement.", 403);
    }
    return directory;
  }

  async function scheduleArchiveUnused(catalog, tx, afterSave, manga, relatives, label) {
    const sources = [];
    for (const relative of new Set(relatives.filter(Boolean))) {
      if (catalog.some((entry) => mangaUsesPathElsewhere(entry, relative))) continue;
      sources.push(await resolvePageFile(manga, relative));
    }
    if (!sources.length) return;
    afterSave.push(async () => {
      const directory = await generateUniqueUnusedTrashPath(label);
      for (const { source, actualSource } of sources) {
        const name = await uniqueDestination(directory, path.basename(source));
        await tx.move(actualSource, path.join(directory, name));
      }
    });
  }

  function applyPageOrder(manga, code, pages, expectedPages) {
    ensure(Object.hasOwn(manga.languages, code), "Langue introuvable.", 404);
    const language = manga.languages[code];
    if (expectedPages !== undefined) ensure(Array.isArray(expectedPages) && JSON.stringify(expectedPages) === JSON.stringify(language.pages), "Les pages ont changé. Actualisez avant de réessayer.", 409);
    ensure(Array.isArray(pages) && pages.length === language.pages.length, "Ordre de pages incomplet.");
    ensure(new Set(pages).size === pages.length && pages.every((page) => language.pages.includes(page)), "Ordre de pages invalide.");
    language.pages = [...pages];
  }

  async function readCatalog() { return parseMangaCatalog(await readFile(catalogPath, "utf8")); }
  async function writeFileAtomic(file, content, beforeCommit = async () => {}) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, { flag: "wx" });
      await beforeCommit();
      await rename(temporary, file);
    } catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  async function writeAtomic(content, beforeCommit) { await writeFileAtomic(catalogPath, content, beforeCommit); }
  const revision = (source) => createHash("sha256").update(source).digest("hex");
  async function backup(operation, slug = "catalog") {
    await mkdir(backupRoot, { recursive: true });
    const destination = path.join(backupRoot, `${operationTimestamp()}-${safeSegment(operation)}-${safeSegment(slug)}-${randomUUID()}.js`);
    await copyFile(catalogPath, destination, constants.COPYFILE_EXCL);
    return destination;
  }
  const { read: readPresentationSettings, update: updatePresentationSettings } = createPresentationSettingsStore({
    file: presentationSettingsPath, backupRoot, key: "showStoryboardSection", label: "Manga",
  });
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
        try { await ensureAssetDirectory(path.dirname(target)); ensure((await lstat(target)).isFile(), `Fichier manga invalide : ${relative}.`); }
        catch (error) { if (error.code === "ENOENT") throw new MangaAdminError(400, `Fichier manga manquant : ${relative}.`); throw error; }
      }
    }
  }
  function mutate(operation, slug, callback, options = {}) {
    // Serialize catalog mutations so simultaneous duplicates cannot lose pages.
    const result = mutationQueue.then(() => performMutation(operation, slug, callback, options));
    mutationQueue = result.catch(() => undefined);
    return result;
  }
  async function performMutation(operation, slug, callback, { metadataOnly = false, expectedRevision } = {}) {
    const original = await readFile(catalogPath, "utf8");
    if (expectedRevision !== undefined) ensure(expectedRevision === revision(original), "Le catalogue Manga a changé. Actualisez avant de réenregistrer.", 409);
    const catalog = parseMangaCatalog(original);
    validateMangaCatalog(catalog);
    const initialData = JSON.stringify(catalog);
    const transaction = new FileTransaction({ renameImpl });
    let backupPath = metadataOnly ? null : await backup(operation, slug);
    let catalogWritten = false;
    let writtenSource;
    const afterSave = [];
    try {
      const result = await callback(catalog, transaction, afterSave);
      validateMangaCatalog(catalog);
      if (metadataOnly && JSON.stringify(catalog) === initialData) return { result, catalogRevision: revision(original), unchanged: true };
      if (metadataOnly) backupPath = await backup(operation, slug);
      if (failurePoint === "before-catalog") throw new Error("Échec manga simulé.");
      if (!metadataOnly) await validateFiles(catalog);
      const serialized = serializeMangaCatalog(catalog);
      validateMangaCatalog(parseMangaCatalog(serialized));
      writtenSource = failurePoint === "invalid-catalog" ? "export const mangas = [;\n" : serialized;
      await writeAtomic(writtenSource, async () => ensure(revision(await readFile(catalogPath, "utf8")) === revision(original), "Le catalogue Manga a changé pendant l’opération. Actualisez avant de réessayer.", 409));
      catalogWritten = true;
      if (metadataOnly) validateMangaCatalog(await readCatalog());
      else await validateFiles(await readCatalog());
      if (failurePoint === "after-catalog") throw new Error("Échec manga simulé.");
      for (const finalize of afterSave) await finalize();
      if (!metadataOnly) onMutation?.();
      transaction.commit();
      return { result, catalogRevision: revision(serialized), backup: path.relative(projectRoot, backupPath).replaceAll("\\", "/") };
    } catch (error) {
      const rollbackErrors = [];
      if (catalogWritten) {
        try { await writeAtomic(original, async () => ensure(await readFile(catalogPath, "utf8") === writtenSource, "Restauration automatique refusée : modification extérieure du catalogue. Conservez les fichiers et restaurez la sauvegarde manuellement.", 409)); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      // Do not delete prepared assets if the on-disk catalog could still refer
      // to them. Keep files and the backup available for manual recovery.
      if (!rollbackErrors.length) {
        try { await transaction.rollback(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
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
    const source = await readFile(catalogPath, "utf8");
    const catalog = parseMangaCatalog(source);
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
      catalogRevision: revision(source),
      mangas: items,
      count: items.length,
      sectionCounts: Object.fromEntries(MANGA_PRESENTATION_SECTION_VALUES.map((section) => [
        section,
        items.filter((manga) => manga.presentationSection === section).length,
      ])),
      languageVersions: items.reduce((sum, manga) => sum + Object.keys(manga.languages).length, 0),
      totalPages: items.reduce((sum, manga) => sum + manga.totalPages, 0),
      issues,
      languagePresets: Object.fromEntries(supportedMangaLanguages.map((language) => [language.code, [language.label, language.shortLabel]])),
    };
  }
  async function decodeImage(upload, preferredName, validateContent = true) {
    ensure(typeof upload?.dataBase64 === "string" && typeof upload?.fileName === "string" && upload.fileName && !upload.fileName.includes("\0"), "Image manquante ou nom invalide.");
    const extension = path.extname(upload.fileName).toLowerCase();
    ensure(EXTENSIONS.has(extension), "Format d’image non autorisé.");
    const buffer = Buffer.from(upload.dataBase64, "base64");
    ensure(buffer.length > 0, "Image vide.");
    const decoder = sharp(buffer, { animated: true, failOn: "warning" });
    try {
      const metadata = await decoder.metadata();
      if (validateContent) {
        const formats = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp", ".avif": "heif", ".gif": "gif" };
        ensure(metadata.format === formats[extension] && (extension !== ".avif" || metadata.compression === "av1"), "L’extension ne correspond pas au format de l’image.");
        // Decode for validation only; the original upload bytes are saved unchanged.
        await decoder.stats();
      }
    } catch (error) {
      if (error instanceof MangaAdminError) throw error;
      throw new MangaAdminError(400, "Fichier image invalide.");
    } finally { decoder.destroy(); }
    const base = safeSegment(path.basename(preferredName || upload.fileName, path.extname(preferredName || upload.fileName)));
    return { buffer, extension, name: `${base}${extension}`, hash: createHash("sha256").update(buffer).digest("hex") };
  }
  async function uniqueDestination(directory, name) {
    let candidate = name; let index = 2;
    while (true) {
      try { await lstat(path.join(directory, candidate)); candidate = `${path.basename(name, path.extname(name))}-${index++}${path.extname(name)}`; }
      catch (error) { if (error.code === "ENOENT") return candidate; throw error; }
    }
  }
  async function fileHash(file) { return createHash("sha256").update(await readFile(file)).digest("hex"); }
  function normalizedFileIdentity(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    return `${safeSegment(path.basename(fileName, path.extname(fileName)))}${extension}`;
  }
  async function registeredPageFingerprints(language) {
    const fingerprints = new Map();
    for (const page of language.pages) {
      const identity = normalizedFileIdentity(path.basename(page));
      const hashes = fingerprints.get(identity) || new Set();
      hashes.add(await fileHash(assetFile(page)));
      fingerprints.set(identity, hashes);
    }
    return fingerprints;
  }
  function ensureNewPage(fingerprints, image, originalName) {
    const hashes = fingerprints.get(image.name) || new Set();
    ensure(!hashes.has(image.hash), `Page dupliquée : ${originalName}.`, 409);
    hashes.add(image.hash);
    fingerprints.set(image.name, hashes);
  }
  async function create(payload) {
    validateInput(payload);
    const title = String(payload.title || "").trim(); ensure(title, "Titre obligatoire.");
    const presentationSection = payload.presentationSection || "completed";
    const presentationDirectory = sectionDirectory(presentationSection);
    const baseSlug = slugify(payload.slug || title);
    const languageType = payload.languageType || "multilingual";
    const initialCode = languageType === "multilingual" ? newLanguageCode(payload.languageCode || "en") : "orig";
    const preset = getLanguageDetails(initialCode);
    ensure(Array.isArray(payload.pages), "Liste de pages invalide.");
    const uploads = naturalPageSort(payload.pages).map((upload) => upload);
    ensure(uploads.length > 0, "Ajoutez au moins une page.");
    return mutate("create", baseSlug, async (catalog, tx) => {
      let slug = baseSlug, suffix = 2;
      await ensureAssetDirectory(path.join(assetRoot, presentationDirectory));
      while (catalog.some((manga) => manga.slug === slug || String(manga.id) === slug) || await destinationExists(path.join(assetRoot, presentationDirectory, slug))) slug = `${baseSlug}-${suffix++}`;
      const projectRootDirectory = path.join(assetRoot, presentationDirectory, slug);
      await ensureAssetDirectory(projectRootDirectory);
      const directory = path.join(projectRootDirectory, initialCode);
      const pagePaths = []; const fingerprints = new Map();
      for (const upload of uploads) {
        const image = await decodeImage(upload);
        ensureNewPage(fingerprints, image, upload.fileName);
        const name = await uniqueDestination(directory, image.name);
        const destination = path.join(directory, name);
        await tx.writeExclusive(destination, image.buffer);
        pagePaths.push(`assets/mangaka/${presentationDirectory}/${slug}/${initialCode}/${name}`);
      }
      ensure(payload.primaryImage, "L’image de la carte Manga est obligatoire.");
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
        languages: { [initialCode]: { label: languageType === "silent" ? "Original / Silent manga" : preset.label, shortLabel: preset.shortLabel, storageFolder: initialCode, pages: pagePaths } },
        featured: false, status: payload.status || "draft", visibility: payload.visibility || "private",
      };
      catalog.push(manga); return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function update(id, payload) {
    validateInput(payload);
    return mutate("update", id, async (catalog, tx) => {
      const manga = findManga(catalog, id);
      if (payload.pageOrder !== undefined) {
        ensure(payload.pageOrder && typeof payload.pageOrder === "object", "Ordre de pages invalide.");
        applyPageOrder(manga, payload.pageOrder.language, payload.pageOrder.pages, payload.pageOrder.expectedPages);
      }
      if (payload.presentationSection !== undefined) {
        const nextSection = payload.presentationSection;
        const nextDirectoryName = sectionDirectory(nextSection);
        const previousPrefix = projectPrefix(manga);
        const nextPrefix = `assets/mangaka/${nextDirectoryName}/${manga.slug}`;
        if (previousPrefix !== nextPrefix) {
          const sourceDirectory = projectDirectory(manga);
          const destinationDirectory = path.join(assetRoot, nextDirectoryName, manga.slug);
          await ensureAssetDirectory(sourceDirectory);
          await ensureAssetDirectory(destinationDirectory);
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
      if (payload.defaultLanguage !== undefined) { ensure(Object.hasOwn(manga.languages, payload.defaultLanguage), "Langue par défaut absente."); manga.defaultLanguage = payload.defaultLanguage; }
      if (payload.order !== undefined) manga.order = Number(payload.order) || 0;
      return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function addLanguage(id, payload) {
    validateInput(payload);
    const code = newLanguageCode(payload.code);
    return mutate("add-language", id, async (catalog) => {
      const manga = findManga(catalog, id);
      ensure(!Object.keys(manga.languages).some((existing) => (getLanguageDetails(existing)?.code || existing) === code), "Cette langue existe déjà.", 409);
      const preset = getLanguageDetails(code);
      manga.languages[code] = { label: preset.label, shortLabel: preset.shortLabel, storageFolder: code, pages: [] };
      return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function deleteLanguage(id, code, payload = {}) {
    return mutate("delete-language", id, async (catalog, tx, afterSave) => {
      const manga = findManga(catalog, id); ensure(Object.hasOwn(manga.languages, code), "Langue introuvable.", 404);
      ensure(Object.keys(manga.languages).length > 1, "Impossible de supprimer la seule langue.");
      ensure(manga.defaultLanguage !== code, "Choisissez d’abord une autre langue par défaut.");
      const sourceManga = structuredClone(manga);
      const pages = [...manga.languages[code].pages];
      delete manga.languages[code];
      forgetProductionPaths(manga, pages);
      await scheduleArchiveUnused(catalog, tx, afterSave, sourceManga, pages, `${manga.slug}-${code}-delete-language`);
      return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function addPages(id, code, payload) {
    validateInput(payload);
    return mutate("add-pages", id, async (catalog, tx) => {
      const manga = findManga(catalog, id); ensure(Object.hasOwn(manga.languages, code), "Langue introuvable.", 404); const language = manga.languages[code];
      ensure(Array.isArray(payload.files), "Liste de pages invalide.");
      const requestedPosition = Number(payload.position ?? language.pages.length + 1);
      ensure(Number.isSafeInteger(requestedPosition) && requestedPosition >= 1, "Position d’insertion invalide.");
      const uploads = naturalPageSort(payload.files || []); ensure(uploads.length, "Aucune page fournie.");
      const storage = analyzeLanguageStorage(manga, code);
      ensure(!storage.ambiguous, `Dossier physique ambigu pour ${manga.title}/${code} : ${storage.candidates.join(", ")}.`, 409);
      const directory = languageDirectory(manga, storage.folder); const additions = [];
      await ensureAssetDirectory(directory);
      const fingerprints = await registeredPageFingerprints(language);
      for (const upload of uploads) {
        const image = await decodeImage(upload); ensureNewPage(fingerprints, image, upload.fileName);
        const name = await uniqueDestination(directory, image.name); const destination = path.join(directory, name);
        await tx.writeExclusive(destination, image.buffer); additions.push(languagePagePath(manga, storage.folder, name));
      }
      const position = Math.min(requestedPosition, language.pages.length + 1);
      language.pages.splice(position - 1, 0, ...additions);
      language.storageFolder = storage.folder;
      return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function duplicatePage(id, code, index, payload = {}) {
    ensure(payload && typeof payload === "object" && !Array.isArray(payload), "Demande de duplication invalide.");
    return mutate("duplicate-page", id, async (catalog, tx) => {
      validateMangaCatalog(catalog);
      const manga = findManga(catalog, id);
      ensure(Object.hasOwn(manga.languages, code), "Langue introuvable.", 404);
      const language = manga.languages[code];
      ensure(Number.isSafeInteger(index) && index >= 0 && index < language.pages.length, "Page source introuvable.", 404);
      const position = Number(payload.position ?? language.pages.length + 1);
      ensure(Number.isSafeInteger(position) && position >= 1 && position <= language.pages.length + 1, "Position d’insertion invalide.");
      const relative = language.pages[index];
      ensure(payload.source === undefined || payload.source === relative, "La page source a changé. Actualisez la liste avant de réessayer.", 409);
      const { folder, source, actualSource, actualDirectory } = await resolvePageFile(manga, relative);
      const extension = path.extname(source);
      ensure(EXTENSIONS.has(extension.toLowerCase()), "Format de page non pris en charge.");
      const name = await uniqueDestination(actualDirectory, `${path.basename(source, extension)}-copy${extension}`);
      const destination = path.join(actualDirectory, name);
      ensure(isPathInside(actualDirectory, destination), "Destination de copie interdite.", 403);
      // No decodeImage/Sharp: write the exact source bytes, exclusively.
      await tx.writeExclusive(destination, await readFile(actualSource));
      const copyPath = languagePagePath(manga, folder, name);
      language.pages.splice(position - 1, 0, copyPath);
      duplicateProductionDrawing(manga, relative, copyPath);
      return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function repairLanguageStorage(id, code, payload = {}) {
    return mutate("repair-language-storage", id, async (catalog, tx) => {
      const manga = findManga(catalog, id);
      const language = manga.languages[code];
      ensure(language, "Langue introuvable.", 404);
      const storage = analyzeLanguageStorage(manga, code);
      ensure(!storage.ambiguous, `Dossier physique ambigu pour ${manga.title}/${code} : ${storage.candidates.join(", ")}.`, 409);
      const directory = languageDirectory(manga, storage.folder);
      await ensureAssetDirectory(directory);
      const moved = [];
      for (let index = 0; index < language.pages.length; index += 1) {
        const currentPath = language.pages[index];
        if (pageStorageFolder(manga, currentPath) === storage.folder) continue;
        const { actualSource: source } = await resolvePageFile(manga, currentPath);
        const name = await uniqueDestination(directory, path.basename(source));
        const destination = path.join(directory, name);
        if (mangaUsesPathElsewhere(manga, currentPath, { languageCode: code, pageIndex: index })) await tx.writeExclusive(destination, await readFile(source));
        else await tx.move(source, destination);
        const nextPath = languagePagePath(manga, storage.folder, name);
        language.pages[index] = nextPath;
        moveProductionPath(manga, currentPath, nextPath);
        moved.push({ index, from: currentPath, to: nextPath });
      }
      language.storageFolder = storage.folder;
      return { manga, storageFolder: storage.folder, moved };
    }, { expectedRevision: payload.catalogRevision });
  }
  async function reorderPages(id, code, pages, payload = {}) {
    return mutate("reorder-pages", id, async (catalog) => {
      const manga = findManga(catalog, id); applyPageOrder(manga, code, pages); return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function deletePage(id, code, index, payload = {}) {
    validateInput(payload);
    return mutate("delete-page", id, async (catalog, tx, afterSave) => {
      const manga = findManga(catalog, id); ensure(Object.hasOwn(manga.languages, code), "Langue introuvable.", 404); const language = manga.languages[code];
      ensure(language.pages.length > 1, "Une langue doit conserver au moins une page.");
      ensure(Number.isSafeInteger(index) && index >= 0 && index < language.pages.length, "Page introuvable.", 404);
      ensure(payload.source === undefined || payload.source === language.pages[index], "La page source a changé. Actualisez avant de réessayer.", 409);
      const sourceManga = structuredClone(manga);
      const [relative] = language.pages.splice(index, 1);
      forgetProductionPaths(manga, [relative]);
      await scheduleArchiveUnused(catalog, tx, afterSave, sourceManga, [relative], `${manga.slug}-${code}-delete-page`);
      return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function replacePage(id, code, index, payload) {
    ensure(payload && typeof payload === "object" && !Array.isArray(payload), "Demande de remplacement invalide.");
    return mutate("replace-page", id, async (catalog, tx, afterSave) => {
      validateMangaCatalog(catalog);
      const manga = findManga(catalog, id);
      ensure(Object.hasOwn(manga.languages, code), "Langue introuvable.", 404);
      const language = manga.languages[code];
      ensure(Number.isSafeInteger(index) && index >= 0 && index < language.pages.length, "Page introuvable.", 404);
      const oldRelative = language.pages[index];
      ensure(payload.source === undefined || payload.source === oldRelative, "La page source a changé. Actualisez la liste avant de réessayer.", 409);
      if (getProductionDrawing(manga, oldRelative)) ensure(["keep", "new"].includes(payload.productionIdentity), "Choisissez de conserver l’identité du dessin ou de créer un nouveau dessin sans durée.");
      const { folder, source: oldFile, actualDirectory } = await resolvePageFile(manga, oldRelative);
      const image = await decodeImage(payload.file, payload.keepName ? path.basename(oldFile, path.extname(oldFile)) : undefined, true);
      const requestedName = payload.keepName ? `${path.basename(oldFile, path.extname(oldFile))}${image.extension}` : image.name;
      // A new unique path keeps the old page usable until the catalog is saved,
      // avoids overwrites and makes browser thumbnails refresh without cache hacks.
      const name = await uniqueDestination(actualDirectory, requestedName);
      const destination = path.join(actualDirectory, name);
      ensure(isPathInside(actualDirectory, destination), "Destination de remplacement interdite.", 403);
      await tx.writeExclusive(destination, image.buffer);
      language.pages[index] = languagePagePath(manga, folder, name);
      replaceProductionDrawing(manga, oldRelative, language.pages[index], payload.productionIdentity);
      await scheduleArchiveUnused(catalog, tx, afterSave, manga, [oldRelative], `${manga.slug}-${code}-replace-page`);
      return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function replaceMedia(id, field, payload) {
    validateInput(payload);
    ensure(["cover", "banner", "thumbnail", "presentation"].includes(field), "Type de média invalide.");
    return mutate(`replace-${field}`, id, async (catalog, tx, afterSave) => {
      const manga = findManga(catalog, id); const image = await decodeImage(payload.file, field); const directory = projectDirectory(manga);
      await ensureAssetDirectory(directory);
      const sourceManga = structuredClone(manga), previous = manga[field];
      const name = await uniqueDestination(directory, image.name); const destination = path.join(directory, name);
      await tx.writeExclusive(destination, image.buffer); manga[field] = `${projectPrefix(manga)}/${name}`;
      await scheduleArchiveUnused(catalog, tx, afterSave, sourceManga, [previous], `${manga.slug}-${field}`);
      return manga;
    }, { expectedRevision: payload.catalogRevision });
  }
  async function replacePrimaryMedia(id, payload) {
    return replaceMedia(id, MANGA_CARD_IMAGE_FIELDS.canonical, payload);
  }
  async function inspectMangaRemoval(catalog, id, confirmation) {
    const index = catalog.findIndex((manga) => String(manga.id) === String(id));
    ensure(index >= 0, "Manga introuvable.", 404);
    const manga = catalog[index];
    ensure(confirmation === manga.slug || confirmation === manga.title, "Confirmation incorrecte.");
    const expectedSection = getMangaPresentationSection(manga);
    const expectedDirectory = sectionDirectory(expectedSection);
    const expectedPrefix = `${projectPrefix(manga)}/`;
    const legacy = expectedPrefix === `assets/mangaka/${manga.slug}/`;
    const expectedRoot = legacy ? assetRoot : path.join(assetRoot, expectedDirectory);
    const references = [
      manga.cover,
      manga.banner,
      manga.thumbnail,
      manga.presentation,
      ...Object.values(manga.languages || {}).flatMap((language) => language.pages || []),
    ].filter(Boolean);
    ensure(references.every((relative) => relative.startsWith(expectedPrefix)), "Suppression refusée : un média sort du dossier de section attendu.", 403);
    const directory = projectDirectory(manga);
    await ensureAssetDirectory(directory);
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

  async function removeManga(id, confirmation, payload = {}) {
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
    }, { expectedRevision: payload.catalogRevision });
  }
  async function reveal(id, descriptor) {
    validateInput(descriptor);
    const catalog = await readCatalog(); const manga = findManga(catalog, id); let relative;
    if (descriptor.type === "page") {
      ensure(Number.isSafeInteger(descriptor.index) && descriptor.index >= 0 && Object.hasOwn(manga.languages, descriptor.language), "Page manga invalide.");
      relative = manga.languages[descriptor.language].pages[descriptor.index];
    }
    else if (descriptor.type === "primary") relative = primaryMangaMedia(manga).path;
    else if (["cover", "banner", "thumbnail", "presentation"].includes(descriptor.type)) relative = manga[descriptor.type];
    ensure(relative, "Média manga introuvable.", 404);
    await resolvePageFile(manga, relative);
    const candidate = assetFile(relative); const actual = await realpath(candidate).catch(() => { throw new MangaAdminError(404, "Fichier manga introuvable."); });
    ensure(isPathInside(assetRoot, actual), "Fichier manga hors projet.", 403);
    const command = buildRevealCommand(actual);
    console.log(`[manga-reveal]\nid: ${manga.id}\nrelative: ${relative}\nabsolute: ${actual}\ncommand: ${command.command}\narguments: ${JSON.stringify(command.args)}`);
    return disableReveal ? { ...command, filePath: actual, simulated: true } : launchReveal(actual);
  }
  async function initialize() { await Promise.all([mkdir(backupRoot, { recursive: true }), mkdir(trashRoot, { recursive: true }), mkdir(stagingRoot, { recursive: true })]); }
  async function editProduction(id, action, payload) {
    const allowed = { total: ["total"], page: ["path", "time"], associate: ["path", "targetPath", "resolution", "confirmGroups"], separate: ["path", "mode"] };
    ensure(Object.hasOwn(allowed, action), "Opération de production inconnue.");
    ensure(payload && typeof payload === "object" && !Array.isArray(payload), "Requête de production invalide.");
    ensure(Object.keys(payload).every(key => [...allowed[action], "catalogRevision"].includes(key)), "Champ de production inconnu.");
    ensure(typeof payload.catalogRevision === "string", "Actualisez le catalogue avant de modifier les temps.", 409);
    return mutate(`production-${action}`, id, (catalog) => {
      const manga = findManga(catalog, id);
      try { ({ total: setProjectTime, page: setPageTime, associate: associateDrawings, separate: dissociateDrawing })[action](manga, payload); }
      catch (error) { throw new MangaAdminError(400, error.message); }
      return manga;
    }, { metadataOnly: true, expectedRevision: payload.catalogRevision });
  }
  async function readAsset(relative) { const file = assetFile(relative); await ensureAssetDirectory(path.dirname(file)); ensure((await lstat(file)).isFile(), "Fichier manga invalide.", 403); return { content: await readFile(file), extension: path.extname(relative).toLowerCase() }; }
  async function productionBatch(id, payload, commit = false) {
    ensure(typeof payload?.catalogRevision === "string", "Actualisez le catalogue avant l’opération groupée.", 409);
    if (!commit) {
      const source = await readFile(catalogPath, "utf8");
      ensure(revision(source) === payload.catalogRevision, "Le catalogue Manga a changé. Actualisez.", 409);
      const catalog = parseMangaCatalog(source); validateMangaCatalog(catalog);
      try { return { plan: prepareMangaProductionBatch(findManga(catalog, id), payload, payload.catalogRevision) }; }
      catch (error) { throw new MangaAdminError(400, error.message); }
    }
    let plan;
    const result = await mutate("production-batch", id, catalog => {
      const manga = findManga(catalog, id);
      try { plan = prepareMangaProductionBatch(manga, payload, payload.catalogRevision); verifyProductionConfirmation(payload, plan); }
      catch (error) { throw new MangaAdminError(400, error.message); }
      return manga;
    }, { metadataOnly: true, expectedRevision: payload.catalogRevision });
    return { ...result, plan };
  }
  return { productionBatch, initialize, report, create, update, editProduction, addLanguage, deleteLanguage, addPages, duplicatePage, repairLanguageStorage, reorderPages, deletePage, replacePage, replaceMedia, replacePrimaryMedia, removeManga, reveal, readAsset, readCatalog, readPresentationSettings, updatePresentationSettings, validateFiles, paths: { catalogPath, presentationSettingsPath, assetRoot, backupRoot, trashRoot, stagingRoot } };
}
