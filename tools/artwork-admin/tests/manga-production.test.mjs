import assert from "node:assert/strict";
import test from "node:test";
import fsPromises, { readFile, readdir, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseMangaCatalog, serializeMangaCatalog, validateMangaCatalog } from "../manga/catalog.mjs";
import { getProductionDrawing, validateMangaProductionTime } from "../manga/production-time.mjs";
import { createMangaProductionFixture } from "./manga-production-fixture.mjs";

const time = { minutes: 150, kind: "actual" };
async function fixture(t, options) { const f = await createMangaProductionFixture(options); t.after(() => f.close()); return f; }
async function mediaUnchanged(f) { for (const [relative, bytes] of f.media) assert.deepEqual(await readFile(path.join(f.root, "public", relative)), bytes); }

test("strict model: old catalog, valid totals/pages, absence, null, unknown fields and ambiguous paths", async t => {
  const f = await fixture(t);
  const m = structuredClone(f.mangas[0]); validateMangaProductionTime(m);
  for (const value of [null, {}, { total: null }, { total: { minutes: 0, kind: "actual" } }, { total: { minutes: -1, kind: "actual" } }, { total: { minutes: 1.5, kind: "actual" } }, { total: { minutes: NaN, kind: "actual" } }, { total: { minutes: Infinity, kind: "actual" } }, { total: { minutes: "150", kind: "actual" } }, { total: { ...time, kind: "wrong" } }, { total: time, unknown: true }]) {
    assert.throws(() => validateMangaProductionTime({ ...m, productionTime: value }));
  }
  const valid = { pages: [{ id: "drawing-1", time }], bindings: [{ path: f.pages.english[0], pageId: "drawing-1" }] };
  validateMangaProductionTime({ ...m, productionTime: valid });
  for (const p of [{ ...valid, pages: [{ id: "drawing-1", time: null }] }, { ...valid, pages: [...valid.pages, valid.pages[0]] }, { ...valid, bindings: [{ path: f.pages.english[0], pageId: "missing" }] }, { ...valid, bindings: [...valid.bindings, valid.bindings[0]] }, { ...valid, bindings: [{ path: "assets/mangaka/../outside.jpg", pageId: "drawing-1" }] }]) {
    assert.throws(() => validateMangaProductionTime({ ...m, productionTime: p }));
  }
  m.languages.french.pages.push(f.pages.english[0]);
  assert.throws(() => validateMangaProductionTime({ ...m, productionTime: valid }), /ambigu/);
});

test("manual total is independent, optional, mutable and explicitly removed; pages/IDs/languages stay intact", async t => {
  const f = await fixture(t);
  await f.edit("total", { total: { minutes: 5400, kind: "estimated" } });
  assert.deepEqual((await f.manga()).productionTime, { total: { minutes: 5400, kind: "estimated" } });
  await f.edit("page", { path: f.pages.english[0], time });
  assert.equal((await f.manga()).productionTime.total.minutes, 5400);
  const before = await f.currentSource();
  const noop = await f.edit("total", {}); assert.equal(noop.unchanged, true); assert.equal(await f.currentSource(), before);
  await f.edit("total", { total: { minutes: 5130, kind: "actual" } });
  await f.edit("total", { total: null });
  const m = await f.manga(); assert.equal(m.productionTime.total, undefined);
  assert.deepEqual(getProductionDrawing(m, f.pages.english[0]).time, time);
  const restored = structuredClone(m); delete restored.productionTime;
  assert.deepEqual(restored, f.mangas[0]); await mediaUnchanged(f);
});

test("individual time persists; type/update/delete/empty payload and historic numeric/language codes", async t => {
  const f = await fixture(t);
  await f.edit("page", { path: f.pages.english[0], time });
  const id = getProductionDrawing(await f.manga(), f.pages.english[0]).id;
  assert.match(id, /^drawing-/);
  assert.equal(getProductionDrawing(await f.manga(), f.pages.french[0]), undefined, "No index-based association");
  await f.edit("page", { path: f.pages.english[0] });
  assert.deepEqual(getProductionDrawing(await f.manga(), f.pages.english[0]).time, time);
  await f.edit("page", { path: f.pages.english[0], time: { minutes: 195, kind: "estimated" } });
  await f.service.update(2, { summary: "Changed summary" });
  assert.deepEqual(getProductionDrawing(await f.manga(), f.pages.english[0]), { id, time: { minutes: 195, kind: "estimated" } });
  await f.edit("page", { path: f.pages.english[0], time: null });
  assert.equal(getProductionDrawing(await f.manga(), f.pages.english[0]).time, undefined);
  assert.equal((await f.manga()).id, 2);
  assert.deepEqual(Object.keys((await f.manga()).languages), ["english", "french", "ja", "original"]);
  assert.deepEqual((await f.service.readCatalog())[1], f.mangas[1]); await mediaUnchanged(f);
});

