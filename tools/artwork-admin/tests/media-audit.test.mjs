import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createMediaAuditService, normalizeAssetPath } from "../media-audit.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "media-audit-"));
  const runtime = path.join(root, "tools/artwork-admin");
  for (const directory of [
    "public/assets/illustration/sketches",
    "public/assets/animation/miniature",
    "public/assets/mangaka/story/english",
  ]) await mkdir(path.join(root, directory), { recursive: true });
  const image = await sharp({ create: { width: 24, height: 32, channels: 3, background: "#993344" } }).jpeg().toBuffer();
  await writeFile(path.join(root, "public/assets/illustration/sketches/référence présente.jpg"), image);
  await writeFile(path.join(root, "public/assets/illustration/sketches/DOC Copie É.jpg"), image);
  await writeFile(path.join(root, "public/assets/illustration/sketches/.caché.jpg"), image);
  await writeFile(path.join(root, "public/assets/illustration/sketches/temp.tmp"), "temp");
  await writeFile(path.join(root, "public/assets/illustration/sketches/source.PSD"), "source");
  await writeFile(path.join(root, "public/assets/animation/clip.MP4"), Buffer.from("0000ftypisom"));
  await writeFile(path.join(root, "public/assets/animation/loop.GIF"), Buffer.from("GIF89a"));
  await writeFile(path.join(root, "public/assets/animation/miniature/clip.jpg"), image);
  await writeFile(path.join(root, "public/assets/mangaka/story/english/01.jpg"), image);
  await writeFile(path.join(root, "public/assets/mangaka/story/english/02.jpg"), image);
  await writeFile(path.join(root, "public/assets/mangaka/story/banner.jpg"), image);
  const catalogs = {
    artwork: [{
      id: "present", title: "", image: "assets\\illustration\\sketches\\référence présente.jpg",
      thumbnail: "", category: ["sketches"], alt: "Présente",
    }, {
      id: "missing", title: "", image: "assets/illustration/sketches/absente.jpg",
      thumbnail: "", category: ["sketches"], alt: "Absente",
    }],
    animation: [{
      id: "clip", title: "Clip", video: "assets/animation/clip.MP4",
      poster: "assets/animation/miniature/clip.jpg", category: "animation 2d",
    }, {
      id: "loop", title: "Loop", video: "assets/animation/loop.GIF",
      poster: "", category: "animation 2d",
    }],
    manga: [{
      id: "story", slug: "story", title: "Story", banner: "assets/mangaka/story/banner.jpg",
      languages: { en: { label: "English", shortLabel: "ENG", pages: ["assets/mangaka/story/english/01.jpg"] } },
    }],
  };
  const service = createMediaAuditService({
    projectRoot: root,
    runtimeRoot: runtime,
    disableReveal: true,
    cacheDurationMs: 60_000,
    catalogLoaders: Object.fromEntries(Object.entries(catalogs).map(([key, value]) => [key, async () => structuredClone(value)])),
  });
  return { root, runtime, service, catalogs };
}

test("normalise les chemins Web et Windows et refuse les traversées", () => {
  assert.equal(normalizeAssetPath("assets\\illustration\\sketches\\é image.JPG"), "assets/illustration/sketches/é image.JPG");
  assert.throws(() => normalizeAssetPath("../secret.jpg"), /traversée/i);
  assert.throws(() => normalizeAssetPath("C:\\secret.jpg"), /absolus/i);
  assert.throws(() => normalizeAssetPath("/etc/passwd"), /absolus/i);
});

test("détecte les médias non référencés, manquants, Unicode et formats source", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const before = JSON.stringify(data.catalogs);
  const artwork = await data.service.audit("artwork", { force: true });
  assert.equal(artwork.summary.referenced, 1);
  assert.equal(artwork.summary.missing, 1);
  assert.equal(artwork.unreferenced[0].path, "assets/illustration/sketches/DOC Copie É.jpg");
  assert.equal(artwork.unreferenced[0].category, "Sketches");
  assert.equal(artwork.unreferenced[0].width, 24);
  assert.equal(artwork.unsupported[0].sourceFile, true);
  assert.equal(artwork.unreferenced.some((item) => item.name.startsWith(".")), false);
  assert.equal(JSON.stringify(data.catalogs), before, "un audit simple ne modifie pas les catalogues");
});

test("distingue poster Animation, GIF autonome, page Manga et langue", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const animation = await data.service.audit("animation", { force: true });
  assert.equal(animation.summary.unreferenced, 0);
  assert.equal(animation.summary.missing, 0, "un GIF média ne requiert pas de poster");
  const manga = await data.service.audit("manga", { force: true });
  assert.equal(manga.unreferenced.length, 1);
  assert.equal(manga.unreferenced[0].type, "page");
  assert.equal(manga.unreferenced[0].language, "en");
  assert.equal(manga.unreferenced[0].name, "02.jpg");
});

