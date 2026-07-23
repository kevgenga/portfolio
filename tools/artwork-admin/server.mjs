import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { inspectImage, normalizeCompression, processImage } from "./image-processor.mjs";
import { runReplacementTransaction } from "./artwork-replacement.mjs";
import { runOptimizationTransaction } from "./artwork-optimization.mjs";
import { buildRevealCommand, isPathInside, launchReveal, resolveArtworkFile } from "./reveal-file.mjs";
import { CATEGORY_VALUES, createCategoryReport, normalizeCategorySelection } from "./public/category-utils.js";
import { createMangaService } from "./manga/service.mjs";
import { handleMangaRoute } from "./manga/routes.mjs";
import { createAnimationService } from "./animation/service.mjs";
import { handleAnimationRoute } from "./animation/routes.mjs";

const ADMIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(process.env.ARTWORK_ADMIN_TEST_ROOT || path.resolve(ADMIN_DIR, "../.."));
const RUNTIME_DIR = path.resolve(process.env.ARTWORK_ADMIN_TEST_RUNTIME || ADMIN_DIR);
const CATALOG_PATH = path.join(PROJECT_ROOT, "src/content/artworks.js");
const PUBLIC_DIR = path.join(ADMIN_DIR, "public");
const BACKUP_DIR = path.join(RUNTIME_DIR, "backups");
const TRASH_DIR = path.join(RUNTIME_DIR, "trash");
const STAGING_DIR = path.join(RUNTIME_DIR, "staging");
const ASSET_ROOT = path.join(PROJECT_ROOT, "public/assets/illustration");
const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.ARTWORK_ADMIN_PORT || "4174", 10);
const MAX_FILE_BYTES = Number.parseInt(process.env.ARTWORK_ADMIN_MAX_FILE_MB || "100", 10) * 1024 * 1024;
const MAX_BATCH_FILES = Number.parseInt(process.env.ARTWORK_ADMIN_MAX_BATCH || "100", 10);
const MAX_ANIMATION_FILE_BYTES = Number.parseInt(process.env.ANIMATION_ADMIN_MAX_FILE_MB || "300", 10) * 1024 * 1024;
const MAX_REQUEST_BYTES = Math.ceil(Math.max(MAX_FILE_BYTES, MAX_ANIMATION_FILE_BYTES) * 4 / 3) + 2 * 1024 * 1024;
const MAX_BACKUPS = 20;
const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const CATEGORIES = Object.freeze(Object.fromEntries(CATEGORY_VALUES.map((category) => [category, category])));
const mangaService = createMangaService({
  projectRoot: PROJECT_ROOT,
  runtimeRoot: RUNTIME_DIR,
  disableReveal: process.env.ARTWORK_ADMIN_DISABLE_REVEAL === "1",
  failurePoint: process.env.MANGA_ADMIN_TEST_FAIL_AT || "",
});
const animationService = createAnimationService({
  projectRoot: PROJECT_ROOT,
  runtimeRoot: RUNTIME_DIR,
  disableReveal: process.env.ARTWORK_ADMIN_DISABLE_REVEAL === "1",
  failurePoint: process.env.ANIMATION_ADMIN_TEST_FAIL_AT || "",
  maxMediaBytes: MAX_ANIMATION_FILE_BYTES,
});

