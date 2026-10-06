import assert from "node:assert/strict";
import fsPromises, { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import sharp from "sharp";
import { FileTransaction } from "../file-transaction.mjs";
import { serializeMangaCatalog } from "../manga/catalog.mjs";
import { handleMangaRoute } from "../manga/routes.mjs";
import { createMangaService } from "../manga/service.mjs";

async function image(name = "corrected.jpg", format = "jpeg") {
  const buffer = await sharp({ create: { width: 16, height: 24, channels: 3, background: "#abcdef" } }).toFormat(format).toBuffer();
  return { fileName: name, dataBase64: buffer.toString("base64") };
}
async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "manga-replace-"));
  assert.ok(path.resolve(dir).startsWith(path.join(tmpdir(), "manga-replace-")));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "portfolio"), runtime = path.join(dir, "runtime");
  const prefix = "assets/mangaka/completed-manga/example";
  const pages = ["01.jpg", "0000.jpg", "03.jpg"].map((name) => `${prefix}/japanese/${name}`);
  const otherPages = [`${prefix}/french/01.jpg`, "assets/mangaka/completed-manga/other/en/01.jpg", `${prefix}/english/01.jpg`];
  const sourceBytes = await sharp({ create: { width: 8, height: 12, channels: 3, background: "#102030" } }).jpeg().toBuffer();
  for (const relative of [...pages, ...otherPages]) {
    const file = path.join(root, "public", relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, sourceBytes);
  }
  const catalog = [
    { id: "example", slug: "example", route: "/mangas/example", title: "Example", presentationSection: "completed", cover: pages[0], defaultLanguage: "en", readingDirection: "rtl", languages: {
      en: { label: "English", shortLabel: "ENG", pages: [otherPages[2]] },
      ja: { label: "日本語", shortLabel: "JA", storageFolder: "japanese", pages },
      fr: { label: "Français", shortLabel: "FR", pages: [otherPages[0]] },
    } },
    { id: "other", slug: "other", route: "/mangas/other", title: "Other", presentationSection: "completed", cover: otherPages[1], defaultLanguage: "en", languages: { en: { label: "English", shortLabel: "ENG", pages: [otherPages[1]] } } },
  ];
  const catalogPath = path.join(root, "src/content/mangas.js"); await mkdir(path.dirname(catalogPath), { recursive: true }); await writeFile(catalogPath, serializeMangaCatalog(catalog));
  const service = createMangaService({ projectRoot: root, runtimeRoot: runtime, ...options }); await service.initialize();
  return { dir, root, runtime, service, pages, catalogPath, source: path.join(root, "public", pages[1]), sourceBytes, original: await readFile(catalogPath), before: await service.readCatalog() };
}
function assertOnlyTargetChanged(before, after, index = 1) {
  const restored = structuredClone(after);
  restored[0].languages.ja.pages[index] = before[0].languages.ja.pages[index];
  assert.deepEqual(restored, before);
}
async function assertRestored(f) {
  assert.deepEqual(await readFile(f.catalogPath), f.original);
  assert.deepEqual(await readFile(f.source), f.sourceBytes);
  assert.deepEqual((await readdir(path.dirname(f.source))).sort(), ["0000.jpg", "01.jpg", "03.jpg"]);
  for (const entry of await readdir(f.service.paths.trashRoot, { recursive: true })) {
    assert.equal((await stat(path.join(f.service.paths.trashRoot, entry))).isFile(), false);
  }
  assert.ok(!(await readdir(path.dirname(f.catalogPath))).some((name) => name.endsWith(".tmp")));
}

