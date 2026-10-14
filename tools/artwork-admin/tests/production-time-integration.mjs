import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { createProductionFixture } from "./production-time-fixture.mjs";

const fixture = await createProductionFixture();
const { request } = fixture;
const listing = () => request("/api/artworks");
const time = { minutes: 150, kind: "actual" };
const clean = (value) => { const entry = { ...value }; delete entry.sizeBytes; delete entry.visibility; return entry; };
const setTime = async (productionTime, id = "sample") => {
  const { catalogRevision } = await listing();
  return request(`/api/artworks/${id}/production-time`, "PUT", { catalogRevision, productionTime });
};
const backups = async () => (await readdir(path.join(fixture.runtime, "backups"))).filter(name => name.startsWith("artworks-"));
try {
  await fixture.start();
  assert.equal((await listing()).count, 2);
  assert.equal((await listing()).artworks[0].productionTime, undefined);
  const original = await fixture.sourceNow();
  const initial = await listing();
  for (const value of [0, -2, 1.5, "150", null]) {
    await assert.rejects(() => setTime({ minutes: value, kind: "actual" }), { status: 400 });
  }
  await assert.rejects(() => setTime({ ...time, extra: true }), { status: 400 });
  await assert.rejects(() => setTime({ ...time, kind: "unknown" }), { status: 400 });
  await assert.rejects(() => request("/api/artworks/sample/production-time", "PUT", { catalogRevision: initial.catalogRevision, productionTime: time, unrelated: true }), { status: 400 });
  assert.equal(await fixture.sourceNow(), original);
  assert.deepEqual(await backups(), []);

  const saved = await setTime(time);
  assert.deepEqual(saved.artwork.productionTime, time);
  assert.deepEqual(await readFile(path.join(fixture.root, "public", fixture.artwork.image)), fixture.buffer);
  assert.equal((await listing()).artworks[1].productionTime, undefined);
  const withoutTime = clean(saved.artwork); delete withoutTime.productionTime;
  assert.deepEqual(withoutTime, fixture.artwork);
  await fixture.restart();
  assert.deepEqual((await listing()).artworks[0].productionTime, time);
  const revision = (await listing()).catalogRevision;
  await request("/api/artworks/sample/production-time", "PUT", { catalogRevision: revision });
  assert.deepEqual((await listing()).artworks[0].productionTime, time);
  assert.equal((await backups()).length, 1, "No-op writes do not create backups");
  await setTime({ ...time, kind: "estimated" });
  const withTime = await fixture.sourceNow();
  assert.equal(spawnSync(process.execPath, ["--check", fixture.catalog]).status, 0);
  assert.match(withTime, /image: assetPath\(/);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext(withTime.match(/export const artworks = (\[[\s\S]*\]);/)[1].replace(/assetPath\(("(?:[^"\\]|\\.)*")\)/g, "$1"))[0].productionTime)), { ...time, kind: "estimated" });

  // A stale browser or an edit from VS Code is refused, not overwritten.
  await assert.rejects(() => request("/api/artworks/sample/production-time", "PUT", { catalogRevision: revision, productionTime: time }), { status: 409 });
  const externalRevision = (await listing()).catalogRevision;
  await writeFile(fixture.catalog, withTime.replace('alt: "Sample image"', 'alt: "Edited in VS Code"'));
  const externalSource = await fixture.sourceNow();
  await assert.rejects(() => request("/api/artworks/sample/production-time", "PUT", { catalogRevision: externalRevision, productionTime: time }), { status: 409 });
  assert.equal(await fixture.sourceNow(), externalSource);
  const currentRevision = (await listing()).catalogRevision;
  const queued = await Promise.allSettled([1, 2].map(offset => request("/api/artworks/sample/production-time", "PUT", { catalogRevision: currentRevision, productionTime: { minutes: 150 + offset, kind: "actual" } })));
  assert.equal(queued.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(queued.find(r => r.status === "rejected").reason.status, 409);
  await setTime(time);

  // Existing writers must preserve the optional field on both artworks.
  await request("/api/artworks/sample/visibility", "PUT", { hidden: true });
  await request("/api/artworks/sample/visibility", "PUT", { hidden: false });
  const moved = await request("/api/artworks/sample", "PUT", { fileName: "renamed.jpg", categories: ["paintings", "illustrations"], date: "02-02-2026", alt: "Updated alt" });
  assert.equal(moved.artwork.id, "renamed");
  assert.deepEqual(moved.artwork.productionTime, time);
  assert.deepEqual(await readFile(path.join(fixture.root, "public", moved.artwork.image)), fixture.buffer);
  const metadataOnly = await request("/api/artworks/renamed", "PUT", { fileName: "renamed.jpg", categories: ["paintings", "illustrations"], date: "03-03-2026", alt: "Other metadata" });
  assert.deepEqual(metadataOnly.artwork.productionTime, time);
  const newBuffer = await sharp({ create: { width: 44, height: 34, channels: 3, background: "#153a54" } }).jpeg().toBuffer();
  const session = await request("/api/replacements/sessions", "POST", { artworkId: "renamed" });
  const staged = (await request(`/api/replacements/sessions/${session.id}/file`, "POST", { fileName: "replacement.jpg", dataBase64: newBuffer.toString("base64") })).file;
  const replaced = await request(`/api/replacements/sessions/${session.id}/commit`, "POST", { token: staged.token, categories: ["paintings"], date: "03-03-2026", alt: "Replacement", nameMode: "current", compression: { enabled: false }, thumbnailMode: "preserve" });
  assert.deepEqual(replaced.artwork.productionTime, time);
  const optimized = await request("/api/artworks/renamed/optimize", "POST", { compression: { enabled: true, format: "webp", quality: 92, maxDimension: "original", metadata: "preserve" } });
  assert.deepEqual(optimized.artwork.productionTime, time);

  const beforeClear = clean((await listing()).artworks.find(entry => entry.id === "renamed"));
  const cleared = await setTime(null, "renamed");
  const expected = { ...beforeClear }; delete expected.productionTime;
  assert.deepEqual(cleared.artwork, expected);
  const media = await readFile(path.join(fixture.root, "public", cleared.artwork.image));
  await setTime({ minutes: 195, kind: "estimated" }, "renamed");
  assert.deepEqual(await readFile(path.join(fixture.root, "public", cleared.artwork.image)), media);
  const beforeFailure = await fixture.sourceNow();
  await fixture.restart({ ARTWORK_ADMIN_TEST_PRODUCTION_FAIL_AT: "before-commit" });
  await assert.rejects(() => setTime({ minutes: 200, kind: "actual" }, "renamed"), { status: 500 });
  assert.equal(await fixture.sourceNow(), beforeFailure);
  assert.ok(!(await readdir(path.dirname(fixture.catalog))).some(name => name.includes(".tmp.js")));
  assert.deepEqual(await readFile(path.join(fixture.root, "public", cleared.artwork.image)), media);
  const allBackups = await backups();
  const sources = await Promise.all(allBackups.map(name => readFile(path.join(fixture.runtime, "backups", name), "utf8")));
  assert.ok(sources.includes(original), "Historical backup without production time");
  assert.ok(sources.some(source => source.includes('"minutes":150')));
  assert.ok(sources.includes(beforeFailure), "Failed write preserves a backup of the previous state");
  assert.ok(allBackups.length <= 20);
  // Manual historical restore is tested only in the fixture, then the newer backup.
  await writeFile(fixture.catalog, original);
  await fixture.restart();
  assert.equal((await listing()).artworks[0].productionTime, undefined);
  await writeFile(fixture.catalog, beforeFailure);
  await fixture.restart();
  assert.deepEqual((await listing()).artworks.find(e => e.id === "renamed").productionTime, { minutes: 195, kind: "estimated" });
  // Existing replacement rollback restores a catalog WITH productionTime too.
  await fixture.restart({ ARTWORK_ADMIN_TEST_REPLACE_FAIL_AT: "after-catalog-write-invalid" });
  const failureSession = await request("/api/replacements/sessions", "POST", { artworkId: "renamed" });
  const failureFile = (await request(`/api/replacements/sessions/${failureSession.id}/file`, "POST", { fileName: "rollback.jpg", dataBase64: fixture.buffer.toString("base64") })).file;
  await assert.rejects(() => request(`/api/replacements/sessions/${failureSession.id}/commit`, "POST", { token: failureFile.token, categories: ["paintings"], date: "03-03-2026", alt: "Rollback", nameMode: "current", compression: { enabled: false }, thumbnailMode: "preserve" }), { status: 500 });
  assert.equal(await fixture.sourceNow(), beforeFailure);
  assert.deepEqual(await readFile(path.join(fixture.root, "public", cleared.artwork.image)), media);
  assert.deepEqual((await listing()).artworks.find(e => e.id === "renamed").productionTime, { minutes: 195, kind: "estimated" });
  await fixture.restart();
  const imported = await request("/api/artworks", "POST", { category: "backgrounds", date: "04-04-2026", fileName: "import.jpg", dataBase64: fixture.buffer.toString("base64") });
  assert.equal(imported.artwork.productionTime, undefined);
  assert.deepEqual(clean((await listing()).artworks.find(e => e.id === "other")), fixture.other);
  assert.ok((await readdir(path.join(fixture.root, "src/content"), { withFileTypes: true })).filter(e => e.isFile()).every(e => !/mangas|animations/.test(e.name)));
  console.log("Production time API: persistence, metadata-only writes, conflicts, rename/category/visibility/replacement/optimization, backups/restore, failure rollback and optional import OK (isolated fixture).");
} finally { await fixture.close(); }
