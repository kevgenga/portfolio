import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { naturalPageSort, serializeMangaCatalog } from "../manga/catalog.mjs";
import { analyzeMangaCardMedia, primaryMangaMedia } from "../manga/media-policy.mjs";
import { createMangaService } from "../manga/service.mjs";

const PROJECT_DIR = path.resolve(import.meta.dirname, "../../..");
const realMangaPath = path.join(PROJECT_DIR, "src/content/mangas.js");
const realArtworkPath = path.join(PROJECT_DIR, "src/content/artworks.js");
const realMangaHash = hash(await readFile(realMangaPath));
const realArtworkHash = hash(await readFile(realArtworkPath));
const temp = await mkdtemp(path.join(tmpdir(), "manga-admin-"));
const root = path.join(temp, "portfolio");
const runtime = path.join(temp, "runtime");
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
async function image(name, color, width = 20, height = 30) { const pipeline = sharp({ create: { width, height, channels: 3, background: color } }); const buffer = path.extname(name).toLowerCase() === ".png" ? await pipeline.png().toBuffer() : await pipeline.jpeg().toBuffer(); return { fileName: name, dataBase64: buffer.toString("base64") }; }

try {
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await mkdir(path.join(root, "public/assets/mangaka/base/orig"), { recursive: true });
  const basePage = await image("001.jpg", "#551122");
  await writeFile(path.join(root, "public/assets/mangaka/base/orig/001.jpg"), Buffer.from(basePage.dataBase64, "base64"));
  const initial = [{ id: "base", slug: "base", route: "/mangas/base", title: "Base", edition: "", cover: "assets/mangaka/base/orig/001.jpg", banner: "", summary: "", genre: "", role: "", year: "", readingDirection: "rtl", defaultLanguage: "orig", languages: { orig: { label: "Original", shortLabel: "ORIG", pages: ["assets/mangaka/base/orig/001.jpg"] } }, featured: false }];
  await writeFile(path.join(root, "src/content/mangas.js"), serializeMangaCatalog(initial));
  const service = createMangaService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true }); await service.initialize();
  assert.equal((await service.report()).count, 1);
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
  assert.equal(orig.result.banner.endsWith("banner.jpg"), true); assert.equal("cover" in orig.result, false); assert.equal("thumbnail" in orig.result, false); assert.equal("presentation" in orig.result, false);
  assert.equal((await service.report()).mangas.find((manga) => manga.id === orig.result.id).primaryMedia.analysis.level, "success");
  assert.deepEqual(orig.result.languages.orig.pages.map((page) => path.basename(page)), ["page1.jpg", "page2.jpg", "page10.jpg"]);
  const silent = await service.create({ title: "Silent Manga", languageType: "silent", primaryImage: await image("main.jpg", "#121212", 1600, 900), pages: [await image("01.jpg", "#102030")] });
  assert.equal(silent.result.languages.orig.label, "Original / Silent manga");

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
  const bannerBeforeRollback = hash(await readFile(path.join(root, "public", ...translated.banner.split("/"))));
  await assert.rejects(failing.replacePrimaryMedia(multilingual.result.id, { file: await image("rollback.jpg", "#990000", 1600, 900) }), /simulÃ©|simulé/);
  assert.equal(hash(await readFile(path.join(root, "public", ...translated.banner.split("/")))), bannerBeforeRollback);

  await service.deleteLanguage(multilingual.result.id, "fr");
  await service.removeManga(silent.result.id, silent.result.slug);
  assert.equal((await service.report()).mangas.some((manga) => manga.id === silent.result.id), false);
  assert.deepEqual(naturalPageSort(["page10.jpg", "page2.jpg", "page1.jpg"]), ["page1.jpg", "page2.jpg", "page10.jpg"]);

  assert.equal(hash(await readFile(realMangaPath)), realMangaHash);
  assert.equal(hash(await readFile(realArtworkPath)), realArtworkHash);
  assert.equal((await service.readCatalog()).some((manga) => JSON.stringify(manga).includes(root)), false);
  const adminHtml = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/mangas.html"), "utf8");
  const adminApp = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/modules/mangas/manga-admin.js"), "utf8");
  const adminCss = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/modules/mangas/manga-admin.css"), "utf8");
  const readerSource = await readFile(path.join(PROJECT_DIR, "src/components/manga/MangaReader.jsx"), "utf8");
  assert.match(adminHtml, /Ajouter un manga/); assert.match(adminApp, /ondragstart/); assert.match(adminApp, /workingPages/);
  assert.match(adminHtml, /Image principale du manga/); assert.doesNotMatch(adminHtml, /name="cover"/);
  assert.match(adminApp, /Taille idéale Photoshop/); assert.match(adminApp, /analysis\.resolution/); assert.match(adminApp, /analysis\.ratioStatus/);
  assert.match(adminCss, /aspect-ratio:16\/9/); assert.match(adminCss, /object-fit:cover/); assert.match(adminCss, /object-position:center/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/Mangaka.jsx"), "utf8"), /manga\.banner \|\| manga\.cover/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/HomePage.jsx"), "utf8"), /mangas\[0\]\.banner \|\| mangas\[0\]\.cover/);
  assert.match(readerSource, /languages\.length === 1/);
  console.log("Manga Admin — tests d’intégration réussis");
  console.log("orig, silent, en/fr, 30 pages, ordre, remplacement, corbeille, rollback, médias et reveal vérifiés");
} finally {
  await rm(temp, { recursive: true, force: true });
}