test("JPG replacement keeps position, order, count, all other languages/mangas and original upload bytes", async (t) => {
  const f = await fixture(t); const upload = await image();
  const result = await f.service.replacePage("example", "ja", 1, { file: upload, keepName: true, source: f.pages[1] });
  const catalog = await f.service.readCatalog(); assertOnlyTargetChanged(f.before, catalog);
  const next = catalog[0].languages.ja.pages[1];
  assert.equal(path.basename(next), "0000-2.jpg"); assert.equal(path.dirname(next), path.dirname(f.pages[1]));
  assert.deepEqual(catalog[0].languages.ja.pages, [f.pages[0], next, f.pages[2]]);
  assert.deepEqual(await readFile(path.join(f.root, "public", next)), Buffer.from(upload.dataBase64, "base64"));
  await assert.rejects(stat(f.source), (error) => error.code === "ENOENT");
  const trashFiles = await readdir(f.service.paths.trashRoot, { recursive: true });
  const archived = trashFiles.find((entry) => path.basename(entry) === "0000.jpg"); assert.ok(archived);
  assert.deepEqual(await readFile(path.join(f.service.paths.trashRoot, archived)), f.sourceBytes);
  assert.deepEqual(await readFile(path.join(f.root, "public", f.pages[0])), f.sourceBytes);
  assert.deepEqual(await readFile(path.join(f.root, "public", f.pages[2])), f.sourceBytes);
  assert.ok(result.backup); assert.deepEqual(await readFile(path.join(f.root, result.backup)), f.original);
  const report = (await f.service.report()).mangas.find((manga) => manga.id === "example");
  const details = report.languages.ja.pageDetails[1];
  assert.equal(details.width, 16); assert.equal(details.height, 24); assert.equal(details.size, Buffer.from(upload.dataBase64, "base64").length);
  assert.equal(report.languages.ja.pageCount, 3); assert.equal(details.path, next);
});

for (const [extension, format] of [["png", "png"], ["webp", "webp"], ["avif", "avif"], ["gif", "gif"], ["jpeg", "jpeg"]]) {
  test(`replacement handles extension change to ${extension} without changing positions`, async (t) => {
    const f = await fixture(t); const upload = await image(`new.${extension}`, format);
    await f.service.replacePage("example", "ja", 1, { file: upload, keepName: true });
    const after = await f.service.readCatalog(); assertOnlyTargetChanged(f.before, after);
    const next = after[0].languages.ja.pages[1]; assert.equal(path.basename(next), `0000.${extension}`);
    assert.deepEqual(await readFile(path.join(f.root, "public", next)), Buffer.from(upload.dataBase64, "base64"));
  });
}

test("colliding names are preserved, including a target owned by another page", async (t) => {
  const f = await fixture(t);
  const occupied = path.join(path.dirname(f.source), "0000.png"); await writeFile(occupied, Buffer.from("do not overwrite"));
  const output = await f.service.replacePage("example", "ja", 1, { file: await image("new.png", "png"), keepName: true });
  assert.equal(path.basename(output.result.languages.ja.pages[1]), "0000-2.png");
  assert.equal(await readFile(occupied, "utf8"), "do not overwrite");
  const output2 = await f.service.replacePage("example", "ja", 1, { file: await image("01.jpg"), keepName: false });
  assert.equal(path.basename(output2.result.languages.ja.pages[1]), "01-2.jpg");
  assert.deepEqual(await readFile(path.join(f.root, "public", f.pages[0])), f.sourceBytes);
});

test("invalid upload, unsupported extension, mismatched content and truncated image change nothing", async (t) => {
  const f = await fixture(t); const png = await image("new.png", "png");
  const invalidUploads = [undefined, {}, { fileName: "bad.jpg", dataBase64: "bm90LWFuLWltYWdl" }, { ...png, fileName: "bad.svg" }, { ...png, fileName: "disguised.jpg" }, { ...png, dataBase64: Buffer.from(png.dataBase64, "base64").subarray(0, 50).toString("base64") }];
  for (const file of invalidUploads) {
    await assert.rejects(f.service.replacePage("example", "ja", 1, { file, keepName: true }), (error) => error.status === 400);
    await assertRestored(f);
  }
  await assert.rejects(f.service.replacePage("example", "ja", 1, null), (error) => error.status === 400);
});

