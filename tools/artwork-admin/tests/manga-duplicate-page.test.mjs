import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import sharp from "sharp";
import { FileTransaction } from "../file-transaction.mjs";
import { serializeMangaCatalog } from "../manga/catalog.mjs";
import { handleMangaRoute } from "../manga/routes.mjs";
import { createMangaService } from "../manga/service.mjs";

async function fixture(t, options = {}, folder = "ja") {
  const dir = await mkdtemp(path.join(tmpdir(), "manga-duplicate-"));
  assert.ok(path.resolve(dir).startsWith(path.join(tmpdir(), "manga-duplicate-")));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "portfolio"), runtime = path.join(dir, "runtime");
  const prefix = "assets/mangaka/completed-manga/example";
  const pages = ["01.jpg", "0000.jpg", "03.jpg"].map((name) => `${prefix}/${folder}/${name}`);
  const others = [`${prefix}/french/01.jpg`, "assets/mangaka/completed-manga/other/orig/01.jpg"];
  for (const [index, relative] of [...pages, ...others].entries()) {
    const file = path.join(root, "public", relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, await sharp({ create: { width: 8, height: 12, channels: 3, background: { r: index * 30, g: 40, b: 80 } } }).jpeg().toBuffer());
  }
  const catalogPath = path.join(root, "src/content/mangas.js");
  await mkdir(path.dirname(catalogPath), { recursive: true });
  const catalog = [
    { id: "example", slug: "example", route: "/mangas/example", title: "Example", presentationSection: "completed", cover: pages[0], defaultLanguage: "ja", readingDirection: "rtl", languages: { ja: { label: "Japanese", shortLabel: "JA", storageFolder: folder, pages }, fr: { label: "French", shortLabel: "FR", pages: [others[0]] } } },
    { id: "other", slug: "other", route: "/mangas/other", title: "Other", presentationSection: "completed", cover: others[1], defaultLanguage: "orig", languages: { orig: { label: "Original", shortLabel: "ORIG", pages: [others[1]] } } },
  ];
  await writeFile(catalogPath, serializeMangaCatalog(catalog));
  const service = createMangaService({ projectRoot: root, runtimeRoot: runtime, ...options });
  await service.initialize();
  const source = path.join(root, "public", pages[1]);
  return { dir, root, source, pages, catalogPath, service, before: await service.readCatalog(), bytes: await readFile(source), original: await readFile(catalogPath) };
}
function assertOnlyPagesChanged(before, after) {
  assert.deepEqual(after[1], before[1]);
  const restored = structuredClone(after[0]);
  restored.languages.ja.pages = before[0].languages.ja.pages;
  assert.deepEqual(restored, before[0]);
}

test("physical byte-exact duplication at the end and in the middle shifts positions only", async (t) => {
  const f = await fixture(t);
  const outcome = await f.service.duplicatePage("example", "ja", 1, { source: f.pages[1], position: 4 });
  const end = outcome.result.languages.ja.pages[3];
  assert.equal(path.basename(end), "0000-copy.jpg"); assert.notEqual(end, f.pages[1]);
  assert.equal(path.dirname(end), path.dirname(f.pages[1]));
  assert.deepEqual(await readFile(path.join(f.root, "public", end)), f.bytes);
  assert.deepEqual(await readFile(f.source), f.bytes);
  assert.ok(outcome.backup);
  const middle = await f.service.duplicatePage("example", "ja", 1, { position: 2 });
  assert.deepEqual(middle.result.languages.ja.pages, [f.pages[0], `${path.dirname(end).replaceAll("\\", "/")}/0000-copy-2.jpg`, f.pages[1], f.pages[2], end]);
  assertOnlyPagesChanged(f.before, await f.service.readCatalog());
  await f.service.deletePage("example", "ja", 1);
  assert.deepEqual(await readFile(f.source), f.bytes);
  assert.ok((await f.service.readCatalog())[0].languages.ja.pages.includes(f.pages[1]));
});

