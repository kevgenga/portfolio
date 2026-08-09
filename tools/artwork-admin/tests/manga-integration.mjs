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
import {
  getMangaPresentationSection,
  isMangaPresentationSectionVisible,
  mangaPresentationSettings,
} from "../../../src/content/mangaPresentation.js";
import {
  getMangaCardImage,
  getMangaCardMedia,
} from "../../../src/utils/mangaCardMedia.js";

const PROJECT_DIR = path.resolve(import.meta.dirname, "../../..");
const realMangaPath = path.join(PROJECT_DIR, "src/content/mangas.js");
const realPresentationPath = path.join(PROJECT_DIR, "src/content/mangaPresentation.js");
const realArtworkPath = path.join(PROJECT_DIR, "src/content/artworks.js");
const realAnimationPath = path.join(PROJECT_DIR, "src/content/animations.js");
const realMangaHash = hash(await readFile(realMangaPath));
const realPresentationHash = hash(await readFile(realPresentationPath));
const realArtworkHash = hash(await readFile(realArtworkPath));
const realAnimationHash = hash(await readFile(realAnimationPath));
const temp = await mkdtemp(path.join(tmpdir(), "manga-admin-"));
const root = path.join(temp, "portfolio");
const runtime = path.join(temp, "runtime");
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
const presentationSettingsFixture = (showStoryboardSection = false) => `export const mangaPresentationSettings = Object.freeze({
  showStoryboardSection: ${showStoryboardSection},
});
`;
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
  await writeFile(path.join(fixtureRoot, "src/content/mangaPresentation.js"), presentationSettingsFixture());
  return { fixtureRoot, fixtureRuntime, sourceDirectory, sourcePage, manga, catalogPath };
}