test("explicit multilingual association, shared edits and safe separation", async t => {
  const f = await fixture(t);
  await f.edit("page", { path: f.pages.english[1], time });
  await f.edit("associate", { path: f.pages.english[1], targetPath: f.pages.french[0] });
  let m = await f.manga();
  assert.equal(getProductionDrawing(m, f.pages.english[1]).id, getProductionDrawing(m, f.pages.french[0]).id);
  assert.equal(getProductionDrawing(m, f.pages.french[1]), undefined);
  await f.edit("page", { path: f.pages.french[0], time: { minutes: 200, kind: "estimated" } });
  assert.equal(getProductionDrawing(await f.manga(), f.pages.english[1]).time.minutes, 200);
  await assert.rejects(f.edit("separate", { path: f.pages.french[0] }), /Choisissez/);
  await f.edit("separate", { path: f.pages.french[0], mode: "copy" });
  m = await f.manga();
  assert.notEqual(getProductionDrawing(m, f.pages.english[1]).id, getProductionDrawing(m, f.pages.french[0]).id);
  assert.equal(getProductionDrawing(m, f.pages.french[0]).time.minutes, 200);
  await f.edit("associate", { path: f.pages.english[1], targetPath: f.pages.french[0] });
  await f.edit("separate", { path: f.pages.french[0], mode: "empty" });
  assert.equal(getProductionDrawing(await f.manga(), f.pages.french[0]).time, undefined);
  assert.equal(getProductionDrawing(await f.manga(), f.pages.english[1]).time.minutes, 200);
  await mediaUnchanged(f);
});

test("conflicting associations require a choice, archive nonretained times and reject overlapping language groups", async t => {
  const f = await fixture(t);
  await f.edit("page", { path: f.pages.english[0], time });
  await f.edit("page", { path: f.pages.french[0], time: { minutes: 300, kind: "estimated" } });
  const before = await f.currentSource();
  await assert.rejects(f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[0] }), /durées diffèrent/);
  assert.equal(await f.currentSource(), before);
  await f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[0], resolution: "target" });
  let m = await f.manga();
  assert.equal(getProductionDrawing(m, f.pages.english[0]).time.minutes, 300);
  assert.ok(m.productionTime.pages.some(page => page.time?.minutes === 150 && !m.productionTime.bindings.some(b => b.pageId === page.id)));
  await f.edit("associate", { path: f.pages.english[2], targetPath: f.pages.french[1] });
  const prior = await f.currentSource();
  await assert.rejects(f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[1] }), /même langue/);
  assert.equal(await f.currentSource(), prior);
  m = await f.manga(); assert.equal(getProductionDrawing(m, f.pages.english[0]).time.minutes, 300);
  await f.edit("separate", { path: f.pages.french[0], mode: "copy" });
  await f.edit("page", { path: f.pages.french[0], time: { minutes: 80, kind: "actual" } });
  await f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[0], resolution: "source" });
  m = await f.manga(); assert.equal(getProductionDrawing(m, f.pages.french[0]).time.minutes, 300);
  assert.ok(m.productionTime.pages.some(page => page.time?.minutes === 80));
});

test("reordering, permutation and insertion keep durations with drawings, not positions", async t => {
  const f = await fixture(t);
  await f.edit("page", { path: f.pages.english[1], time });
  const id = getProductionDrawing(await f.manga(), f.pages.english[1]).id;
  for (const order of [[1, 0, 2], [0, 2, 1], [2, 1, 0]]) {
    await f.service.reorderPages(2, "english", order.map(i => f.pages.english[i]));
    assert.deepEqual(getProductionDrawing(await f.manga(), f.pages.english[1]), { id, time });
  }
  await f.service.addPages(2, "english", { position: 1, files: [await f.upload("insert.jpg")] });
  const m = await f.manga(); assert.deepEqual(getProductionDrawing(m, f.pages.english[1]), { id, time });
  assert.equal(getProductionDrawing(m, m.languages.english.pages[0]), undefined);
});

