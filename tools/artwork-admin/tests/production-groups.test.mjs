import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir, writeFile, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { transformWithEsbuild } from "vite";
import { validateProductionGroups, parseArtworkProductionGroups, prepareProductionBatch, verifyProductionConfirmation } from "../production-groups.mjs";
import { createProductionFixture } from "./production-time-fixture.mjs";
import { createMangaProductionFixture } from "./manga-production-fixture.mjs";
import { getProductionDrawing } from "../manga/production-time.mjs";
import { createMangaService } from "../manga/service.mjs";

const time = { minutes: 120, kind: "actual" }, collective = { minutes: 300, kind: "estimated" };
const confirmation = plan => ({ token: plan.token, confirmed: true, confirmOverwrite: true, confirmOverlap: true });
async function artworkFixture(t) { const f = await createProductionFixture(); t.after(() => f.close()); await f.start(); return f; }
async function mangaFixture(t, options) { const f = await createMangaProductionFixture(options); t.after(() => f.close()); return f; }
async function artBatch(f, body, commit = true) {
  const data = await f.request("/api/artworks");
  const payload = { catalogRevision: data.catalogRevision, ...body };
  const preview = await f.request("/api/artworks/production-batch/preview", "POST", payload);
  return commit ? f.request("/api/artworks/production-batch/commit", "POST", { ...payload, ...confirmation(preview.plan) }) : { ...preview, payload };
}
async function mangaBatch(f, body, commit = true) {
  const payload = { catalogRevision: (await f.service.report()).catalogRevision, ...body };
  const preview = await f.service.productionBatch(2, payload);
  return commit ? f.service.productionBatch(2, { ...payload, ...confirmation(preview.plan) }, true) : { ...preview, payload };
}

test("group validation is strict, optional names work, invalid times/IDs/references/empty or duplicated members are refused", () => {
  const group = { id: "group-one", time, artworkIds: ["a", "b"] }, valid = new Set(["a", "b"]);
  validateProductionGroups([group], "artworkIds", valid);
  for (const groups of [null, [group, group], [{ ...group, unknown: 1 }], [{ ...group, time: undefined }], [{ ...group, time: null }], [{ ...group, time: { minutes: 0, kind: "actual" } }], [{ ...group, name: null }], [{ ...group, artworkIds: [] }], [{ ...group, artworkIds: ["a", "a"] }], [{ ...group, artworkIds: ["missing"] }]]) assert.throws(() => validateProductionGroups(groups, "artworkIds", valid));
  assert.deepEqual(parseArtworkProductionGroups("export const artworks = [];"), { groups: [], hasGroups: false });
  assert.throws(() => parseArtworkProductionGroups("export const artworkProductionGroups = broken;"));
});

test("preview and explicit acknowledgements distinguish individual replacement from overlapping collective totals", () => {
  const map = new Map([["a", time], ["b", undefined]]), groups = [];
  const payload = { catalogRevision: "v1", operation: "individual", time: collective, strategy: "replace", ids: ["a", "b"] };
  const plan = prepareProductionBatch({ groups, selectedIds: payload.ids, selectionCount: 2, field: "artworkIds", readTime: id => map.get(id), setTime: (id, value) => map.set(id, value), payload, revision: "v1" });
  assert.equal(plan.created, 1); assert.equal(plan.replaced, 1); assert.equal(groups.length, 0);
  assert.throws(() => verifyProductionConfirmation({ ...payload, token: plan.token, confirmed: true }, plan), /remplacement/);
  verifyProductionConfirmation({ ...payload, ...confirmation(plan) }, plan);
  assert.throws(() => verifyProductionConfirmation({ ...payload, ...confirmation(plan), token: "stale" }, plan));
});