try {
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await mkdir(path.join(root, "public/assets/mangaka/completed-manga/base/orig"), { recursive: true });
  for (const folder of ["english", "french", "en", "fr"]) {
    await mkdir(path.join(root, "public/assets/mangaka/completed-manga/legacy-translated", folder), { recursive: true });
  }
  const basePage = await image("001.jpg", "#551122");
  await writeFile(path.join(root, "public/assets/mangaka/completed-manga/base/orig/001.jpg"), Buffer.from(basePage.dataBase64, "base64"));
  const legacyFiles = {
    "english/01.jpg": await image("01.jpg", "#102030"),
    "english/02.jpg": await image("02.jpg", "#203040"),
    "en/0000.jpg": await image("0000.jpg", "#ffffff"),
    "french/01.jpg": await image("01.jpg", "#304050"),
    "french/02.jpg": await image("02.jpg", "#405060"),
    "fr/0000.jpg": await image("0000.jpg", "#ffffff"),
  };
  for (const [relative, upload] of Object.entries(legacyFiles)) {
    await writeFile(
      path.join(root, "public/assets/mangaka/completed-manga/legacy-translated", ...relative.split("/")),
      Buffer.from(upload.dataBase64, "base64"),
    );
  }
  const legacyPrefix = "assets/mangaka/completed-manga/legacy-translated";
  const initial = [
    { id: "base", slug: "base", route: "/mangas/base", title: "Base", edition: "", presentationSection: "completed", cover: "assets/mangaka/completed-manga/base/orig/001.jpg", banner: "", summary: "", genre: "", role: "", year: "", readingDirection: "rtl", defaultLanguage: "orig", languages: { orig: { label: "Original", shortLabel: "ORIG", pages: ["assets/mangaka/completed-manga/base/orig/001.jpg"] } }, featured: false },
    { id: "legacy-translated", slug: "legacy-translated", route: "/mangas/legacy-translated", title: "Legacy translated", edition: "", presentationSection: "completed", cover: `${legacyPrefix}/english/01.jpg`, banner: "", summary: "", genre: "", role: "", year: "", readingDirection: "rtl", defaultLanguage: "en", languages: { en: { label: "English", shortLabel: "ENG", pages: [`${legacyPrefix}/english/01.jpg`, `${legacyPrefix}/en/0000.jpg`, `${legacyPrefix}/english/02.jpg`] }, fr: { label: "French", shortLabel: "FR", pages: [`${legacyPrefix}/french/01.jpg`, `${legacyPrefix}/fr/0000.jpg`, `${legacyPrefix}/french/02.jpg`] } }, featured: false },
  ];
  await writeFile(path.join(root, "src/content/mangas.js"), serializeMangaCatalog(initial));
  await writeFile(path.join(root, "src/content/mangaPresentation.js"), presentationSettingsFixture());
  let mutationNotifications = 0;
  const service = createMangaService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true, onMutation: () => { mutationNotifications += 1; } }); await service.initialize();
  if (process.platform === "win32") assert.equal(sharp.cache().files.max, 0);
  assert.equal((await service.report()).count, 2);
  const settingsCatalogHash = hash(await readFile(path.join(root, "src/content/mangas.js")));
  const settingsPageHash = hash(await readFile(path.join(root, "public/assets/mangaka/completed-manga/base/orig/001.jpg")));
  assert.deepEqual(await service.readPresentationSettings(), { showStoryboardSection: false });
  assert.deepEqual(await service.updatePresentationSettings({ showStoryboardSection: true }), { showStoryboardSection: true });
  assert.deepEqual(await service.readPresentationSettings(), { showStoryboardSection: true });
  assert.equal(hash(await readFile(path.join(root, "src/content/mangas.js"))), settingsCatalogHash);
  assert.equal(hash(await readFile(path.join(root, "public/assets/mangaka/completed-manga/base/orig/001.jpg"))), settingsPageHash);
  assert.equal(mutationNotifications, 0);
  await assert.rejects(service.updatePresentationSettings({ showStoryboardSection: "false" }), /visibilit/i);
  await service.updatePresentationSettings({ showStoryboardSection: false });
  assert.deepEqual(await service.readPresentationSettings(), { showStoryboardSection: false });
  assert.ok((await readdir(path.join(runtime, "backups/mangas"))).some((entry) => entry.includes("presentation-settings")));

  const legacyRoot = path.join(root, "public/assets/mangaka/completed-manga/legacy-translated");
  const historicalHashes = new Map();
  for (const relative of ["english/01.jpg", "english/02.jpg", "french/01.jpg", "french/02.jpg"]) {
    historicalHashes.set(relative, hash(await readFile(path.join(legacyRoot, ...relative.split("/")))));
  }
  const externalDirectory = path.join(temp, "external-pages");
  await mkdir(externalDirectory, { recursive: true });
  const externalEnglishPath = path.join(externalDirectory, "0000-2.jpg");
  await writeFile(externalEnglishPath, Buffer.from(legacyFiles["en/0000.jpg"].dataBase64, "base64"));
  const externalEnglish = { fileName: path.basename(externalEnglishPath), dataBase64: (await readFile(externalEnglishPath)).toString("base64") };
  await service.addPages("legacy-translated", "en", { files: [externalEnglish], position: 2 });
  let persistedLegacy = (await service.readCatalog()).find((manga) => manga.id === "legacy-translated");
  assert.equal(persistedLegacy.languages.en.pages.length, 4);
  assert.match(persistedLegacy.languages.en.pages[1], /\/english\/0000-2\.jpg$/);
  assert.equal(persistedLegacy.languages.en.storageFolder, "english");
  assert.deepEqual(await readdir(path.join(legacyRoot, "en")), ["0000.jpg"]);
  assert.equal(hash(await readFile(externalEnglishPath)), hash(Buffer.from(externalEnglish.dataBase64, "base64")));

  await assert.rejects(
    service.addPages("legacy-translated", "en", { files: [externalEnglish], position: 2 }),
    /dupliquÃ©e|dupliquée/,
  );
  await service.addPages("legacy-translated", "en", { files: [await image("0000-2.jpg", "#112233")], position: 3 });
  persistedLegacy = (await service.readCatalog()).find((manga) => manga.id === "legacy-translated");
  assert.match(persistedLegacy.languages.en.pages[2], /\/english\/0000-2-2\.jpg$/);

  const externalFrench = await image("nouvelle-page.jpg", "#667788");
  await service.addPages("legacy-translated", "fr", { files: [externalFrench], position: 2 });
  persistedLegacy = (await service.readCatalog()).find((manga) => manga.id === "legacy-translated");
  assert.match(persistedLegacy.languages.fr.pages[1], /\/french\/nouvelle-page\.jpg$/);
  assert.equal(persistedLegacy.languages.fr.storageFolder, "french");
  assert.deepEqual(await readdir(path.join(legacyRoot, "fr")), ["0000.jpg"]);

  const repairedEnglish = await service.repairLanguageStorage("legacy-translated", "en");
  const repairedFrench = await service.repairLanguageStorage("legacy-translated", "fr");
  assert.equal(repairedEnglish.result.storageFolder, "english");
  assert.equal(repairedFrench.result.storageFolder, "french");
  assert.equal(repairedEnglish.result.moved.length, 1);
  assert.equal(repairedFrench.result.moved.length, 1);
  assert.deepEqual(await readdir(path.join(legacyRoot, "en")), []);
  assert.deepEqual(await readdir(path.join(legacyRoot, "fr")), []);
  persistedLegacy = (await service.readCatalog()).find((manga) => manga.id === "legacy-translated");
  assert.equal(persistedLegacy.languages.en.storageFolder, "english");
  assert.equal(persistedLegacy.languages.fr.storageFolder, "french");
  assert.ok(persistedLegacy.languages.en.pages.every((page) => page.startsWith(`${legacyPrefix}/english/`)));
  assert.ok(persistedLegacy.languages.fr.pages.every((page) => page.startsWith(`${legacyPrefix}/french/`)));
  assert.match(persistedLegacy.languages.en.pages[3], /\/english\/0000\.jpg$/);
  assert.match(persistedLegacy.languages.fr.pages[2], /\/french\/0000\.jpg$/);
  for (const [relative, expectedHash] of historicalHashes) {
    assert.equal(hash(await readFile(path.join(legacyRoot, ...relative.split("/")))), expectedHash);
  }
  await service.validateFiles(await service.readCatalog());

  assert.equal(getMangaPresentationSection({}), "completed");
  assert.equal(mangaPresentationSettings.showStoryboardSection, false);
  assert.equal(isMangaPresentationSectionVisible({ presentationSection: "completed" }), true);
  assert.equal(isMangaPresentationSectionVisible({ presentationSection: "storyboard" }), false);
  assert.equal(isMangaPresentationSectionVisible({ presentationSection: "storyboard" }, { showStoryboardSection: true }), true);
  assert.equal(primaryMangaMedia(initial[0]).field, "cover");
  assert.deepEqual(primaryMangaMedia(initial[0]), getMangaCardMedia(initial[0]));
  assert.equal(getMangaCardImage(initial[0]), initial[0].cover);
  assert.equal(getMangaCardImage({ banner: "canonical.jpg", cover: "legacy.jpg" }), "canonical.jpg");
  assert.deepEqual(primaryMangaMedia({ banner: "", cover: "" }), { field: "banner", path: "", fallback: false });
  assert.equal(analyzeMangaCardMedia(null).level, "error");
  const highQuality = analyzeMangaCardMedia({ width: 1200, height: 1600 }); assert.equal(highQuality.resolution.label, "Haute qualité"); assert.equal(highQuality.ratioStatus.label, "Conforme");
  const ideal = analyzeMangaCardMedia({ width: 900, height: 1200 }); assert.equal(ideal.resolution.label, "Taille idéale"); assert.equal(ideal.ratioStatus.label, "Conforme");
  assert.equal(analyzeMangaCardMedia({ width: 750, height: 1000 }).resolution.label, "Qualité correcte");
  assert.equal(analyzeMangaCardMedia({ width: 600, height: 800 }).resolution.label, "Qualité minimale acceptable");
  assert.equal(analyzeMangaCardMedia({ width: 599, height: 799 }).resolution.label, "Image trop petite");
  const legendStatus = analyzeMangaCardMedia({ width: 894, height: 400 }); assert.equal(legendStatus.resolution.label, "Image trop petite"); assert.equal(legendStatus.ratioStatus.label, "Ratio fortement incorrect");
  const stubbornStatus = analyzeMangaCardMedia({ width: 800, height: 1127 }); assert.equal(stubbornStatus.resolution.label, "Qualité correcte"); assert.equal(stubbornStatus.ratioStatus.level, "warning");
  const ahesStatus = analyzeMangaCardMedia({ width: 1299, height: 1949 }); assert.equal(ahesStatus.resolution.label, "Haute qualité"); assert.equal(ahesStatus.ratioStatus.level, "error");
  assert.equal(analyzeMangaCardMedia({ width: 900, height: 1200 }).ratioStatus.label, "Conforme");
  assert.equal(analyzeMangaCardMedia({ width: 800, height: 1100 }).ratioStatus.level, "warning");

  const legacyBeforeReplacement = (await service.readCatalog()).find((manga) => manga.id === "base");
  const { banner: legacyBannerBefore, ...legacyDataBefore } = legacyBeforeReplacement;
  assert.equal(legacyBannerBefore, "");
  await service.replacePrimaryMedia("base", { file: await image("card.jpg", "#225577", 900, 1200) });
  const legacyAfterReplacement = (await service.readCatalog()).find((manga) => manga.id === "base");
  const { banner: legacyBannerAfter, ...legacyDataAfter } = legacyAfterReplacement;
  assert.match(legacyBannerAfter, /\/banner\.jpg$/);
  assert.deepEqual(legacyDataAfter, legacyDataBefore);
  assert.equal(getMangaCardImage(legacyAfterReplacement), legacyBannerAfter);
  const legacyAdminReport = (await service.report()).mangas.find((manga) => manga.id === "base");
  assert.equal(legacyAdminReport.primaryMedia.path, legacyBannerAfter);
  assert.equal(legacyAdminReport.primaryMedia.field, "banner");
  assert.equal(legacyAdminReport.primaryMedia.fallback, false);

  const orig = await service.create({ title: "Original Manga", languageType: "original", primaryImage: await image("main.jpg", "#111111", 1200, 1600), pages: [await image("page10.jpg", "#100010"), await image("page2.jpg", "#200020"), await image("page1.jpg", "#300030")] });
  assert.equal(orig.result.defaultLanguage, "orig");
  assert.equal(orig.result.presentationSection, "completed");
  assert.match(orig.result.banner, /^assets\/mangaka\/completed-manga\/original-manga\//);
  assert.equal(orig.result.banner.endsWith("banner.jpg"), true); assert.equal("cover" in orig.result, false); assert.equal("thumbnail" in orig.result, false); assert.equal("presentation" in orig.result, false);
  assert.equal((await service.report()).mangas.find((manga) => manga.id === orig.result.id).primaryMedia.analysis.level, "success");
  assert.deepEqual(orig.result.languages.orig.pages.map((page) => path.basename(page)), ["page1.jpg", "page2.jpg", "page10.jpg"]);
  const silent = await service.create({ title: "Silent Manga", languageType: "silent", primaryImage: await image("main.jpg", "#121212", 1200, 1600), pages: [await image("01.jpg", "#102030")] });
  assert.equal(silent.result.languages.orig.label, "Original / Silent manga");
  const storyboard = await service.create({ title: "Storyboard Copy", slug: "storyboard-copy", presentationSection: "storyboard", languageType: "original", primaryImage: await image("main.jpg", "#111111", 1200, 1600), pages: [await image("01.jpg", "#100010")] });
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

  const multilingual = await service.create({ title: "Translated Manga", languageType: "multilingual", languageCode: "en", primaryImage: await image("main.jpg", "#131313", 1200, 1600), pages: [await image("01.jpg", "#405060")] });
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
  const sameContentDifferentName = await image("duplicate.jpg", "#405060");
  await service.addPages(multilingual.result.id, "en", { files: [sameContentDifferentName], position: 1 });
  await assert.rejects(service.addPages(multilingual.result.id, "en", { files: [sameContentDifferentName], position: 1 }), /dupliquÃ©e|dupliquée/);

  const translatedBeforeReplacement = (await service.readCatalog()).find((manga) => manga.id === multilingual.result.id);
  const { banner: oldBanner, ...translatedDataBefore } = translatedBeforeReplacement;
  await service.replacePrimaryMedia(multilingual.result.id, { file: await image("main-new.png", "#908070", 1200, 1600) });
  const translatedAfterReplacement = (await service.readCatalog()).find((manga) => manga.id === multilingual.result.id);
  const { banner: newBanner, ...translatedDataAfter } = translatedAfterReplacement;
  assert.match(newBanner, /\.png$/);
  assert.notEqual(newBanner, oldBanner);
  assert.deepEqual(translatedDataAfter, translatedDataBefore);
  assert.equal(getMangaCardImage(translatedAfterReplacement), newBanner);
  translated = (await service.report()).mangas.find((manga) => manga.id === multilingual.result.id);
  assert.equal(translated.primaryMedia.path, newBanner);
  await stat(path.join(root, "public", ...newBanner.split("/")));
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
    const settingsResponse = await fetch(`${runningAdmin.origin}/api/manga-presentation-settings`);
    assert.equal(settingsResponse.status, 200);
    assert.deepEqual(await settingsResponse.json(), { showStoryboardSection: false });
    const toggleResponse = await fetch(`${runningAdmin.origin}/api/manga-presentation-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showStoryboardSection: true }),
    });
    assert.equal(toggleResponse.status, 200);
    assert.equal((await toggleResponse.json()).showStoryboardSection, true);
    assert.equal((await (await fetch(`${runningAdmin.origin}/api/manga-presentation-settings`)).json()).showStoryboardSection, true);
    assert.equal((await (await fetch(`${runningAdmin.origin}/api/mangas`)).json()).count, 2);
    const serverStoryboard = activeReport.mangas.find((manga) => manga.slug === activeServer.manga.slug);
    assert.ok(serverStoryboard);
    for (const relative of [serverStoryboard.cover, serverStoryboard.languages.orig.pages[0]]) {
      const preview = await fetch(`${runningAdmin.origin}/api/manga-image/${encodeURIComponent(relative)}`);
      assert.equal(preview.status, 200);
      assert.ok((await preview.arrayBuffer()).byteLength > 0);
    }
    const completedBeforeReplacement = activeReport.mangas.find((manga) => manga.id === "server-completed");
    const replacementResponse = await fetch(`${runningAdmin.origin}/api/mangas/server-completed/media/primary`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: await image("new-card.jpg", "#334477", 900, 1200) }),
    });
    assert.equal(replacementResponse.status, 200, await replacementResponse.text());
    const afterReplacementReport = await (await fetch(`${runningAdmin.origin}/api/mangas`)).json();
    const completedAfterReplacement = afterReplacementReport.mangas.find((manga) => manga.id === "server-completed");
    assert.match(completedAfterReplacement.banner, /\/banner\.jpg$/);
    assert.equal(completedAfterReplacement.primaryMedia.path, completedAfterReplacement.banner);
    assert.equal(completedAfterReplacement.primaryMedia.field, "banner");
    assert.equal(completedAfterReplacement.cover, completedBeforeReplacement.cover);
    assert.equal(completedAfterReplacement.slug, completedBeforeReplacement.slug);
    assert.equal(completedAfterReplacement.route, completedBeforeReplacement.route);
    assert.equal(completedAfterReplacement.defaultLanguage, completedBeforeReplacement.defaultLanguage);
    assert.deepEqual(completedAfterReplacement.languages, completedBeforeReplacement.languages);
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
  assert.equal(hash(await readFile(realPresentationPath)), realPresentationHash);
  assert.equal(hash(await readFile(realArtworkPath)), realArtworkHash);
  assert.equal(hash(await readFile(realAnimationPath)), realAnimationHash);
  assert.equal((await service.readCatalog()).some((manga) => JSON.stringify(manga).includes(root)), false);
  const adminHtml = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/mangas.html"), "utf8");
  const adminApp = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/modules/mangas/manga-admin.js"), "utf8");
  const adminCss = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/modules/mangas/manga-admin.css"), "utf8");
  const publicCss = await readFile(path.join(PROJECT_DIR, "src/index.css"), "utf8");
  const readerSource = await readFile(path.join(PROJECT_DIR, "src/components/manga/MangaReader.jsx"), "utf8");
  assert.match(adminHtml, /Ajouter un manga/); assert.match(adminHtml, /name="presentationSection"/); assert.match(adminHtml, /id="manga-section"/); assert.match(adminApp, /ondragstart/); assert.match(adminApp, /workingPages/);
  assert.match(adminHtml, /Visibilité publique de la section Storyboards/);
  assert.match(adminApp, /api\/manga-presentation-settings/);
  assert.match(adminApp, /adminPreview=1/);
  assert.match(adminApp, /Masquer toute la section Storyboards & Manga Concepts/);
  assert.match(adminApp, /Copie temporaire de test/); assert.match(adminApp, /sectionLabels/);
  assert.match(adminHtml, /Image de la carte Manga/); assert.doesNotMatch(adminHtml, /name="cover"/);
  assert.match(adminApp, /Taille idéale Photoshop/); assert.match(adminApp, /analysis\.resolution/); assert.match(adminApp, /analysis\.ratioStatus/); assert.match(adminApp, /manga\.primaryMedia\.path/);
  assert.match(adminCss, /aspect-ratio:3\/4/); assert.match(adminCss, /object-fit:cover/); assert.match(adminCss, /object-position:center/);
  assert.match(publicCss, /\.manga-card__media[\s\S]*?aspect-ratio:\s*3\s*\/\s*4/);
  assert.match(publicCss, /\.manga-card__body[\s\S]*?width:\s*100%/);
  assert.match(publicCss, /\.manga-card__body[\s\S]*?margin:\s*0;/);
  assert.doesNotMatch(publicCss, /margin:\s*-1\.1rem/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/Mangaka.jsx"), "utf8"), /getMangaCardImage\(manga\)/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/Mangaka.jsx"), "utf8"), /Completed|sections\.completed/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/Mangaka.jsx"), "utf8"), /mangaPresentationSettings\.showStoryboardSection/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/MangaReaderPage.jsx"), "utf8"), /isMangaPresentationSectionVisible/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/MangaReaderPage.jsx"), "utf8"), /<Navigate to="\/mangaka" replace/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/HomePage.jsx"), "utf8"), /sitePresentation/);
  assert.match(readerSource, /languages\.length === 1/);
  console.log("Manga Admin — tests d’intégration réussis");
  console.log("serveur actif + aperçu WebP + suppression, orig, silent, en/fr, 30 pages, ordre, corbeille, collisions, erreurs Windows et rollback vérifiés");
} finally {
  await rm(temp, { recursive: true, force: true });
}
