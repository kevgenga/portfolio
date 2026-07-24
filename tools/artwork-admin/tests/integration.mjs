import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import sharp from "sharp";
import {
  resolveArtworkSortPreference,
  sortArtworks,
  sortArtworksByDate,
} from "../public/sort-utils.js";
import { formatFileSize } from "../public/file-size-utils.js";
import { DEFAULT_CATEGORY, resolveCategoryPreference } from "../public/filter-preference.js";
import { buildRevealCommand, buildRevealFallbackCommand, launchReveal, resolveArtworkFile } from "../reveal-file.mjs";

const PROJECT_DIR = path.resolve(import.meta.dirname, "../../..");
const tempRoot = await mkdtemp(path.join(tmpdir(), "artwork-admin-v2-"));
const fixtureRoot = path.join(tempRoot, "portfolio");
const runtimeRoot = path.join(tempRoot, "runtime");
const categoryNames = ["backgrounds", "character-design", "illustrations", "paintings", "sketches"];
let server;

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function catalogSource(entries) {
  const objects = entries.map((entry) => `  {
    id: ${JSON.stringify(entry.id)},
    title: "",
    image: assetPath(${JSON.stringify(entry.image)}),
    thumbnail: ${JSON.stringify(entry.thumbnail || "")},
    category: [${entry.category.map((value) => JSON.stringify(value)).join(", ")}],
    date: ${JSON.stringify(entry.date)},
    year: ${entry.year},
    alt: ${JSON.stringify(entry.alt)},
    featured: false,
    orientation: "",
  }`).join(",\n");
  return `import { assetPath } from "../utils/assetPath";\n\nexport const artworks = [\n${objects},\n];\n\n`;
}