test("Artwork A applies per artwork atomically, missing-only preserves existing values, preview/cancel/invalid member write nothing", async t => {
  const f = await artworkFixture(t), before = await f.sourceNow();
  const pending = await artBatch(f, { operation: "individual", ids: ["sample", "other"], time, strategy: "replace" }, false);
  assert.equal(await f.sourceNow(), before);
  await assert.rejects(f.request("/api/artworks/production-batch/commit", "POST", pending.payload), { status: 400 });
  await artBatch(f, { operation: "individual", ids: ["sample", "other"], time, strategy: "replace" });
  assert.ok((await f.request("/api/artworks")).artworks.every(entry => entry.productionTime.minutes === 120));
  const snapshot = await f.sourceNow();
  const missing = await artBatch(f, { operation: "individual", ids: ["sample", "other"], time: collective, strategy: "missing" });
  assert.equal(missing.plan.skipped, 2);
  assert.ok((await f.request("/api/artworks")).artworks.every(entry => entry.productionTime.minutes === 120));
  await assert.rejects(artBatch(f, { operation: "individual", ids: ["sample", "missing"], time, strategy: "replace" }), { status: 409 });
  for (const value of [null, { minutes: -1, kind: "actual" }, { minutes: 1.5, kind: "actual" }, { minutes: 20, kind: "wrong" }]) await assert.rejects(artBatch(f, { operation: "individual", ids: ["sample", "other"], time: value, strategy: "replace" }), { status: 400 });
  assert.equal(await f.sourceNow(), snapshot);
  assert.deepEqual(await readFile(path.join(f.root, "public", f.artwork.image)), f.buffer);
});

test("Artwork groups persist through individual time, visibility, rename/category/replacement and optimization; grouped deletion is blocked", async t => {
  const f = await artworkFixture(t);
  await artBatch(f, { operation: "individual", ids: ["sample", "other"], time, strategy: "replace" });
  await artBatch(f, { operation: "group-create", ids: ["sample", "other"], time: collective, name: "Study group" });
  let data = await f.request("/api/artworks"), group = data.artworkProductionGroups[0];
  assert.equal(group.time.minutes, 300); assert.ok(data.artworks.every(entry => entry.productionTime.minutes === 120));
  await f.request("/api/artworks/sample/production-time", "PUT", { catalogRevision: data.catalogRevision, productionTime: { minutes: 150, kind: "estimated" } });
  await f.request("/api/artworks/sample/visibility", "PUT", { hidden: true });
  await f.request("/api/artworks/sample/visibility", "PUT", { hidden: false });
  const renamed = await f.request("/api/artworks/sample", "PUT", { fileName: "renamed.jpg", categories: ["paintings"], date: "02-02-2026", alt: "Updated" });
  data = await f.request("/api/artworks"); group = data.artworkProductionGroups[0];
  assert.deepEqual(group.artworkIds, [renamed.artwork.id, "other"]); assert.deepEqual(group.time, collective);
  const mediaBefore = await readFile(path.join(f.root, "public", renamed.artwork.image));
  await assert.rejects(f.request(`/api/artworks/${renamed.artwork.id}`, "DELETE"), { status: 409 });
  assert.deepEqual(await readFile(path.join(f.root, "public", renamed.artwork.image)), mediaBefore);
  // A real replacement in the fixture, not just another metadata save.
  const session = await f.request("/api/replacements/sessions", "POST", { artworkId: renamed.artwork.id });
  const replacementBytes = await sharp({ create: { width: 44, height: 33, channels: 3, background: "#334477" } }).jpeg().toBuffer();
  const staged = (await f.request(`/api/replacements/sessions/${session.id}/file`, "POST", { fileName: "replacement.jpg", dataBase64: replacementBytes.toString("base64") })).file;
  const replacement = await f.request(`/api/replacements/sessions/${session.id}/commit`, "POST", { token: staged.token, categories: ["paintings"], date: "03-03-2026", alt: "Replacement", nameMode: "current", compression: { enabled: false }, thumbnailMode: "preserve" });
  assert.equal(replacement.artwork.id, renamed.artwork.id);
  assert.deepEqual(replacement.artwork.productionTime, { minutes: 150, kind: "estimated" });
  assert.deepEqual(await readFile(path.join(f.root, "public", replacement.artwork.image)), replacementBytes);
  assert.deepEqual((await f.request("/api/artworks")).artworkProductionGroups, [group]);
  await f.request(`/api/artworks/${renamed.artwork.id}/optimize`, "POST", { compression: { enabled: true, format: "webp", quality: 92, maxDimension: "original", metadata: "preserve" } });
  assert.deepEqual((await f.request("/api/artworks")).artworkProductionGroups, [group]);
});

