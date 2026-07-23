import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { FileTransaction } from "../file-transaction.mjs";
import { normalizeCompression, processImage } from "../image-processor.mjs";
import { buildRevealCommand, isPathInside, launchReveal } from "../reveal-file.mjs";
import {
  ANIMATION_CATEGORIES,
  MEDIA_EXTENSIONS,
  POSTER_EXTENSIONS,
  mediaKindFromName,
  normalizeAnimationDate,
  parseAnimationCatalog,
  publicAnimationType,
  serializeAnimationCatalog,
  slugifyAnimation,
  validateAnimationCatalog,
} from "./catalog.mjs";

export class AnimationAdminError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function ensure(condition, message, status = 400) { if (!condition) throw new AnimationAdminError(status, message); }
function timestamp() { return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"); }
function safeSegment(value) { return slugifyAnimation(value).slice(0, 90); }
function extensionOf(value) { return path.extname(String(value || "")).toLowerCase(); }

export function createAnimationService({
  projectRoot,
  runtimeRoot,
  disableReveal = false,
  failurePoint = "",
  maxMediaBytes = Number.parseInt(process.env.ANIMATION_ADMIN_MAX_FILE_MB || "300", 10) * 1024 * 1024,
} = {}) {
  const catalogPath = path.join(projectRoot, "src/content/animations.js");
  const assetRoot = path.join(projectRoot, "public/assets/animation");
  const posterRoot = path.join(assetRoot, "miniature");
  const backupRoot = path.join(runtimeRoot, "backups/animations");
  const trashRoot = path.join(runtimeRoot, "trash/animations");
  const stagingRoot = path.join(runtimeRoot, "staging/animations");
  let mutationQueue = Promise.resolve();

  function queueMutation(operation) {
    const output = mutationQueue.then(operation, operation);
    mutationQueue = output.catch(() => undefined);
    return output;
  }

  function assetFile(relative) {
    ensure(typeof relative === "string" && relative.startsWith("assets/animation/"), "Chemin Animation invalide.");
    const target = path.resolve(projectRoot, "public", ...relative.split("/"));
    ensure(isPathInside(assetRoot, target), "Le chemin Animation sort du dossier autorisé.", 403);
    return target;
  }

  async function readCatalog() { return parseAnimationCatalog(await readFile(catalogPath, "utf8")); }
  async function writeAtomic(content) {
    const temporary = `${catalogPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { flag: "wx" });
    try { await rename(temporary, catalogPath); }
    catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  async function backup(operation, id = "catalog") {
    await mkdir(backupRoot, { recursive: true });
    const destination = path.join(backupRoot, `${timestamp()}-${safeSegment(operation)}-${safeSegment(id)}.js`);
    await copyFile(catalogPath, destination);
    return destination;
  }
  function findEntry(catalog, id) {
    const entry = catalog.find((item) => item.id === id);
    ensure(entry, "Animation introuvable.", 404);
    return entry;
  }
  function relativeFromFile(file) { return `assets/animation/${path.relative(assetRoot, file).replaceAll("\\", "/")}`; }
  function normalizeFileName(fileName, allowedExtensions) {
    ensure(typeof fileName === "string" && path.basename(fileName) === fileName && !fileName.includes("\0"), "Nom de fichier dangereux.");
    const extension = extensionOf(fileName);
    ensure(allowedExtensions.includes(extension), `Format non autorisé : ${extension || "inconnu"}.`);
    const base = safeSegment(path.basename(fileName, extension));
    ensure(base, "Nom de fichier invalide.");
    return `${base}${extension}`;
  }
  function detectSignature(buffer, extension) {
    const ascii = buffer.subarray(0, 32).toString("ascii");
    const hex = buffer.subarray(0, 16).toString("hex");
    const valid =
      (extension === ".mp4" && ascii.slice(4, 8) === "ftyp") ||
      (extension === ".webm" && hex.startsWith("1a45dfa3")) ||
      ([".jpg", ".jpeg"].includes(extension) && hex.startsWith("ffd8ff")) ||
      (extension === ".png" && hex.startsWith("89504e470d0a1a0a")) ||
      (extension === ".gif" && (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a"))) ||
      (extension === ".webp" && ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") ||
      (extension === ".avif" && ["ftypavif", "ftypavis"].includes(ascii.slice(4, 12)));
    ensure(valid, `Le contenu ne correspond pas au format ${extension.toUpperCase()}.`);
  }
  async function stageUpload(upload, kind, directory) {
    ensure(upload?.fileName && upload?.dataBase64, `${kind === "poster" ? "Poster" : "Média"} manquant.`);
    const allowed = kind === "poster" ? POSTER_EXTENSIONS : MEDIA_EXTENSIONS;
    const normalizedName = normalizeFileName(upload.fileName, allowed);
    const extension = extensionOf(normalizedName);
    const buffer = Buffer.from(upload.dataBase64, "base64");
    ensure(buffer.length > 0, "Le fichier est vide.");
    ensure(buffer.length <= maxMediaBytes, `Le fichier dépasse la limite de ${Math.round(maxMediaBytes / 1024 / 1024)} Mo.`, 413);
    detectSignature(buffer, extension);
    let dimensions = null;
    if (mediaKindFromName(normalizedName) !== "video") {
      try {
        const metadata = await sharp(buffer, { animated: true }).metadata();
        ensure(metadata.width && metadata.height, "Dimensions illisibles.");
        dimensions = { width: metadata.width, height: metadata.height, animated: (metadata.pages || 1) > 1 };
      } catch (error) {
        if (error instanceof AnimationAdminError) throw error;
        throw new AnimationAdminError(400, `Image illisible : ${error.message}`);
      }
    }
    await mkdir(directory, { recursive: true });
    const stagedPath = path.join(directory, `${randomUUID()}${extension}`);
    ensure(isPathInside(directory, stagedPath), "Chemin de staging invalide.");
    await writeFile(stagedPath, buffer, { flag: "wx" });
    return {
      path: stagedPath,
      originalName: path.basename(upload.fileName),
      normalizedName,
      extension,
      size: buffer.length,
      hash: createHash("sha256").update(buffer).digest("hex"),
      kind: mediaKindFromName(normalizedName),
      ...dimensions,
    };
  }
  async function fileHash(file) {
    const hash = createHash("sha256");
    await new Promise((resolve, reject) => {
      const stream = createReadStream(file);
      stream.on("data", (chunk) => hash.update(chunk)); stream.on("end", resolve); stream.on("error", reject);
    });
    return hash.digest("hex");
  }
  async function listFiles(directory = assetRoot) {
    const output = [];
    let entries = [];
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return output; throw error; }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) output.push(...await listFiles(target));
      else if (entry.isFile()) output.push(target);
    }
    return output;
  }
  async function rejectDuplicateHash(hash, ignoredFiles = []) {
    const ignored = new Set(ignoredFiles.filter(Boolean).map((file) => path.resolve(file).toLowerCase()));
    for (const file of await listFiles()) {
      if (ignored.has(path.resolve(file).toLowerCase())) continue;
      if (await fileHash(file) === hash) throw new AnimationAdminError(409, `Contenu dupliqué : ${relativeFromFile(file)}.`);
    }
  }
  async function ensureDestinationAvailable(destination, currentFile = null) {
    if (currentFile && path.resolve(destination) === path.resolve(currentFile)) return;
    try { await stat(destination); throw new AnimationAdminError(409, `Un fichier porte déjà ce nom : ${relativeFromFile(destination)}.`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  function destinationName(staged, mode, currentRelative, customName, outputExtension = staged.extension) {
    const currentBase = currentRelative ? path.basename(currentRelative, extensionOf(currentRelative)) : "";
    const requested = mode === "current" && currentBase
      ? `${currentBase}${outputExtension}`
      : mode === "custom"
        ? `${path.basename(String(customName || ""), extensionOf(String(customName || "")))}${outputExtension}`
        : `${path.basename(staged.normalizedName, staged.extension)}${outputExtension}`;
    return normalizeFileName(requested, staged.kind === "video" ? MEDIA_EXTENSIONS : [...MEDIA_EXTENSIONS, ...POSTER_EXTENSIONS]);
  }
  function failAt(point) { if (failurePoint === point) throw new Error(`Échec Animation simulé : ${point}.`); }
  async function validateFiles(catalog) {
    validateAnimationCatalog(catalog, { allowLegacyEmptyTitles: true });
    if (catalog.length) ensure(catalog[0].poster, "La première animation du catalogue doit conserver un poster pour la page d’accueil.");
    for (const entry of catalog) {
      for (const relative of [entry.video, entry.poster].filter(Boolean)) {
        try { ensure((await stat(assetFile(relative))).isFile(), `Fichier invalide : ${relative}.`); }
        catch (error) { if (error.code === "ENOENT") throw new AnimationAdminError(400, `Fichier manquant : ${relative}.`); throw error; }
      }
      if (mediaKindFromName(entry.video) === "video") ensure(entry.poster, `Poster obligatoire pour la vidéo ${entry.id}.`);
    }
  }
  async function mutate(operation, id, callback) {
    const original = await readFile(catalogPath, "utf8");
    const catalog = parseAnimationCatalog(original);
    const backupPath = await backup(operation, id);
    const stageDirectory = path.join(stagingRoot, `${timestamp()}-${randomUUID()}`);
    const transaction = new FileTransaction();
    await mkdir(stageDirectory, { recursive: true });
    try {
      const result = await callback(catalog, transaction, stageDirectory);
      failAt("before-catalog");
      await validateFiles(catalog);
      await writeAtomic(serializeAnimationCatalog(catalog));
      failAt("after-catalog");
      transaction.commit();
      return { result, backup: path.relative(projectRoot, backupPath).replaceAll("\\", "/") };
    } catch (error) {
      await writeAtomic(original).catch(() => undefined);
      await transaction.rollback().catch(() => undefined);
      throw error;
    } finally {
      await rm(stageDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  function validateMetadata(payload, current = {}) {
    const title = String(payload.title ?? current.title ?? "").trim();
    ensure(title, "Le titre est obligatoire.");
    const alt = payload.useTitleAsAlt === true ? title : String(payload.alt ?? current.alt ?? title).trim();
    ensure(alt, "Le texte alternatif est obligatoire.");
    const category = String(payload.category ?? current.category ?? "");
    ensure(ANIMATION_CATEGORIES.includes(category), "Catégorie inconnue.");
    const normalizedDate = normalizeAnimationDate(payload.date ?? current.date);
    return { title, alt, category, ...normalizedDate, featured: Boolean(payload.featured ?? current.featured) };
  }
  function uniqueId(title, catalog) {
    const base = slugifyAnimation(title); let candidate = base; let suffix = 2;
    while (catalog.some((entry) => entry.id === candidate)) candidate = `${base}-${suffix++}`;
    return candidate;
  }
  async function create(payload) {
    const metadata = validateMetadata(payload);
    ensure(payload.media, "Le média principal est obligatoire.");
    return mutate("create", metadata.title, async (catalog, tx, stageDirectory) => {
      const media = await stageUpload(payload.media, "media", stageDirectory);
      await rejectDuplicateHash(media.hash);
      let poster = null;
      if (payload.poster) {
        poster = await stageUpload(payload.poster, "poster", stageDirectory);
        await rejectDuplicateHash(poster.hash);
        ensure(poster.hash !== media.hash, "Le poster duplique le média principal.", 409);
      }
      ensure(media.kind !== "video" || poster, "Un poster est obligatoire pour une vidéo.");
      const mediaName = destinationName(media, "new", "", "");
      const mediaDestination = path.join(assetRoot, mediaName);
      await ensureDestinationAvailable(mediaDestination);
      await tx.move(media.path, mediaDestination); failAt("after-copy");
      let posterRelative = "";
      if (poster) {
        const compression = normalizeCompression(payload.posterCompression || {});
        const processed = await processImage(poster.path, poster.originalName, compression);
        const posterName = destinationName(poster, "new", "", "", processed.extension);
        const posterDestination = path.join(posterRoot, posterName);
        await ensureDestinationAvailable(posterDestination);
        if (compression.enabled) await tx.writeExclusive(posterDestination, processed.buffer);
        else await tx.move(poster.path, posterDestination);
        posterRelative = relativeFromFile(posterDestination);
      }
      const entry = {
        id: uniqueId(metadata.title, catalog), title: metadata.title, video: relativeFromFile(mediaDestination), poster: posterRelative,
        category: metadata.category, duration: null, date: metadata.date, year: metadata.year, alt: metadata.alt,
        featured: metadata.featured, type: publicAnimationType(mediaName),
      };
      const position = Math.min(Math.max(Number(payload.position) || catalog.length + 1, 1), catalog.length + 1);
      catalog.splice(position - 1, 0, entry);
      return entry;
    });
  }
  async function update(id, payload) {
    const currentCatalog = await readCatalog();
    const current = findEntry(currentCatalog, id);
    const metadata = validateMetadata(payload, current);
    return mutate("update", id, async (catalog) => {
      const entry = findEntry(catalog, id);
      Object.assign(entry, metadata);
      if (payload.position !== undefined) {
        const from = catalog.indexOf(entry);
        const position = Math.min(Math.max(Number(payload.position) || from + 1, 1), catalog.length);
        catalog.splice(from, 1); catalog.splice(position - 1, 0, entry);
      }
      return entry;
    });
  }
  async function replaceAsset(id, kind, payload) {
    ensure(["media", "poster"].includes(kind), "Type de fichier invalide.");
    ensure(["current", "new", "custom"].includes(payload.nameMode || "current"), "Stratégie de nom invalide.");
    if (payload.nameMode === "custom") ensure(String(payload.customName || "").trim(), "Le nom personnalisé est obligatoire.");
    return mutate(`replace-${kind}`, id, async (catalog, tx, stageDirectory) => {
      const entry = findEntry(catalog, id);
      const field = kind === "media" ? "video" : "poster";
      const currentRelative = entry[field] || "";
      const currentFile = currentRelative ? assetFile(currentRelative) : null;
      const staged = await stageUpload(payload.file, kind, stageDirectory);
      await rejectDuplicateHash(staged.hash);
      if (kind === "media" && staged.kind === "video") ensure(entry.poster, "Ajoutez un poster avant d’installer cette vidéo.");
      let outputBuffer = null; let outputExtension = staged.extension;
      if (kind === "poster") {
        const processed = await processImage(staged.path, staged.originalName, normalizeCompression(payload.compression || {}));
        outputBuffer = processed.buffer; outputExtension = processed.extension;
      }
      const name = destinationName(staged, payload.nameMode || "current", currentRelative, payload.customName, outputExtension);
      const destination = path.join(kind === "poster" ? posterRoot : assetRoot, name);
      await ensureDestinationAvailable(destination, currentFile);
      const trashFolder = path.join(trashRoot, `${timestamp()}-${safeSegment(id)}-replace-${kind}`);
      if (currentFile) {
        await tx.move(currentFile, path.join(trashFolder, path.basename(currentFile)));
        failAt("after-move");
      }
      if (kind === "poster" && (payload.compression?.enabled || outputExtension !== staged.extension)) await tx.writeExclusive(destination, outputBuffer);
      else await tx.move(staged.path, destination);
      failAt("after-copy");
      entry[field] = relativeFromFile(destination);
      if (kind === "media") entry.type = publicAnimationType(name);
      const manifest = {
        animationId: entry.id, operation: `replace-${kind}`, oldPath: currentRelative, newPath: entry[field], date: new Date().toISOString(),
      };
      await tx.writeExclusive(path.join(trashFolder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      return entry;
    });
  }
  async function remove(id, confirmation) {
    return mutate("delete", id, async (catalog, tx) => {
      const index = catalog.findIndex((entry) => entry.id === id);
      ensure(index >= 0, "Animation introuvable.", 404);
      const entry = catalog[index];
      ensure(confirmation === entry.id || confirmation === entry.title, "Confirmation incorrecte.");
      const trashFolder = path.join(trashRoot, `${timestamp()}-${safeSegment(entry.id)}-delete`);
      const moved = [];
      for (const relative of [...new Set([entry.video, entry.poster].filter(Boolean))]) {
        const source = assetFile(relative); const destination = path.join(trashFolder, path.basename(source));
        await tx.move(source, destination); moved.push({ oldPath: relative, trashName: path.basename(destination) });
      }
      failAt("after-move");
      const manifest = { animationId: entry.id, title: entry.title, operation: "delete", deletedAt: new Date().toISOString(), files: moved };
      await tx.writeExclusive(path.join(trashFolder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      catalog.splice(index, 1);
      return { animation: entry, manifest: path.relative(projectRoot, path.join(trashFolder, "manifest.json")).replaceAll("\\", "/") };
    });
  }
  async function inspectAsset(relative) {
    if (!relative) return null;
    const file = assetFile(relative);
    try {
      const fileStat = await stat(file); const extension = extensionOf(file); const kind = mediaKindFromName(file);
      let metadata = {};
      if (kind !== "video") {
        const info = await sharp(file, { animated: true }).metadata();
        metadata = { width: info.width || null, height: info.height || null, animated: (info.pages || 1) > 1 };
      }
      return { path: relative, name: path.basename(file), extension, kind, size: fileStat.size, hash: await fileHash(file), missing: false, ...metadata };
    } catch (error) {
      if (error.code === "ENOENT") return { path: relative, name: path.basename(file), extension: extensionOf(file), kind: mediaKindFromName(file), missing: true };
      return { path: relative, name: path.basename(file), extension: extensionOf(file), kind: mediaKindFromName(file), missing: true, error: error.message };
    }
  }
  async function report() {
    const catalog = await readCatalog(); const issues = []; const items = []; const hashes = new Map();
    const referenced = new Set(catalog.flatMap((entry) => [entry.video, entry.poster].filter(Boolean)).map((value) => value.toLowerCase()));
    for (const [index, entry] of catalog.entries()) {
      const mediaDetails = await inspectAsset(entry.video); const posterDetails = await inspectAsset(entry.poster);
      if (!entry.title?.trim()) issues.push(`${entry.id}: titre vide conservé (donnée historique)`);
      try { normalizeAnimationDate(entry.date); } catch { issues.push(`${entry.id}: date invalide`); }
      if (!ANIMATION_CATEGORIES.includes(entry.category)) issues.push(`${entry.id}: catégorie inconnue`);
      if (mediaDetails?.missing) issues.push(`${entry.id}: média manquant`);
      if (mediaKindFromName(entry.video) === "video" && (!entry.poster || posterDetails?.missing)) issues.push(`${entry.id}: poster vidéo manquant`);
      for (const details of [mediaDetails, posterDetails].filter((item) => item && !item.missing)) {
        if (hashes.has(details.hash)) issues.push(`${entry.id}: contenu dupliqué avec ${hashes.get(details.hash)}`);
        else hashes.set(details.hash, details.path);
      }
      items.push({ ...entry, position: index + 1, mediaKind: mediaKindFromName(entry.video), mediaDetails, posterDetails, effectivePoster: entry.poster || entry.video });
    }
    const physical = await listFiles();
    const unreferenced = physical.map(relativeFromFile).filter((relative) => !referenced.has(relative.toLowerCase()));
    const physicalHashes = new Map();
    for (const file of physical) {
      const digest = await fileHash(file); const relative = relativeFromFile(file);
      if (physicalHashes.has(digest)) issues.push(`Fichier physique dupliqué : ${relative} et ${physicalHashes.get(digest)}`);
      else physicalHashes.set(digest, relative);
    }
    return {
      animations: items, count: items.length, categories: ANIMATION_CATEGORIES, limits: { maxMediaBytes }, issues, unreferenced,
      audit: {
        fields: [...new Set(catalog.flatMap((entry) => Object.keys(entry)))],
        mediaFormats: [...new Set(items.map((entry) => entry.mediaDetails?.extension).filter(Boolean))],
        posterFormats: [...new Set(items.map((entry) => entry.posterDetails?.extension).filter(Boolean))],
        missingMedia: items.filter((entry) => entry.mediaDetails?.missing).length,
        missingPosters: items.filter((entry) => entry.mediaKind === "video" && (!entry.poster || entry.posterDetails?.missing)).length,
      },
    };
  }
  async function reveal(id, type) {
    ensure(["media", "poster"].includes(type), "Type de fichier invalide.");
    const entry = findEntry(await readCatalog(), id); const relative = type === "media" ? entry.video : entry.poster;
    ensure(relative, type === "poster" ? "Cette animation n’a pas de poster distinct." : "Média introuvable.", 404);
    const actual = await realpath(assetFile(relative)).catch(() => { throw new AnimationAdminError(404, "Fichier introuvable."); });
    ensure(isPathInside(assetRoot, actual), "Fichier hors projet.", 403);
    const command = buildRevealCommand(actual);
    console.log(`[animation-reveal]\nid: ${entry.id}\ntype: ${type}\nrelative: ${relative}\nabsolute: ${actual}\ncommand: ${command.command}\narguments: ${JSON.stringify(command.args)}`);
    return disableReveal ? { ...command, filePath: actual, simulated: true } : launchReveal(actual);
  }
  function resolveAsset(relative) { return { file: assetFile(relative), extension: extensionOf(relative) }; }
  async function manualBackup() { const output = await backup("manual", "catalog"); return path.relative(projectRoot, output).replaceAll("\\", "/"); }
  async function initialize() {
    await Promise.all([mkdir(assetRoot, { recursive: true }), mkdir(posterRoot, { recursive: true }), mkdir(backupRoot, { recursive: true }), mkdir(trashRoot, { recursive: true }), mkdir(stagingRoot, { recursive: true })]);
    const staged = await readdir(stagingRoot, { withFileTypes: true });
    await Promise.all(staged.filter((entry) => entry.name !== ".gitkeep").map((entry) => rm(path.join(stagingRoot, entry.name), { recursive: entry.isDirectory(), force: true })));
  }
  return {
    initialize, report,
    create: (payload) => queueMutation(() => create(payload)),
    update: (id, payload) => queueMutation(() => update(id, payload)),
    replaceMedia: (id, payload) => queueMutation(() => replaceAsset(id, "media", payload)),
    replacePoster: (id, payload) => queueMutation(() => replaceAsset(id, "poster", payload)),
    remove: (id, confirmation) => queueMutation(() => remove(id, confirmation)),
    reveal, resolveAsset, readCatalog, validateFiles,
    manualBackup: () => queueMutation(manualBackup),
    paths: { catalogPath, assetRoot, posterRoot, backupRoot, trashRoot, stagingRoot },
  };
}