async function request(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function startServer(port, { failAt = 0, replaceFailAt = "", optimizeFailAt = "", referenceFailAt = "" } = {}) {
  const output = [];
  const child = spawn(process.execPath, ["tools/artwork-admin/server.mjs"], {
    cwd: PROJECT_DIR,
    env: {
      ...process.env,
      ARTWORK_ADMIN_NO_OPEN: "1",
      ARTWORK_ADMIN_PORT: String(port),
      ARTWORK_ADMIN_TEST_ROOT: fixtureRoot,
      ARTWORK_ADMIN_TEST_RUNTIME: runtimeRoot,
      ARTWORK_ADMIN_TEST_FAIL_AT: String(failAt),
      ARTWORK_ADMIN_TEST_REPLACE_FAIL_AT: replaceFailAt,
      ARTWORK_ADMIN_TEST_OPTIMIZE_FAIL_AT: optimizeFailAt,
      ARTWORK_ADMIN_TEST_REFERENCE_FAIL_AT: referenceFailAt,
      ARTWORK_ADMIN_DISABLE_REVEAL: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await request(port, "/api/artworks");
      return child;
    } catch {
      if (child.exitCode !== null) throw new Error(`Le serveur de test s’est arrêté : ${output.join("")}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  child.kill();
  throw new Error(`Le serveur de test ne répond pas : ${output.join("")}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
}

async function createSession(port) {
  return request(port, "/api/import/sessions", { method: "POST" });
}

async function stage(port, sessionId, name, buffer, lastModified = Date.now()) {
  return request(port, `/api/import/sessions/${sessionId}/files`, {
    method: "POST",
    body: JSON.stringify({ fileName: name, lastModified, dataBase64: buffer.toString("base64") }),
  });
}

async function stageExisting(port, sessionId, assetPath) {
  return request(port, `/api/import/sessions/${sessionId}/existing`, {
    method: "POST",
    body: JSON.stringify({ path: assetPath, source: "media-audit", mode: "reference-existing" }),
  });
}

async function createReplacementSession(port, artworkId) {
  return request(port, "/api/replacements/sessions", {
    method: "POST",
    body: JSON.stringify({ artworkId }),
  });
}

async function stageReplacement(port, sessionId, name, buffer) {
  return request(port, `/api/replacements/sessions/${sessionId}/file`, {
    method: "POST",
    body: JSON.stringify({ fileName: name, lastModified: Date.now(), dataBase64: buffer.toString("base64") }),
  });
}

async function commitReplacement(port, sessionId, file, overrides = {}) {
  return request(port, `/api/replacements/sessions/${sessionId}/commit`, {
    method: "POST",
    body: JSON.stringify({
      token: file.token,
      categories: ["illustrations"],
      date: "01-01-2025",
      alt: "Replacement",
      nameMode: "current",
      customName: "",
      compression: { enabled: false },
      thumbnailMode: "preserve",
      ...overrides,
    }),
  });
}

async function estimateOptimization(port, artworkId, compression) {
  return request(port, `/api/artworks/${artworkId}/optimize/estimate`, {
    method: "POST",
    body: JSON.stringify({ compression }),
  });
}

async function commitOptimization(port, artworkId, compression) {
  return request(port, `/api/artworks/${artworkId}/optimize`, {
    method: "POST",
    body: JSON.stringify({ compression }),
  });
}

async function expectHttpError(operation, status) {
  try {
    await operation();
    assert.fail(`Une erreur HTTP ${status} était attendue.`);
  } catch (error) {
    assert.equal(error.status, status);
    return error;
  }
}

try {
  await mkdir(path.join(fixtureRoot, "src/content"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "src/utils"), { recursive: true });
  for (const category of categoryNames) await mkdir(path.join(fixtureRoot, "public/assets/illustration", category), { recursive: true });

  const existingBuffer = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#541526" } }).jpeg().toBuffer();
  const otherBuffer = await sharp({ create: { width: 42, height: 32, channels: 3, background: "#265415" } }).jpeg().toBuffer();
  const distinctBuffer = await sharp({ create: { width: 44, height: 34, channels: 3, background: "#153a54" } }).jpeg().toBuffer();
  const distinctThumbBuffer = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#777777" } }).jpeg().toBuffer();
  const optimizeJpegBuffer = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#384f72" } }).jpeg({ quality: 96 }).toBuffer();
  const optimizePngBuffer = await sharp({ create: { width: 1200, height: 900, channels: 4, background: { r: 80, g: 30, b: 130, alpha: 0.55 } } }).png().toBuffer();
  const optimizeSmallBuffer = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#806040" } }).jpeg().toBuffer();
  const auditExistingBuffer = await sharp({ create: { width: 96, height: 128, channels: 3, background: "#604080" } }).jpeg().toBuffer();
  const auditCancelBuffer = await sharp({ create: { width: 97, height: 129, channels: 3, background: "#406080" } }).jpeg().toBuffer();
  const auditRollbackBuffer = await sharp({ create: { width: 98, height: 130, channels: 3, background: "#806040" } }).jpeg().toBuffer();
  const auditCompressBuffer = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#805060" } }).jpeg({ quality: 96 }).toBuffer();
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations/existing.jpg"), existingBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations/other.jpg"), otherBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations/distinct.jpg"), distinctBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations/distinct-thumb.jpg"), distinctThumbBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations/optimize-jpeg.jpg"), optimizeJpegBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations/optimize-png.png"), optimizePngBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations/optimize-small.jpg"), optimizeSmallBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/sketches/audit-existing.jpg"), auditExistingBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/sketches/audit-cancel.jpg"), auditCancelBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/paintings/audit-rollback.jpg"), auditRollbackBuffer);
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/paintings/audit-compress.jpg"), auditCompressBuffer);
  const fixtureEntries = [{
    id: "existing",
    image: "assets/illustration/illustrations/existing.jpg",
    category: ["illustrations"],
    date: "01-01-2025",
    year: 2025,
    alt: "Existing",
  }, {
    id: "other",
    image: "assets/illustration/illustrations/other.jpg",
    thumbnail: "assets/illustration/illustrations/other.jpg",
    category: ["illustrations"],
    date: "02-01-2025",
    year: 2025,
    alt: "Other",
  }, {
    id: "distinct",
    image: "assets/illustration/illustrations/distinct.jpg",
    thumbnail: "assets/illustration/illustrations/distinct-thumb.jpg",
    category: ["illustrations"],
    date: "03-01-2025",
    year: 2025,
    alt: "Distinct",
  }, {
    id: "optimize-jpeg",
    image: "assets/illustration/illustrations/optimize-jpeg.jpg",
    category: ["illustrations"],
    date: "05-01-2025",
    year: 2025,
    alt: "Optimize JPEG",
  }, {
    id: "optimize-png",
    image: "assets/illustration/illustrations/optimize-png.png",
    category: ["illustrations"],
    date: "06-01-2025",
    year: 2025,
    alt: "Optimize transparent PNG",
  }, {
    id: "optimize-small",
    image: "assets/illustration/illustrations/optimize-small.jpg",
    category: ["illustrations"],
    date: "07-01-2025",
    year: 2025,
    alt: "Optimize small",
  }];
  for (let index = 0; index < 13; index += 1) {
    const name = `historical-${index}.jpg`;
    const buffer = await sharp({ create: { width: 30 + index, height: 25 + index, channels: 3, background: { r: 90 + index, g: 30 + index, b: 50 + index } } }).jpeg().toBuffer();
    await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations", name), buffer);
    fixtureEntries.push({
      id: `historical-${index}`,
      image: `assets/illustration/illustrations/${name}`,
      category: ["illustrations", "character-design"],
      date: "04-01-2025",
      year: 2025,
      alt: `Historical ${index}`,
    });
  }
  const historicalBefore = fixtureEntries.filter((entry) => entry.id.startsWith("historical-")).map((entry) => ({ id: entry.id, category: entry.category }));
  await writeFile(path.join(fixtureRoot, "src/content/artworks.js"), catalogSource(fixtureEntries));

  const port = 4192;
  server = await startServer(port);
  const initial = await request(port, "/api/artworks");
  assert.equal(initial.count, fixtureEntries.length);
  assert.equal(initial.categoryReport.multipleCategories.length, 13);
  assert.equal(initial.categoryReport.withoutCategory.length, 0);
  assert.equal(initial.categoryReport.unknownCategories.length, 0);
  assert.equal(initial.categoryReport.primaryFolderMismatch.length, 0);
  assert.equal(initial.limits.maxBatchFiles, 100);
  assert.equal(initial.artworks.find((entry) => entry.id === "existing").sizeBytes, existingBuffer.length);
  assert.equal(DEFAULT_CATEGORY, "illustrations");
  assert.equal(resolveCategoryPreference(null, initial.categories), "illustrations");
  assert.equal(resolveCategoryPreference("", initial.categories), "");
  assert.equal(resolveCategoryPreference("sketches", initial.categories), "sketches");
  assert.equal(resolveCategoryPreference("unknown", initial.categories), "illustrations");
  assert.equal(formatFileSize(700), "700 o");
  assert.equal(formatFileSize(714_547), "697,8 Ko");
  assert.equal(formatFileSize(1_677_722), "1,6 Mo");
  assert.equal(formatFileSize(2 * 1024 ** 3), "2,0 Go");
  assert.equal(formatFileSize(null), "Indisponible");
  assert.equal(resolveArtworkSortPreference("newest"), "newest");
  assert.equal(resolveArtworkSortPreference("oldest"), "oldest");
  assert.equal(resolveArtworkSortPreference("heaviest"), "heaviest");
  assert.equal(resolveArtworkSortPreference("lightest"), "lightest");
  assert.equal(resolveArtworkSortPreference("invalid"), "newest");

  const sizeSortFixture = [
    { id: "first-tie", sizeBytes: 200 },
    { id: "unknown", sizeBytes: null },
    { id: "light", sizeBytes: 100 },
    { id: "second-tie", sizeBytes: 200 },
  ];
  assert.deepEqual(
    sortArtworks(sizeSortFixture, "heaviest").map((entry) => entry.id),
    ["first-tie", "second-tie", "light", "unknown"],
  );
  assert.deepEqual(
    sortArtworks(sizeSortFixture, "lightest").map((entry) => entry.id),
    ["light", "first-tie", "second-tie", "unknown"],
  );

  const catalogBeforeReveal = hash(await readFile(path.join(fixtureRoot, "src/content/artworks.js")));
  const existingPath = path.join(fixtureRoot, "public/assets/illustration/illustrations/existing.jpg");
  const existingBeforeReveal = hash(await readFile(existingPath));
  const revealed = await request(port, "/api/artworks/reveal-file", {
    method: "POST",
    body: JSON.stringify({ artworkId: "existing" }),
  });
  assert.equal(revealed.simulation.filePath, existingPath);
  assert.equal(revealed.mode, "selected");
  assert.equal(revealed.simulation.command, buildRevealCommand(existingPath).command);
  assert.deepEqual(revealed.simulation.args, buildRevealCommand(existingPath).args);
  await expectHttpError(() => request(port, "/api/artworks/reveal-file", {
    method: "POST",
    body: JSON.stringify({ artworkId: "unknown-artwork" }),
  }), 404);

  const missingPath = path.join(fixtureRoot, "public/assets/illustration/illustrations/other.jpg");
  await rm(missingPath);
  const catalogWithMissingFile = await request(port, "/api/artworks");
  assert.equal(catalogWithMissingFile.artworks.find((entry) => entry.id === "other").sizeBytes, null);
  await expectHttpError(() => request(port, "/api/artworks/reveal-file", {
    method: "POST",
    body: JSON.stringify({ artworkId: "other" }),
  }), 404);
  await writeFile(missingPath, otherBuffer);
  const catalogWithRestoredFile = await request(port, "/api/artworks");
  assert.equal(catalogWithRestoredFile.artworks.find((entry) => entry.id === "other").sizeBytes, otherBuffer.length);

  assert.throws(
    () => resolveArtworkFile(fixtureRoot, "assets/illustration/../../outside.jpg"),
    /sort du projet/,
  );
  assert.equal(resolveArtworkFile(fixtureRoot, fixtureEntries[0].image), existingPath);
  assert.equal(hash(await readFile(path.join(fixtureRoot, "src/content/artworks.js"))), catalogBeforeReveal);
  assert.equal(hash(await readFile(existingPath)), existingBeforeReveal);
  assert.doesNotMatch(await readFile(path.join(fixtureRoot, "src/content/artworks.js"), "utf8"), new RegExp(fixtureRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const launchCalls = [];
  const fakeChild = new EventEmitter();
  fakeChild.unref = () => { fakeChild.unrefCalled = true; };
  const launchPromise = launchReveal(existingPath, {
    platform: "win32",
    spawnImpl(command, args, options) {
      launchCalls.push({ command, args, options });
      queueMicrotask(() => fakeChild.emit("spawn"));
      return fakeChild;
    },
  });
  const launchResult = await launchPromise;
  assert.equal(launchCalls[0].command, "explorer.exe");
  assert.deepEqual(launchCalls[0].args, ["/select,", existingPath]);
  assert.equal(launchCalls[0].options.windowsHide, false);
  assert.equal(launchCalls[0].args.some((argument) => argument.includes('"')), false);
  assert.equal(launchResult.mode, "selected");
  assert.equal(launchResult.filePath, existingPath);
  assert.equal(fakeChild.unrefCalled, true);

  const spacedPath = path.join(fixtureRoot, "public/assets/illustration/illustrations/file with spaces.jpg");
  assert.deepEqual(buildRevealCommand(spacedPath, "win32").args, ["/select,", spacedPath]);
  assert.deepEqual(buildRevealFallbackCommand(spacedPath, "win32").args, [path.dirname(spacedPath)]);

  const fallbackCalls = [];
  const fallbackResult = await launchReveal(existingPath, {
    platform: "win32",
    spawnImpl(command, args, options) {
      const child = new EventEmitter();
      child.unref = () => {};
      fallbackCalls.push({ command, args, options });
      queueMicrotask(() => child.emit(fallbackCalls.length === 1 ? "error" : "spawn", new Error("selection failed")));
      return child;
    },
  });
  assert.equal(fallbackCalls.length, 2);
  assert.deepEqual(fallbackCalls[0].args, ["/select,", existingPath]);
  assert.deepEqual(fallbackCalls[1].args, [path.dirname(existingPath)]);
  assert.equal(fallbackResult.mode, "opened-folder");
  assert.match(fallbackResult.warning, /automatique/);

  const session = await createSession(port);
  await expectHttpError(() => stage(port, session.id, "existing-copy.jpg", existingBuffer), 409);
  await expectHttpError(() => stage(port, session.id, "not-an-image.jpg", Buffer.from("not an image")), 400);

  const staged = [];
  for (let index = 0; index < 30; index += 1) {
    const buffer = await sharp({
      create: {
        width: 80 + index,
        height: 60 + index,
        channels: 3,
        background: { r: index + 10, g: 70 + index, b: 140 - index },
      },
    }).jpeg({ quality: 90 }).toBuffer();
    staged.push((await stage(port, session.id, `batch-${String(index).padStart(2, "0")}.jpg`, buffer)).file);
    if (index === 0) await expectHttpError(() => stage(port, session.id, "queue-duplicate.jpg", buffer), 409);
  }

  const sameNameDifferentContent = await sharp({ create: { width: 91, height: 77, channels: 3, background: "#208060" } }).jpeg().toBuffer();
  const collision = (await stage(port, session.id, "batch-00.jpg", sameNameDifferentContent)).file;
  assert.equal(collision.suggestedName, "batch-00-2.jpg");
  staged.push(collision);
  await expectHttpError(() => request(port, `/api/import/sessions/${session.id}/commit`, {
    method: "POST",
    body: JSON.stringify({ items: [{
      token: staged[0].token,
      category: "sketches",
      date: "31-02-2025",
      alt: "Date invalide",
      finalName: staged[0].suggestedName,
      compression: { enabled: false },
    }] }),
  }), 400);
  await expectHttpError(() => request(port, `/api/import/sessions/${session.id}/commit`, {
    method: "POST",
    body: JSON.stringify({ items: [{
      token: staged[0].token,
      categories: [],
      date: "22-07-2026",
      alt: "Sans catégorie",
      finalName: staged[0].suggestedName,
      compression: { enabled: false },
    }] }),
  }), 400);
  await expectHttpError(() => request(port, `/api/import/sessions/${session.id}/commit`, {
    method: "POST",
    body: JSON.stringify({ items: [{
      token: staged[0].token,
      categories: ["illustrations", "unknown"],
      date: "22-07-2026",
      alt: "Catégorie inconnue",
      finalName: staged[0].suggestedName,
      compression: { enabled: false },
    }] }),
  }), 400);
  await expectHttpError(() => request(port, `/api/import/sessions/${session.id}/estimate`, {
    method: "POST",
    body: JSON.stringify({ items: [{ token: staged[0].token, compression: { enabled: true, maxDimension: 10 } }] }),
  }), 400);

  const bigJpeg = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#285080" } }).jpeg({ quality: 96 }).toBuffer();
  const bigPng = await sharp({ create: { width: 2000, height: 1200, channels: 4, background: { r: 120, g: 40, b: 90, alpha: 0.7 } } }).png().toBuffer();
  const smallJpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#806020" } }).jpeg().toBuffer();
  const bigJpegFile = (await stage(port, session.id, "large-original.jpg", bigJpeg)).file;
  const bigPngFile = (await stage(port, session.id, "large-webp.png", bigPng)).file;
  const smallFile = (await stage(port, session.id, "small-no-upscale.jpg", smallJpeg)).file;
  staged.push(bigJpegFile, bigPngFile, smallFile);
  assert.equal(staged.length, 34);

  const compressionOriginal = { enabled: true, maxDimension: 1600, quality: 92, format: "original", preserveMetadata: false };
  const compressionWebp = { enabled: true, maxDimension: 1600, quality: 92, format: "webp", preserveMetadata: false };
  const estimate = await request(port, `/api/import/sessions/${session.id}/estimate`, {
    method: "POST",
    body: JSON.stringify({ items: [
      { token: bigJpegFile.token, compression: compressionOriginal },
      { token: bigPngFile.token, compression: compressionWebp },
      { token: smallFile.token, compression: compressionOriginal },
    ] }),
  });
  assert.deepEqual([estimate.results[0].outputWidth, estimate.results[0].outputHeight], [1600, 1200]);
  assert.deepEqual([estimate.results[1].outputWidth, estimate.results[1].outputHeight], [1600, 960]);
  assert.deepEqual([estimate.results[2].outputWidth, estimate.results[2].outputHeight], [800, 600]);

  const items = staged.map((file, index) => ({
    token: file.token,
    categories: index === 0
      ? ["illustrations"]
      : index === 1
        ? ["illustrations", "character-design"]
        : index === 2
          ? ["illustrations", "character-design", "sketches", "paintings", "backgrounds"]
          : index < 12
            ? ["illustrations", "sketches"]
            : ["sketches"],
    date: index === 5 ? "21-07-2026" : "22-07-2026",
    alt: index === 5 ? "Valeur individuelle" : "Valeur globale",
    finalName: file.suggestedName,
    compression: file.token === bigJpegFile.token
      ? compressionOriginal
      : file.token === bigPngFile.token
        ? compressionWebp
        : file.token === smallFile.token
          ? compressionOriginal
          : { enabled: false, maxDimension: "original", quality: 92, format: "original", preserveMetadata: false },
  }));
  const committed = await request(port, `/api/import/sessions/${session.id}/commit`, { method: "POST", body: JSON.stringify({ items }) });
  assert.equal(committed.count, 34);
  const afterImport = await request(port, "/api/artworks");
  assert.equal(afterImport.count, fixtureEntries.length + 34);
  assert.deepEqual(afterImport.artworks.find((entry) => entry.id === "batch-00").category, ["illustrations"]);
  assert.deepEqual(afterImport.artworks.find((entry) => entry.id === "batch-01").category, ["illustrations", "character-design"]);
  assert.equal(afterImport.artworks.find((entry) => entry.id === "batch-02").category.length, 5);
  assert.deepEqual(
    afterImport.artworks.filter((entry) => entry.id.startsWith("historical-")).map((entry) => ({ id: entry.id, category: entry.category })),
    historicalBefore,
  );
  assert.equal((await stat(path.join(fixtureRoot, "public/assets/illustration/sketches/large-original.jpg"))).isFile(), true);
  assert.equal((await stat(path.join(fixtureRoot, "public/assets/illustration/sketches/large-webp.webp"))).isFile(), true);
  const smallMetadata = await sharp(path.join(fixtureRoot, "public/assets/illustration/sketches/small-no-upscale.jpg")).metadata();
  assert.deepEqual([smallMetadata.width, smallMetadata.height], [800, 600]);
  const backups = (await readdir(path.join(runtimeRoot, "backups"))).filter((name) => name.endsWith(".js"));
  assert.equal(backups.length, 1);

  const quickTarget = afterImport.artworks.find((entry) => entry.id === "batch-00");
  const secondaryEdit = await request(port, `/api/artworks/${quickTarget.id}`, {
    method: "PUT",
    body: JSON.stringify({
      fileName: path.basename(quickTarget.image),
      categories: ["illustrations", "character-design"],
      date: "23-07-2026",
      alt: "Alt modifié rapidement",
    }),
  });
  assert.deepEqual(secondaryEdit.artwork.category, ["illustrations", "character-design"]);
  assert.equal((await stat(path.join(fixtureRoot, "public/assets/illustration/illustrations/batch-00.jpg"))).isFile(), true);
  const quickEdit = await request(port, `/api/artworks/${quickTarget.id}`, {
    method: "PUT",
    body: JSON.stringify({
      fileName: path.basename(quickTarget.image),
      categories: ["paintings", "illustrations"],
      date: "23-07-2026",
      alt: "Alt modifié rapidement",
    }),
  });
  assert.equal(quickEdit.artwork.id, quickTarget.id);
  assert.equal(quickEdit.artwork.year, 2026);
  assert.deepEqual(quickEdit.artwork.category, ["paintings", "illustrations"]);
  assert.equal((await stat(path.join(fixtureRoot, "public/assets/illustration/paintings/batch-00.jpg"))).isFile(), true);
  const deduplicated = await request(port, "/api/artworks/batch-01", {
    method: "PUT",
    body: JSON.stringify({
      fileName: "batch-01.jpg",
      categories: ["illustrations", "illustrations", "sketches"],
      date: "22-07-2026",
      alt: "Catégories dédupliquées",
    }),
  });
  assert.deepEqual(deduplicated.artwork.category, ["illustrations", "sketches"]);

  const sorted = sortArtworksByDate((await request(port, "/api/artworks")).artworks, "newest");
  assert.equal(sorted[0].id, quickTarget.id);

  const jpegOptimization = { enabled: true, maxDimension: 1600, quality: 92, format: "original", preserveMetadata: true };
  const jpegEstimate = await estimateOptimization(port, "optimize-jpeg", jpegOptimization);
  assert.deepEqual([jpegEstimate.result.outputWidth, jpegEstimate.result.outputHeight], [1600, 1200]);
  assert.equal(jpegEstimate.result.outputFormat, "jpeg");
  const catalogBeforeSamePathOptimization = hash(await readFile(path.join(fixtureRoot, "src/content/artworks.js")));
  const optimizedJpeg = await commitOptimization(port, "optimize-jpeg", jpegOptimization);
  assert.equal(optimizedJpeg.artwork.image, "assets/illustration/illustrations/optimize-jpeg.jpg");
  assert.equal(hash(await readFile(path.join(fixtureRoot, "src/content/artworks.js"))), catalogBeforeSamePathOptimization);
  const optimizedJpegMetadata = await sharp(path.join(fixtureRoot, "public/assets/illustration/illustrations/optimize-jpeg.jpg")).metadata();
  assert.deepEqual([optimizedJpegMetadata.width, optimizedJpegMetadata.height], [1600, 1200]);
  const optimizedJpegStats = await stat(path.join(fixtureRoot, "public/assets/illustration/illustrations/optimize-jpeg.jpg"));
  const catalogAfterOptimization = await request(port, "/api/artworks");
  assert.equal(catalogAfterOptimization.artworks.find((entry) => entry.id === "optimize-jpeg").sizeBytes, optimizedJpegStats.size);
  const jpegManifest = JSON.parse(await readFile(path.resolve(fixtureRoot, optimizedJpeg.manifest), "utf8"));
  assert.equal(jpegManifest.type, "optimize-existing-artwork");
  assert.equal(jpegManifest.oldFile, jpegManifest.newFile);

  const transparentJpegEstimate = await estimateOptimization(port, "optimize-png", {
    enabled: true, maxDimension: "original", quality: 92, format: "jpeg", preserveMetadata: false,
  });
  assert.match(transparentJpegEstimate.result.warnings.join(" "), /transparence/);
  const weakQualityEstimate = await estimateOptimization(port, "optimize-png", {
    enabled: true, maxDimension: "original", quality: 60, format: "webp", preserveMetadata: false,
  });
  assert.match(weakQualityEstimate.result.warnings.join(" "), /qualité choisie est très faible/);
  const optimizedPng = await commitOptimization(port, "optimize-png", {
    enabled: true, maxDimension: 800, quality: 92, format: "webp", preserveMetadata: false,
  });
  assert.equal(optimizedPng.artwork.image, "assets/illustration/illustrations/optimize-png.webp");
  assert.equal(optimizedPng.artwork.id, "optimize-png");
  assert.equal(optimizedPng.artwork.alt, "Optimize transparent PNG");
  assert.deepEqual(optimizedPng.artwork.category, ["illustrations"]);
  assert.deepEqual((await sharp(path.join(fixtureRoot, "public/assets/illustration/illustrations/optimize-png.webp")).metadata()).format, "webp");

  const smallEstimate = await estimateOptimization(port, "optimize-small", {
    enabled: true, maxDimension: 1600, quality: 92, format: "png", preserveMetadata: false,
  });
  assert.deepEqual([smallEstimate.result.outputWidth, smallEstimate.result.outputHeight], [400, 300]);
  assert.equal(smallEstimate.result.outputFormat, "png");
  assert.match(smallEstimate.result.warnings.join(" "), /déjà plus petite/);
  const jpegFormatEstimate = await estimateOptimization(port, "optimize-small", {
    enabled: true, maxDimension: "original", quality: 92, format: "jpeg", preserveMetadata: false,
  });
  assert.equal(jpegFormatEstimate.result.outputFormat, "jpeg");
  assert.deepEqual(await readdir(path.join(runtimeRoot, "staging")), []);

  const replacementSession = await createReplacementSession(port, "existing");
  assert.equal(replacementSession.details.thumbnail.status, "empty");
  assert.deepEqual([replacementSession.details.file.width, replacementSession.details.file.height], [40, 30]);
  await expectHttpError(() => stageReplacement(port, replacementSession.id, "fake.jpg", Buffer.from("fake jpg")), 400);
  const identicalCurrent = await stageReplacement(port, replacementSession.id, "same.jpg", existingBuffer);
  assert.equal(identicalCurrent.identicalCurrent, true);
  await expectHttpError(() => stageReplacement(port, replacementSession.id, "other-copy.jpg", otherBuffer), 409);

  const replacementBuffer = await sharp({ create: { width: 2400, height: 1800, channels: 4, background: { r: 30, g: 70, b: 160, alpha: 0.8 } } }).png().toBuffer();
  const replacementFile = (await stageReplacement(port, replacementSession.id, "new-existing.png", replacementBuffer)).file;
  const replacementEstimate = await request(port, `/api/replacements/sessions/${replacementSession.id}/estimate`, {
    method: "POST",
    body: JSON.stringify({ token: replacementFile.token, compression: compressionWebp }),
  });
  assert.deepEqual([replacementEstimate.result.outputWidth, replacementEstimate.result.outputHeight], [1600, 1200]);
  const existingReplacement = await commitReplacement(port, replacementSession.id, replacementFile, {
    categories: ["paintings", "sketches"],
    date: "24-07-2026",
    alt: "Existing remplacée",
    nameMode: "current",
    compression: compressionWebp,
  });
  assert.equal(existingReplacement.artwork.id, "existing");
  assert.equal(existingReplacement.artwork.image, "assets/illustration/paintings/existing.webp");
  assert.equal(existingReplacement.artwork.thumbnail, "");
  assert.deepEqual(existingReplacement.artwork.category, ["paintings", "sketches"]);
  assert.equal((await stat(path.join(fixtureRoot, "public/assets/illustration/paintings/existing.webp"))).isFile(), true);
  await assert.rejects(stat(path.join(fixtureRoot, "public/assets/illustration/illustrations/existing.jpg")), { code: "ENOENT" });
  const existingTrashFile = path.join(runtimeRoot, "trash", existingReplacement.trashPath.split("trash/")[1].replaceAll("/", path.sep));
  assert.equal((await stat(existingTrashFile)).isFile(), true);
  const trashMetadataPath = path.join(path.dirname(existingTrashFile), "replacement.json");
  const trashMetadata = JSON.parse(await readFile(trashMetadataPath, "utf8"));
  assert.equal(trashMetadata.artworkId, "existing");
  assert.equal(trashMetadata.oldPath, "assets/illustration/illustrations/existing.jpg");
  const afterExistingReplacement = await request(port, "/api/artworks");
  assert.equal(afterExistingReplacement.artworks[0].id, "existing");
  assert.equal(
    afterExistingReplacement.artworks[0].sizeBytes,
    (await stat(path.join(fixtureRoot, "public/assets/illustration/paintings/existing.webp"))).size,
  );

  const conflictPhysical = await sharp({ create: { width: 19, height: 19, channels: 3, background: "#111111" } }).png().toBuffer();
  await writeFile(path.join(fixtureRoot, "public/assets/illustration/illustrations/new-version.png"), conflictPhysical);
  const otherReplacementSession = await createReplacementSession(port, "other");
  const otherNewBuffer = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 90, g: 10, b: 140, alpha: 1 } } }).png().toBuffer();
  const otherNewFile = (await stageReplacement(port, otherReplacementSession.id, "new-version.png", otherNewBuffer)).file;
  assert.equal(otherNewFile.suggestedName, "new-version-2.png");
  const otherReplacement = await commitReplacement(port, otherReplacementSession.id, otherNewFile, {
    nameMode: "new",
    thumbnailMode: "preserve",
  });
  assert.equal(otherReplacement.artwork.image, "assets/illustration/illustrations/new-version-2.png");
  assert.equal(otherReplacement.artwork.thumbnail, otherReplacement.artwork.image);

  const distinctReplacementSession = await createReplacementSession(port, "distinct");
  assert.equal(distinctReplacementSession.details.thumbnail.status, "distinct");
  const distinctNewBuffer = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#b06030" } }).jpeg().toBuffer();
  const distinctNewFile = (await stageReplacement(port, distinctReplacementSession.id, "camera-name.jpg", distinctNewBuffer)).file;
  const distinctEstimate = await request(port, `/api/replacements/sessions/${distinctReplacementSession.id}/estimate`, {
    method: "POST",
    body: JSON.stringify({ token: distinctNewFile.token, compression: compressionOriginal }),
  });
  assert.deepEqual([distinctEstimate.result.outputWidth, distinctEstimate.result.outputHeight], [320, 240]);
  const distinctReplacement = await commitReplacement(port, distinctReplacementSession.id, distinctNewFile, {
    nameMode: "custom",
    customName: "custom-artwork",
    compression: compressionOriginal,
    thumbnailMode: "preserve",
  });
  assert.equal(distinctReplacement.artwork.image, "assets/illustration/illustrations/custom-artwork.jpg");
  assert.equal(distinctReplacement.artwork.thumbnail, "assets/illustration/illustrations/distinct-thumb.jpg");

  const gifWidth = 10;
  const gifHeight = 10;
  const redFrame = Buffer.alloc(gifWidth * gifHeight * 4, 0);
  const greenFrame = Buffer.alloc(gifWidth * gifHeight * 4, 0);
  for (let pixel = 0; pixel < gifWidth * gifHeight; pixel += 1) {
    redFrame[pixel * 4] = 255;
    redFrame[pixel * 4 + 3] = 255;
    greenFrame[pixel * 4 + 1] = 255;
    greenFrame[pixel * 4 + 3] = 255;
  }
  const animatedGif = await sharp(Buffer.concat([redFrame, greenFrame]), {
    raw: { width: gifWidth, height: gifHeight * 2, channels: 4, pageHeight: gifHeight },
  }).gif({ loop: 0, delay: [100, 100] }).toBuffer();
  const gifSession = await createReplacementSession(port, "historical-0");
  const gifFile = (await stageReplacement(port, gifSession.id, "animated.gif", animatedGif)).file;
  assert.equal(gifFile.animated, true);
  const gifReplacement = await commitReplacement(port, gifSession.id, gifFile, {
    categories: ["illustrations", "character-design"],
    compression: compressionWebp,
  });
  assert.match(gifReplacement.processed.warning, /GIF animé/);
  assert.match(gifReplacement.artwork.image, /\.gif$/);
  await expectHttpError(() => estimateOptimization(port, "historical-0", {
    enabled: true, maxDimension: 800, quality: 92, format: "webp", preserveMetadata: false,
  }), 422);

  const auditExistingPath = "assets/illustration/sketches/audit-existing.jpg";
  const auditCancelPath = "assets/illustration/sketches/audit-cancel.jpg";
  const auditExistingFile = path.join(fixtureRoot, "public", ...auditExistingPath.split("/"));
  const auditCancelFile = path.join(fixtureRoot, "public", ...auditCancelPath.split("/"));
  const auditExistingHash = hash(await readFile(auditExistingFile));
  const auditCancelHash = hash(await readFile(auditCancelFile));
  const auditBefore = await request(port, "/api/media-audit/artwork?refresh=1");
  assert.equal(auditBefore.unreferenced.some((item) => item.path === auditExistingPath && item.category === "Sketches"), true);

  const cancelSession = await createSession(port);
  const cancelPrepared = (await stageExisting(port, cancelSession.id, auditCancelPath)).file;
  assert.equal(cancelPrepared.mode, "reference-existing");
  await request(port, `/api/import/sessions/${cancelSession.id}`, { method: "DELETE" });
  assert.equal(hash(await readFile(auditCancelFile)), auditCancelHash);
  assert.equal((await request(port, "/api/media-audit/artwork?refresh=1")).unreferenced.some((item) => item.path === auditCancelPath), true);

  const existingSession = await createSession(port);
  const existingPrepared = (await stageExisting(port, existingSession.id, auditExistingPath)).file;
  assert.equal(existingPrepared.mode, "reference-existing");
  assert.equal(existingPrepared.source, "media-audit");
  assert.equal(existingPrepared.existingAssetPath, auditExistingPath);
  assert.equal(existingPrepared.originalName, "audit-existing.jpg");
  const existingCommit = await request(port, `/api/import/sessions/${existingSession.id}/commit`, {
    method: "POST",
    body: JSON.stringify({ items: [{
      token: existingPrepared.token,
      categories: ["sketches"],
      date: "23-07-2026",
      alt: "Audit existing",
      finalName: "ce-nom-ne-doit-pas-renommer.jpg",
      compression: { enabled: false },
    }] }),
  });
  assert.equal(existingCommit.results[0].mode, "reference-existing");
  assert.equal(existingCommit.results[0].entry.image, auditExistingPath);
  assert.equal(hash(await readFile(auditExistingFile)), auditExistingHash);
  await assert.rejects(stat(path.join(fixtureRoot, "public/assets/illustration/sketches/ce-nom-ne-doit-pas-renommer.jpg")), { code: "ENOENT" });
  const afterExistingReference = await request(port, "/api/artworks");
  assert.equal(afterExistingReference.artworks.some((entry) => entry.image === auditExistingPath && entry.category[0] === "sketches"), true);
  assert.equal((await request(port, "/api/media-audit/artwork?refresh=1")).unreferenced.some((item) => item.path === auditExistingPath), false);
  const alreadyIntegratedSession = await createSession(port);
  await expectHttpError(() => stageExisting(port, alreadyIntegratedSession.id, auditExistingPath), 409);
  await expectHttpError(() => stageExisting(port, alreadyIntegratedSession.id, "../outside.jpg"), 403);
  await expectHttpError(() => stageExisting(port, alreadyIntegratedSession.id, "assets/illustration/../outside.jpg"), 403);

  const compressExistingPath = "assets/illustration/paintings/audit-compress.jpg";
  const compressExistingOriginal = path.join(fixtureRoot, "public", ...compressExistingPath.split("/"));
  const compressExistingSession = await createSession(port);
  const compressExistingPrepared = (await stageExisting(port, compressExistingSession.id, compressExistingPath)).file;
  const compressExistingCommit = await request(port, `/api/import/sessions/${compressExistingSession.id}/commit`, {
    method: "POST",
    body: JSON.stringify({ items: [{
      token: compressExistingPrepared.token,
      categories: ["paintings"],
      date: "23-07-2026",
      alt: "Compressed existing reference",
      finalName: compressExistingPrepared.originalName,
      compression: { enabled: true, maxDimension: 800, quality: 92, format: "webp", preserveMetadata: false },
    }] }),
  });
  assert.equal(compressExistingCommit.results[0].mode, "reference-existing");
  assert.equal(compressExistingCommit.results[0].entry.image, "assets/illustration/paintings/audit-compress.webp");
  await assert.rejects(stat(compressExistingOriginal), { code: "ENOENT" });
  const compressedExistingFile = path.join(fixtureRoot, "public/assets/illustration/paintings/audit-compress.webp");
  const compressedExistingMetadata = await sharp(await readFile(compressedExistingFile)).metadata();
  assert.deepEqual([compressedExistingMetadata.width, compressedExistingMetadata.height], [800, 600]);

  await stopServer(server);
  server = null;

  const catalogPath = path.join(fixtureRoot, "src/content/artworks.js");
  const beforeRollback = hash(await readFile(catalogPath));
  const referenceRollbackPath = "assets/illustration/paintings/audit-rollback.jpg";
  const referenceRollbackFile = path.join(fixtureRoot, "public", ...referenceRollbackPath.split("/"));
  const referenceRollbackHash = hash(await readFile(referenceRollbackFile));
  const referenceTrashBefore = (await readdir(path.join(runtimeRoot, "trash"))).sort();
  server = await startServer(4198, { referenceFailAt: "after-catalog" });
  const referenceRollbackSession = await createSession(4198);
  const referenceRollbackPrepared = (await stageExisting(4198, referenceRollbackSession.id, referenceRollbackPath)).file;
  await expectHttpError(() => request(4198, `/api/import/sessions/${referenceRollbackSession.id}/commit`, {
    method: "POST",
    body: JSON.stringify({ items: [{
      token: referenceRollbackPrepared.token,
      categories: ["paintings"],
      date: "23-07-2026",
      alt: "Rollback existing reference",
      finalName: referenceRollbackPrepared.originalName,
      compression: { enabled: true, maxDimension: 800, quality: 92, format: "webp", preserveMetadata: false },
    }] }),
  }), 500);
  assert.equal(hash(await readFile(catalogPath)), beforeRollback);
  assert.equal(hash(await readFile(referenceRollbackFile)), referenceRollbackHash);
  await assert.rejects(stat(path.join(fixtureRoot, "public/assets/illustration/paintings/audit-rollback.webp")), { code: "ENOENT" });
  assert.deepEqual((await readdir(path.join(runtimeRoot, "trash"))).sort(), referenceTrashBefore);
  assert.equal((await request(4198, "/api/media-audit/artwork?refresh=1")).unreferenced.some((item) => item.path === referenceRollbackPath), true);
  await stopServer(server);
  server = null;

  server = await startServer(4193, { failAt: 2 });
  const rollbackSession = await createSession(4193);
  const rollbackA = (await stage(4193, rollbackSession.id, "rollback-a.jpg", await sharp({ create: { width: 70, height: 70, channels: 3, background: "#101020" } }).jpeg().toBuffer())).file;
  const rollbackB = (await stage(4193, rollbackSession.id, "rollback-b.jpg", await sharp({ create: { width: 71, height: 71, channels: 3, background: "#202010" } }).jpeg().toBuffer())).file;
  await expectHttpError(() => request(4193, `/api/import/sessions/${rollbackSession.id}/commit`, {
    method: "POST",
    body: JSON.stringify({ items: [rollbackA, rollbackB].map((file) => ({
      token: file.token,
      categories: ["backgrounds", "sketches"],
      date: "22-07-2026",
      alt: "Rollback",
      finalName: file.suggestedName,
      compression: { enabled: false },
    })) }),
  }), 500);
  assert.equal(hash(await readFile(catalogPath)), beforeRollback);
  await assert.rejects(stat(path.join(fixtureRoot, "public/assets/illustration/backgrounds/rollback-a.jpg")), { code: "ENOENT" });
  await assert.rejects(stat(path.join(fixtureRoot, "public/assets/illustration/backgrounds/rollback-b.jpg")), { code: "ENOENT" });
  await stopServer(server);
  server = null;

  const optimizationRollbackPort = 4194;
  const catalogBeforeOptimizationRollback = hash(await readFile(catalogPath));
  const optimizationRollbackFile = path.join(fixtureRoot, "public/assets/illustration/illustrations/historical-2.jpg");
  const optimizationRollbackHash = hash(await readFile(optimizationRollbackFile));
  const optimizationTrashBefore = (await readdir(path.join(runtimeRoot, "trash"))).sort();
  server = await startServer(optimizationRollbackPort, { optimizeFailAt: "after-catalog-write-invalid" });
  await expectHttpError(() => commitOptimization(optimizationRollbackPort, "historical-2", {
    enabled: true, maxDimension: "original", quality: 92, format: "webp", preserveMetadata: false,
  }), 500);
  assert.equal(hash(await readFile(catalogPath)), catalogBeforeOptimizationRollback);
  assert.equal(hash(await readFile(optimizationRollbackFile)), optimizationRollbackHash);
  await assert.rejects(stat(path.join(fixtureRoot, "public/assets/illustration/illustrations/historical-2.webp")), { code: "ENOENT" });
  assert.deepEqual((await readdir(path.join(runtimeRoot, "trash"))).sort(), optimizationTrashBefore);
  assert.deepEqual(await readdir(path.join(runtimeRoot, "staging")), []);
  await stopServer(server);
  server = null;

  const replacementFailurePoints = [
    "after-sharp",
    "after-old-move",
    "after-new-install",
    "before-catalog-write",
    "after-catalog-write-invalid",
  ];
  for (const [failureIndex, failurePoint] of replacementFailurePoints.entries()) {
    const portForFailure = 4200 + failureIndex;
    const catalogBeforeFailure = hash(await readFile(catalogPath));
    const oldFile = path.join(fixtureRoot, "public/assets/illustration/illustrations/historical-1.jpg");
    const oldFileHash = hash(await readFile(oldFile));
    const trashBefore = (await readdir(path.join(runtimeRoot, "trash"))).sort();
    server = await startServer(portForFailure, { replaceFailAt: failurePoint });
    const failureSession = await createReplacementSession(portForFailure, "historical-1");
    const failureBuffer = await sharp({ create: { width: 180 + failureIndex, height: 140, channels: 4, background: { r: 20 + failureIndex, g: 100, b: 180, alpha: 1 } } }).png().toBuffer();
    const failureFile = (await stageReplacement(portForFailure, failureSession.id, `failure-${failureIndex}.png`, failureBuffer)).file;
    await expectHttpError(() => commitReplacement(portForFailure, failureSession.id, failureFile, {
      categories: ["backgrounds", "sketches"],
      nameMode: "custom",
      customName: `rollback-replacement-${failureIndex}`,
    }), 500);
    assert.equal(hash(await readFile(catalogPath)), catalogBeforeFailure, `Catalogue restauré pour ${failurePoint}`);
    assert.equal(hash(await readFile(oldFile)), oldFileHash, `Ancienne image restaurée pour ${failurePoint}`);
    await assert.rejects(stat(path.join(fixtureRoot, `public/assets/illustration/backgrounds/rollback-replacement-${failureIndex}.png`)), { code: "ENOENT" });
    assert.deepEqual((await readdir(path.join(runtimeRoot, "trash"))).sort(), trashBefore, `Corbeille restaurée pour ${failurePoint}`);
    assert.deepEqual(await readdir(path.join(runtimeRoot, "staging")), [], `Staging nettoyé pour ${failurePoint}`);
    await stopServer(server);
    server = null;
  }

  const html = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/index.html"), "utf8");
  const app = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/app.js"), "utf8");
  assert.match(html, /Déposez vos images ici/);
  assert.match(html, /multiple accept=/);
  assert.match(app, /addEventListener\("drop"/);
  assert.match(app, /URL\.revokeObjectURL/);
  assert.match(app, /artwork\.category\.includes\(category\)/);
  assert.match(html, /replacement-drop-zone/);
  assert.match(html, /Optimiser l’image actuelle/);
  assert.match(html, /Optimisation facultative de la nouvelle image/);
  assert.match(app, /CATEGORY_STORAGE_KEY/);
  assert.match(app, /resolveCategoryPreference/);
  assert.match(html, /value="heaviest"/);
  assert.match(html, /value="lightest"/);
  assert.match(app, /formatFileSize\(artwork\.sizeBytes\)/);
  assert.match(app, /mode:\s*"reference-existing"/);
  assert.match(app, /Fichier existant à référencer/);
  assert.match(app, /categories:\s*\[detectedCategory\]/);
  assert.match(app, /compressionEnabled:\s*false/);
  assert.doesNotMatch(app, /auditItemAsFile\(item\)/);
  assert.match(html, /id="reveal-file-button"/);
  assert.match(app, /\/api\/artworks\/reveal-file/);

  console.log("Artwork Admin V2.1 — tests d’intégration réussis");
  console.log("Filtre initial, multcatégories, optimisation actuelle, remplacement, compression, GIF animé, corbeille et rollbacks vérifiés");
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await stopServer(server);
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