test("existing names are never overwritten, and legacy physical language folders stay unchanged", async (t) => {
  const f = await fixture(t, {}, "english");
  const occupied = path.join(path.dirname(f.source), "0000-copy.jpg");
  const occupiedBytes = Buffer.from("pre-existing file must remain intact");
  await writeFile(occupied, occupiedBytes);
  const output = await f.service.duplicatePage("example", "ja", 1);
  const copy = output.result.languages.ja.pages.at(-1);
  assert.equal(path.basename(copy), "0000-copy-2.jpg");
  assert.equal(path.dirname(copy), path.dirname(f.pages[1]));
  assert.deepEqual(await readFile(occupied), occupiedBytes);
  assert.deepEqual(await readFile(path.join(f.root, "public", copy)), f.bytes);
  assertOnlyPagesChanged(f.before, await f.service.readCatalog());
});

test("invalid positions, stale source references and missing sources leave the catalog unchanged", async (t) => {
  const f = await fixture(t);
  for (const position of [0, -1, 5, 1.5, "bad"]) {
    await assert.rejects(f.service.duplicatePage("example", "ja", 1, { position }), (error) => error.status === 400);
  }
  await assert.rejects(f.service.duplicatePage("example", "ja", 1, { source: f.pages[0] }), (error) => error.status === 409);
  await assert.rejects(f.service.duplicatePage("example", "ja", 99), (error) => error.status === 404);
  await rm(f.source);
  await assert.rejects(f.service.duplicatePage("example", "ja", 1), (error) => error.status === 404);
  assert.deepEqual(await readFile(f.catalogPath), f.original);
  assert.ok(!(await readdir(path.dirname(f.source))).some((name) => name.includes("copy")));
});

test("partial physical copy failure rolls back the owned destination", async (t) => {
  const f = await fixture(t);
  const write = FileTransaction.prototype.writeExclusive;
  t.mock.method(FileTransaction.prototype, "writeExclusive", async function (destination, buffer) {
    await write.call(this, destination, buffer.subarray(0, 5));
    throw new Error("Physical copy failed");
  });
  await assert.rejects(f.service.duplicatePage("example", "ja", 1), /Physical copy failed/);
  assert.deepEqual(await readFile(f.catalogPath), f.original);
  assert.deepEqual(await readFile(f.source), f.bytes);
  assert.ok(!(await readdir(path.dirname(f.source))).some((name) => name.includes("copy")));
});

for (const failurePoint of ["before-catalog", "invalid-catalog", "after-catalog"]) {
  test(`catalog failure (${failurePoint}) removes the copy and restores the original catalog`, async (t) => {
    const f = await fixture(t, { failurePoint });
    await assert.rejects(f.service.duplicatePage("example", "ja", 1));
    assert.deepEqual(await readFile(f.catalogPath), f.original);
    assert.deepEqual(await readFile(f.source), f.bytes);
    assert.deepEqual(await readdir(path.dirname(f.source)), ["0000.jpg", "01.jpg", "03.jpg"]);
    assert.deepEqual(await f.service.readCatalog(), f.before);
  });
}

test("exclusive writes preserve an existing file and clean up a failed new write", async (t) => {
  const f = await fixture(t);
  const tx = new FileTransaction();
  await assert.rejects(tx.writeExclusive(f.source, Buffer.from("overwrite")), (error) => error.code === "EEXIST");
  await tx.rollback(); assert.deepEqual(await readFile(f.source), f.bytes);
  const destination = path.join(path.dirname(f.source), "failed-write.jpg");
  await assert.rejects(tx.writeExclusive(destination, { invalid: true }), TypeError);
  await tx.rollback(); await assert.rejects(stat(destination), (error) => error.code === "ENOENT");
});