let mutationQueue = Promise.resolve();
const hashCache = new Map();
const importSessions = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function assert(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assetPathToFile(assetPath) {
  assert(typeof assetPath === "string" && assetPath.startsWith("assets/illustration/"), "Chemin d’image invalide.");
  const target = path.resolve(PROJECT_ROOT, "public", ...assetPath.split("/"));
  assert(isInside(ASSET_ROOT, target), "Le chemin d’image sort du dossier Illustration.");
  return target;
}

async function addFileSizes(artworks) {
  return Promise.all(artworks.map(async (artwork) => {
    try {
      const fileStats = await stat(assetPathToFile(artwork.image));
      return { ...artwork, sizeBytes: fileStats.isFile() ? fileStats.size : null };
    } catch {
      return { ...artwork, sizeBytes: null };
    }
  }));
}

function parseCatalog(source) {
  const match = source.match(/export\s+const\s+artworks\s*=\s*(\[[\s\S]*\]);\s*$/);
  assert(match, "Impossible de lire le tableau artworks.", 500);
  const expression = match[1].replace(/assetPath\(("(?:[^"\\]|\\.)*")\)/g, "$1");
  let entries;
  try {
    entries = vm.runInNewContext(`(${expression})`, Object.create(null), { timeout: 1000 });
  } catch (error) {
    throw new HttpError(500, `Le catalogue est invalide : ${error.message}`);
  }
  assert(Array.isArray(entries), "Le catalogue artworks n’est pas un tableau.", 500);
  return entries.map((entry) => ({ ...entry, category: [...entry.category] }));
}

async function readCatalog() {
  return parseCatalog(await readFile(CATALOG_PATH, "utf8"));
}

function quote(value) {
  return JSON.stringify(String(value));
}

function serializeCatalog(entries) {
  const items = entries.map((entry) => `  {
    id: ${quote(entry.id)},
    title: ${quote(entry.title)},
    image: assetPath(${quote(entry.image)}),
    thumbnail: ${quote(entry.thumbnail)},
    category: [${entry.category.map(quote).join(", ")}],
    date: ${quote(entry.date)},
    year: ${entry.year},
    alt: ${quote(entry.alt)},
    featured: ${Boolean(entry.featured)},
    orientation: ${quote(entry.orientation)},
  }`).join(",\n");
  return `import { assetPath } from "../utils/assetPath";\n\nexport const artworks = [\n${items},\n];\n\n`;
}

function validateDate(value) {
  assert(typeof value === "string" && /^\d{2}-\d{2}-\d{4}$/.test(value), "La date doit respecter DD-MM-YYYY.");
  const [day, month, year] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  assert(
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day,
    "La date n’existe pas.",
  );
  return year;
}

function validateCategory(value) {
  assert(typeof value === "string" && Object.hasOwn(CATEGORIES, value), "Catégorie inconnue.");
  return value;
}

function validateCategories(values) {
  try {
    return normalizeCategorySelection(values);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

function normalizeBaseName(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 100);
  assert(normalized && normalized !== "." && normalized !== "..", "Nom de fichier invalide.");
  return normalized;
}

function normalizeFileName(originalName, preferredBase = "") {
  assert(typeof originalName === "string", "Nom de fichier manquant.");
  const originalBase = path.basename(originalName);
  assert(originalBase === originalName && !originalName.includes("\0"), "Nom de fichier dangereux.");
  const extension = path.extname(originalBase).toLowerCase();
  assert(EXTENSIONS.has(extension), "Format non accepté. Utilisez JPG, JPEG, PNG, WEBP, AVIF ou GIF.");
  const sourceBase = preferredBase ? path.parse(path.basename(preferredBase)).name : path.parse(originalBase).name;
  return `${normalizeBaseName(sourceBase)}${extension}`;
}

function humanizeFileName(fileName) {
  return path.parse(fileName).name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueId(base, entries, ignoredId = null) {
  const used = new Set(entries.filter((entry) => entry.id !== ignoredId).map((entry) => entry.id));
  let candidate = normalizeBaseName(base).toLowerCase();
  let suffix = 2;
  while (used.has(candidate)) candidate = `${normalizeBaseName(base).toLowerCase()}-${suffix++}`;
  return candidate;
}

function validateEntries(entries) {
  const ids = new Set();
  const images = new Set();
  for (const entry of entries) {
    assert(typeof entry.id === "string" && entry.id, "Une œuvre possède un ID vide.");
    assert(!ids.has(entry.id), `ID dupliqué : ${entry.id}`);
    ids.add(entry.id);
    assert(typeof entry.image === "string" && entry.image, `Chemin manquant pour ${entry.id}.`);
    assert(!images.has(entry.image.toLowerCase()), `Chemin dupliqué : ${entry.image}`);
    images.add(entry.image.toLowerCase());
    assetPathToFile(entry.image);
    validateCategories(entry.category);
    const year = validateDate(entry.date);
    assert(entry.year === year, `Année incohérente pour ${entry.id}.`);
    assert(typeof entry.alt === "string", `Alt invalide pour ${entry.id}.`);
  }
}

function detectImage(buffer, extension) {
  const ascii = buffer.subarray(0, 32).toString("ascii");
  const hex = buffer.subarray(0, 12).toString("hex");
  const detected =
    (hex.startsWith("ffd8ff") && [".jpg", ".jpeg"].includes(extension)) ||
    (hex.startsWith("89504e470d0a1a0a") && extension === ".png") ||
    ((ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) && extension === ".gif") ||
    (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP" && extension === ".webp") ||
    (ascii.slice(4, 12) === "ftypavif" && extension === ".avif");
  assert(detected, "Le contenu du fichier ne correspond pas à une image acceptée.");
}

async function fileHash(filePath) {
  const info = await stat(filePath);
  const cached = hashCache.get(filePath);
  const signature = `${info.size}:${info.mtimeMs}`;
  if (cached?.signature === signature) return cached.hash;
  const hash = createHash("sha256").update(await readFile(filePath)).digest("hex");
  hashCache.set(filePath, { signature, hash });
  return hash;
}

async function rejectDuplicateContent(buffer, entries) {
  const incoming = createHash("sha256").update(buffer).digest("hex");
  for (const entry of entries) {
    const filePath = assetPathToFile(entry.image);
    try {
      if (await fileHash(filePath) === incoming) {
        throw new HttpError(409, `Cette image existe déjà : ${entry.image}`);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function checkedCompression(value) {
  try {
    return normalizeCompression(value);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

function getImportSession(id) {
  const session = importSessions.get(id);
  assert(session, "Session d’import introuvable ou expirée.", 404);
  return session;
}

function publicStagedFile(session, staged) {
  return {
    token: staged.token,
    originalName: staged.originalName,
    suggestedName: staged.suggestedName,
    extension: staged.extension,
    size: staged.size,
    width: staged.width,
    height: staged.height,
    animated: staged.animated,
    lastModified: staged.lastModified,
    previewUrl: `/api/import/sessions/${session.id}/files/${staged.token}/image`,
  };
}

function uniqueSuggestedName(fileName, entries, session, physicalNames = []) {
  const extension = path.extname(fileName).toLowerCase();
  const base = path.parse(fileName).name;
  const used = new Set([
    ...entries.map((entry) => path.basename(entry.image).toLowerCase()),
    ...physicalNames.map((name) => name.toLowerCase()),
    ...[...session.files.values()].map((item) => item.suggestedName.toLowerCase()),
  ]);
  let candidate = `${base}${extension}`;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base}-${suffix++}${extension}`;
  return candidate;
}

async function listPhysicalAssets() {
  const assets = [];
  for (const category of Object.keys(CATEGORIES)) {
    const directory = path.join(ASSET_ROOT, CATEGORIES[category]);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        assets.push({
          name: entry.name,
          assetPath: `assets/illustration/${category}/${entry.name}`,
          filePath: path.join(directory, entry.name),
        });
      }
    }
  }
  return assets;
}

function outputExtension(staged, compression) {
  if (!compression.enabled || (staged.animated && staged.extension === ".gif") || compression.format === "original") {
    return staged.extension;
  }
  return compression.format === "jpeg" ? ".jpg" : `.${compression.format}`;
}

function availableDestinationName(category, requestedName, extension, usedPaths) {
  const base = normalizeBaseName(path.parse(path.basename(requestedName)).name);
  let candidate = `${base}${extension}`;
  let suffix = 2;
  let assetPath = `assets/illustration/${category}/${candidate}`;
  while (usedPaths.has(assetPath.toLowerCase())) {
    candidate = `${base}-${suffix++}${extension}`;
    assetPath = `assets/illustration/${category}/${candidate}`;
  }
  usedPaths.add(assetPath.toLowerCase());
  return { fileName: candidate, assetPath };
}

async function createImportSession() {
  assert(Number.isInteger(MAX_BATCH_FILES) && MAX_BATCH_FILES > 0, "Limite de lot invalide.", 500);
  const id = randomUUID();
  const directory = path.join(STAGING_DIR, id);
  assert(isInside(STAGING_DIR, directory), "Dossier temporaire invalide.", 500);
  await mkdir(directory, { recursive: true });
  const session = {
    id,
    directory,
    files: new Map(),
    status: { phase: "ready", current: 0, total: 0, message: "Session prête." },
  };
  importSessions.set(id, session);
  return session;
}

async function stageImportFile(session, payload) {
  assert(session.files.size < MAX_BATCH_FILES, `Un lot ne peut pas dépasser ${MAX_BATCH_FILES} images.`, 413);
  assert(typeof payload.dataBase64 === "string" && payload.dataBase64, "Image manquante.");
  const fileName = normalizeFileName(payload.fileName);
  const extension = path.extname(fileName).toLowerCase();
  const buffer = Buffer.from(payload.dataBase64, "base64");
  assert(buffer.length > 0, "Le fichier est vide.");
  assert(buffer.length <= MAX_FILE_BYTES, `Ce fichier dépasse la limite de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} Mo.`, 413);
  detectImage(buffer, extension);

  const hash = createHash("sha256").update(buffer).digest("hex");
  const duplicateInQueue = [...session.files.values()].find((item) => item.hash === hash);
  assert(!duplicateInQueue, `Cette image est déjà dans la file : ${duplicateInQueue?.originalName}`, 409);
  const entries = await readCatalog();
  await rejectDuplicateContent(buffer, entries);
  const physicalAssets = await listPhysicalAssets();
  for (const asset of physicalAssets) {
    if (await fileHash(asset.filePath) === hash) {
      throw new HttpError(409, `Cette image existe déjà dans les assets : ${asset.assetPath}`);
    }
  }

  const token = randomUUID();
  const temporaryPath = path.join(session.directory, `${token}${extension}`);
  assert(isInside(session.directory, temporaryPath), "Chemin temporaire invalide.");
  await writeFileExclusive(temporaryPath, buffer);
  try {
    const metadata = await inspectImage(temporaryPath);
    const staged = {
      token,
      temporaryPath,
      originalName: path.basename(payload.fileName),
      suggestedName: uniqueSuggestedName(fileName, entries, session, physicalAssets.map((asset) => asset.name)),
      extension,
      size: buffer.length,
      hash,
      width: metadata.width,
      height: metadata.height,
      animated: metadata.animated,
      lastModified: Number(payload.lastModified) || null,
    };
    session.files.set(token, staged);
    session.status = { phase: "ready", current: session.files.size, total: session.files.size, message: "Fichiers prêts." };
    return publicStagedFile(session, staged);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw new HttpError(400, `Image illisible : ${error.message}`);
  }
}

async function removeStagedFile(session, token) {
  const staged = session.files.get(token);
  assert(staged, "Fichier temporaire introuvable.", 404);
  await rm(staged.temporaryPath, { force: true });
  session.files.delete(token);
}

async function discardImportSession(session) {
  await rm(session.directory, { recursive: true, force: true });
  importSessions.delete(session.id);
}

async function estimateImport(session, payload) {
  assert(Array.isArray(payload.items) && payload.items.length > 0, "Aucune image à analyser.");
  const results = [];
  session.status = { phase: "estimating", current: 0, total: payload.items.length, message: "Analyse de la compression…" };
  for (const [index, item] of payload.items.entries()) {
    const staged = session.files.get(item.token);
    assert(staged, "Un fichier de la file est introuvable.", 404);
    const compression = checkedCompression(item.compression);
    let processed;
    try {
      processed = await processImage(staged.temporaryPath, staged.originalName, compression);
    } catch (error) {
      session.status = { phase: "error", current: index, total: payload.items.length, message: error.message };
      throw new HttpError(422, `${staged.originalName} : ${error.message}`);
    }
    results.push({
      token: item.token,
      originalSize: processed.originalSize,
      outputSize: processed.outputSize,
      originalWidth: processed.originalWidth,
      originalHeight: processed.originalHeight,
      outputWidth: processed.outputWidth,
      outputHeight: processed.outputHeight,
      savedPercent: processed.originalSize ? Math.round((1 - processed.outputSize / processed.originalSize) * 100) : 0,
      warning: processed.warning,
    });
    session.status = { phase: "estimating", current: index + 1, total: payload.items.length, message: `Analyse ${index + 1} / ${payload.items.length}` };
  }
  session.status = { phase: "ready", current: results.length, total: results.length, message: "Analyse terminée." };
  return results;
}

async function commitImport(session, payload) {
  assert(Array.isArray(payload.items) && payload.items.length > 0, "La file d’import est vide.");
  assert(payload.items.length <= MAX_BATCH_FILES, `Un lot ne peut pas dépasser ${MAX_BATCH_FILES} images.`);
  const entries = await readCatalog();
  const usedPaths = new Set(entries.map((entry) => entry.image.toLowerCase()));
  const physicalAssets = await listPhysicalAssets();
  for (const asset of physicalAssets) usedPaths.add(asset.assetPath.toLowerCase());
  const prepared = payload.items.map((item) => {
    const staged = session.files.get(item.token);
    assert(staged, "Un fichier de la file est introuvable.", 404);
    const categories = validateCategories(item.categories || [item.category]);
    const category = categories[0];
    const year = validateDate(item.date);
    const compression = checkedCompression(item.compression);
    const extension = outputExtension(staged, compression);
    const destination = availableDestinationName(category, item.finalName || staged.suggestedName, extension, usedPaths);
    return { item, staged, category, categories, year, compression, ...destination };
  });

  const backup = await createBackup();
  const createdFiles = [];
  const nextEntries = [...entries];
  const results = [];
  session.status = { phase: "processing", current: 0, total: prepared.length, message: `Traitement 0 / ${prepared.length}` };

  try {
    for (const [index, preparedItem] of prepared.entries()) {
      let processed;
      try {
        processed = await processImage(
          preparedItem.staged.temporaryPath,
          preparedItem.staged.originalName,
          preparedItem.compression,
        );
      } catch (error) {
        throw new HttpError(422, `${preparedItem.staged.originalName} : ${error.message}`);
      }
      assert(processed.extension === path.extname(preparedItem.fileName).toLowerCase(), "Extension de sortie incohérente.", 500);
      const destinationFile = path.join(ASSET_ROOT, CATEGORIES[preparedItem.category], preparedItem.fileName);
      assert(isInside(path.join(ASSET_ROOT, CATEGORIES[preparedItem.category]), destinationFile), "Destination invalide.");
      await writeFileExclusive(destinationFile, processed.buffer);
      createdFiles.push(destinationFile);

      const id = uniqueId(path.parse(preparedItem.fileName).name, nextEntries);
      const entry = {
        id,
        title: "",
        image: preparedItem.assetPath,
        thumbnail: "",
        category: preparedItem.categories,
        date: preparedItem.item.date,
        year: preparedItem.year,
        alt: String(preparedItem.item.alt || "").trim() || humanizeFileName(preparedItem.fileName),
        featured: false,
        orientation: "",
      };
      nextEntries.push(entry);
      results.push({
        entry,
        originalName: preparedItem.staged.originalName,
        outputSize: processed.outputSize,
        originalSize: processed.originalSize,
        outputWidth: processed.outputWidth,
        outputHeight: processed.outputHeight,
        warning: processed.warning,
      });

      session.status = {
        phase: "processing",
        current: index + 1,
        total: prepared.length,
        message: `Traitement ${index + 1} / ${prepared.length}`,
      };
      const failAt = Number.parseInt(process.env.ARTWORK_ADMIN_TEST_FAIL_AT || "0", 10);
      if (failAt === index + 1) throw new Error("Échec de test simulé après copie.");
    }

    session.status = { phase: "writing", current: prepared.length, total: prepared.length, message: "Écriture atomique du catalogue…" };
    await writeCatalogAtomic(nextEntries);
  } catch (error) {
    await Promise.all(createdFiles.map((file) => rm(file, { force: true })));
    session.status = { phase: "error", current: createdFiles.length, total: prepared.length, message: error.message };
    throw error;
  }

  for (const file of createdFiles) hashCache.delete(file);
  session.status = { phase: "done", current: prepared.length, total: prepared.length, message: "Import terminé." };
  await rm(session.directory, { recursive: true, force: true }).catch(() => undefined);
  session.files.clear();
  const cleanupTimer = setTimeout(() => importSessions.delete(session.id), 5 * 60 * 1000);
  cleanupTimer.unref();
  return {
    count: results.length,
    results,
    backup: path.relative(PROJECT_ROOT, backup).replaceAll("\\", "/"),
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function createBackup() {
  await mkdir(BACKUP_DIR, { recursive: true });
  const destination = path.join(BACKUP_DIR, `artworks-${timestamp()}.js`);
  await copyFile(CATALOG_PATH, destination);
  const backups = (await readdir(BACKUP_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^artworks-.+\.js$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(backups.slice(MAX_BACKUPS).map((name) => rm(path.join(BACKUP_DIR, name))));
  return destination;
}

async function writeCatalogSourceAtomic(source) {
  const tempPath = `${CATALOG_PATH}.${process.pid}.${Date.now()}.tmp.js`;
  await writeFile(tempPath, source, { encoding: "utf8", flag: "wx" });
  try {
    const check = spawnSync(process.execPath, ["--check", tempPath], { encoding: "utf8" });
    assert(check.status === 0, `JavaScript généré invalide : ${check.stderr}`, 500);
    validateEntries(parseCatalog(source));
    await rename(tempPath, CATALOG_PATH);
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function writeCatalogAtomic(entries) {
  validateEntries(entries);
  await writeCatalogSourceAtomic(serializeCatalog(entries));
}

async function restoreCatalogBackup(backupPath) {
  await writeCatalogSourceAtomic(await readFile(backupPath, "utf8"));
}

async function writeFileExclusive(filePath, buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(buffer);
  } finally {
    await handle.close();
  }
}

async function addArtwork(payload) {
  const entries = await readCatalog();
  const category = validateCategory(payload.category);
  const year = validateDate(payload.date);
  const fileName = normalizeFileName(payload.fileName, payload.internalName);
  assert(typeof payload.dataBase64 === "string" && payload.dataBase64, "Image manquante.");
  const buffer = Buffer.from(payload.dataBase64, "base64");
  assert(buffer.length > 0 && buffer.length <= MAX_FILE_BYTES, "Taille d’image invalide.");
  detectImage(buffer, path.extname(fileName));
  await rejectDuplicateContent(buffer, entries);
  const destination = path.join(ASSET_ROOT, CATEGORIES[category], fileName);
  assert(isInside(path.join(ASSET_ROOT, CATEGORIES[category]), destination), "Destination invalide.");
  assert(!entries.some((entry) => entry.image.toLowerCase() === `assets/illustration/${category}/${fileName}`.toLowerCase()), "Ce chemin existe déjà.", 409);
  const id = uniqueId(path.parse(fileName).name, entries);
  const entry = {
    id,
    title: "",
    image: `assets/illustration/${category}/${fileName}`,
    thumbnail: "",
    category: [category],
    date: payload.date,
    year,
    alt: String(payload.alt || "").trim() || humanizeFileName(fileName),
    featured: false,
    orientation: "",
  };
  validateEntries([...entries, entry]);
  await createBackup();
  await writeFileExclusive(destination, buffer);
  try {
    await writeCatalogAtomic([...entries, entry]);
    hashCache.delete(destination);
    return entry;
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}

async function updateArtwork(id, payload) {
  const entries = await readCatalog();
  const index = entries.findIndex((entry) => entry.id === id);
  assert(index >= 0, "Œuvre introuvable.", 404);
  const current = entries[index];
  const categories = validateCategories(payload.categories || [payload.category || payload.primaryCategory]);
  const primaryCategory = categories[0];
  const year = validateDate(payload.date);
  const oldFile = assetPathToFile(current.image);
  const oldName = path.basename(oldFile);
  const requestedName = payload.fileName || oldName;
  const extension = path.extname(requestedName).toLowerCase();
  assert(extension === path.extname(oldName).toLowerCase(), "La modification de l’extension n’est pas autorisée.");
  const newName = normalizeFileName(requestedName);
  const newFile = path.join(ASSET_ROOT, CATEGORIES[primaryCategory], newName);
  assert(isInside(path.join(ASSET_ROOT, CATEGORIES[primaryCategory]), newFile), "Destination invalide.");
  const image = `assets/illustration/${primaryCategory}/${newName}`;
  const moved = path.resolve(oldFile) !== path.resolve(newFile);
  if (moved) {
    assert(!entries.some((entry, entryIndex) => entryIndex !== index && entry.image.toLowerCase() === image.toLowerCase()), "Ce chemin existe déjà.", 409);
    try {
      await stat(newFile);
      throw new HttpError(409, "Un fichier porte déjà ce nom dans la catégorie cible.");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error.code !== "ENOENT") throw error;
    }
  }
  const renamed = path.parse(newName).name !== path.parse(oldName).name;
  const nextEntry = {
    ...current,
    id: renamed ? uniqueId(path.parse(newName).name, entries, id) : id,
    image,
    thumbnail: current.thumbnail === current.image ? image : current.thumbnail,
    category: categories,
    date: payload.date,
    year,
    alt: String(payload.alt ?? "").trim(),
  };
  const nextEntries = [...entries];
  nextEntries[index] = nextEntry;
  validateEntries(nextEntries);
  await createBackup();
  if (moved) {
    await mkdir(path.dirname(newFile), { recursive: true });
    await rename(oldFile, newFile);
  }
  try {
    await writeCatalogAtomic(nextEntries);
    hashCache.delete(oldFile);
    hashCache.delete(newFile);
    return nextEntry;
  } catch (error) {
    if (moved) await rename(newFile, oldFile);
    throw error;
  }
}

async function artworkFileDetails(id) {
  const entries = await readCatalog();
  const artwork = entries.find((entry) => entry.id === id);
  assert(artwork, "Œuvre introuvable.", 404);
  const filePath = assetPathToFile(artwork.image);
  const [fileStat, metadata] = await Promise.all([stat(filePath), inspectImage(filePath)]);
  const thumbnailStatus = !artwork.thumbnail
    ? "empty"
    : artwork.thumbnail === artwork.image
      ? "same"
      : "distinct";
  return {
    artwork,
    file: {
      name: path.basename(filePath),
      path: artwork.image,
      extension: path.extname(filePath).toLowerCase(),
      size: fileStat.size,
      width: metadata.width,
      height: metadata.height,
      animated: metadata.animated,
    },
    thumbnail: { status: thumbnailStatus, path: artwork.thumbnail },
  };
}

function optimizationWarnings(processed, compression) {
  const warnings = [];
  const savedPercent = processed.originalSize
    ? Math.round((1 - processed.outputSize / processed.originalSize) * 100)
    : 0;
  if (processed.outputSize > processed.originalSize) warnings.push("Le résultat est plus lourd que l’image actuelle.");
  else if (savedPercent < 5) warnings.push("Le gain estimé est négligeable.");
  if (compression.maxDimension
    && Math.max(processed.originalWidth, processed.originalHeight) <= compression.maxDimension) {
    warnings.push("L’image est déjà plus petite que la dimension maximale choisie ; elle ne sera pas agrandie.");
  }
  if (processed.hasAlpha && processed.outputFormat === "jpeg") {
    warnings.push("La conversion JPEG supprimera la transparence et la remplacera par un fond blanc.");
  }
  if (compression.quality < 70 && ["jpeg", "webp"].includes(processed.outputFormat)) {
    warnings.push("La qualité choisie est très faible et peut produire des artefacts visibles.");
  }
  if (processed.warning) warnings.push(processed.warning);
  return [...new Set(warnings)];
}

function optimizationResult(processed, compression) {
  return {
    originalFormat: processed.originalFormat,
    outputFormat: processed.outputFormat,
    originalSize: processed.originalSize,
    outputSize: processed.outputSize,
    originalWidth: processed.originalWidth,
    originalHeight: processed.originalHeight,
    outputWidth: processed.outputWidth,
    outputHeight: processed.outputHeight,
    savedBytes: processed.originalSize - processed.outputSize,
    savedPercent: processed.originalSize ? Math.round((1 - processed.outputSize / processed.originalSize) * 100) : 0,
    warnings: optimizationWarnings(processed, compression),
  };
}

async function estimateExistingArtworkOptimization(id, payload) {
  const details = await artworkFileDetails(id);
  assert(!details.file.animated, "L’optimisation d’un GIF animé est refusée afin de préserver son animation.", 422);
  const compression = checkedCompression({ ...payload.compression, enabled: true });
  try {
    const processed = await processImage(assetPathToFile(details.artwork.image), details.file.name, compression);
    return optimizationResult(processed, compression);
  } catch (error) {
    throw new HttpError(422, `${details.file.name} : ${error.message}`);
  }
}

async function optimizeExistingArtwork(id, payload) {
  const entries = await readCatalog();
  const index = entries.findIndex((entry) => entry.id === id);
  assert(index >= 0, "Œuvre introuvable.", 404);
  const current = entries[index];
  const currentFile = assetPathToFile(current.image);
  const currentDetails = await artworkFileDetails(id);
  assert(!currentDetails.file.animated, "L’optimisation d’un GIF animé est refusée afin de préserver son animation.", 422);
  const compression = checkedCompression({ ...payload.compression, enabled: true });
  const backup = await createBackup();
  const operationTimestamp = timestamp();
  const stagingFolder = path.join(STAGING_DIR, `${operationTimestamp}-${normalizeBaseName(current.id)}-optimization`);
  assert(isInside(STAGING_DIR, stagingFolder), "Chemin de staging invalide.", 500);
  await mkdir(stagingFolder, { recursive: true });
  const stagedSource = path.join(stagingFolder, `source${path.extname(currentFile).toLowerCase()}`);
  await copyFile(currentFile, stagedSource);

  try {
    const processed = await processImage(stagedSource, path.basename(currentFile), compression);
    const validatedOutput = await inspectImage(processed.buffer);
    assert(validatedOutput.width === processed.outputWidth && validatedOutput.height === processed.outputHeight,
      "Les dimensions du résultat optimisé sont incohérentes.", 500);

    const currentFolder = current.image.split("/")[2];
    validateCategory(currentFolder);
    const physicalAssets = await listPhysicalAssets();
    const usedPaths = new Set(entries
      .filter((_, entryIndex) => entryIndex !== index)
      .map((entry) => entry.image.toLowerCase()));
    for (const asset of physicalAssets) {
      if (path.resolve(asset.filePath) !== path.resolve(currentFile)) usedPaths.add(asset.assetPath.toLowerCase());
    }
    const destination = availableDestinationName(currentFolder, path.basename(currentFile), processed.extension, usedPaths);
    const newFile = path.join(ASSET_ROOT, currentFolder, destination.fileName);
    assert(isInside(path.join(ASSET_ROOT, currentFolder), newFile), "Destination optimisée invalide.");
    const catalogChanged = destination.assetPath !== current.image;
    const nextEntry = catalogChanged
      ? {
          ...current,
          image: destination.assetPath,
          thumbnail: current.thumbnail === current.image ? destination.assetPath : current.thumbnail,
        }
      : current;
    const nextEntries = [...entries];
    nextEntries[index] = nextEntry;
    validateEntries(nextEntries);

    const trashFolder = path.join(TRASH_DIR, `${operationTimestamp}-${normalizeBaseName(current.id)}-optimization`);
    const trashFile = path.join(trashFolder, path.basename(currentFile));
    const manifestFile = path.join(trashFolder, "optimization.json");
    assert(isInside(TRASH_DIR, trashFile) && isInside(TRASH_DIR, manifestFile), "Chemin de corbeille invalide.");
    const manifest = {
      type: "optimize-existing-artwork",
      id: current.id,
      oldFile: current.image,
      newFile: destination.assetPath,
      oldFormat: currentDetails.file.extension.replace(".", ""),
      newFormat: processed.outputFormat,
      oldSize: processed.originalSize,
      newSize: processed.outputSize,
      oldDimensions: { width: processed.originalWidth, height: processed.originalHeight },
      newDimensions: { width: processed.outputWidth, height: processed.outputHeight },
      date: new Date().toISOString(),
    };

    try {
      await runOptimizationTransaction({
        oldFile: currentFile,
        newFile,
        newBuffer: processed.buffer,
        trashFile,
        manifestFile,
        manifest,
        nextEntries,
        catalogChanged,
        backupPath: backup,
        writeCatalog: writeCatalogAtomic,
        restoreCatalog: restoreCatalogBackup,
        failurePoint: process.env.ARTWORK_ADMIN_TEST_OPTIMIZE_FAIL_AT || "",
      });
    } catch (error) {
      await rm(trashFolder, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }

    hashCache.delete(currentFile);
    hashCache.delete(newFile);
    return {
      artwork: nextEntry,
      backup: path.relative(PROJECT_ROOT, backup).replaceAll("\\", "/"),
      trashPath: path.relative(PROJECT_ROOT, trashFile).replaceAll("\\", "/"),
      manifest: path.relative(PROJECT_ROOT, manifestFile).replaceAll("\\", "/"),
      result: optimizationResult(processed, compression),
    };
  } finally {
    await rm(stagingFolder, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }).catch(() => undefined);
  }
}

async function revealArtworkFile(id) {
  assert(typeof id === "string" && id.trim(), "Identifiant d’œuvre invalide.");
  const entries = await readCatalog();
  const artwork = entries.find((entry) => entry.id === id);
  assert(artwork, "Œuvre introuvable.", 404);

  let candidate;
  try {
    candidate = resolveArtworkFile(PROJECT_ROOT, artwork.image);
  } catch (error) {
    throw new HttpError(403, error.message);
  }

  let actualPath;
  try {
    actualPath = await realpath(candidate);
    const fileStat = await stat(actualPath);
    assert(fileStat.isFile(), "Le chemin de l’œuvre ne désigne pas un fichier.", 404);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code === "ENOENT") throw new HttpError(404, "Le fichier de l’œuvre est introuvable.");
    throw error;
  }
  assert(isPathInside(PROJECT_ROOT, actualPath) && isPathInside(ASSET_ROOT, actualPath), "Le fichier de l’œuvre sort du projet.", 403);

  try {
    const command = buildRevealCommand(actualPath);
    console.log([
      "[reveal-file]",
      `artworkId: ${artwork.id}`,
      `relative: ${artwork.image}`,
      `absolute: ${actualPath}`,
      "exists: true",
      `platform: ${process.platform}`,
      `command: ${command.command}`,
      `arguments: ${JSON.stringify(command.args)}`,
    ].join("\n"));
    if (process.env.ARTWORK_ADMIN_DISABLE_REVEAL === "1") {
      return { ...command, filePath: actualPath, simulated: true };
    }
    return await launchReveal(actualPath);
  } catch (error) {
    console.error("Impossible d’ouvrir le gestionnaire de fichiers :", error);
    throw new HttpError(500, "Impossible d’ouvrir le fichier dans le gestionnaire de fichiers.");
  }
}

async function createReplacementSession(artworkId) {
  const details = await artworkFileDetails(artworkId);
  const session = await createImportSession();
  session.kind = "replacement";
  session.artworkId = artworkId;
  return { session, details };
}

async function stageReplacementFile(session, payload) {
  assert(session.kind === "replacement", "Cette session n’est pas une session de remplacement.");
  assert(typeof payload.dataBase64 === "string" && payload.dataBase64, "Image manquante.");
  const normalizedName = normalizeFileName(payload.fileName);
  const extension = path.extname(normalizedName).toLowerCase();
  const buffer = Buffer.from(payload.dataBase64, "base64");
  assert(buffer.length > 0, "Le fichier est vide.");
  assert(buffer.length <= MAX_FILE_BYTES, `Ce fichier dépasse la limite de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} Mo.`, 413);
  detectImage(buffer, extension);

  const entries = await readCatalog();
  const current = entries.find((entry) => entry.id === session.artworkId);
  assert(current, "Œuvre introuvable.", 404);
  const incomingHash = createHash("sha256").update(buffer).digest("hex");
  const currentFile = assetPathToFile(current.image);
  if (await fileHash(currentFile) === incomingHash) {
    return { identicalCurrent: true, message: "Cette image est identique à l’image actuelle." };
  }
  for (const entry of entries) {
    if (entry.id === current.id) continue;
    try {
      if (await fileHash(assetPathToFile(entry.image)) === incomingHash) {
        throw new HttpError(409, `Cette image est déjà utilisée par l’œuvre « ${entry.id} » (${entry.image}).`);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error.code !== "ENOENT") throw error;
    }
  }
  const physicalAssets = await listPhysicalAssets();
  for (const asset of physicalAssets) {
    if (path.resolve(asset.filePath) === path.resolve(currentFile)) continue;
    if (await fileHash(asset.filePath) === incomingHash) {
      throw new HttpError(409, `Cette image existe déjà dans les assets : ${asset.assetPath}`);
    }
  }

  for (const staged of session.files.values()) await rm(staged.temporaryPath, { force: true });
  session.files.clear();
  const token = randomUUID();
  const temporaryPath = path.join(session.directory, `${token}${extension}`);
  assert(isInside(session.directory, temporaryPath), "Chemin temporaire invalide.");
  await writeFileExclusive(temporaryPath, buffer);
  try {
    const metadata = await inspectImage(temporaryPath);
    const otherEntries = entries.filter((entry) => entry.id !== current.id);
    const otherPhysicalNames = physicalAssets
      .filter((asset) => path.resolve(asset.filePath) !== path.resolve(currentFile))
      .map((asset) => asset.name);
    const staged = {
      token,
      temporaryPath,
      originalName: path.basename(payload.fileName),
      suggestedName: uniqueSuggestedName(normalizedName, otherEntries, session, otherPhysicalNames),
      extension,
      size: buffer.length,
      hash: incomingHash,
      width: metadata.width,
      height: metadata.height,
      animated: metadata.animated,
      lastModified: Number(payload.lastModified) || null,
    };
    session.files.set(token, staged);
    return { identicalCurrent: false, file: publicStagedFile(session, staged) };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw new HttpError(400, `Image illisible : ${error.message}`);
  }
}

async function estimateReplacement(session, payload) {
  assert(session.kind === "replacement", "Cette session n’est pas une session de remplacement.");
  const staged = session.files.get(payload.token);
  assert(staged, "Nouvelle image introuvable.", 404);
  const compression = checkedCompression(payload.compression);
  try {
    const processed = await processImage(staged.temporaryPath, staged.originalName, compression);
    const result = optimizationResult(processed, compression);
    return {
      token: staged.token,
      ...result,
      warning: result.warnings.join(" "),
    };
  } catch (error) {
    throw new HttpError(422, `${staged.originalName} : ${error.message}`);
  }
}

async function commitReplacement(session, payload) {
  assert(session.kind === "replacement", "Cette session n’est pas une session de remplacement.");
  const entries = await readCatalog();
  const index = entries.findIndex((entry) => entry.id === session.artworkId);
  assert(index >= 0, "Œuvre introuvable.", 404);
  const current = entries[index];
  const staged = session.files.get(payload.token);
  assert(staged, "Nouvelle image introuvable.", 404);
  const categories = validateCategories(payload.categories);
  const primaryCategory = categories[0];
  const year = validateDate(payload.date);
  const compression = checkedCompression(payload.compression);
  const extension = outputExtension(staged, compression);
  const nameMode = ["current", "new", "custom"].includes(payload.nameMode) ? payload.nameMode : "current";
  const requestedName = nameMode === "current"
    ? path.basename(current.image)
    : nameMode === "new"
      ? staged.originalName
      : payload.customName;
  assert(typeof requestedName === "string" && requestedName.trim(), "Le nom personnalisé est vide.");

  const currentFile = assetPathToFile(current.image);
  const physicalAssets = await listPhysicalAssets();
  const usedPaths = new Set(entries.filter((_, entryIndex) => entryIndex !== index).map((entry) => entry.image.toLowerCase()));
  for (const asset of physicalAssets) {
    if (path.resolve(asset.filePath) !== path.resolve(currentFile)) usedPaths.add(asset.assetPath.toLowerCase());
  }
  const destination = availableDestinationName(primaryCategory, requestedName, extension, usedPaths);
  const newFile = path.join(ASSET_ROOT, primaryCategory, destination.fileName);
  assert(isInside(path.join(ASSET_ROOT, primaryCategory), newFile), "Destination finale invalide.");

  const backup = await createBackup();
  let processed;
  try {
    processed = await processImage(staged.temporaryPath, staged.originalName, compression);
  } catch (error) {
    await discardImportSession(session);
    throw new HttpError(422, `${staged.originalName} : ${error.message}`);
  }
  assert(processed.extension === extension, "Extension de remplacement incohérente.", 500);

  let thumbnail = current.thumbnail;
  if (current.thumbnail === current.image) thumbnail = destination.assetPath;
  else if (current.thumbnail && payload.thumbnailMode === "use-new") thumbnail = destination.assetPath;

  const nextEntry = {
    ...current,
    image: destination.assetPath,
    thumbnail,
    category: categories,
    date: payload.date,
    year,
    alt: String(payload.alt ?? "").trim(),
  };
  const nextEntries = [...entries];
  nextEntries[index] = nextEntry;
  validateEntries(nextEntries);

  const operationTimestamp = timestamp();
  const trashFolder = path.join(TRASH_DIR, `${operationTimestamp}-${normalizeBaseName(current.id)}-replacement`);
  const trashFile = path.join(trashFolder, path.basename(currentFile));
  const trashMetadataFile = path.join(trashFolder, "replacement.json");
  assert(isInside(TRASH_DIR, trashFile) && isInside(TRASH_DIR, trashMetadataFile), "Chemin de corbeille invalide.");
  const trashMetadata = {
    artworkId: current.id,
    oldPath: current.image,
    newPath: destination.assetPath,
    replacedAt: new Date().toISOString(),
    operation: "artwork-image-replacement",
  };

  try {
    await runReplacementTransaction({
      oldFile: currentFile,
      newFile,
      newBuffer: processed.buffer,
      trashFile,
      trashMetadataFile,
      trashMetadata,
      nextEntries,
      backupPath: backup,
      writeCatalog: writeCatalogAtomic,
      restoreCatalog: restoreCatalogBackup,
      failurePoint: process.env.ARTWORK_ADMIN_TEST_REPLACE_FAIL_AT || "",
    });
  } catch (error) {
    await rm(trashFolder, { recursive: true, force: true }).catch(() => undefined);
    await discardImportSession(session).catch(() => undefined);
    throw error;
  }

  hashCache.delete(currentFile);
  hashCache.delete(newFile);
  await discardImportSession(session).catch(() => undefined);
  return {
    artwork: nextEntry,
    backup: path.relative(PROJECT_ROOT, backup).replaceAll("\\", "/"),
    trashPath: path.relative(PROJECT_ROOT, trashFile).replaceAll("\\", "/"),
    processed: {
      originalSize: processed.originalSize,
      outputSize: processed.outputSize,
      outputWidth: processed.outputWidth,
      outputHeight: processed.outputHeight,
      warning: optimizationWarnings(processed, compression).join(" "),
    },
  };
}

async function deleteArtwork(id) {
  const entries = await readCatalog();
  const index = entries.findIndex((entry) => entry.id === id);
  assert(index >= 0, "Œuvre introuvable.", 404);
  const entry = entries[index];
  const source = assetPathToFile(entry.image);
  const trashFolder = path.join(TRASH_DIR, `${timestamp()}-${normalizeBaseName(id)}`);
  const destination = path.join(trashFolder, path.basename(source));
  assert(isInside(TRASH_DIR, destination), "Destination de corbeille invalide.");
  await createBackup();
  await mkdir(trashFolder, { recursive: true });
  await rename(source, destination);
  try {
    await writeCatalogAtomic(entries.filter((_, entryIndex) => entryIndex !== index));
    hashCache.delete(source);
    return { entry, trashPath: path.relative(PROJECT_ROOT, destination).replaceAll("\\", "/") };
  } catch (error) {
    await rename(destination, source);
    await rm(trashFolder, { recursive: true, force: true });
    throw error;
  }
}

function queueMutation(operation) {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.catch(() => undefined);
  return result;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    assert(size <= MAX_REQUEST_BYTES, "Requête trop volumineuse.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
}

function sendJson(response, status, body) {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(data);
}

function checkLocalRequest(request) {
  const host = request.headers.host || "";
  assert(host.startsWith(`${HOST}:`) || host === HOST || host.startsWith("localhost:"), "Accès local uniquement.", 403);
  const origin = request.headers.origin;
  if (origin) {
    const allowed = new Set([`http://${HOST}:${PORT}`, `http://localhost:${PORT}`]);
    assert(allowed.has(origin), "Origine refusée.", 403);
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

async function serveStatic(response, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(PUBLIC_DIR, relative);
  assert(target === PUBLIC_DIR || isInside(PUBLIC_DIR, target), "Fichier interdit.", 403);
  const content = await readFile(target);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
    "Content-Length": content.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(content);
}

async function cleanStagingDirectory() {
  await mkdir(STAGING_DIR, { recursive: true });
  const entries = await readdir(STAGING_DIR, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.name !== ".gitkeep")
    .map((entry) => rm(path.join(STAGING_DIR, entry.name), { recursive: entry.isDirectory(), force: true })));
}

async function handleRequest(request, response) {
  checkLocalRequest(request);
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (await handleMangaRoute(request, response, url, { service: mangaService, readJson, sendJson })) return;
  if (await handleAnimationRoute(request, response, url, { service: animationService, readJson, sendJson })) return;
  if (request.method === "GET" && url.pathname === "/api/artworks") {
    const catalogArtworks = await readCatalog();
    const categoryReport = createCategoryReport(catalogArtworks);
    const artworks = await addFileSizes(catalogArtworks);
    sendJson(response, 200, {
      artworks,
      categories: Object.keys(CATEGORIES),
      count: artworks.length,
      limits: { maxFileBytes: MAX_FILE_BYTES, maxBatchFiles: MAX_BATCH_FILES },
      categoryReport,
    });
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/image/")) {
    const encoded = url.pathname.slice("/api/image/".length);
    const file = assetPathToFile(decodeURIComponent(encoded));
    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/artworks") {
    const payload = await readJson(request);
    const artwork = await queueMutation(() => addArtwork(payload));
    sendJson(response, 201, { artwork, message: "Œuvre ajoutée et catalogue sauvegardé." });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/artworks/reveal-file") {
    const payload = await readJson(request);
    const result = await revealArtworkFile(payload.artworkId);
    sendJson(response, 200, {
      ok: true,
      mode: result.mode,
      message: result.mode === "opened-folder"
        ? "Dossier ouvert sans sélection automatique du fichier."
        : "Explorateur ouvert avec demande de sélection du fichier.",
      ...(result.warning ? { warning: result.warning } : {}),
      ...(result.simulated ? { simulation: result } : {}),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/import/sessions") {
    const session = await createImportSession();
    sendJson(response, 201, {
      id: session.id,
      limits: { maxFileBytes: MAX_FILE_BYTES, maxBatchFiles: MAX_BATCH_FILES },
    });
    return;
  }
  const artworkDetailsMatch = url.pathname.match(/^\/api\/artworks\/([^/]+)\/details$/);
  if (artworkDetailsMatch && request.method === "GET") {
    const details = await artworkFileDetails(decodeURIComponent(artworkDetailsMatch[1]));
    sendJson(response, 200, details);
    return;
  }
  const artworkOptimizationMatch = url.pathname.match(/^\/api\/artworks\/([^/]+)\/optimize(?:\/(estimate))?$/);
  if (artworkOptimizationMatch && request.method === "POST") {
    const id = decodeURIComponent(artworkOptimizationMatch[1]);
    const payload = await readJson(request);
    if (artworkOptimizationMatch[2] === "estimate") {
      const result = await estimateExistingArtworkOptimization(id, payload);
      sendJson(response, 200, { result });
    } else {
      const result = await queueMutation(() => optimizeExistingArtwork(id, payload));
      sendJson(response, 200, { ...result, message: "Image actuelle optimisée avec succès." });
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/replacements/sessions") {
    const payload = await readJson(request);
    const { session, details } = await createReplacementSession(payload.artworkId);
    sendJson(response, 201, { id: session.id, details, limits: { maxFileBytes: MAX_FILE_BYTES } });
    return;
  }
  const replacementFileMatch = url.pathname.match(/^\/api\/replacements\/sessions\/([^/]+)\/file$/);
  if (replacementFileMatch && request.method === "POST") {
    const session = getImportSession(decodeURIComponent(replacementFileMatch[1]));
    const result = await stageReplacementFile(session, await readJson(request));
    sendJson(response, 201, result);
    return;
  }
  const replacementActionMatch = url.pathname.match(/^\/api\/replacements\/sessions\/([^/]+)\/(estimate|commit)$/);
  if (replacementActionMatch && request.method === "POST") {
    const session = getImportSession(decodeURIComponent(replacementActionMatch[1]));
    const payload = await readJson(request);
    if (replacementActionMatch[2] === "estimate") {
      const result = await estimateReplacement(session, payload);
      sendJson(response, 200, { result });
    } else {
      const result = await queueMutation(() => commitReplacement(session, payload));
      sendJson(response, 200, { ...result, message: "Image et métadonnées remplacées avec succès." });
    }
    return;
  }
  const importFileImageMatch = url.pathname.match(/^\/api\/import\/sessions\/([^/]+)\/files\/([^/]+)\/image$/);
  if (importFileImageMatch && request.method === "GET") {
    const session = getImportSession(decodeURIComponent(importFileImageMatch[1]));
    const staged = session.files.get(decodeURIComponent(importFileImageMatch[2]));
    assert(staged, "Fichier temporaire introuvable.", 404);
    const content = await readFile(staged.temporaryPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[staged.extension] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
    return;
  }
  const importFileMatch = url.pathname.match(/^\/api\/import\/sessions\/([^/]+)\/files(?:\/([^/]+))?$/);
  if (importFileMatch && request.method === "POST" && !importFileMatch[2]) {
    const session = getImportSession(decodeURIComponent(importFileMatch[1]));
    const staged = await stageImportFile(session, await readJson(request));
    sendJson(response, 201, { file: staged, message: "Image ajoutée à la file temporaire." });
    return;
  }
  if (importFileMatch && request.method === "DELETE" && importFileMatch[2]) {
    const session = getImportSession(decodeURIComponent(importFileMatch[1]));
    await removeStagedFile(session, decodeURIComponent(importFileMatch[2]));
    sendJson(response, 200, { message: "Image retirée de la sélection." });
    return;
  }
  const importActionMatch = url.pathname.match(/^\/api\/import\/sessions\/([^/]+)\/(estimate|commit|status)$/);
  if (importActionMatch && request.method === "GET" && importActionMatch[2] === "status") {
    const session = getImportSession(decodeURIComponent(importActionMatch[1]));
    sendJson(response, 200, session.status);
    return;
  }
  if (importActionMatch && request.method === "POST" && importActionMatch[2] === "estimate") {
    const session = getImportSession(decodeURIComponent(importActionMatch[1]));
    const results = await estimateImport(session, await readJson(request));
    sendJson(response, 200, { results });
    return;
  }
  if (importActionMatch && request.method === "POST" && importActionMatch[2] === "commit") {
    const session = getImportSession(decodeURIComponent(importActionMatch[1]));
    const payload = await readJson(request);
    const result = await queueMutation(() => commitImport(session, payload));
    sendJson(response, 201, { ...result, message: `${result.count} œuvre(s) ajoutée(s).` });
    return;
  }
  const importSessionMatch = url.pathname.match(/^\/api\/import\/sessions\/([^/]+)$/);
  if (importSessionMatch && request.method === "DELETE") {
    const session = getImportSession(decodeURIComponent(importSessionMatch[1]));
    await discardImportSession(session);
    sendJson(response, 200, { message: "File d’import supprimée." });
    return;
  }
  const artworkMatch = url.pathname.match(/^\/api\/artworks\/([^/]+)$/);
  if (artworkMatch && request.method === "PUT") {
    const id = decodeURIComponent(artworkMatch[1]);
    const payload = await readJson(request);
    const artwork = await queueMutation(() => updateArtwork(id, payload));
    sendJson(response, 200, { artwork, message: "Œuvre modifiée et catalogue sauvegardé." });
    return;
  }
  if (artworkMatch && request.method === "DELETE") {
    const id = decodeURIComponent(artworkMatch[1]);
    const result = await queueMutation(() => deleteArtwork(id));
    sendJson(response, 200, { ...result, message: "Œuvre déplacée dans la corbeille." });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/backup") {
    const backup = await queueMutation(() => createBackup());
    sendJson(response, 201, {
      message: "Sauvegarde créée.",
      backup: path.relative(PROJECT_ROOT, backup).replaceAll("\\", "/"),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/preview") {
    sendJson(response, 200, { url: "http://localhost:5173/portfolio/" });
    return;
  }
  if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
    await serveStatic(response, url.pathname);
    return;
  }
  throw new HttpError(404, "Route introuvable.");
}

function openBrowser(url) {
  if (process.env.ARTWORK_ADMIN_NO_OPEN === "1") return;
  const commands = {
    win32: ["cmd", ["/c", "start", "", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };
  const [command, args] = commands[process.platform] || commands.linux;
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

await Promise.all([
  mkdir(BACKUP_DIR, { recursive: true }),
  mkdir(TRASH_DIR, { recursive: true }),
  cleanStagingDirectory(),
  mangaService.initialize(),
  animationService.initialize(),
]);
const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    const status = Number.isInteger(error.status) ? error.status : error.code === "ENOENT" ? 404 : 500;
    if (status === 500) console.error(error);
    const publicMessage = Number.isInteger(error.status)
      ? error.message
      : status === 500
        ? "Erreur interne de l’outil."
        : error.message;
    if (!response.headersSent) sendJson(response, status, { error: publicMessage });
    else response.destroy();
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`Artwork Admin : ${url}`);
  console.log("Arrêt : Ctrl+C");
  openBrowser(url);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") console.error(`Le port ${PORT} est déjà utilisé.`);
  else console.error(error);
  process.exitCode = 1;
});