test("replacement needs an identity decision; same drawing keeps all languages, new drawing archives old time", async t => {
  const f = await fixture(t);
  await f.edit("page", { path: f.pages.english[1], time });
  await f.edit("associate", { path: f.pages.english[1], targetPath: f.pages.french[0] });
  const id = getProductionDrawing(await f.manga(), f.pages.english[1]).id;
  const before = await f.currentSource();
  await assert.rejects(f.service.replacePage(2, "english", 1, { file: await f.upload(), source: f.pages.english[1] }), /identité/);
  assert.equal(await f.currentSource(), before);
  let output = await f.service.replacePage(2, "english", 1, { file: await f.upload(), source: f.pages.english[1], productionIdentity: "keep" });
  const corrected = output.result.languages.english.pages[1];
  assert.deepEqual(getProductionDrawing(output.result, corrected), { id, time });
  assert.equal(getProductionDrawing(output.result, f.pages.french[0]).id, id);
  output = await f.service.replacePage(2, "english", 1, { file: await f.upload("different.jpg", "#112233"), source: corrected, productionIdentity: "new" });
  const different = getProductionDrawing(output.result, output.result.languages.english.pages[1]);
  assert.notEqual(different.id, id); assert.equal(different.time, undefined);
  assert.deepEqual(getProductionDrawing(output.result, f.pages.french[0]), { id, time });
});

test("duplication creates independent identity without duration; page/language deletion retains shared or historical times", async t => {
  const f = await fixture(t);
  await f.edit("page", { path: f.pages.english[1], time });
  await f.edit("associate", { path: f.pages.english[1], targetPath: f.pages.french[0] });
  const sourceId = getProductionDrawing(await f.manga(), f.pages.english[1]).id;
  const copy = (await f.service.duplicatePage(2, "english", 1)).result.languages.english.pages.at(-1);
  assert.notEqual(getProductionDrawing(await f.manga(), copy).id, sourceId);
  assert.equal(getProductionDrawing(await f.manga(), copy).time, undefined);
  assert.deepEqual(await readFile(path.join(f.root, "public", copy)), f.media.get(f.pages.english[1]));
  await f.service.deletePage(2, "french", 0);
  assert.deepEqual(getProductionDrawing(await f.manga(), f.pages.english[1]), { id: sourceId, time });
  await f.service.deleteLanguage(2, "french");
  assert.deepEqual(getProductionDrawing(await f.manga(), f.pages.english[1]), { id: sourceId, time });
  await f.service.deletePage(2, "english", 1);
  const m = await f.manga(); assert.ok(m.productionTime.pages.some(page => page.id === sourceId && page.time.minutes === 150));
  assert.ok(!m.productionTime.bindings.some(b => b.pageId === sourceId));
});

test("section moves and language-folder repairs remap bindings without changing logical IDs", async t => {
  const f = await fixture(t);
  await f.edit("page", { path: f.pages.english[1], time });
  const id = getProductionDrawing(await f.manga(), f.pages.english[1]).id;
  await f.service.update(2, { presentationSection: "storyboard" });
  let m = await f.manga(); const moved = m.languages.english.pages[1];
  assert.notEqual(moved, f.pages.english[1]); assert.deepEqual(getProductionDrawing(m, moved), { id, time });
  // Simulate a historical mixed folder catalog in the fixture only.
  m.languages.english.pages.push(m.languages.ja.pages[0]); delete m.languages.ja;
  await writeFile(f.catalogPath, serializeMangaCatalog([m, f.mangas[1]]));
  await f.edit("page", { path: m.languages.english.pages.at(-1), time: { minutes: 80, kind: "estimated" } });
  const mixedId = getProductionDrawing(await f.manga(), m.languages.english.pages.at(-1)).id;
  await f.service.repairLanguageStorage(2, "english");
  m = await f.manga(); assert.equal(getProductionDrawing(m, m.languages.english.pages.at(-1)).id, mixedId);
});