test("Artwork group edit/add/remove/delete and overlapping/identical groups require explicit confirmation; restoration retains groups", async t => {
  const f = await artworkFixture(t);
  await artBatch(f, { operation: "group-create", ids: ["sample"], time: collective });
  let data = await f.request("/api/artworks"); const group = data.artworkProductionGroups[0];
  await artBatch(f, { operation: "group-update", groupId: group.id, ids: ["sample", "other"], time: { minutes: 600, kind: "actual" }, name: "Updated group" });
  const original = await f.sourceNow();
  const same = await artBatch(f, { operation: "group-create", ids: ["other", "sample"], time: collective }, false);
  assert.equal(same.plan.overlaps[0].identical, true);
  await assert.rejects(f.request("/api/artworks/production-batch/commit", "POST", { ...same.payload, token: same.plan.token, confirmed: true }), { status: 400 });
  assert.equal(await f.sourceNow(), original);
  await artBatch(f, { operation: "group-create", ids: ["other", "sample"], time: collective });
  await artBatch(f, { operation: "group-update", groupId: group.id, ids: ["other"] });
  await artBatch(f, { operation: "group-delete", groupId: group.id });
  data = await f.request("/api/artworks"); assert.equal(data.artworks.length, 2); assert.ok(data.artworks.every(entry => !entry.productionTime));
  const remaining = data.artworkProductionGroups[0]; await artBatch(f, { operation: "group-delete", groupId: remaining.id });
  const deleted = await f.request("/api/artworks/other", "DELETE");
  // Manual full-catalog restore with the paired fixture media (existing restore policy).
  await copyFile(path.resolve(f.root, deleted.trashPath), path.join(f.root, "public", f.other.image));
  await writeFile(f.catalog, original); await f.restart();
  assert.equal((await f.request("/api/artworks")).artworkProductionGroups[0].time.minutes, 600);
  assert.ok((await readdir(path.join(f.runtime, "backups"))).some(name => name.startsWith("artworks-")));
});

test("Artwork stale preview and failed atomic group write preserve the previous catalog, groups and all media", async t => {
  const f = await artworkFixture(t);
  const pending = await artBatch(f, { operation: "group-create", ids: ["sample", "other"], time: collective }, false);
  const original = await f.sourceNow(); await writeFile(f.catalog, original + "\n");
  await assert.rejects(f.request("/api/artworks/production-batch/commit", "POST", { ...pending.payload, ...confirmation(pending.plan) }), { status: 409 });
  assert.equal(await f.sourceNow(), original + "\n");
  await f.restart({ ARTWORK_ADMIN_TEST_PRODUCTION_FAIL_AT: "before-commit" });
  await assert.rejects(artBatch(f, { operation: "group-create", ids: ["sample", "other"], time: collective }), { status: 500 });
  assert.equal(await f.sourceNow(), original + "\n");
  assert.ok(!(await readdir(path.dirname(f.catalog))).some(name => name.includes(".tmp.js")));
  assert.deepEqual(await readFile(path.join(f.root, "public", f.artwork.image)), f.buffer);
});

test("Manga A deduplicates only explicitly linked drawings, preserving bindings and manual total; Manga B is independent", async t => {
  const f = await mangaFixture(t);
  await f.edit("total", { total: { minutes: 5400, kind: "estimated" } });
  await f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[1] });
  const bindings = (await f.manga()).productionTime.bindings;
  const selection = [f.pages.english[0], f.pages.french[1], f.pages.english[1]].map(path => ({ path }));
  const preview = await mangaBatch(f, { operation: "individual", selection, time, strategy: "replace" }, false);
  assert.equal(preview.plan.files, 3); assert.equal(preview.plan.logicalCount, 2);
  await mangaBatch(f, { operation: "individual", selection, time, strategy: "replace" });
  let m = await f.manga(); assert.equal(m.productionTime.pages.filter(page => page.time).length, 2);
  assert.deepEqual(m.productionTime.bindings.slice(0, 2), bindings);
  assert.equal(m.productionTime.total.minutes, 5400);
  await mangaBatch(f, { operation: "group-create", selection, time: collective, name: "Scene" });
  m = await f.manga(); assert.equal(m.productionTime.groups[0].pageIds.length, 2);
  assert.equal(m.productionTime.groups[0].time.minutes, 300); assert.ok(m.productionTime.pages.filter(p => p.time).every(p => p.time.minutes === 120));
  assert.equal(m.productionTime.total.minutes, 5400);
  assert.equal(getProductionDrawing(m, f.pages.french[0]), undefined, "Same index is not proof of correspondence");
});

