import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { naturalPageSort, parseMangaCatalog, serializeMangaCatalog } from "../manga/catalog.mjs";
import { analyzeMangaCardMedia, primaryMangaMedia } from "../manga/media-policy.mjs";
import { createMangaService } from "../manga/service.mjs";
import { getMangaPresentationSection } from "../../../src/content/mangaPresentation.js";

const PROJECT_DIR = path.resolve(import.meta.dirname, "../../..");
const realMangaPath = path.join(PROJECT_DIR, "src/content/mangas.js");
const realArtworkPath = path.join(PROJECT_DIR, "src/content/artworks.js");
const realAnimationPath = path.join(PROJECT_DIR, "src/content/animations.js");
const realMangaHash = hash(await readFile(realMangaPath));
const realArtworkHash = hash(await readFile(realArtworkPath));
const realAnimationHash = hash(await readFile(realAnimationPath));
const temp = await mkdtemp(path.join(tmpdir(), "manga-admin-"));
const root = path.join(temp, "portfolio");
const runtime = path.join(temp, "runtime");
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
async function image(name, color, width = 20, height = 30) {
  const pipeline = sharp({ create: { width, height, channels: 3, background: color } });
  const extension = path.extname(name).toLowerCase();
  const buffer = extension === ".png"
    ? await pipeline.png().toBuffer()
    : extension === ".webp"
      ? await pipeline.webp().toBuffer()
      : await pipeline.jpeg().toBuffer();
  return { fileName: name, dataBase64: buffer.toString("base64") };
}
async function availablePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
async function startAdminServer(fixtureRoot, fixtureRuntime) {
  const port = await availablePort();
  const child = spawn(process.execPath, ["tools/artwork-admin/server.mjs"], {
    cwd: PROJECT_DIR,
    env: {
      ...process.env,
      ARTWORK_ADMIN_TEST_ROOT: fixtureRoot,
      ARTWORK_ADMIN_TEST_RUNTIME: fixtureRuntime,
      ARTWORK_ADMIN_PORT: String(port),
      ARTWORK_ADMIN_NO_OPEN: "1",
      ARTWORK_ADMIN_DISABLE_REVEAL: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Démarrage du serveur Admin expiré.\n${output}`)), 10_000);
    const inspect = (chunk) => {
      output += chunk.toString();
      if (!output.includes(`Artwork Admin : http://127.0.0.1:${port}`)) return;
      clearTimeout(timeout);
      resolve();
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      if (output.includes(`Artwork Admin : http://127.0.0.1:${port}`)) return;
      clearTimeout(timeout);
      reject(new Error(`Le serveur Admin s’est arrêté avec le code ${code}.\n${output}`));
    });
  });
  return {
    child,
    origin: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}
async function removalFixture(name, { section = "completed", slug = "delete-me", pageName = "001.jpg" } = {}) {
  const fixtureRoot = path.join(temp, name, "portfolio");
  const fixtureRuntime = path.join(temp, name, "runtime");
  const sectionDirectory = section === "storyboard" ? "complete-storyboards" : "completed-manga";
  const relativePage = `assets/mangaka/${sectionDirectory}/${slug}/orig/${pageName}`;
  const sourceDirectory = path.join(fixtureRoot, "public/assets/mangaka", sectionDirectory, slug);
  const sourcePage = path.join(fixtureRoot, "public", ...relativePage.split("/"));
  await mkdir(path.dirname(sourcePage), { recursive: true });
  await mkdir(path.join(fixtureRoot, "src/content"), { recursive: true });
  const page = await image(pageName, "#563412");
  await writeFile(sourcePage, Buffer.from(page.dataBase64, "base64"));
  const manga = {
    id: slug,
    slug,
    route: `/mangas/${slug}`,
    title: `Delete ${slug}`,
    edition: "",
    presentationSection: section,
    cover: relativePage,
    banner: "",
    summary: "",
    genre: "",
    role: "",
    year: "",
    readingDirection: "rtl",
    defaultLanguage: "orig",
    languages: { orig: { label: "Original", shortLabel: "ORIG", pages: [relativePage] } },
    featured: false,
  };
  const catalogPath = path.join(fixtureRoot, "src/content/mangas.js");
  await writeFile(catalogPath, serializeMangaCatalog([manga]));
  return { fixtureRoot, fixtureRuntime, sourceDirectory, sourcePage, manga, catalogPath };
}