test("old/new backups restore, JS/assetPath round trip is valid and concurrent edits are rejected", async t => {
  const f = await fixture(t);
  const revision = (await f.service.report()).catalogRevision;
  const output = await f.edit("total", { total: time });
  assert.equal(await readFile(path.join(f.root, output.backup), "utf8"), f.original);
  await assert.rejects(f.service.editProduction(2, "total", { total: time, catalogRevision: revision }), error => error.status === 409);
  await f.edit("page", { path: f.pages.english[0], time });
  const recent = await f.currentSource();
  assert.equal(spawnSync(process.execPath, ["--check", f.catalogPath]).status, 0);
  assert.match(recent, /"path": assetPath\(/);
  const parsed = parseMangaCatalog(recent); validateMangaCatalog(parsed); assert.deepEqual(parsed, await f.service.readCatalog());
  await writeFile(f.catalogPath, f.original); assert.equal((await f.manga()).productionTime, undefined);
  await writeFile(f.catalogPath, recent); assert.equal(getProductionDrawing(await f.manga(), f.pages.english[0]).time.minutes, 150);
  const stale = (await f.service.report()).catalogRevision;
  await writeFile(f.catalogPath, recent + "\n");
  await assert.rejects(f.service.editProduction(2, "total", { total: { minutes: 200, kind: "actual" }, catalogRevision: stale }), error => error.status === 409);
  await assert.rejects(f.service.update(2, { title: "Stale title", catalogRevision: stale }), error => error.status === 409);
  await assert.rejects(f.service.duplicatePage(2, "english", 0, { catalogRevision: stale }), error => error.status === 409);
  await assert.rejects(f.service.deleteLanguage(2, "french", { catalogRevision: stale }), error => error.status === 409);
  assert.equal(await f.currentSource(), recent + "\n");
  const version = (await f.service.report()).catalogRevision;
  const result = await Promise.allSettled([201, 202].map(minutes => f.service.editProduction(2, "total", { total: { minutes, kind: "actual" }, catalogRevision: version })));
  assert.equal(result.filter(item => item.status === "fulfilled").length, 1);
  await mediaUnchanged(f);
});

for (const point of ["before-catalog", "after-catalog", "invalid-catalog"]) {
  test(`failure ${point}: duration save is atomic and backup/rollback retain the catalog and media`, async t => {
    const f = await fixture(t, { failurePoint: point });
    await assert.rejects(f.edit("total", { total: time }));
    assert.equal(await f.currentSource(), f.original);
    assert.ok((await readdir(f.service.paths.backupRoot)).length > 0);
    assert.ok(!(await readdir(path.dirname(f.catalogPath))).some(name => name.endsWith(".tmp")));
    await mediaUnchanged(f);
  });
}

test("real filesystem write failure leaves the previous catalog, backup and media intact", async t => {
  const f = await fixture(t);
  const rename = fsPromises.rename;
  t.mock.method(fsPromises, "rename", async (from, to) => {
    if (to === f.catalogPath) throw Object.assign(new Error("Catalog write denied"), { code: "EPERM" });
    return rename(from, to);
  });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(f.edit("total", { total: time }), /write denied/);
  assert.equal(await f.currentSource(), f.original);
  assert.ok(!(await readdir(path.dirname(f.catalogPath))).some(name => name.endsWith(".tmp")));
  await mediaUnchanged(f);
});

test("external edit during temporary write is detected before atomic replacement", async t => {
  const f = await fixture(t);
  const write = fsPromises.writeFile;
  const external = f.original.replace("Original summary", "Changed in VS Code");
  let changed = false;
  t.mock.method(fsPromises, "writeFile", async (file, ...args) => {
    await write(file, ...args);
    if (String(file).startsWith(f.catalogPath + ".") && !changed) { changed = true; await write(f.catalogPath, external); }
  });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(f.edit("total", { total: time }), error => error.status === 409);
  assert.equal(await f.currentSource(), external);
  assert.ok(!(await readdir(path.dirname(f.catalogPath))).some(name => name.endsWith(".tmp")));
  await mediaUnchanged(f);
});
