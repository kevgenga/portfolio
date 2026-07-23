import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import sharp from "sharp";
import { normalizeAnimationDate, parseAnimationCatalog, serializeAnimationCatalog } from "../animation/catalog.mjs";
import { handleAnimationRoute } from "../animation/routes.mjs";
import { createAnimationService } from "../animation/service.mjs";
import { usesCustomAlternativeText } from "../public/modules/animations/alt-utils.js";
import { formatAnimationAdminDate, parseAnimationDate } from "../public/modules/animations/date-utils.js";

const PROJECT_DIR = path.resolve(import.meta.dirname, "../../..");
const realPaths = ["src/content/animations.js", "src/content/mangas.js", "src/content/artworks.js"].map((relative) => path.join(PROJECT_DIR, relative));
const realHashes = new Map(await Promise.all(realPaths.map(async (file) => [file, hash(await readFile(file))])));
const realAnimationCount = parseAnimationCatalog(await readFile(realPaths[0], "utf8")).length;
const temp = await mkdtemp(path.join(tmpdir(), "animation-admin-"));
const root = path.join(temp, "portfolio");
const runtime = path.join(temp, "runtime");
const catalogFile = path.join(root, "src/content/animations.js");
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function upload(name, buffer) { return { fileName: name, dataBase64: buffer.toString("base64") }; }
function videoBuffer(brand = "isom", payload = "video") { return Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp"), Buffer.from(brand.padEnd(16, "0")), Buffer.from(payload)]); }
function webmBuffer(payload = "webm") { return Buffer.concat([Buffer.from("1a45dfa3", "hex"), Buffer.from(payload)]); }
async function imageBuffer(format = "jpeg", color = "#763348") {
  let pipeline = sharp({ create: { width: 32, height: 18, channels: 3, background: color } });
  if (format === "png") pipeline = pipeline.png(); else if (format === "webp") pipeline = pipeline.webp(); else if (format === "gif") pipeline = pipeline.gif(); else pipeline = pipeline.jpeg();
  return pipeline.toBuffer();
}
async function directoryFiles(directory) {
  try { return await readdir(directory, { recursive: true }); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
async function assertStagingEmpty(service) { assert.deepEqual(await directoryFiles(service.paths.stagingRoot), []); }

try {
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await mkdir(path.join(root, "public/assets/animation/miniature"), { recursive: true });
  const baseVideo = videoBuffer("isom", "base-video"); const basePoster = await imageBuffer("jpeg", "#223344");
  await writeFile(path.join(root, "public/assets/animation/base.mp4"), baseVideo);
  await writeFile(path.join(root, "public/assets/animation/miniature/base.jpg"), basePoster);
  const initial = [{ id: "base", title: "Base Animation", video: "assets/animation/base.mp4", poster: "assets/animation/miniature/base.jpg", category: "animation 2d", duration: null, date: "2024-01-02", year: 2024, alt: "Base animation", featured: false, type: "video" }];
  await writeFile(catalogFile, serializeAnimationCatalog(initial));
  const service = createAnimationService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true, maxMediaBytes: 5 * 1024 * 1024 });
  await service.initialize();

  const firstReport = await service.report();
  assert.equal(firstReport.count, 1); assert.deepEqual(firstReport.categories, ["court-métrage", "animation 2d", "animation 3d"]);
  assert.equal(firstReport.animations[0].mediaKind, "video"); assert.equal(firstReport.animations[0].mediaDetails.size, baseVideo.length);
  let routeBody;
  assert.equal(await handleAnimationRoute({ method: "GET" }, {}, new URL("http://local/api/animations"), { service, readJson: async () => ({}), sendJson: (response, status, body) => { routeBody = { status, body }; } }), true);
  assert.equal(routeBody.status, 200); assert.equal(routeBody.body.count, 1);
  const rangeResponse = new PassThrough(); const rangeChunks = []; let rangeStatus; let rangeHeaders;
  rangeResponse.writeHead = (status, headers) => { rangeStatus = status; rangeHeaders = headers; return rangeResponse; };
  rangeResponse.on("data", (chunk) => rangeChunks.push(chunk));
  assert.equal(await handleAnimationRoute({ method: "GET", headers: { range: "bytes=0-7" } }, rangeResponse, new URL(`http://local/api/animation-asset/${encodeURIComponent(initial[0].video)}`), { service, readJson: async () => ({}), sendJson: () => undefined }), true);
  await once(rangeResponse, "finish");
  assert.equal(rangeStatus, 206); assert.equal(rangeHeaders["Content-Range"], `bytes 0-7/${baseVideo.length}`); assert.deepEqual(Buffer.concat(rangeChunks), baseVideo.subarray(0, 8));
  assert.deepEqual(normalizeAnimationDate("03/02/2025"), { date: "2025-02-03", year: 2025 });
  assert.deepEqual(normalizeAnimationDate("04-03-2025"), { date: "2025-03-04", year: 2025 });
  assert.deepEqual(normalizeAnimationDate("2025-04-05"), { date: "2025-04-05", year: 2025 });
  assert.throws(() => normalizeAnimationDate("31/02/2025"), /existe/);
  assert.equal(formatAnimationAdminDate("2025-02-01"), "01-02-2025");
  assert.equal(formatAnimationAdminDate("15-07-2023"), "15-07-2023");
  assert.equal(formatAnimationAdminDate("12/12/2022"), "12-12-2022");
  assert.equal(formatAnimationAdminDate("2024-02-29"), "29-02-2024");
  assert.equal(formatAnimationAdminDate("2023-02-29"), ""); assert.equal(formatAnimationAdminDate(""), ""); assert.equal(parseAnimationDate("31-02-2025"), null); assert.throws(() => normalizeAnimationDate(""), /respecter/);
  assert.equal(usesCustomAlternativeText("Character Study", " character study! "), false);
  assert.equal(usesCustomAlternativeText("Character Study", "A character turning in space"), true);
  assert.equal(usesCustomAlternativeText("", "Historical alternative text"), true);

  const videoCreated = await service.create({ title: "New Film", date: "03/02/2025", category: "court-métrage", alt: "New film", media: upload("film.mp4", videoBuffer("mp42", "film-one")), poster: upload("film-poster.jpg", await imageBuffer("jpeg", "#334455")), position: 1 });
  assert.equal(videoCreated.result.date, "2025-02-03"); assert.equal(videoCreated.result.year, 2025); assert.equal(videoCreated.result.type, "video");
  const imageCreated = await service.create({ title: "Still Animation", date: "04-03-2025", category: "animation 2d", alt: "Still", media: upload("still.png", await imageBuffer("png", "#445566")) });
  assert.equal(imageCreated.result.poster, ""); assert.equal(imageCreated.result.type, "image");
  const gifBuffer = await imageBuffer("gif", "#556677");
  const gifCreated = await service.create({ title: "Animated GIF", date: "2025-04-05", category: "animation 2d", alt: "GIF", media: upload("motion.gif", gifBuffer) });
  assert.equal(gifCreated.result.type, "image"); assert.equal((await service.report()).animations.find((entry) => entry.id === gifCreated.result.id).mediaKind, "gif");
  const automaticAlt = await service.create({ title: "Automatic Alt", date: "06-05-2025", category: "animation 3d", useTitleAsAlt: true, media: upload("automatic-alt.png", await imageBuffer("png", "#5f6f7f")) });
  assert.equal(automaticAlt.result.alt, "Automatic Alt"); assert.equal(automaticAlt.result.category, "animation 3d");
  const customAlt = await service.create({ title: "Spatial Study", date: "07-05-2025", category: "animation 3d", alt: "A rotating three-dimensional character study", useTitleAsAlt: false, media: upload("spatial-study.png", await imageBuffer("png", "#607080")) });
  assert.equal(customAlt.result.alt, "A rotating three-dimensional character study");
  await service.update(imageCreated.result.id, { title: "Still Animation", date: "04-03-2025", category: "animation 3d", alt: "Still", position: imageCreated.result.position });
  assert.equal((await service.report()).animations.find((entry) => entry.id === imageCreated.result.id).category, "animation 3d");
  await service.update("base", { title: "Base Animation", date: "2024-01-02", category: "animation 2d" });
  assert.equal((await service.report()).animations.find((entry) => entry.id === "base").alt, "Base animation");
  await assert.rejects(service.create({ title: "", date: "2025-01-01", category: "animation 2d", useTitleAsAlt: true, media: upload("no-title.png", await imageBuffer("png", "#101010")) }), /titre/i);
  await assert.rejects(service.create({ title: "Bad Date", date: "31/02/2025", category: "animation 2d", alt: "Bad", media: upload("bad-date.png", await imageBuffer("png", "#111111")) }), /existe/);
  await assert.rejects(service.create({ title: "Bad Category", date: "2025-01-01", category: "unknown", alt: "Bad", media: upload("bad-category.png", await imageBuffer("png", "#121212")) }), /Catégorie/);
  await assert.rejects(service.create({ title: "No Poster", date: "2025-01-01", category: "animation 2d", alt: "Video", media: upload("no-poster.mp4", videoBuffer("isom", "no-poster")) }), /poster/i);
  await assert.rejects(service.create({ title: "Fake MP4", date: "2025-01-01", category: "animation 2d", alt: "Fake", media: upload("fake.mp4", Buffer.from("not a video")), poster: upload("fake-poster.jpg", await imageBuffer("jpeg", "#131313")) }), /contenu/);
  await assert.rejects(service.create({ title: "Fake JPG", date: "2025-01-01", category: "animation 2d", alt: "Fake", media: upload("fake.jpg", Buffer.from("not an image")) }), /contenu/);
  await assert.rejects(service.create({ title: "Duplicate", date: "2025-01-01", category: "animation 2d", alt: "Duplicate", media: upload("duplicate.gif", gifBuffer) }), /dupliqué/);

  let current = (await service.report()).animations.find((entry) => entry.id === videoCreated.result.id);
  const originalPoster = current.poster;
  await service.replacePoster(current.id, { file: upload("poster-new.png", await imageBuffer("png", "#667788")), nameMode: "new", compression: { enabled: false } });
  current = (await service.report()).animations.find((entry) => entry.id === current.id); assert.match(current.poster, /poster-new\.png$/); assert.notEqual(current.poster, originalPoster);
  await service.replaceMedia(current.id, { file: upload("incoming.webm", webmBuffer("replacement-webm")), nameMode: "current" });
  current = (await service.report()).animations.find((entry) => entry.id === current.id); assert.match(current.video, /film\.webm$/); assert.equal(current.type, "video");
  await service.replaceMedia(current.id, { file: upload("new-file.mp4", videoBuffer("isom", "replacement-mp4")), nameMode: "new" });
  current = (await service.report()).animations.find((entry) => entry.id === current.id); assert.match(current.video, /new-file\.mp4$/);
  await service.replaceMedia(current.id, { file: upload("third.mp4", videoBuffer("isom", "replacement-custom")), nameMode: "custom", customName: "custom-name" });
  current = (await service.report()).animations.find((entry) => entry.id === current.id); assert.match(current.video, /custom-name\.mp4$/);
  await service.update(current.id, { title: "Updated Film", date: "15-07-2025", category: "court-métrage", alt: "Updated alt", featured: true, position: 2 });
  current = (await service.report()).animations.find((entry) => entry.id === current.id); assert.equal(current.date, "2025-07-15"); assert.equal(current.year, 2025); assert.equal(current.featured, true); assert.equal(current.position, 2);
  assert.equal((await service.report()).animations[0].id, "base"); assert.ok((await service.report()).animations[0].poster);

  await writeFile(path.join(root, "public/assets/animation/conflict.mp4"), videoBuffer("isom", "physical-conflict"));
  await assert.rejects(service.replaceMedia(current.id, { file: upload("conflict.mp4", videoBuffer("isom", "different-content")), nameMode: "new" }), /porte déjà ce nom/);
  const revealedMedia = await service.reveal(current.id, "media"); assert.equal(revealedMedia.command, "explorer.exe"); assert.deepEqual(revealedMedia.args.slice(0, 1), ["/select,"]);
  const revealedPoster = await service.reveal(current.id, "poster"); assert.equal(revealedPoster.mode, "selected");

  const missingPath = path.join(root, "public", ...current.video.split("/")); const missingContent = await readFile(missingPath); await rm(missingPath);
  assert.ok((await service.report()).issues.some((issue) => issue.includes("média manquant"))); await writeFile(missingPath, missingContent);

  const catalogBeforeFailure = hash(await readFile(catalogFile));
  const failBeforeCatalog = createAnimationService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true, failurePoint: "before-catalog" }); await failBeforeCatalog.initialize();
  await assert.rejects(failBeforeCatalog.update("base", { title: "Never Saved", date: "2024-01-02", category: "animation 2d", alt: "Base animation" }), /simulé/);
  assert.equal(hash(await readFile(catalogFile)), catalogBeforeFailure); await assertStagingEmpty(failBeforeCatalog);
  const failAfterCatalog = createAnimationService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true, failurePoint: "after-catalog" }); await failAfterCatalog.initialize();
  await assert.rejects(failAfterCatalog.update("base", { title: "Never Saved", date: "2024-01-02", category: "animation 2d", alt: "Base animation" }), /simulé/);
  assert.equal(hash(await readFile(catalogFile)), catalogBeforeFailure); await assertStagingEmpty(failAfterCatalog);
  const failAfterCopy = createAnimationService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true, failurePoint: "after-copy" }); await failAfterCopy.initialize();
  await assert.rejects(failAfterCopy.create({ title: "Rollback Copy", date: "2025-01-01", category: "animation 2d", alt: "Rollback", media: upload("rollback-copy.png", await imageBuffer("png", "#778899")) }), /simulé/);
  await assert.rejects(stat(path.join(root, "public/assets/animation/rollback-copy.png")), /ENOENT/); assert.equal(hash(await readFile(catalogFile)), catalogBeforeFailure); await assertStagingEmpty(failAfterCopy);
  const mediaBeforeMove = await readFile(path.join(root, "public", ...current.video.split("/")));
  const failAfterMove = createAnimationService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true, failurePoint: "after-move" }); await failAfterMove.initialize();
  await assert.rejects(failAfterMove.replaceMedia(current.id, { file: upload("rollback-move.mp4", videoBuffer("isom", "rollback-move")), nameMode: "new" }), /simulé/);
  assert.equal(hash(await readFile(path.join(root, "public", ...current.video.split("/")))), hash(mediaBeforeMove)); assert.equal(hash(await readFile(catalogFile)), catalogBeforeFailure); await assertStagingEmpty(failAfterMove);

  const deletedId = imageCreated.result.id; const deletion = await service.remove(deletedId, deletedId);
  assert.match(deletion.result.manifest, /manifest\.json$/); const manifestFile = path.join(root, ...deletion.result.manifest.split("/"));
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")); assert.equal(manifest.operation, "delete"); assert.equal(manifest.animationId, deletedId);
  assert.equal((await service.report()).animations.some((entry) => entry.id === deletedId), false);
  assert.ok((await directoryFiles(path.join(runtime, "trash/animations"))).some((file) => String(file).includes("manifest.json")));
  await assertStagingEmpty(service);

  const adminHtml = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/animations.html"), "utf8");
  const adminJs = await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/modules/animations/animation-admin.js"), "utf8");
  assert.match(adminHtml, /Ajouter une animation/); assert.match(adminHtml, /Informations/); assert.match(adminHtml, /Média/); assert.match(adminHtml, /Poster/);
  assert.match(adminHtml, /Date \(JJ-MM-AAAA\)/); assert.match(adminHtml, /Ordre interne du catalogue/); assert.match(adminHtml, /position 1 fournit actuellement le visuel Animation/); assert.match(adminHtml, /Personnaliser le texte alternatif/);
  assert.match(adminJs, /dataTransfer/); assert.match(adminJs, /nameMode/); assert.match(adminJs, /portfolio\/animation/); assert.match(adminJs, /useTitleAsAlt/); assert.match(adminJs, /animation 3d/);
  assert.match(await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/index.html"), "utf8"), /animations\.html/);
  assert.match(await readFile(path.join(PROJECT_DIR, "tools/artwork-admin/public/mangas.html"), "utf8"), /animations\.html/);
  const publicAnimationPage = await readFile(path.join(PROJECT_DIR, "src/pages/Animation.jsx"), "utf8");
  const publicUi = await readFile(path.join(PROJECT_DIR, "src/content/ui.js"), "utf8");
  assert.match(publicAnimationPage, /"animation 3d"/); assert.match(publicUi, /title: "Animation"/); assert.match(publicUi, /"animation 3d": "3D Animation"/);
  assert.match(await readFile(path.join(PROJECT_DIR, "src/pages/HomePage.jsx"), "utf8"), /animations\[0\]\.poster/);
  assert.equal(parseAnimationCatalog(await readFile(realPaths[0], "utf8")).length, realAnimationCount);
  for (const [file, expected] of realHashes) assert.equal(hash(await readFile(file)), expected, `${path.basename(file)} réel a été modifié`);
  console.log("Animation Admin — tests d’intégration réussis");
  console.log("Vidéo, image, GIF, dates, catégories, posters, remplacements, SHA-256, corbeille, reveal et rollbacks vérifiés");
} finally {
  await rm(temp, { recursive: true, force: true });
}