try {
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await mkdir(path.join(root, "public/assets/mangaka/completed-manga/base/orig"), { recursive: true });
  const basePage = await image("001.jpg", "#551122");
  await writeFile(path.join(root, "public/assets/mangaka/completed-manga/base/orig/001.jpg"), Buffer.from(basePage.dataBase64, "base64"));
  const initial = [{ id: "base", slug: "base", route: "/mangas/base", title: "Base", edition: "", presentationSection: "completed", cover: "assets/mangaka/completed-manga/base/orig/001.jpg", banner: "", summary: "", genre: "", role: "", year: "", readingDirection: "rtl", defaultLanguage: "orig", languages: { orig: { label: "Original", shortLabel: "ORIG", pages: ["assets/mangaka/completed-manga/base/orig/001.jpg"] } }, featured: false }];
  await writeFile(path.join(root, "src/content/mangas.js"), serializeMangaCatalog(initial));
  const service = createMangaService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true }); await service.initialize();
  if (process.platform === "win32") assert.equal(sharp.cache().files.max, 0);
  assert.equal((await service.report()).count, 1);
  assert.equal(getMangaPresentationSection({}), "completed");
  assert.equal(primaryMangaMedia(initial[0]).field, "cover");
  assert.deepEqual(primaryMangaMedia({ banner: "", cover: "" }), { field: "banner", path: "", fallback: false });
  assert.equal(analyzeMangaCardMedia(null).level, "error");
  const highQuality = analyzeMangaCardMedia({ width: 1600, height: 900 }); assert.equal(highQuality.resolution.label, "Haute qualité"); assert.equal(highQuality.ratioStatus.label, "Conforme");
  const ideal = analyzeMangaCardMedia({ width: 1280, height: 720 }); assert.equal(ideal.resolution.label, "Taille idéale"); assert.equal(ideal.ratioStatus.label, "Conforme");
  assert.equal(analyzeMangaCardMedia({ width: 960, height: 540 }).resolution.label, "Qualité correcte");
  assert.equal(analyzeMangaCardMedia({ width: 800, height: 450 }).resolution.label, "Qualité minimale acceptable");
  assert.equal(analyzeMangaCardMedia({ width: 799, height: 449 }).resolution.label, "Image trop petite");
  const legendStatus = analyzeMangaCardMedia({ width: 894, height: 400 }); assert.equal(legendStatus.resolution.label, "Image trop petite"); assert.equal(legendStatus.ratioStatus.label, "Ratio fortement incorrect");
  const stubbornStatus = analyzeMangaCardMedia({ width: 800, height: 696 }); assert.equal(stubbornStatus.resolution.label, "Qualité minimale acceptable"); assert.equal(stubbornStatus.ratioStatus.label, "Ratio fortement incorrect");
  const ahesStatus = analyzeMangaCardMedia({ width: 1299, height: 1949 }); assert.equal(ahesStatus.resolution.label, "Taille idéale"); assert.equal(ahesStatus.ratioStatus.label, "Ratio fortement incorrect");
  assert.equal(analyzeMangaCardMedia({ width: 1279, height: 719 }).ratioStatus.label, "Conforme");
  assert.equal(analyzeMangaCardMedia({ width: 1280, height: 750 }).ratioStatus.level, "warning");

  const orig = await service.create({ title: "Original Manga", languageType: "original", primaryImage: await image("main.jpg", "#111111", 1600, 900), pages: [await image("page10.jpg", "#100010"), await image("page2.jpg", "#200020"), await image("page1.jpg", "#300030")] });
  assert.equal(orig.result.defaultLanguage, "orig");
  assert.equal(orig.result.presentationSection, "completed");
  assert.match(orig.result.banner, /^assets\/mangaka\/completed-manga\/original-manga\//);
  assert.equal(orig.result.banner.endsWith("banner.jpg"), true); assert.equal("cover" in orig.result, false); assert.equal("thumbnail" in orig.result, false); assert.equal("presentation" in orig.result, false);
  assert.equal((await service.report()).mangas.find((manga) => manga.id === orig.result.id).primaryMedia.analysis.level, "success");
  assert.deepEqual(orig.result.languages.orig.pages.map((page) => path.basename(page)), ["page1.jpg", "page2.jpg", "page10.jpg"]);
  const silent = await service.create({ title: "Silent Manga", languageType: "silent", primaryImage: await image("main.jpg", "#121212", 1600, 900), pages: [await image("01.jpg", "#102030")] });
  assert.equal(silent.result.languages.orig.label, "Original / Silent manga");
  const storyboard = await service.create({ title: "Storyboard Copy", slug: "storyboard-copy", presentationSection: "storyboard", languageType: "original", primaryImage: await image("main.jpg", "#111111", 1600, 900), pages: [await image("01.jpg", "#100010")] });
  assert.equal(storyboard.result.presentationSection, "storyboard");
  assert.match(storyboard.result.banner, /^assets\/mangaka\/complete-storyboards\/storyboard-copy\//);
  assert.notEqual(storyboard.result.id, orig.result.id);
  assert.notEqual(storyboard.result.slug, orig.result.slug);
  assert.notEqual(storyboard.result.banner, orig.result.banner);
  await service.update(storyboard.result.id, { title: "Storyboard Copy Updated", presentationSection: "storyboard" });
  assert.equal((await service.readCatalog()).find((manga) => manga.id === orig.result.id).title, "Original Manga");
  await service.update(orig.result.id, { presentationSection: "storyboard" });
  let movedOriginal = (await service.readCatalog()).find((manga) => manga.id === orig.result.id);
  assert.equal(movedOriginal.presentationSection, "storyboard");
  assert.ok(movedOriginal.languages.orig.pages.every((page) => page.startsWith("assets/mangaka/complete-storyboards/original-manga/")));
  await assert.rejects(stat(path.join(root, "public/assets/mangaka/completed-manga/original-manga")), /ENOENT/);
  await service.update(orig.result.id, { presentationSection: "completed" });
  movedOriginal = (await service.readCatalog()).find((manga) => manga.id === orig.result.id);
  assert.ok(movedOriginal.languages.orig.pages.every((page) => page.startsWith("assets/mangaka/completed-manga/original-manga/")));

  const multilingual = await service.create({ title: "Translated Manga", languageType: "multilingual", languageCode: "en", primaryImage: await image("main.jpg", "#131313", 1600, 900), pages: [await image("01.jpg", "#405060")] });
  await service.addLanguage(multilingual.result.id, { code: "fr" });
  let translated = (await service.report()).mangas.find((manga) => manga.id === multilingual.result.id);
  assert.equal(translated.defaultLanguage, "en"); assert.equal(translated.languages.fr.pageCount, 0);

  const thirty = [];
  for (let index = 30; index >= 1; index -= 1) thirty.push(await image(`page${index}.jpg`, { r: index * 3, g: 80, b: 120 }));
  await service.addPages(multilingual.result.id, "fr", { files: thirty, position: 1 });
  translated = (await service.report()).mangas.find((manga) => manga.id === multilingual.result.id);
  assert.equal(translated.languages.fr.pageCount, 30);
  assert.equal(path.basename(translated.languages.fr.pages[1]), "page2.jpg");
  assert.equal(path.basename(translated.languages.fr.pages[9]), "page10.jpg");

  await service.addPages(multilingual.result.id, "en", { files: [await image("first.jpg", "#abcdef")], position: 1 });
  await service.addPages(multilingual.result.id, "en", { files: [await image("last.jpg", "#fedcba")], position: 99 });
  await service.addPages(multilingual.result.id, "en", { files: [await image("middle.jpg", "#334455")], position: 2 });
  translated = (await service.report()).mangas.find((manga) => manga.id === multilingual.result.id);
  assert.deepEqual(translated.languages.en.pages.map((page) => path.basename(page)), ["first.jpg", "middle.jpg", "01.jpg", "last.jpg"]);

  const reordered = [translated.languages.en.pages[0], translated.languages.en.pages[1], translated.languages.en.pages[3], translated.languages.en.pages[2]];
  await service.reorderPages(multilingual.result.id, "en", reordered);
  translated = (await service.report()).mangas.find((manga) => manga.id === multilingual.result.id);
  assert.deepEqual(translated.languages.en.pages, reordered);

  const oldPage = translated.languages.en.pages[1];
  await service.replacePage(multilingual.result.id, "en", 1, { file: { ...(await image("replacement.png", "#778899")), fileName: "replacement.png" }, keepName: true });
  translated = (await service.report()).mangas.find((manga) => manga.id === multilingual.result.id);
  assert.match(translated.languages.en.pages[1], /middle\.png$/); assert.notEqual(translated.languages.en.pages[1], oldPage);
  assert.ok((await readdir(path.join(runtime, "trash/mangas"), { recursive: true })).some((entry) => String(entry).includes("middle.jpg")));

  const beforeDelete = translated.languages.en.pageCount; await service.deletePage(multilingual.result.id, "en", 1);
  translated = (await service.report()).mangas.find((manga) => manga.id === multilingual.result.id); assert.equal(translated.languages.en.pageCount, beforeDelete - 1);
  await assert.rejects(service.addPages(multilingual.result.id, "en", { files: [await image("duplicate.jpg", "#405060")], position: 1 }), /dupliquÃ©e|dupliquée/);

  const oldBanner = translated.banner;
  await service.replacePrimaryMedia(multilingual.result.id, { file: await image("main-new.png", "#908070", 1600, 900) });
  translated = (await service.report()).mangas.find((manga) => manga.id === multilingual.result.id); assert.match(translated.banner, /\.png$/); assert.notEqual(translated.banner, oldBanner); await stat(path.join(root, "public", ...translated.banner.split("/")));
  assert.ok((await readdir(path.join(runtime, "trash/mangas"), { recursive: true })).some((entry) => String(entry).includes("banner.jpg")));
  const revealedPage = await service.reveal(multilingual.result.id, { type: "page", language: "en", index: 0 }); assert.equal(revealedPage.command, "explorer.exe"); assert.deepEqual(revealedPage.args.slice(0, 1), ["/select,"]);
  const revealedCover = await service.reveal(multilingual.result.id, { type: "primary" }); assert.equal(revealedCover.mode, "selected");

  const differenceReport = await service.report(); assert.ok(differenceReport.issues.some((issue) => issue.includes("nombre de pages différent")));
  const missingPath = path.join(root, "public", ...translated.languages.en.pages[0].split("/")); const missingContent = await readFile(missingPath); await rm(missingPath);
  assert.ok((await service.report()).issues.some((issue) => issue.includes("manquante"))); await writeFile(missingPath, missingContent);

  const sourceBeforeRollback = hash(await readFile(path.join(root, "src/content/mangas.js")));
  const failing = createMangaService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true, failurePoint: "after-catalog" }); await failing.initialize();
  await assert.rejects(failing.update("base", { title: "Must Roll Back" }), /simulÃ©|simulé/);
  assert.equal(hash(await readFile(path.join(root, "src/content/mangas.js"))), sourceBeforeRollback);
  const completedDirectoryBeforeSectionRollback = path.join(root, "public/assets/mangaka/completed-manga/original-manga");
  await assert.rejects(failing.update(orig.result.id, { presentationSection: "storyboard" }), /simulÃ©|simulé/);
  assert.equal((await stat(completedDirectoryBeforeSectionRollback)).isDirectory(), true);
  await assert.rejects(stat(path.join(root, "public/assets/mangaka/complete-storyboards/original-manga")), /ENOENT/);
  assert.equal((await service.readCatalog()).find((manga) => manga.id === orig.result.id).presentationSection, "completed");
  const bannerBeforeRollback = hash(await readFile(path.join(root, "public", ...translated.banner.split("/"))));
  await assert.rejects(failing.replacePrimaryMedia(multilingual.result.id, { file: await image("rollback.jpg", "#990000", 1600, 900) }), /simulÃ©|simulé/);
  assert.equal(hash(await readFile(path.join(root, "public", ...translated.banner.split("/")))), bannerBeforeRollback);

  const missingTrash = await removalFixture("missing-trash");
  const observedTrashMoves = [];
  const inspectTrashRename = async (source, destination) => {
    await assert.rejects(stat(destination), /ENOENT/);
    assert.equal(path.dirname(destination), path.join(missingTrash.fixtureRuntime, "trash/mangas"));
    observedTrashMoves.push({ source, destination });
    await rename(source, destination);
  };
  const missingTrashService = createMangaService({
    projectRoot: missingTrash.fixtureRoot,
    runtimeRoot: missingTrash.fixtureRuntime,
    disableReveal: true,
    renameImpl: inspectTrashRename,
  });
  await missingTrashService.initialize();
  await rm(path.join(missingTrash.fixtureRuntime, "trash/mangas"), { recursive: true, force: true });
  await missingTrashService.removeManga(missingTrash.manga.id, missingTrash.manga.slug);
  assert.equal((await stat(path.join(missingTrash.fixtureRuntime, "trash/mangas"))).isDirectory(), true);
  assert.equal(observedTrashMoves.length, 1);
  assert.equal((await stat(path.join(observedTrashMoves[0].destination, "orig/001.jpg"))).isFile(), true);
  await assert.rejects(stat(missingTrash.sourceDirectory), /ENOENT/);

  const gitkeepOnly = await removalFixture("gitkeep-only", { section: "storyboard", slug: "storyboard-trash" });
  const gitkeepService = createMangaService({ projectRoot: gitkeepOnly.fixtureRoot, runtimeRoot: gitkeepOnly.fixtureRuntime, disableReveal: true });
  await gitkeepService.initialize();
  await rm(path.join(gitkeepOnly.fixtureRuntime, "trash"), { recursive: true, force: true });
  await mkdir(path.join(gitkeepOnly.fixtureRuntime, "trash"), { recursive: true });
  await writeFile(path.join(gitkeepOnly.fixtureRuntime, "trash/.gitkeep"), "");
  await gitkeepService.removeManga(gitkeepOnly.manga.id, gitkeepOnly.manga.slug);
  assert.equal((await stat(path.join(gitkeepOnly.fixtureRuntime, "trash/mangas"))).isDirectory(), true);
  assert.equal(await readFile(path.join(gitkeepOnly.fixtureRuntime, "trash/.gitkeep"), "utf8"), "");

  const fixedNow = new Date("2026-07-24T12:34:56.789Z");
  const collision = await removalFixture("trash-collision");
  const collisionService = createMangaService({ projectRoot: collision.fixtureRoot, runtimeRoot: collision.fixtureRuntime, disableReveal: true, now: () => fixedNow });
  await collisionService.initialize();
  const collisionBase = "2026-07-24T12-34-56-789Z-completed-delete-me";
  await mkdir(path.join(collision.fixtureRuntime, "trash/mangas", collisionBase), { recursive: true });
  await collisionService.removeManga(collision.manga.id, collision.manga.slug);
  assert.equal((await stat(path.join(collision.fixtureRuntime, "trash/mangas", `${collisionBase}-2`, "orig/001.jpg"))).isFile(), true);

  const raceCollision = await removalFixture("trash-race-collision");
  let raceRenameCalls = 0;
  const raceRename = async (source, destination) => {
    raceRenameCalls += 1;
    if (raceRenameCalls === 1) {
      await mkdir(destination);
      await writeFile(path.join(destination, "occupied-by-another-operation.txt"), "fixture");
      const error = new Error("rename EPERM causé par une destination apparue pendant la course");
      error.code = "EPERM";
      throw error;
    }
    await rename(source, destination);
  };
  const raceService = createMangaService({
    projectRoot: raceCollision.fixtureRoot,
    runtimeRoot: raceCollision.fixtureRuntime,
    disableReveal: true,
    now: () => fixedNow,
    renameImpl: raceRename,
  });
  await raceService.initialize();
  await raceService.removeManga(raceCollision.manga.id, raceCollision.manga.slug);
  assert.equal(raceRenameCalls, 2);
  assert.equal(await readFile(path.join(raceCollision.fixtureRuntime, "trash/mangas", collisionBase, "occupied-by-another-operation.txt"), "utf8"), "fixture");
  assert.equal((await stat(path.join(raceCollision.fixtureRuntime, "trash/mangas", `${collisionBase}-2`, "orig/001.jpg"))).isFile(), true);

  const missingSource = await removalFixture("missing-source");
  const missingSourceService = createMangaService({ projectRoot: missingSource.fixtureRoot, runtimeRoot: missingSource.fixtureRuntime, disableReveal: true });
  await missingSourceService.initialize();
  const missingSourceCatalogHash = hash(await readFile(missingSource.catalogPath));
  await rm(missingSource.sourceDirectory, { recursive: true, force: true });
  await assert.rejects(missingSourceService.removeManga(missingSource.manga.id, missingSource.manga.slug), /dossier source.*n’existe plus/i);
  assert.equal(hash(await readFile(missingSource.catalogPath)), missingSourceCatalogHash);

  const locked = await removalFixture("locked-source");
  const lockedRename = async () => {
    const error = new Error("rename EPERM simulé");
    error.code = "EPERM";
    throw error;
  };
  const lockedService = createMangaService({ projectRoot: locked.fixtureRoot, runtimeRoot: locked.fixtureRuntime, disableReveal: true, renameImpl: lockedRename });
  await lockedService.initialize();
  const lockedCatalogHash = hash(await readFile(locked.catalogPath));
  await assert.rejects(lockedService.removeManga(locked.manga.id, locked.manga.slug), /Windows refuse.*Fermez/i);
  assert.equal(hash(await readFile(locked.catalogPath)), lockedCatalogHash);
  assert.equal((await stat(locked.sourceDirectory)).isDirectory(), true);
  assert.deepEqual(await readdir(path.join(locked.fixtureRuntime, "trash/mangas")), []);

  for (const failurePoint of ["before-catalog", "invalid-catalog", "after-catalog"]) {
    const rollback = await removalFixture(`delete-rollback-${failurePoint}`);
    const rollbackService = createMangaService({ projectRoot: rollback.fixtureRoot, runtimeRoot: rollback.fixtureRuntime, disableReveal: true, failurePoint });
    await rollbackService.initialize();
    const rollbackCatalog = await readFile(rollback.catalogPath);
    await assert.rejects(rollbackService.removeManga(rollback.manga.id, rollback.manga.slug));
    assert.equal(hash(await readFile(rollback.catalogPath)), hash(rollbackCatalog));
    assert.equal((await stat(rollback.sourceDirectory)).isDirectory(), true);
    assert.deepEqual(await readdir(path.join(rollback.fixtureRuntime, "trash/mangas")), []);
  }

  const wrongRoot = await removalFixture("wrong-section-reference");
  const wrongCatalog = [{
    ...wrongRoot.manga,
    cover: wrongRoot.manga.cover.replace("completed-manga", "complete-storyboards"),
  }];
  await writeFile(wrongRoot.catalogPath, serializeMangaCatalog(wrongCatalog));
  const wrongRootService = createMangaService({ projectRoot: wrongRoot.fixtureRoot, runtimeRoot: wrongRoot.fixtureRuntime, disableReveal: true });
  await wrongRootService.initialize();
  await assert.rejects(wrongRootService.removeManga(wrongRoot.manga.id, wrongRoot.manga.slug), /sort du dossier de section attendu/i);
  assert.equal((await stat(wrongRoot.sourceDirectory)).isDirectory(), true);

  const activeServer = await removalFixture("active-server", { section: "storyboard", slug: "server-storyboard", pageName: "13.webp" });
  const activeCatalog = parseMangaCatalog(await readFile(activeServer.catalogPath, "utf8"));
  const homologRelative = "assets/mangaka/completed-manga/server-completed/orig/13.webp";
  const homologFile = path.join(activeServer.fixtureRoot, "public", ...homologRelative.split("/"));
  await mkdir(path.dirname(homologFile), { recursive: true });
  await writeFile(homologFile, await readFile(activeServer.sourcePage));
  activeCatalog.push({
    ...structuredClone(activeServer.manga),
    id: "server-completed",
    slug: "server-completed",
    route: "/mangas/server-completed",
    title: activeServer.manga.title,
    presentationSection: "completed",
    cover: homologRelative,
    languages: { orig: { ...activeServer.manga.languages.orig, pages: [homologRelative] } },
  });
  await writeFile(activeServer.catalogPath, serializeMangaCatalog(activeCatalog));
  const runningAdmin = await startAdminServer(activeServer.fixtureRoot, activeServer.fixtureRuntime);
  try {
    const adminPage = await fetch(`${runningAdmin.origin}/mangas.html`);
    assert.equal(adminPage.status, 200);
    await adminPage.text();
    const reportResponse = await fetch(`${runningAdmin.origin}/api/mangas`);
    assert.equal(reportResponse.status, 200);
    const activeReport = await reportResponse.json();
    const serverStoryboard = activeReport.mangas.find((manga) => manga.slug === activeServer.manga.slug);
    assert.ok(serverStoryboard);
    for (const relative of [serverStoryboard.cover, serverStoryboard.languages.orig.pages[0]]) {
      const preview = await fetch(`${runningAdmin.origin}/api/manga-image/${encodeURIComponent(relative)}`);
      assert.equal(preview.status, 200);
      assert.ok((await preview.arrayBuffer()).byteLength > 0);
    }
    const removalResponse = await fetch(`${runningAdmin.origin}/api/mangas/${encodeURIComponent(activeServer.manga.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: activeServer.manga.slug }),
    });
    assert.equal(removalResponse.status, 200, await removalResponse.text());
    await assert.rejects(stat(activeServer.sourceDirectory), /ENOENT/);
    assert.equal((await stat(path.dirname(homologFile))).isDirectory(), true);
    const trashEntries = await readdir(path.join(activeServer.fixtureRuntime, "trash/mangas"), { withFileTypes: true });
    const moved = trashEntries.find((entry) => entry.isDirectory() && entry.name.includes(activeServer.manga.slug));
    assert.ok(moved);
    assert.equal((await stat(path.join(activeServer.fixtureRuntime, "trash/mangas", moved.name, "orig/13.webp"))).isFile(), true);
    assert.equal(trashEntries.filter((entry) => entry.isDirectory() && entry.name.includes(activeServer.manga.slug)).length, 1);
    const afterDeleteResponse = await fetch(`${runningAdmin.origin}/api/mangas`);
    assert.equal(afterDeleteResponse.status, 200);
    const afterDeleteReport = await afterDeleteResponse.json();
    assert.equal(afterDeleteReport.mangas.some((manga) => manga.slug === activeServer.manga.slug), false);
    assert.equal(afterDeleteReport.mangas.some((manga) => manga.slug === "server-completed"), true);
    assert.equal(runningAdmin.child.exitCode, null);
  } finally {
    await runningAdmin.stop();
  }

  await service.deleteLanguage(multilingual.result.id, "fr");
  const completedOriginalPage = path.join(root, "public", ...(await service.readCatalog()).find((manga) => manga.id === orig.result.id).languages.orig.pages[0].split("/"));
  const completedOriginalHash = hash(await readFile(completedOriginalPage));
  await service.removeManga(storyboard.result.id, storyboard.result.slug);
  assert.equal(hash(await readFile(completedOriginalPage)), completedOriginalHash);
  assert.equal((await service.report()).mangas.some((manga) => manga.id === orig.result.id), true);
  await service.removeManga(silent.result.id, silent.result.slug);
  assert.equal((await service.report()).mangas.some((manga) => manga.id === silent.result.id), false);
  assert.deepEqual(naturalPageSort(["page10.jpg", "page2.jpg", "page1.jpg"]), ["page1.jpg", "page2.jpg", "page10.jpg"]);

  assert.equal(hash(await readFile(realMangaPath)), realMangaHash);
  assert.equal(hash(await readFile(realArtworkPath)), realArtworkHash);
  assert.equal(hash(await readFile(realAnimationPath)), realAnimationHash);
  assert.equal((await service.readCatalog()).some((manga) => JSON.stringify(manga).includes(root)), false);
  const adminHtml = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/mangas.html"), "utf8");
  const adminApp = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/modules/mangas/manga-admin.js"), "utf8");
  const adminCss = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/modules/mangas/manga-admin.css"), "utf8");
  const readerSource = await readFile(path.join(PROJECT_DIR, "src/components/manga/MangaReader.jsx"), "utf8");
  assert.match(adminHtml, /Ajouter un manga/); assert.match(adminHtml, /name="presentationSection"/); assert.match(adminHtml, /id="manga-section"/); assert.match(adminApp, /ondragstart/); assert.match(adminApp, /workingPages/);
  assert.match(adminApp, /Copie temporaire de test/); assert.match(adminApp, /sectionLabels/);
  assert.match(adminHtml, /Image principale du manga/); assert.doesNotMatch(adminHtml, /name="cover"/);
  assert.match(adminApp, /Taille idéale Photoshop/); assert.match(adminApp, /analysis\.resolution/); assert.match(adminApp, /analysis\.ratioStatus/);
  assert.match(adminCss, /aspect-ratio:16\/9/); assert.match(adminCss, /object-fit:cover/); assert.match(adminCss, /object-position:center/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/Mangaka.jsx"), "utf8"), /manga\.banner \|\| manga\.cover/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/Mangaka.jsx"), "utf8"), /Completed|sections\.completed/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/HomePage.jsx"), "utf8"), /mangas\[0\]\.banner \|\| mangas\[0\]\.cover/);
  assert.match(readerSource, /languages\.length === 1/);
  console.log("Manga Admin — tests d’intégration réussis");
  console.log("serveur actif + aperçu WebP + suppression, orig, silent, en/fr, 30 pages, ordre, corbeille, collisions, erreurs Windows et rollback vérifiés");
} finally {
  await rm(temp, { recursive: true, force: true });
}
