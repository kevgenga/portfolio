import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "./sharp-runtime.mjs";
import { buildRevealCommand, isPathInside, launchReveal } from "./reveal-file.mjs";

export const MEDIA_AUDIT_MODULES = Object.freeze({
  artwork: {
    assetPrefix: "assets/illustration/",
    directory: "illustration",
    supported: [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"],
  },
  animation: {
    assetPrefix: "assets/animation/",
    directory: "animation",
    supported: [".mp4", ".webm", ".gif", ".jpg", ".jpeg", ".png", ".webp", ".avif"],
  },
  manga: {
    assetPrefix: "assets/mangaka/",
    directory: "mangaka",
    supported: [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"],
  },
});

const SOURCE_EXTENSIONS = new Set([".pdf", ".psd", ".psb", ".clip", ".zip", ".rar", ".7z", ".kra", ".xcf"]);
const IGNORED_FILE_NAMES = new Set([".gitkeep", "thumbs.db", "desktop.ini", ".ds_store"]);
const IGNORED_DIRECTORY_NAMES = new Set([
  "backups", "backup", "trash", "staging", "temp", "tmp", "__tests__", "tests", "fixtures", "test-output",
  "admin", "artwork-admin", "animation-admin", "manga-admin",
]);
const IGNORED_SUFFIXES = [".tmp", ".temp", ".part", ".bak", "~"];
const ARTWORK_CATEGORIES = new Map([
  ["illustrations", "Illustrations"],
  ["sketches", "Sketches"],
  ["paintings", "Paintings"],
  ["character-design", "Character Design"],
  ["backgrounds", "Backgrounds"],
]);

export class MediaAuditError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function ensure(condition, message, status = 400) {
  if (!condition) throw new MediaAuditError(status, message);
}

function comparisonKey(value) {
  const normalized = normalizeAssetPath(value);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en") : normalized;
}

export function normalizeAssetPath(value) {
  ensure(typeof value === "string" && value.trim(), "Chemin média invalide.");
  ensure(!value.includes("\0"), "Chemin média invalide.");
  let normalized = value.trim().replaceAll("\\", "/").normalize("NFC");
  ensure(!path.win32.isAbsolute(normalized) && !path.posix.isAbsolute(normalized), "Les chemins absolus sont interdits.", 403);
  normalized = normalized.replace(/^\.\/+/, "").replace(/\/+/g, "/");
  const segments = normalized.split("/");
  ensure(!segments.some((segment) => segment === ".." || segment === "." || segment === ""), "La traversée de chemin est interdite.", 403);
  return segments.join("/");
}

function shouldIgnoreEntry(name, isDirectory) {
  const lower = name.toLocaleLowerCase("en");
  if (name.startsWith(".") || IGNORED_FILE_NAMES.has(lower)) return true;
  if (isDirectory && IGNORED_DIRECTORY_NAMES.has(lower)) return true;
  if (!isDirectory && (IGNORED_SUFFIXES.some((suffix) => lower.endsWith(suffix)) || lower.endsWith(".manifest.json"))) return true;
  return !isDirectory
    && /(^|[-_.])(test|fixture|generated)([-_.]|$)/i.test(name)
    && /test/i.test(name);
}

function classifyReference(moduleName, entry, relative, role, language = "") {
  return {
    entryId: String(entry.id ?? entry.slug ?? ""),
    title: entry.title || entry.alt || entry.slug || "",
    path: normalizeAssetPath(relative),
    role,
    category: moduleName === "artwork" ? (entry.category || []).join(", ") : entry.category || "",
    language,
  };
}

function catalogReferences(moduleName, catalog) {
  const references = [];
  if (moduleName === "artwork") {
    for (const entry of catalog) {
      if (entry.image) references.push(classifyReference(moduleName, entry, entry.image, "image"));
      if (entry.thumbnail && comparisonKey(entry.thumbnail) !== comparisonKey(entry.image)) {
        references.push(classifyReference(moduleName, entry, entry.thumbnail, "thumbnail"));
      }
    }
  } else if (moduleName === "animation") {
    for (const entry of catalog) {
      if (entry.video) references.push(classifyReference(moduleName, entry, entry.video, "media"));
      if (entry.poster) references.push(classifyReference(moduleName, entry, entry.poster, "poster"));
    }
  } else {
    for (const entry of catalog) {
      for (const field of ["banner", "cover", "thumbnail", "presentation"]) {
        if (entry[field]) references.push(classifyReference(moduleName, entry, entry[field], field));
      }
      for (const [language, definition] of Object.entries(entry.languages || {})) {
        for (const page of definition.pages || []) {
          references.push(classifyReference(moduleName, entry, page, "page", language));
        }
      }
    }
  }
  return references;
}

function animationKind(extension, relative) {
  if (relative.toLocaleLowerCase("en").includes("/miniature/")) return "poster";
  if ([".mp4", ".webm", ".gif"].includes(extension)) return "media";
  return "media";
}

function findMangaContext(relative, catalog) {
  const segments = relative.split("/");
  const presentationDirectory = segments[2] || "";
  const structured = ["completed-manga", "complete-storyboards"].includes(presentationDirectory);
  const folder = segments[structured ? 3 : 2] || "";
  const presentationSection = presentationDirectory === "complete-storyboards"
    ? "storyboard"
    : "completed";
  const manga = catalog.find((entry) => [entry.slug, String(entry.id)].filter(Boolean)
    .some((value) => String(value).normalize("NFC").toLocaleLowerCase("en") === folder.normalize("NFC").toLocaleLowerCase("en")));
  const languageIndex = structured ? 4 : 3;
  const languageFolder = segments.length > languageIndex + 1 ? segments[languageIndex].toLocaleLowerCase("en") : "";
  const language = manga
    ? Object.entries(manga.languages || {}).find(([code, definition]) => {
      const values = [code, definition.label, definition.shortLabel].filter(Boolean).map((value) => String(value).toLocaleLowerCase("en"));
      return values.includes(languageFolder)
        || (languageFolder === "english" && code === "en")
        || (languageFolder === "french" && code === "fr");
    })?.[0] || ""
    : "";
  return { manga, language, folder, languageFolder, presentationSection };
}

function guessFile(moduleName, relative, extension, catalog) {
  const segments = relative.split("/");
  if (moduleName === "artwork") {
    const folder = segments[2] || "";
    return { directory: folder, category: ARTWORK_CATEGORIES.get(folder.toLocaleLowerCase("en")) || "À vérifier", type: "image" };
  }
  if (moduleName === "animation") {
    const type = animationKind(extension, relative);
    return {
      directory: segments.slice(2, -1).join("/") || "animation",
      category: type === "poster" ? "Poster / miniature" : "Média principal",
      type,
    };
  }
  const context = findMangaContext(relative, catalog);
  const base = path.basename(relative, extension).toLocaleLowerCase("en");
  const knownPresentation = /(^|[-_\s])(cover|banner|thumbnail|presentation)([-_\s]|$)/i.test(base)
    || /^bandeau(?:[-_\s]?\d+)?$/i.test(base)
    || ["0000", "300x300", "300x300-v2", "447x200"].includes(base);
  const isLanguagePage = Boolean(context.language) || segments.length > 4;
  return {
    directory: segments.slice(2, -1).join("/"),
    category: context.manga?.title || context.folder || "Manga inconnu",
    mangaId: context.manga?.id ?? "",
    mangaSlug: context.manga?.slug || "",
    presentationSection: context.presentationSection,
    language: context.language,
    languageLabel: context.manga?.languages?.[context.language]?.label || context.languageFolder || "",
    type: knownPresentation ? "banner-or-legacy" : isLanguagePage ? (context.language ? "page" : "orphan-language") : "page-or-legacy",
  };
}

async function fileHash(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("close", resolve);
    stream.once("error", (error) => {
      stream.destroy();
      reject(error);
    });
  });
  return hash.digest("hex");
}