test("Manga group-only pages have no fabricated individual time; members can be edited and removed without changing time", async t => {
  const f = await mangaFixture(t);
  await mangaBatch(f, { operation: "group-create", selection: [{ path: f.pages.english[0] }, { path: f.pages.english[1] }], time: collective });
  let m = await f.manga(), group = m.productionTime.groups[0];
  assert.equal(m.productionTime.total, undefined); assert.ok(m.productionTime.pages.every(page => !page.time));
  await mangaBatch(f, { operation: "group-update", groupId: group.id, selection: [{ path: f.pages.ja[0] }, { pageId: group.pageIds[0] }], name: "Updated" });
  m = await f.manga(); group = m.productionTime.groups[0]; assert.equal(group.pageIds.length, 2); assert.deepEqual(group.time, collective);
  await mangaBatch(f, { operation: "group-update", groupId: group.id, selection: [{ pageId: group.pageIds[0] }] });
  await mangaBatch(f, { operation: "group-delete", groupId: group.id });
  assert.equal((await f.manga()).productionTime.groups, undefined);
  assert.deepEqual((await f.manga()).languages, f.mangas[0].languages);
});

test("Manga reorder/keep/new/duplicate/delete/unlink respect group identities and historical members", async t => {
  const f = await mangaFixture(t);
  await f.edit("associate", { path: f.pages.english[1], targetPath: f.pages.french[0] });
  await mangaBatch(f, { operation: "group-create", selection: [{ path: f.pages.english[1] }, { path: f.pages.english[2] }], time: collective });
  const group = structuredClone((await f.manga()).productionTime.groups[0]);
  await f.service.reorderPages(2, "english", [f.pages.english[2], f.pages.english[1], f.pages.english[0]]);
  assert.deepEqual((await f.manga()).productionTime.groups[0], group);
  let result = await f.service.replacePage(2, "english", 1, { file: await f.upload(), productionIdentity: "keep" });
  assert.deepEqual(result.result.productionTime.groups[0], group);
  result = await f.service.replacePage(2, "english", 1, { file: await f.upload("different.jpg", "#123456"), productionIdentity: "new" });
  assert.ok(!group.pageIds.includes(getProductionDrawing(result.result, result.result.languages.english.pages[1]).id));
  assert.deepEqual(result.result.productionTime.groups[0], group);
  const copy = (await f.service.duplicatePage(2, "english", 0)).result.languages.english.pages.at(-1);
  assert.ok(!group.pageIds.includes(getProductionDrawing(await f.manga(), copy).id));
  await f.edit("associate", { path: f.pages.english[2], targetPath: f.pages.french[1], confirmGroups: true });
  await f.edit("separate", { path: f.pages.french[1], mode: "empty" });
  assert.ok(!group.pageIds.includes(getProductionDrawing(await f.manga(), f.pages.french[1]).id));
  await f.service.deletePage(2, "english", 0); await f.service.deleteLanguage(2, "french");
  const m = await f.manga(); assert.deepEqual(m.productionTime.groups[0], group);
  assert.ok(group.pageIds.every(id => m.productionTime.pages.some(page => page.id === id)), "Historical untimed group members survive cleanup");
});

test("Manga association of grouped identities requires confirmation and deduplicates members without summing group times", async t => {
  const f = await mangaFixture(t);
  await mangaBatch(f, { operation: "group-create", selection: [{ path: f.pages.english[0] }, { path: f.pages.french[0] }], time: collective });
  const before = await f.currentSource();
  await assert.rejects(f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[0] }), /groupes/);
  assert.equal(await f.currentSource(), before);
  await f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[0], confirmGroups: true });
  const group = (await f.manga()).productionTime.groups[0]; assert.equal(group.pageIds.length, 1); assert.deepEqual(group.time, collective);
});

test("Manga invalid member, stale preview, failed write and rollback leave all existing groups/times untouched", async t => {
  const f = await mangaFixture(t);
  await mangaBatch(f, { operation: "group-create", selection: [{ path: f.pages.english[0] }], time: collective });
  const source = await f.currentSource();
  await assert.rejects(mangaBatch(f, { operation: "individual", selection: [{ path: f.pages.english[0] }, { path: "assets/mangaka/foreign/01.jpg" }], time, strategy: "replace" }));
  assert.equal(await f.currentSource(), source);
  const pending = await mangaBatch(f, { operation: "individual", selection: [{ path: f.pages.english[0] }], time, strategy: "replace" }, false);
  await f.service.update(2, { summary: "Changed externally" });
  await assert.rejects(f.service.productionBatch(2, { ...pending.payload, ...confirmation(pending.plan) }, true), error => error.status === 409);
  const faulty = await mangaFixture(t, { failurePoint: "after-catalog" });
  await assert.rejects(mangaBatch(faulty, { operation: "group-create", selection: [{ path: faulty.pages.english[0] }, { path: faulty.pages.english[1] }], time: collective }));
  assert.equal(await faulty.currentSource(), faulty.original);
  for (const [relative, bytes] of faulty.media) assert.deepEqual(await readFile(path.join(faulty.root, "public", relative)), bytes);
});