test("invalid index, language, stale source and missing original fail before changing files", async (t) => {
  const f = await fixture(t); const payload = { file: await image(), keepName: true };
  for (const index of [-1, 3, 1.5, "1"]) await assert.rejects(f.service.replacePage("example", "ja", index, payload), (error) => error.status === 404);
  await assert.rejects(f.service.replacePage("example", "missing", 1, payload), (error) => error.status === 404);
  await assert.rejects(f.service.replacePage("example", "ja", 1, { ...payload, source: f.pages[0] }), (error) => error.status === 409);
  await assertRestored(f);
  await rm(f.source);
  await assert.rejects(f.service.replacePage("example", "ja", 1, payload), (error) => error.status === 404);
  assert.deepEqual(await readFile(f.catalogPath), f.original);
  assert.deepEqual((await readdir(path.dirname(f.source))).sort(), ["01.jpg", "03.jpg"]);
});

test("partial image write failure removes the new file and keeps the original functional", async (t) => {
  const f = await fixture(t); const write = FileTransaction.prototype.writeExclusive;
  t.mock.method(FileTransaction.prototype, "writeExclusive", async function (destination, buffer) {
    await write.call(this, destination, buffer.subarray(0, 5)); throw new Error("Image write failed");
  });
  await assert.rejects(f.service.replacePage("example", "ja", 1, { file: await image(), keepName: true }), /Image write failed/);
  await assertRestored(f);
});

for (const failurePoint of ["before-catalog", "invalid-catalog", "after-catalog"]) {
  test(`catalog failure ${failurePoint} restores catalog and removes the prepared image`, async (t) => {
    const f = await fixture(t, { failurePoint });
    await assert.rejects(f.service.replacePage("example", "ja", 1, { file: await image(), keepName: true }));
    await assertRestored(f);
  });
}