test("path traversal and directory links outside the manga cannot be copied", async (t) => {
  const f = await fixture(t);
  const altered = structuredClone(f.before);
  altered[0].languages.ja.pages[1] = "assets/mangaka/completed-manga/example/ja/../french/01.jpg";
  await writeFile(f.catalogPath, serializeMangaCatalog(altered));
  const before = await readFile(f.catalogPath);
  await assert.rejects(f.service.duplicatePage("example", "ja", 1), (error) => error.status === 403);
  assert.deepEqual(await readFile(f.catalogPath), before);
  const outside = path.join(f.dir, "outside"); await mkdir(outside); await writeFile(path.join(outside, "01.jpg"), f.bytes);
  const link = path.join(path.dirname(path.dirname(f.source)), "linked");
  await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  altered[0].languages.ja.pages[1] = "assets/mangaka/completed-manga/example/linked/01.jpg";
  await writeFile(f.catalogPath, serializeMangaCatalog(altered));
  await assert.rejects(f.service.duplicatePage("example", "ja", 1), (error) => error.status === 403);
  assert.deepEqual(await readdir(outside), ["01.jpg"]);
});

test("simultaneous duplicate requests retain both independent copies", async (t) => {
  const f = await fixture(t);
  await Promise.all([f.service.duplicatePage("example", "ja", 1), f.service.duplicatePage("example", "ja", 1)]);
  const catalog = await f.service.readCatalog();
  assert.equal(catalog[0].languages.ja.pages.length, 5);
  assert.equal(new Set(catalog[0].languages.ja.pages).size, 5);
  for (const page of catalog[0].languages.ja.pages.slice(3)) assert.deepEqual(await readFile(path.join(f.root, "public", page)), f.bytes);
  assertOnlyPagesChanged(f.before, catalog);
});

test("duplicate API route uses the existing service and returns a created page", async (t) => {
  const f = await fixture(t);
  let response;
  const matched = await handleMangaRoute({ method: "POST" }, {}, new URL("http://localhost/api/mangas/example/languages/ja/pages/1/duplicate"), {
    service: f.service, readJson: async () => ({ source: f.pages[1], position: 4 }), sendJson: (_, status, body) => { response = { status, body }; },
  });
  assert.equal(matched, true); assert.equal(response.status, 201);
  assert.equal(response.body.result.languages.ja.pages.length, 4);
});

test("duplicate confirmation defaults to the end, supports cancellation and keeps the selected language", async () => {
  const source = await readFile(new URL("../public/modules/mangas/manga-admin.js", import.meta.url), "utf8");
  const nodes = new Map();
  const $ = (id) => { if (!nodes.has(id)) nodes.set(id, { hidden: true, open: false, disabled: false, showModal() { this.open = true; }, close() { this.open = false; }, focus() {}, select() {}, reportValidity() { return true; }, addEventListener() {} }); return nodes.get(id); };
  const pages = ["assets/mangaka/example/ja/01.jpg", "assets/mangaka/example/ja/0000.jpg", "assets/mangaka/example/ja/03.jpg"];
  const state = { currentId: "example", language: "ja", dirty: false, workingPages: pages };
  const requests = [], messages = [];
  const context = vm.createContext({ $, state, message: (value) => messages.push(value), api: async (url, options) => requests.push({ url, body: JSON.parse(options.body) }), reloadEditor: async () => { state.language = "en"; }, renderLanguages: () => {} });
  vm.runInContext(`let duplicateRequest = null; let duplicateSubmitting = false;\n${source.slice(source.indexOf("function openDuplicatePage("), source.indexOf("function movePage("))}`, context);
  context.openDuplicatePage(1);
  assert.equal($("#duplicate-page-dialog").open, true);
  assert.equal(Number($("#duplicate-page-position").value), 4);
  assert.ok($("#duplicate-page-source").textContent.includes("Position 02"));
  context.closeDuplicatePage(); assert.equal(requests.length, 0);
  context.openDuplicatePage(1); $("#duplicate-page-position").value = "2";
  await context.submitDuplicatePage({ preventDefault() {} });
  assert.equal(requests[0].url, "/api/mangas/example/languages/ja/pages/1/duplicate");
  assert.equal(requests[0].body.position, 2); assert.equal(requests[0].body.source, pages[1]);
  assert.equal(state.language, "ja"); assert.equal($("#confirm-duplicate-page").disabled, false);
  state.dirty = true; context.openDuplicatePage(1);
  assert.equal($("#duplicate-page-dialog").open, false); assert.match(messages.at(-1), /Enregistrez/);
});