test("Artwork import and failed replacement preserve the complete groups export and its backups", async t => {
  const f = await artworkFixture(t);
  await artBatch(f, { operation: "group-create", ids: ["sample", "other"], time: collective });
  const groups = (await f.request("/api/artworks")).artworkProductionGroups;
  const importedBytes = await sharp({ create: { width: 24, height: 36, channels: 3, background: "#abcdef" } }).jpeg().toBuffer();
  await f.request("/api/artworks", "POST", { category: "backgrounds", date: "04-04-2026", fileName: "new.jpg", dataBase64: importedBytes.toString("base64") });
  assert.deepEqual((await f.request("/api/artworks")).artworkProductionGroups, groups);
  const before = await f.sourceNow();
  await f.restart({ ARTWORK_ADMIN_TEST_REPLACE_FAIL_AT: "after-catalog-write-invalid" });
  const session = await f.request("/api/replacements/sessions", "POST", { artworkId: "sample" });
  const bytes = await sharp({ create: { width: 20, height: 30, channels: 3, background: "#a1b2c3" } }).jpeg().toBuffer();
  const staged = (await f.request(`/api/replacements/sessions/${session.id}/file`, "POST", { fileName: "rollback.jpg", dataBase64: bytes.toString("base64") })).file;
  await assert.rejects(f.request(`/api/replacements/sessions/${session.id}/commit`, "POST", { token: staged.token, categories: ["illustrations"], date: "03-03-2026", alt: "Rollback", nameMode: "current", compression: { enabled: false }, thumbnailMode: "preserve" }), { status: 500 });
  assert.equal(await f.sourceNow(), before);
  assert.deepEqual(await readFile(path.join(f.root, "public", f.artwork.image)), f.buffer);
  const backups = await Promise.all((await readdir(path.join(f.runtime, "backups"))).filter(name => name.startsWith("artworks-")).map(name => readFile(path.join(f.runtime, "backups", name), "utf8")));
  assert.ok(backups.includes(before)); assert.ok(backups.some(source => !source.includes("artworkProductionGroups")), "Pre-Phase 3 backup is still readable");
});

test("Artwork partial overlap and invalid group updates do not write; times exceed 24h without truncation", async t => {
  const f = await artworkFixture(t);
  await artBatch(f, { operation: "group-create", ids: ["sample", "other"], time: { minutes: 7200, kind: "estimated" } });
  const before = await f.sourceNow();
  const overlap = await artBatch(f, { operation: "group-create", ids: ["sample"], time: collective }, false);
  assert.equal(overlap.plan.overlaps[0].identical, false); assert.equal(overlap.plan.overlaps[0].shared, 1);
  const groupId = (await f.request("/api/artworks")).artworkProductionGroups[0].id;
  for (const change of [{ ids: [] }, { ids: ["sample", "sample"] }, { ids: ["missing"] }, { time: { minutes: Number.MAX_SAFE_INTEGER + 1, kind: "actual" } }, { name: "x".repeat(161) }]) await assert.rejects(artBatch(f, { operation: "group-update", groupId, ...change }));
  assert.equal(await f.sourceNow(), before);
  assert.equal((await f.request("/api/artworks")).artworkProductionGroups[0].time.minutes, 7200);
});

test("Manga preview makes no lazy identities persistent, requires overwrite/overlap acknowledgements and protects other projects", async t => {
  const f = await mangaFixture(t), original = await f.currentSource();
  const selection = [{ path: f.pages.english[0] }, { path: f.pages.french[0] }];
  const pending = await mangaBatch(f, { operation: "group-create", selection, time: collective }, false);
  assert.equal(pending.plan.logicalCount, 2, "Same position in two languages is not a confirmed link");
  assert.equal(await f.currentSource(), original);
  await mangaBatch(f, { operation: "individual", selection, time, strategy: "replace" });
  const before = await f.currentSource();
  const replacement = await mangaBatch(f, { operation: "individual", selection, time: collective, strategy: "replace" }, false);
  await assert.rejects(f.service.productionBatch(2, { ...replacement.payload, token: replacement.plan.token, confirmed: true }, true), /remplacement/);
  assert.equal(await f.currentSource(), before);
  await mangaBatch(f, { operation: "group-create", selection, time: collective });
  const overlap = await mangaBatch(f, { operation: "group-create", selection, time: collective }, false);
  assert.equal(overlap.plan.overlaps[0].identical, true);
  await assert.rejects(f.service.productionBatch(2, { ...overlap.payload, token: overlap.plan.token, confirmed: true }, true), /recouvrements/);
  const other = (await f.service.readCatalog())[1];
  await assert.rejects(mangaBatch(f, { operation: "group-create", selection: [{ path: other.cover }], time: collective }));
  assert.deepEqual((await f.service.readCatalog())[1], f.mangas[1]);
});