async function imageMetadata(file, extension) {
  if (![".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"].includes(extension)) return {};
  const image = sharp(file, { animated: true });
  try {
    const metadata = await image.metadata();
    return { width: metadata.width || null, height: metadata.height || null };
  } catch {
    return { metadataError: "Dimensions illisibles" };
  } finally {
    image.destroy();
  }
}

export function createMediaAuditService({
  projectRoot,
  runtimeRoot,
  catalogLoaders,
  disableReveal = false,
  cacheDurationMs = 30_000,
} = {}) {
  const publicAssetsRoot = path.resolve(projectRoot, "public/assets");
  const ignorePath = path.join(runtimeRoot, "storage/media-audit-ignore.json");
  const trashRoot = path.join(runtimeRoot, "trash/media-audit");
  const cache = new Map();
  const hashCache = new Map();

  function moduleConfig(moduleName) {
    const config = MEDIA_AUDIT_MODULES[moduleName];
    ensure(config, "Module d’audit inconnu.", 404);
    return config;
  }

  function moduleRoot(moduleName) {
    return path.join(publicAssetsRoot, moduleConfig(moduleName).directory);
  }

  async function secureFile(moduleName, relative, { mustExist = true } = {}) {
    const config = moduleConfig(moduleName);
    const normalized = normalizeAssetPath(relative);
    ensure(normalized.startsWith(config.assetPrefix), "Ce chemin n’appartient pas au module demandé.", 403);
    const target = path.resolve(projectRoot, "public", ...normalized.split("/"));
    const root = moduleRoot(moduleName);
    ensure(isPathInside(root, target), "Le chemin sort du dossier média autorisé.", 403);
    if (!mustExist) return { normalized, target, root };
    const [actual, actualRoot] = await Promise.all([
      realpath(target).catch(() => { throw new MediaAuditError(404, "Fichier média introuvable."); }),
      realpath(root),
    ]);
    ensure(actual === actualRoot || isPathInside(actualRoot, actual), "Le lien symbolique sort du dossier média autorisé.", 403);
    ensure((await stat(actual)).isFile(), "Le chemin ne correspond pas à un fichier.", 400);
    return { normalized, target: actual, root: actualRoot };
  }

  async function readIgnoreList() {
    try {
      const parsed = JSON.parse(await readFile(ignorePath, "utf8"));
      const paths = Array.isArray(parsed.paths) ? parsed.paths.map(normalizeAssetPath) : [];
      return { version: 1, paths: [...new Set(paths)] };
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, paths: [] };
      if (error instanceof SyntaxError) throw new MediaAuditError(500, "La liste des médias ignorés est invalide.");
      throw error;
    }
  }

  async function writeIgnoreList(list) {
    await mkdir(path.dirname(ignorePath), { recursive: true });
    const temporary = `${ignorePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, paths: [...list.paths].sort() }, null, 2)}\n`, { flag: "wx" });
    try { await rename(temporary, ignorePath); }
    catch (error) { await rm(temporary, { force: true }); throw error; }
  }

  async function scanFiles(moduleName) {
    const config = moduleConfig(moduleName);
    const root = moduleRoot(moduleName);
    const rootReal = await realpath(root);
    const supported = [];
    const unsupported = [];
    let excludedCount = 0;

    async function walk(directory) {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (shouldIgnoreEntry(entry.name, entry.isDirectory())) {
          excludedCount += 1;
          continue;
        }
        const target = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          const actual = await realpath(target).catch(() => "");
          if (!actual || !isPathInside(rootReal, actual)) {
            excludedCount += 1;
            continue;
          }
        }
        if (entry.isDirectory()) {
          await walk(target);
          continue;
        }
        if (!entry.isFile()) continue;
        const extension = path.extname(entry.name).toLocaleLowerCase("en");
        const relative = `${config.assetPrefix}${path.relative(root, target).replaceAll("\\", "/")}`.normalize("NFC");
        const fileStat = await stat(target);
        const base = {
          name: entry.name,
          path: relative,
          extension,
          format: extension.slice(1).toUpperCase() || "INCONNU",
          size: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
        };
        if (config.supported.includes(extension)) {
          supported.push({ ...base, ...await imageMetadata(target, extension), absoluteFile: target });
        } else {
          unsupported.push({ ...base, sourceFile: SOURCE_EXTENSIONS.has(extension), status: "Format non pris en charge" });
        }
      }
    }
    await walk(root);
    return { supported, unsupported, excludedCount };
  }

  async function computeHashDuplicates(files) {
    const groupsBySize = new Map();
    for (const file of files) {
      if (!groupsBySize.has(file.size)) groupsBySize.set(file.size, []);
      groupsBySize.get(file.size).push(file);
    }
    const duplicates = [];
    for (const candidates of groupsBySize.values()) {
      if (candidates.length < 2) continue;
      const byHash = new Map();
      for (const file of candidates) {
        const key = `${file.path}:${file.size}:${file.modifiedAt}`;
        let digest = hashCache.get(key);
        if (!digest) {
          digest = await fileHash(file.absoluteFile);
          hashCache.set(key, digest);
        }
        file.hash = digest;
        if (!byHash.has(digest)) byHash.set(digest, []);
        byHash.get(digest).push(file.path);
      }
      for (const [hash, paths] of byHash) {
        if (paths.length > 1) {
          const sections = new Set(paths.map((itemPath) => itemPath.split("/")[2]));
          const expectedCrossSection = sections.has("completed-manga")
            && sections.has("complete-storyboards");
          duplicates.push({
            type: expectedCrossSection ? "expected-cross-section-copy" : "same-hash",
            hash,
            paths,
          });
        }
      }
    }
    return duplicates;
  }

  async function audit(moduleName, { force = false } = {}) {
    moduleConfig(moduleName);
    const cached = cache.get(moduleName);
    if (!force && cached && Date.now() - cached.createdAt < cacheDurationMs) return cached.value;
    const catalog = await catalogLoaders[moduleName]();
    const references = catalogReferences(moduleName, catalog);
    const referenceGroups = new Map();
    for (const reference of references) {
      const key = comparisonKey(reference.path);
      if (!referenceGroups.has(key)) referenceGroups.set(key, []);
      referenceGroups.get(key).push(reference);
    }
    const { supported, unsupported, excludedCount } = await scanFiles(moduleName);
    const physicalByKey = new Map(supported.map((file) => [comparisonKey(file.path), file]));
    const ignoreList = await readIgnoreList();
    const ignoredKeys = new Set(ignoreList.paths.map(comparisonKey));
    const ignored = [];
    const unreferenced = [];
    for (const file of supported) {
      if (referenceGroups.has(comparisonKey(file.path))) continue;
      const item = {
        ...file,
        ...guessFile(moduleName, file.path, file.extension, catalog),
        status: "Présent sur le disque, absent du catalogue",
      };
      delete item.absoluteFile;
      if (ignoredKeys.has(comparisonKey(file.path))) ignored.push(item);
      else unreferenced.push(item);
    }
    const missing = [];
    for (const reference of references) {
      if (!physicalByKey.has(comparisonKey(reference.path))) {
        missing.push({ ...reference, status: "Référencé dans le catalogue, fichier physique manquant" });
      }
    }
    const duplicates = [];
    for (const group of referenceGroups.values()) {
      if (group.length > 1) {
        const entryIds = new Set(group.map((item) => item.entryId));
        const roles = new Set(group.map((item) => item.role));
        const repeatedSameRole = group.some((item, index) => group.findIndex((candidate) =>
          candidate.entryId === item.entryId && candidate.role === item.role && candidate.language === item.language) !== index);
        const isPotentialDuplicate = entryIds.size > 1
          || repeatedSameRole
          || (moduleName === "animation" && roles.size > 1);
        if (isPotentialDuplicate) {
          duplicates.push({ type: "repeated-catalog-path", path: group[0].path, references: group });
        }
      }
    }
    const hashDuplicates = await computeHashDuplicates(supported);
    const expectedCopies = hashDuplicates.filter((item) => item.type === "expected-cross-section-copy");
    duplicates.push(...hashDuplicates.filter((item) => item.type !== "expected-cross-section-copy"));
    const referencedPresent = [...referenceGroups.keys()].filter((key) => physicalByKey.has(key)).length;
    const animationPosterIssues = moduleName === "animation"
      ? catalog.filter((entry) => [".mp4", ".webm"].includes(path.extname(entry.video || "").toLowerCase()) && !entry.poster)
        .map((entry) => ({ entryId: entry.id, title: entry.title, path: "", role: "poster", status: "Poster obligatoire absent du catalogue" }))
      : [];
    missing.push(...animationPosterIssues);
    const value = {
      module: moduleName,
      generatedAt: new Date().toISOString(),
      summary: {
        referenced: referencedPresent,
        missing: missing.length,
        unreferenced: unreferenced.length,
        duplicates: duplicates.length,
        expectedCopies: expectedCopies.length,
        ignored: ignored.length,
        unsupported: unsupported.length,
        excluded: excludedCount,
      },
      unreferenced,
      missing,
      duplicates,
      expectedCopies,
      ignored,
      unsupported,
    };
    cache.set(moduleName, { createdAt: Date.now(), value });
    return value;
  }

  function invalidate(moduleName) {
    if (moduleName) cache.delete(moduleName);
    else cache.clear();
  }

  async function ignore(moduleName, relative) {
    const { normalized } = await secureFile(moduleName, relative);
    const list = await readIgnoreList();
    if (!list.paths.some((item) => comparisonKey(item) === comparisonKey(normalized))) list.paths.push(normalized);
    await writeIgnoreList(list);
    invalidate(moduleName);
    return normalized;
  }

  async function restore(moduleName, relative) {
    const config = moduleConfig(moduleName);
    const normalized = normalizeAssetPath(relative);
    ensure(normalized.startsWith(config.assetPrefix), "Ce chemin n’appartient pas au module demandé.", 403);
    const list = await readIgnoreList();
    list.paths = list.paths.filter((item) => comparisonKey(item) !== comparisonKey(normalized));
    await writeIgnoreList(list);
    invalidate(moduleName);
    return normalized;
  }

  async function reveal(moduleName, relative) {
    const { normalized, target } = await secureFile(moduleName, relative);
    const command = buildRevealCommand(target);
    console.log(`[media-audit-reveal]\nmodule: ${moduleName}\nrelative: ${normalized}\nabsolute: ${target}`);
    return disableReveal ? { ...command, filePath: target, simulated: true } : launchReveal(target);
  }

  async function trash(moduleName, relative, confirmation) {
    const { normalized, target } = await secureFile(moduleName, relative);
    ensure(confirmation === path.basename(normalized), "La confirmation ne correspond pas au nom du fichier.");
    const currentAudit = await audit(moduleName, { force: true });
    ensure(currentAudit.unreferenced.some((item) => comparisonKey(item.path) === comparisonKey(normalized)), "Seul un fichier actuellement non référencé peut être déplacé.");
    const folder = path.join(trashRoot, `${new Date().toISOString().replaceAll(":", "-")}-${moduleName}-${randomUUID()}`);
    await mkdir(folder, { recursive: true });
    const destination = path.join(folder, path.basename(target));
    await rename(target, destination);
    await writeFile(path.join(folder, "manifest.json"), `${JSON.stringify({
      module: moduleName,
      originalPath: normalized,
      trashPath: path.relative(projectRoot, destination).replaceAll("\\", "/"),
      movedAt: new Date().toISOString(),
    }, null, 2)}\n`, { flag: "wx" });
    invalidate(moduleName);
    return { originalPath: normalized, trashPath: path.relative(projectRoot, destination).replaceAll("\\", "/") };
  }

  async function resolveFile(moduleName, relative) {
    return secureFile(moduleName, relative);
  }

  return {
    audit,
    ignore,
    restore,
    reveal,
    trash,
    resolveFile,
    invalidate,
    readIgnoreList,
    paths: { ignorePath, trashRoot, publicAssetsRoot },
  };
}