test("comprend les deux racines Manga et classe les copies inter-section comme attendues", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "media-audit-sections-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const completed = path.join(root, "public/assets/mangaka/completed-manga/story/en");
  const storyboard = path.join(root, "public/assets/mangaka/complete-storyboards/story-test/en");
  await Promise.all([mkdir(completed, { recursive: true }), mkdir(storyboard, { recursive: true })]);
  const shared = await sharp({ create: { width: 24, height: 32, channels: 3, background: "#334499" } }).jpeg().toBuffer();
  const extra = await sharp({ create: { width: 26, height: 34, channels: 3, background: "#993344" } }).jpeg().toBuffer();
  await Promise.all([
    writeFile(path.join(completed, "01.jpg"), shared),
    writeFile(path.join(storyboard, "01.jpg"), shared),
    writeFile(path.join(storyboard, "02.jpg"), extra),
  ]);
  const catalog = [{
    id: "story", slug: "story", title: "Story", presentationSection: "completed",
    languages: { en: { pages: ["assets/mangaka/completed-manga/story/en/01.jpg"] } },
  }, {
    id: "story-test", slug: "story-test", title: "Story", presentationSection: "storyboard",
    languages: { en: { pages: ["assets/mangaka/complete-storyboards/story-test/en/01.jpg"] } },
  }];
  const service = createMediaAuditService({
    projectRoot: root,
    runtimeRoot: path.join(root, "tools/artwork-admin"),
    disableReveal: true,
    catalogLoaders: { manga: async () => structuredClone(catalog) },
  });
  const report = await service.audit("manga", { force: true });
  assert.equal(report.summary.duplicates, 0);
  assert.equal(report.summary.expectedCopies, 1);
  assert.equal(report.expectedCopies[0].type, "expected-cross-section-copy");
  assert.equal(report.unreferenced[0].presentationSection, "storyboard");
  assert.equal(report.unreferenced[0].mangaSlug, "story-test");
  assert.equal(report.unreferenced[0].language, "en");
});

test("ignore puis restaure un chemin normalisé sans déplacer le média", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const relative = "assets/illustration/sketches/DOC Copie É.jpg";
  const physical = path.join(data.root, "public/assets/illustration/sketches/DOC Copie É.jpg");
  await data.service.ignore("artwork", relative);
  let report = await data.service.audit("artwork", { force: true });
  assert.equal(report.unreferenced.length, 0);
  assert.equal(report.ignored.length, 1);
  assert.equal((await stat(physical)).isFile(), true);
  const ignoreFile = JSON.parse(await readFile(path.join(data.runtime, "storage/media-audit-ignore.json"), "utf8"));
  assert.deepEqual(ignoreFile.paths, [relative]);
  await data.service.restore("artwork", relative);
  report = await data.service.audit("artwork", { force: true });
  assert.equal(report.unreferenced.length, 1);
  assert.equal(report.ignored.length, 0);
});

test("les accès hors du module sont refusés", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  await assert.rejects(data.service.resolveFile("artwork", "assets/animation/clip.MP4"), /module demandé/i);
  await assert.rejects(data.service.resolveFile("artwork", "../outside.jpg"), /traversée/i);
});

test("une œuvre multcatégorie ne devient pas un doublon", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  data.catalogs.artwork[0].category = ["sketches", "illustrations"];
  const artwork = await data.service.audit("artwork", { force: true });
  assert.equal(artwork.duplicates.some((item) => item.type === "repeated-catalog-path"), false);
});

test("un ancien cover Manga réutilisant la première page n’est pas un faux doublon", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  data.catalogs.manga[0].cover = "assets/mangaka/story/english/01.jpg";
  const manga = await data.service.audit("manga", { force: true });
  assert.equal(manga.duplicates.some((item) => item.type === "repeated-catalog-path"), false);
});

test("la corbeille ne déplace un média qu’après confirmation explicite", async (context) => {
  const data = await fixture();
  context.after(() => rm(data.root, { recursive: true, force: true }));
  const relative = "assets/illustration/sketches/DOC Copie É.jpg";
  const original = path.join(data.root, "public/assets/illustration/sketches/DOC Copie É.jpg");
  await assert.rejects(data.service.trash("artwork", relative, "mauvaise confirmation"), /confirmation/i);
  assert.equal((await stat(original)).isFile(), true);
  const result = await data.service.trash("artwork", relative, "DOC Copie É.jpg");
  await assert.rejects(stat(original), { code: "ENOENT" });
  assert.equal((await stat(path.join(data.root, result.trashPath))).isFile(), true);
  assert.equal(JSON.stringify(data.catalogs.artwork).includes(relative), false);
});