test("generated Artwork catalog preserves both ESM exports, original metadata and BASE_URL-compatible assets through Vite", async t => {
  const f = await artworkFixture(t);
  await artBatch(f, { operation: "group-create", ids: ["sample", "other"], time: collective });
  const source = await f.sourceNow();
  assert.match(source, /image: assetPath\(/);
  // Replace only the fixture import for evaluation in Node. The actual emitted
  // catalog keeps the project's assetPath import and is checked by the writer.
  const fixtureSource = source.replace(/^import \{ assetPath \} from [^\n]+\n/, 'const assetPath = path => "/portfolio/" + path;\n');
  const transformed = await transformWithEsbuild(fixtureSource, "artworks.js", { loader: "js" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString("base64")}`);
  assert.deepEqual(module.artworkProductionGroups, (await f.request("/api/artworks")).artworkProductionGroups);
  for (const [index, original] of [f.artwork, f.other].entries()) assert.deepEqual(module.artworks[index], { ...original, image: "/portfolio/" + original.image });
});

async function extendArtworks(f, count) {
  for (let i = 2; i < count; i++) {
    const bytes = await sharp({ create: { width: 30 + i, height: 40, channels: 3, background: { r: 10 + i * 30, g: 40, b: 70 } } }).jpeg().toBuffer();
    await f.request("/api/artworks", "POST", { category: "illustrations", date: "04-04-2026", fileName: `extra-${i}.jpg`, dataBase64: bytes.toString("base64") });
  }
  return (await f.request("/api/artworks")).artworks;
}
const withoutTime = value => { const next = { ...value }; delete next.productionTime; return next; };
async function artworkBackups(f) { return (await readdir(path.join(f.runtime, "backups"))).filter(name => name.startsWith("artworks-")).sort(); }
async function assertArtworkMedia(f, entries, bytes) {
  for (const [i, entry] of entries.entries()) assert.deepEqual(await readFile(path.join(f.root, "public", entry.image)), bytes[i]);
}

test("clear planner removes only existing individual values, counts ignored members and never changes a group", () => {
  const values = new Map([["a", time], ["b", time], ["c", time], ["d", undefined], ["e", undefined]]);
  const groups = [{ id: "group-a", time: collective, artworkIds: ["a", "b"] }], before = structuredClone(groups);
  const payload = { operation: "individual-clear", ids: [...values.keys()], catalogRevision: "revision" };
  const plan = prepareProductionBatch({ groups, selectedIds: payload.ids, selectionCount: 5, field: "artworkIds", readTime: id => values.get(id), clearTime: id => values.delete(id), payload, revision: "revision" });
  assert.equal(plan.erased, 3); assert.equal(plan.skipped, 2); assert.equal(plan.created, 0); assert.equal(plan.replaced, 0);
  assert.equal(values.size, 2); assert.deepEqual(groups, before);
  assert.throws(() => verifyProductionConfirmation(payload, plan)); verifyProductionConfirmation({ ...payload, token: plan.token, confirmed: true }, plan);
  assert.throws(() => prepareProductionBatch({ groups, selectedIds: ["a"], selectionCount: 1, field: "artworkIds", readTime: () => time, payload: { ...payload, time }, revision: "revision" }));
});

test("Artwork C clears three selected times, survives reload and preserves every other property/media", async t => {
  const f = await artworkFixture(t), entries = await extendArtworks(f, 3), ids = entries.map(a => a.id);
  await artBatch(f, { operation: "individual", ids, time, strategy: "replace" });
  const before = (await f.request("/api/artworks")).artworks;
  const bytes = await Promise.all(before.map(a => readFile(path.join(f.root, "public", a.image))));
  const result = await artBatch(f, { operation: "individual-clear", ids });
  assert.equal(result.plan.erased, 3); assert.equal(result.plan.skipped, 0);
  await f.restart(); assert.deepEqual((await f.request("/api/artworks")).artworks, before.map(withoutTime));
  await assertArtworkMedia(f, before, bytes);
});

test("Artwork C mixed five/three times/two absent preserves groups/members and makes one full backup", async t => {
  const f = await artworkFixture(t), entries = await extendArtworks(f, 5), ids = entries.map(a => a.id);
  await artBatch(f, { operation: "individual", ids: ids.slice(0, 3), time, strategy: "replace" });
  await artBatch(f, { operation: "group-create", ids, time: collective, name: "Protected group" });
  const before = await f.sourceNow(), data = await f.request("/api/artworks"), backups = await artworkBackups(f);
  const bytes = await Promise.all(data.artworks.map(a => readFile(path.join(f.root, "public", a.image))));
  const pending = await artBatch(f, { operation: "individual-clear", ids }, false);
  assert.equal(pending.plan.erased, 3); assert.equal(pending.plan.skipped, 2); assert.equal(await f.sourceNow(), before);
  const result = await artBatch(f, { operation: "individual-clear", ids });
  assert.equal((await artworkBackups(f)).length, backups.length + 1);
  assert.equal(await readFile(path.resolve(f.root, result.backup), "utf8"), before);
  await f.restart(); const after = await f.request("/api/artworks");
  assert.deepEqual(after.artworks, data.artworks.map(withoutTime)); assert.deepEqual(after.artworkProductionGroups, data.artworkProductionGroups);
  await assertArtworkMedia(f, data.artworks, bytes);
});

test("Artwork C with no duration is a successful no-op: no write, backup or legacy export initialization", async t => {
  const f = await artworkFixture(t), before = await f.sourceNow(), info = await stat(f.catalog), backups = await artworkBackups(f);
  const result = await artBatch(f, { operation: "individual-clear", ids: ["sample", "other"] });
  assert.equal(result.unchanged, true); assert.equal(result.plan.erased, 0); assert.equal(result.plan.skipped, 2);
  assert.equal(await f.sourceNow(), before); assert.equal((await stat(f.catalog)).mtimeMs, info.mtimeMs); assert.deepEqual(await artworkBackups(f), backups);
});

test("Artwork C ignores nonselected times; invalid/stale/unconfirmed lots and failed writes cannot partly erase", async t => {
  const f = await artworkFixture(t); await artBatch(f, { operation: "individual", ids: ["sample", "other"], time, strategy: "replace" });
  await artBatch(f, { operation: "group-create", ids: ["sample", "other"], time: collective });
  let before = await f.sourceNow(); const pending = await artBatch(f, { operation: "individual-clear", ids: ["sample", "other"] }, false);
  await assert.rejects(f.request("/api/artworks/production-batch/commit", "POST", { ...pending.payload, token: pending.plan.token }), { status: 400 });
  await assert.rejects(artBatch(f, { operation: "individual-clear", ids: ["sample", "missing"] }), { status: 409 });
  await assert.rejects(f.request("/api/artworks/production-batch/commit", "POST", { ...pending.payload, ids: ["sample"], ...confirmation(pending.plan) }), { status: 400 });
  assert.equal(await f.sourceNow(), before);
  await writeFile(f.catalog, before + "\n"); before += "\n";
  await assert.rejects(f.request("/api/artworks/production-batch/commit", "POST", { ...pending.payload, ...confirmation(pending.plan) }), { status: 409 });
  await f.restart({ ARTWORK_ADMIN_TEST_PRODUCTION_FAIL_AT: "before-commit" });
  await assert.rejects(artBatch(f, { operation: "individual-clear", ids: ["sample", "other"] }), { status: 500 });
  assert.equal(await f.sourceNow(), before); assert.ok(!(await readdir(path.dirname(f.catalog))).some(name => name.includes(".tmp.js")));
  await f.restart(); await artBatch(f, { operation: "individual-clear", ids: ["sample"] });
  const after = await f.request("/api/artworks"); assert.equal(after.artworks.find(a => a.id === "sample").productionTime, undefined);
  assert.deepEqual(after.artworks.find(a => a.id === "other").productionTime, time); assert.deepEqual(after.artworkProductionGroups[0].time, collective);
});

test("Manga C deduplicates linked files, ignores untracked pages and preserves global time/groups/IDs/bindings/unselected times", async t => {
  const f = await mangaFixture(t);
  await f.edit("total", { total: { minutes: 15000, kind: "estimated" } });
  await f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[0] });
  await mangaBatch(f, { operation: "individual", selection: f.pages.english.map(path => ({ path })), time, strategy: "replace" });
  await mangaBatch(f, { operation: "group-create", selection: [{ path: f.pages.english[0] }, { path: f.pages.english[1] }], time: collective });
  const before = await f.manga();
  const selection = [f.pages.english[0], f.pages.french[0], f.pages.english[1], f.pages.french[1]].map(path => ({ path }));
  const result = await mangaBatch(f, { operation: "individual-clear", selection });
  assert.equal(result.plan.files, 4); assert.equal(result.plan.logicalCount, 3); assert.equal(result.plan.erased, 2); assert.equal(result.plan.skipped, 1);
  const after = await f.manga(), expected = structuredClone(before);
  for (const p of expected.productionTime.pages) if ([getProductionDrawing(before, f.pages.english[0]).id, getProductionDrawing(before, f.pages.english[1]).id].includes(p.id)) delete p.time;
  assert.deepEqual(after, expected); assert.equal(getProductionDrawing(after, f.pages.french[1]), undefined);
  assert.deepEqual((await f.service.readCatalog())[1], f.mangas[1]);
  await f.start(); assert.deepEqual((await f.request("/api/mangas")).mangas[0].productionTime, expected.productionTime);
  for (const [relative, bytes] of f.media) assert.deepEqual(await readFile(path.join(f.root, "public", relative)), bytes);
});

test("Manga C keeps historical drawings/groups after their last individual time is removed", async t => {
  const f = await mangaFixture(t);
  await mangaBatch(f, { operation: "individual", selection: [{ path: f.pages.english[0] }], time, strategy: "replace" });
  await mangaBatch(f, { operation: "group-create", selection: [{ path: f.pages.english[0] }], time: collective });
  const pageId = getProductionDrawing(await f.manga(), f.pages.english[0]).id;
  await f.service.replacePage(2, "english", 0, { file: await f.upload(), productionIdentity: "new" });
  const before = await f.manga();
  await mangaBatch(f, { operation: "individual-clear", selection: [{ pageId }] });
  const after = await f.manga(), expected = structuredClone(before);
  delete expected.productionTime.pages.find(p => p.id === pageId).time;
  assert.deepEqual(after, expected); assert.ok(after.productionTime.pages.some(p => p.id === pageId));
});

test("Manga C without durations neither writes/backups nor creates logical identities, including unrelated equal page numbers", async t => {
  const f = await mangaFixture(t), before = await f.currentSource(), info = await stat(f.catalogPath), backups = await readdir(f.service.paths.backupRoot);
  const result = await mangaBatch(f, { operation: "individual-clear", selection: [{ path: f.pages.english[0] }, { path: f.pages.french[0] }] });
  assert.equal(result.unchanged, true); assert.equal(result.plan.logicalCount, 2); assert.equal(result.plan.erased, 0); assert.equal(result.plan.skipped, 2);
  assert.equal(await f.currentSource(), before); assert.equal((await stat(f.catalogPath)).mtimeMs, info.mtimeMs);
  assert.deepEqual(await readdir(f.service.paths.backupRoot), backups);
});

test("Manga C invalid/stale lots and post-write rollback retain all original metadata and media", async t => {
  const f = await mangaFixture(t);
  await mangaBatch(f, { operation: "individual", selection: f.pages.english.map(path => ({ path })), time, strategy: "replace" });
  await mangaBatch(f, { operation: "group-create", selection: [{ path: f.pages.english[0] }], time: collective });
  const before = await f.currentSource(), selection = [{ path: f.pages.english[0] }, { path: f.pages.english[1] }];
  const pending = await mangaBatch(f, { operation: "individual-clear", selection }, false);
  await assert.rejects(mangaBatch(f, { operation: "individual-clear", selection: [...selection, { path: "assets/mangaka/foreign/01.jpg" }] }));
  await assert.rejects(f.service.productionBatch(2, { ...pending.payload, token: pending.plan.token }, true));
  assert.equal(await f.currentSource(), before);
  const faulty = createMangaService({ projectRoot: f.root, runtimeRoot: f.runtime, failurePoint: "after-catalog" });
  await assert.rejects(faulty.productionBatch(2, { ...pending.payload, ...confirmation(pending.plan) }, true));
  assert.equal(await f.currentSource(), before);
  await writeFile(f.catalogPath, before + "\n");
  await assert.rejects(f.service.productionBatch(2, { ...pending.payload, ...confirmation(pending.plan) }, true), error => error.status === 409);
  assert.equal(await f.currentSource(), before + "\n");
  for (const [relative, bytes] of f.media) assert.deepEqual(await readFile(path.join(f.root, "public", relative)), bytes);
});