export async function handleMediaAuditRoute(request, response, url, { service, readJson, sendJson, sendFile }) {
  const match = url.pathname.match(/^\/api\/media-audit\/(artwork|animation|manga)(?:\/(file|ignore|restore|reveal|trash))?$/);
  if (!match) return false;
  const [, moduleName, action] = match;
  if (!action && request.method === "GET") {
    sendJson(response, 200, await service.audit(moduleName, { force: url.searchParams.get("refresh") === "1" }));
    return true;
  }
  if (action === "file" && request.method === "GET") {
    const relative = url.searchParams.get("path");
    const resolved = await service.resolveFile(moduleName, relative);
    await sendFile(response, resolved.target, request);
    return true;
  }
  if (request.method !== "POST") throw new MediaAuditError(405, "Méthode non autorisée.");
  const payload = await readJson(request);
  const relative = payload.path;
  if (action === "ignore") sendJson(response, 200, { path: await service.ignore(moduleName, relative), message: "Fichier ignoré dans les prochains audits." });
  else if (action === "restore") sendJson(response, 200, { path: await service.restore(moduleName, relative), message: "Fichier réintégré dans l’audit." });
  else if (action === "reveal") sendJson(response, 200, { ...(await service.reveal(moduleName, relative)), message: "Fichier affiché dans le gestionnaire de fichiers." });
  else if (action === "trash") {
    sendJson(response, 200, { ...(await service.trash(moduleName, relative, payload.confirmation)), message: "Fichier déplacé vers la corbeille locale." });
  } else throw new MediaAuditError(404, "Action d’audit inconnue.");
  return true;
}