test("actual catalog write failure removes a partial temporary catalog and prepared image", async (t) => {
  const f = await fixture(t); const upload = await image(); const originalWrite = fsPromises.writeFile; let failed = false;
  t.mock.method(fsPromises, "writeFile", async (target, content, options) => {
    if (!failed && String(target).startsWith(`${f.catalogPath}.`) && String(target).endsWith(".tmp")) {
      failed = true; await originalWrite(target, "partial", options); throw new Error("Catalog write failed");
    }
    return originalWrite(target, content, options);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(f.service.replacePage("example", "ja", 1, { file: upload, keepName: true }), /Catalog write failed/);
    await assertRestored(f);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

test("old file is moved only after the new file and catalog are valid", async (t) => {
  let f, moved = false;
  f = await fixture(t, { renameImpl: async (source, destination) => {
    assert.equal(source, f.source); assert.deepEqual(await readFile(source), f.sourceBytes);
    const pages = (await f.service.readCatalog())[0].languages.ja.pages;
    assert.notEqual(pages[1], f.pages[1]); assert.ok((await stat(path.join(f.root, "public", pages[1]))).isFile());
    moved = true; return rename(source, destination);
  } });
  await f.service.replacePage("example", "ja", 1, { file: await image(), keepName: true }); assert.equal(moved, true);
});

test("failure while archiving the original rolls back the saved catalog and prepared image", async (t) => {
  const f = await fixture(t, { renameImpl: async () => { throw new Error("Trash move failed"); } });
  await assert.rejects(f.service.replacePage("example", "ja", 1, { file: await image(), keepName: true }), /Trash move failed/);
  await assertRestored(f);
});

test("rollback also restores the original after it has already been moved into trash", async (t) => {
  const f = await fixture(t); const move = FileTransaction.prototype.move;
  t.mock.method(FileTransaction.prototype, "move", async function (source, destination) {
    await move.call(this, source, destination); throw new Error("Failure after archival");
  });
  await assert.rejects(f.service.replacePage("example", "ja", 1, { file: await image(), keepName: true }), /Failure after archival/);
  await assertRestored(f);
});

test("a new collision between name selection and writing cannot overwrite an unrelated file", async (t) => {
  const f = await fixture(t); const write = FileTransaction.prototype.writeExclusive;
  const occupiedBytes = Buffer.from("concurrent unrelated file"); let occupied;
  t.mock.method(FileTransaction.prototype, "writeExclusive", async function (destination, buffer) {
    occupied = destination; await writeFile(destination, occupiedBytes, { flag: "wx" });
    return write.call(this, destination, buffer);
  });
  await assert.rejects(f.service.replacePage("example", "ja", 1, { file: await image(), keepName: true }), (error) => error.code === "EEXIST");
  assert.deepEqual(await readFile(f.catalogPath), f.original);
  assert.deepEqual(await readFile(f.source), f.sourceBytes);
  assert.deepEqual(await readFile(occupied), occupiedBytes);
});

test("original also used as presentation media stays intact, and cross-language duplicate references are rejected", async (t) => {
  const f = await fixture(t); const catalog = await f.service.readCatalog();
  catalog[0].banner = f.pages[1];
  await writeFile(f.catalogPath, serializeMangaCatalog(catalog));
  await f.service.replacePage("example", "ja", 1, { file: await image(), keepName: true });
  const after = await f.service.readCatalog(); assertOnlyTargetChanged(catalog, after);
  assert.deepEqual(await readFile(f.source), f.sourceBytes);
  assert.deepEqual(await readdir(f.service.paths.trashRoot), []);
  after[0].languages.fr.pages.push(after[0].languages.ja.pages[1]);
  await writeFile(f.catalogPath, serializeMangaCatalog(after)); const before = await readFile(f.catalogPath);
  await assert.rejects(f.service.replacePage("example", "ja", 1, { file: await image(), keepName: true }), /dupliqué/);
  assert.deepEqual(await readFile(f.catalogPath), before);
});

test("a duplicated page can be replaced then deleted without breaking the original or other pages", async (t) => {
  const f = await fixture(t);
  const duplicate = (await f.service.duplicatePage("example", "ja", 1)).result.languages.ja.pages[3];
  assert.equal(path.basename(duplicate), "0000-copy.jpg");
  const output = await f.service.replacePage("example", "ja", 3, { file: await image(), keepName: true, source: duplicate });
  const replacement = output.result.languages.ja.pages[3]; assert.equal(path.basename(replacement), "0000-copy-2.jpg");
  assert.deepEqual(output.result.languages.ja.pages.slice(0, 3), f.pages);
  await f.service.deletePage("example", "ja", 3);
  assert.deepEqual((await f.service.readCatalog())[0].languages.ja.pages, f.pages);
  assert.deepEqual(await readFile(f.source), f.sourceBytes);
  await assert.rejects(stat(path.join(f.root, "public", replacement)), (error) => error.code === "ENOENT");
});

test("path traversal and language directory links outside the manga are refused", async (t) => {
  const f = await fixture(t); const payload = { file: await image(), keepName: true };
  const catalog = await f.service.readCatalog();
  catalog[0].languages.ja.pages[1] = "assets/mangaka/completed-manga/example/japanese/../french/01.jpg";
  await writeFile(f.catalogPath, serializeMangaCatalog(catalog));
  await assert.rejects(f.service.replacePage("example", "ja", 1, payload), (error) => error.status === 403);
  const outside = path.join(f.dir, "outside"); await mkdir(outside); await writeFile(path.join(outside, "01.jpg"), f.sourceBytes);
  const link = path.join(path.dirname(path.dirname(f.source)), "linked"); await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  catalog[0].languages.ja.pages[1] = "assets/mangaka/completed-manga/example/linked/01.jpg";
  await writeFile(f.catalogPath, serializeMangaCatalog(catalog)); const before = await readFile(f.catalogPath);
  await assert.rejects(f.service.replacePage("example", "ja", 1, payload), (error) => error.status === 403);
  assert.deepEqual(await readFile(f.catalogPath), before); assert.deepEqual(await readdir(outside), ["01.jpg"]);
  assert.deepEqual(await readFile(f.source), f.sourceBytes);
});

test("upload filenames are normalized and never allow traversal", async (t) => {
  const f = await fixture(t);
  const output = await f.service.replacePage("example", "ja", 1, { file: await image("../../escaped.jpg"), keepName: false });
  const relative = output.result.languages.ja.pages[1];
  assert.equal(path.dirname(relative), path.dirname(f.pages[1])); assert.equal(path.basename(relative), "escaped.jpg");
  assertOnlyTargetChanged(f.before, await f.service.readCatalog());
});

test("existing replacement API route returns the unchanged count and updated physical path", async (t) => {
  const f = await fixture(t); let response;
  const matched = await handleMangaRoute({ method: "PUT" }, {}, new URL("http://localhost/api/mangas/example/languages/ja/pages/1"), {
    service: f.service, readJson: async () => ({ file: await image(), source: f.pages[1], keepName: true }), sendJson: (_, status, body) => { response = { status, body }; },
  });
  assert.equal(matched, true); assert.equal(response.status, 200);
  assert.equal(response.body.result.languages.ja.pages.length, 3); assert.notEqual(response.body.result.languages.ja.pages[1], f.pages[1]);
});

async function uiFixture() {
  const source = await readFile(new URL("../public/modules/mangas/manga-admin.js", import.meta.url), "utf8");
  const state = { dirty: false, currentId: "example", language: "ja", workingPages: ["pages/01.jpg", "pages/0000.jpg", "pages/03.jpg"] };
  const dialog = { inert: false }, requests = [], notices = [], confirmations = [], callbacks = [];
  const context = vm.createContext({
    state, dialog, message: (text) => notices.push(text), chooseFile: (callback) => callbacks.push(callback), confirm: (text) => { confirmations.push(text); return true; },
    filePayload: async (file) => ({ fileName: file.name, dataBase64: "image" }),
    api: async (url, options) => { assert.equal(dialog.inert, true); requests.push({ url, body: JSON.parse(options.body) }); },
    reloadEditor: async () => { state.language = "en"; }, renderLanguages: () => {},
  });
  vm.runInContext(`let pageReplacementPending = false;\n${source.slice(source.indexOf("function replacePageImage("), source.indexOf("function chooseFile("))}`, context);
  return { context, state, dialog, requests, notices, confirmations, callbacks, source };
}

test("replacement UI identifies the source and keeps Japanese selection after a successful refresh", async () => {
  const f = await uiFixture(); f.context.replacePageImage(1); await f.callbacks[0]({ name: "corrected.jpg" });
  assert.match(f.confirmations[0], /Position 02 — 0000\.jpg.*corrected\.jpg/);
  assert.equal(f.requests[0].url, "/api/mangas/example/languages/ja/pages/1"); assert.equal(f.requests[0].body.source, "pages/0000.jpg");
  assert.equal(f.state.language, "ja"); assert.equal(f.dialog.inert, false);
  assert.ok(f.source.includes('data-action="replace" title="Remplacer cette page" aria-label="Remplacer cette page"'));
});

test("unsaved changes, changed context, cancellation and unsupported files trigger no replacement requests", async () => {
  const f = await uiFixture(); f.state.dirty = true; f.context.replacePageImage(1);
  assert.equal(f.callbacks.length, 0); assert.match(f.notices[0], /Enregistrez/);
  f.state.dirty = false; f.context.replacePageImage(1); f.state.language = "en"; await f.callbacks[0]({ name: "new.jpg" }); assert.equal(f.requests.length, 0);
  f.state.language = "ja"; f.context.replacePageImage(1); await f.callbacks[1]({ name: "bad.svg" }); assert.equal(f.requests.length, 0);
  f.context.confirm = () => false; f.context.replacePageImage(1); await f.callbacks[2]({ name: "new.jpg" }); assert.equal(f.requests.length, 0);
  f.context.confirm = () => true; f.context.filePayload = async () => { f.state.dirty = true; return {}; };
  f.context.replacePageImage(1); await f.callbacks[3]({ name: "new.jpg" }); assert.equal(f.requests.length, 0); assert.equal(f.dialog.inert, false);
});

test("pending replacement suppresses double submission and releases the editor after a network error", async () => {
  const f = await uiFixture(); let reject;
  f.context.api = () => new Promise((_, fail) => { reject = fail; });
  f.context.replacePageImage(1); const pending = f.callbacks[0]({ name: "new.jpg" });
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(f.dialog.inert, true);
  f.context.replacePageImage(1); assert.equal(f.callbacks.length, 1);
  await f.callbacks[0]({ name: "new.jpg" }); assert.equal(f.confirmations.length, 1);
  reject(new Error("Network error")); await assert.rejects(pending, /Network error/);
  assert.equal(f.dialog.inert, false); f.context.replacePageImage(1); assert.equal(f.callbacks.length, 2);
});
