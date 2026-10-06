import assert from "node:assert/strict";
import fsPromises, { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import sharp from "sharp";
import { serializeMangaCatalog } from "../manga/catalog.mjs";
import { createMangaService } from "../manga/service.mjs";

async function image(fileName = "new.jpg") {
  const buffer = await sharp({ create: { width: 12, height: 18, channels: 3, background: "#908070" } }).jpeg().toBuffer();
  return { fileName, dataBase64: buffer.toString("base64") };
}
async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "manga-audit-"));
  assert.ok(path.resolve(dir).startsWith(path.join(tmpdir(), "manga-audit-")));
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const root = path.join(dir, "portfolio"), runtime = path.join(dir, "runtime");
  const prefix = "assets/mangaka/completed-manga/example";
  const pages = ["01.jpg", "02.jpg", "03.jpg"].map((name) => `${prefix}/english/${name}`);
  const japanese = [`${prefix}/ja/01.jpg`, `${prefix}/ja/02.jpg`];
  const other = "assets/mangaka/completed-manga/other/fr/01.jpg";
  for (const relative of [...pages, ...japanese, other]) {
    const file = path.join(root, "public", relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, Buffer.from((await image()).dataBase64, "base64"));
  }
  const catalog = [
    { id: "example", slug: "example", route: "/mangas/example", title: "Example", presentationSection: "completed", cover: pages[0], defaultLanguage: "en", readingDirection: "rtl", languages: {
      en: { label: "English", pages }, ja: { label: "日本語", storageFolder: "ja", pages: japanese },
    } },
    { id: "other", slug: "other", route: "/mangas/other", title: "Other", presentationSection: "completed", cover: other, defaultLanguage: "fr", languages: { fr: { label: "Français", pages: [other] } } },
  ];
  const catalogPath = path.join(root, "src/content/mangas.js"); await mkdir(path.dirname(catalogPath), { recursive: true }); await writeFile(catalogPath, serializeMangaCatalog(catalog));
  const service = createMangaService({ projectRoot: root, runtimeRoot: runtime, disableReveal: true, ...options }); await service.initialize();
  return { root, runtime, dir, service, pages, japanese, catalogPath, original: await readFile(catalogPath), before: await service.readCatalog() };
}
const fileAt = (f, relative) => path.join(f.root, "public", relative);
async function files(root) {
  const result = new Map();
  async function scan(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) await scan(file); else result.set(path.relative(root, file), await readFile(file)); } }
  await scan(root); return result;
}

test("audit: removing a page also used as cover preserves the cover file", async (t) => {
  const f = await fixture(t); const originalBytes = await readFile(fileAt(f, f.pages[0]));
  await f.service.deletePage("example", "en", 0, { source: f.pages[0] });
  const after = await f.service.readCatalog(); assert.deepEqual(after[0].languages.en.pages, f.pages.slice(1));
  assert.equal(after[0].cover, f.pages[0]); assert.deepEqual(await readFile(fileAt(f, f.pages[0])), originalBytes); assert.deepEqual(after[1], f.before[1]);
});

test("audit: a throwing cache invalidator cannot undo catalog after file rollback was discarded", async (t) => {
  const f = await fixture(t, { onMutation: () => { throw new Error("Cache failure"); } });
  const bytes = await readFile(fileAt(f, f.pages[1]));
  await assert.rejects(f.service.replacePage("example", "en", 1, { file: await image(), keepName: true }), /Cache failure/);
  assert.deepEqual(await readFile(f.catalogPath), f.original); assert.deepEqual(await readFile(fileAt(f, f.pages[1])), bytes);
});

test("audit: create avoids an occupied physical manga folder and preserves unreferenced files", async (t) => {
  const f = await fixture(t); const occupied = path.join(f.root, "public/assets/mangaka/completed-manga/new-story");
  await mkdir(occupied); await writeFile(path.join(occupied, "notes.txt"), "keep this file");
  const output = await f.service.create({ title: "New Story", pages: [await image("01.jpg")], primaryImage: await image("banner.jpg") });
  assert.equal(output.result.slug, "new-story-2"); assert.deepEqual(await readdir(occupied), ["notes.txt"]);
});

test("audit: information and page order are saved together, including a section move", async (t) => {
  const f = await fixture(t);
  const desired = [f.pages[2], f.pages[0], f.pages[1]];
  await f.service.update("example", { title: "Updated", presentationSection: "storyboard", pageOrder: { language: "en", pages: desired } });
  const after = await f.service.readCatalog(); assert.equal(after[0].title, "Updated");
  assert.deepEqual(after[0].languages.en.pages, desired.map((relative) => relative.replace("/completed-manga/", "/complete-storyboards/")));
  assert.deepEqual(after[1], f.before[1]);
});

test("audit: invalid order prevents a partial information save", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.update("example", { title: "Must not persist", pageOrder: { language: "en", pages: [f.pages[0]] } }));
  assert.deepEqual(await readFile(f.catalogPath), f.original);
});

test("audit: language deletion preserves a shared cover and archives only its own pages", async (t) => {
  const f = await fixture(t); await f.service.update("example", { defaultLanguage: "ja" });
  const before = await f.service.readCatalog(); await f.service.deleteLanguage("example", "en");
  const after = await f.service.readCatalog(); assert.equal(after[0].languages.en, undefined);
  assert.deepEqual(after[0].languages.ja, before[0].languages.ja); assert.deepEqual(after[1], before[1]);
  assert.ok(await stat(fileAt(f, f.pages[0]))); await assert.rejects(stat(fileAt(f, f.pages[1])), { code: "ENOENT" });
  const archived = await files(f.service.paths.trashRoot); assert.equal(archived.size, 2);
});

test("audit: language deletion archives colliding legacy basenames without overwriting", async (t) => {
  const f = await fixture(t); const catalog = await f.service.readCatalog();
  const second = f.japanese[1].replace("/ja/", "/legacy/").replace("02.jpg", "01.jpg");
  await mkdir(path.dirname(fileAt(f, second)), { recursive: true }); await writeFile(fileAt(f, second), await readFile(fileAt(f, f.japanese[1])));
  catalog[0].languages.ja.pages[1] = second; await writeFile(f.catalogPath, serializeMangaCatalog(catalog));
  await f.service.deleteLanguage("example", "ja"); const archived = await files(f.service.paths.trashRoot);
  assert.equal(archived.size, 2); assert.equal(new Set([...archived.keys()].map((name) => path.basename(name))).size, 2);
});

test("audit: default and sole languages cannot be removed; added languages persist natively", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.deleteLanguage("example", "en"), /autre langue/);
  await assert.rejects(f.service.deleteLanguage("other", "fr"), /seule langue/);
  await f.service.addLanguage("example", { code: "ar" }); await f.service.update("example", { defaultLanguage: "ar" });
  const after = await f.service.readCatalog(); assert.equal(after[0].defaultLanguage, "ar"); assert.equal(after[0].readingDirection, "rtl");
  assert.equal(after[0].languages.ar.label, "العربية"); assert.deepEqual(after[0].languages.ar.pages, []);
  assert.deepEqual(after[0].languages.en, f.before[0].languages.en); assert.deepEqual(after[1], f.before[1]);
});

test("audit: concurrent creations reserve distinct slugs inside the transaction queue", async (t) => {
  const f = await fixture(t); const payload = { title: "New Story", pages: [await image("01.jpg")], primaryImage: await image("cover.jpg") };
  const results = await Promise.all([f.service.create(payload), f.service.create(payload)]);
  assert.deepEqual(results.map((result) => result.result.slug), ["new-story", "new-story-2"]);
  await f.service.validateFiles(await f.service.readCatalog());
});

test("audit: multiple backups at the same timestamp cannot overwrite each other", async (t) => {
  const f = await fixture(t, { now: () => new Date("2026-10-07T12:00:00Z") });
  await f.service.update("example", { title: "One" }); await f.service.update("example", { title: "Two" });
  const backups = await files(f.service.paths.backupRoot); assert.equal(backups.size, 2);
  assert.equal([...backups.values()].some((bytes) => bytes.equals(f.original)), true);
  assert.equal([...backups.values()].some((bytes) => bytes.toString().includes('"title": "One"')), true);
});

test("audit: restoring the catalog can fail without deleting assets still referenced by the saved catalog", async (t) => {
  const f = await fixture(t, { failurePoint: "after-catalog" }); const realRename = fsPromises.rename; let writes = 0;
  fsPromises.rename = async (...args) => { if (args[1] === f.catalogPath && ++writes === 2) throw new Error("Restore denied"); return realRename(...args); };
  syncBuiltinESMExports();
  try {
    await assert.rejects(f.service.duplicatePage("example", "en", 1), /rollback est incomplet/);
    const saved = await f.service.readCatalog(); assert.equal(saved[0].languages.en.pages.length, 4);
    await f.service.validateFiles(saved); assert.deepEqual(await readFile(fileAt(f, f.pages[1])), await readFile(fileAt(f, saved[0].languages.en.pages[3])));
    assert.equal((await files(f.service.paths.backupRoot)).size, 1);
  } finally { fsPromises.rename = realRename; syncBuiltinESMExports(); }
});

for (const failurePoint of ["before-catalog", "invalid-catalog", "after-catalog"]) {
  test(`audit: page addition, card replacement and language deletion rollback at ${failurePoint}`, async (t) => {
    const f = await fixture(t, { failurePoint }); const originalFiles = await files(path.join(f.root, "public"));
    for (const operation of [
      () => f.service.addPages("example", "ja", { files: [{ ...upload }], position: 2 }),
      () => f.service.replacePrimaryMedia("example", { file: upload }),
      () => f.service.deleteLanguage("example", "ja"),
    ]) {
      await assert.rejects(operation()); assert.deepEqual(await readFile(f.catalogPath), f.original);
      assert.deepEqual(await files(path.join(f.root, "public")), originalFiles);
    }
  });
}
const upload = await image("added.jpg");

test("audit: multi-page add rolls back earlier files when a later upload is invalid", async (t) => {
  const f = await fixture(t); const originalFiles = await files(path.join(f.root, "public"));
  await assert.rejects(f.service.addPages("example", "ja", { files: [upload, { fileName: "z.jpg", dataBase64: "YWJj" }] }));
  assert.deepEqual(await readFile(f.catalogPath), f.original); assert.deepEqual(await files(path.join(f.root, "public")), originalFiles);
});

test("audit: add checks positions and true image formats; names cannot escape the project", async (t) => {
  const f = await fixture(t);
  for (const position of [0, -1, 1.5, "invalid"]) await assert.rejects(f.service.addPages("example", "ja", { files: [upload], position }));
  for (const file of [{ ...upload, fileName: "fake.png" }, { ...upload, fileName: "fake.svg" }, { ...upload, fileName: "bad\0.jpg" }]) await assert.rejects(f.service.addPages("example", "ja", { files: [file] }));
  await f.service.addPages("example", "ja", { files: [{ ...upload, fileName: "../../outside.jpg" }], position: 1 });
  const saved = await f.service.readCatalog(); assert.match(saved[0].languages.ja.pages[0], /\/ja\/outside\.jpg$/);
  assert.deepEqual(saved[0].languages.en, f.before[0].languages.en);
});

test("audit: stale delete and stale combined save are rejected without a partial write", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.deletePage("example", "en", 1, { source: f.pages[2] }), /changé/);
  await assert.rejects(f.service.update("example", { title: "Wrong", pageOrder: { language: "en", pages: [...f.pages].reverse(), expectedPages: [...f.pages].reverse() } }), /changé/);
  assert.deepEqual(await readFile(f.catalogPath), f.original);
});

test("audit: unsafe field values cannot persist and a missing reference blocks unrelated writes", async (t) => {
  const f = await fixture(t);
  for (const payload of [{ title: " " }, { title: {} }, { status: "nonsense" }, { readingDirection: "ar" }, { order: "NaN" }, { tags: [12] }, { featured: "false" }]) await assert.rejects(f.service.update("example", payload));
  await rm(fileAt(f, f.japanese[1])); await assert.rejects(f.service.update("example", { title: "No" }), /manquant/);
  assert.deepEqual(await readFile(f.catalogPath), f.original);
});

test("audit: unsafe ancestor links are rejected for uploads, deletion, read and Explorer", async (t) => {
  const f = await fixture(t); const directory = path.dirname(fileAt(f, f.japanese[0])), outside = path.join(f.dir, "outside");
  await mkdir(outside); for (const page of f.japanese) await writeFile(path.join(outside, path.basename(page)), await readFile(fileAt(f, page)));
  await rm(directory, { recursive: true }); await symlink(outside, directory, process.platform === "win32" ? "junction" : "dir");
  const before = await files(outside);
  for (const operation of [
    () => f.service.addPages("example", "ja", { files: [upload] }),
    () => f.service.deleteLanguage("example", "ja"),
    () => f.service.readAsset(f.japanese[0]),
    () => f.service.reveal("example", { type: "page", language: "ja", index: 0 }),
  ]) await assert.rejects(operation(), /lié|invalide/);
  assert.deepEqual(await files(outside), before); assert.deepEqual(await readFile(f.catalogPath), f.original);
});

test("audit: deletion validates the entire catalog before moving any physical directory", async (t) => {
  const f = await fixture(t); const catalog = await f.service.readCatalog(); catalog[1].languages.fr.pages.push(f.pages[1]);
  await writeFile(f.catalogPath, serializeMangaCatalog(catalog)); const originalFiles = await files(path.join(f.root, "public"));
  await assert.rejects(f.service.removeManga("example", "example"), /hors|dupliqué/);
  assert.deepEqual(await files(path.join(f.root, "public")), originalFiles); assert.equal((await files(f.service.paths.trashRoot)).size, 0);
});

test("audit: storage repair copies a shared cover instead of moving it away", async (t) => {
  const f = await fixture(t); const catalog = await f.service.readCatalog();
  const rootPage = f.pages[0].replace("/english/", "/"); await fsPromises.rename(fileAt(f, f.pages[0]), fileAt(f, rootPage));
  catalog[0].cover = rootPage; catalog[0].languages.en.pages[0] = rootPage; await writeFile(f.catalogPath, serializeMangaCatalog(catalog));
  const originalBytes = await readFile(fileAt(f, rootPage)); await f.service.repairLanguageStorage("example", "en");
  const after = await f.service.readCatalog(); assert.equal(after[0].cover, rootPage); assert.equal(after[0].languages.en.pages[0], f.pages[0]);
  assert.deepEqual(await readFile(fileAt(f, rootPage)), originalBytes); assert.deepEqual(await readFile(fileAt(f, f.pages[0])), originalBytes);
});

test("audit: legacy manga deletion archives its whole exact folder, including unreferenced files", async (t) => {
  const f = await fixture(t); const catalog = await f.service.readCatalog(); const manga = catalog[0];
  const prefix = "assets/mangaka/example";
  const originalDirectory = path.join(f.root, "public/assets/mangaka/completed-manga/example"), legacyDirectory = path.join(f.root, "public", prefix);
  await fsPromises.rename(originalDirectory, legacyDirectory); delete manga.presentationSection;
  manga.cover = manga.cover.replace("/completed-manga/", "/");
  for (const language of Object.values(manga.languages)) language.pages = language.pages.map((page) => page.replace("/completed-manga/", "/"));
  await writeFile(path.join(legacyDirectory, "unreferenced.txt"), "keep me in trash"); await writeFile(f.catalogPath, serializeMangaCatalog(catalog));
  const before = await files(legacyDirectory); await f.service.removeManga("example", "example");
  const after = await f.service.readCatalog(); assert.deepEqual(after, [f.before[1]]);
  const trash = await readdir(f.service.paths.trashRoot); assert.equal(trash.length, 1);
  assert.deepEqual(await files(path.join(f.service.paths.trashRoot, trash[0])), before);
});

const adminSource = await readFile(new URL("../public/modules/mangas/manga-admin.js", import.meta.url), "utf8");
function uiContext() {
  const state = { dirty: false, language: "ja", currentId: "example", workingPages: ["a", "b"], savedPages: ["a", "b"] }, notices = [], requests = [], refreshes = [];
  const dialog = { inert: false };
  const context = vm.createContext({ state, dialog, message: (...args) => notices.push(args), reloadEditor: async (...args) => refreshes.push(args), api: async (...args) => requests.push(args), confirm: () => true, reveal: (value) => requests.push(value), renderPages() {}, setDirty() {} });
  const helpers = adminSource.slice(adminSource.indexOf("function requireSavedEditor("), adminSource.indexOf("function switchEditorTab("));
  const actions = adminSource.slice(adminSource.indexOf("function movePage("), adminSource.indexOf("function replacePageImage("));
  vm.runInContext(`let editorMutationPending = false, pageReplacementPending = false, duplicateSubmitting = false;\n${helpers}\n${actions}`, context);
  return { state, context, requests, notices, refreshes, dialog };
}
test("audit UI: immediate operations refuse dirty edits, preserve selected language and expose errors", async () => {
  const f = uiContext(); f.state.dirty = true;
  await f.context.immediateMutation(() => { throw new Error("Must not run"); }); assert.equal(f.notices[0][1], "warning"); assert.equal(f.refreshes.length, 0);
  f.state.dirty = false; await f.context.immediateMutation(async () => {}, "Saved"); assert.deepEqual(f.refreshes, [["Saved", "ja"]]);
  await f.context.immediateMutation(async () => { throw new Error("HTTP 500"); }); assert.deepEqual(f.notices.at(-1), ["HTTP 500", "error"]); assert.equal(f.dialog.inert, false);
});
test("audit UI: pending actions block double execution and Explorer uses the saved file identity", async () => {
  const f = uiContext(); let release; const pending = f.context.immediateMutation(() => new Promise((resolve) => { release = resolve; }));
  await f.context.immediateMutation(() => { throw new Error("Double request"); }); release(); await pending; assert.equal(f.notices.length, 0);
  f.state.workingPages.reverse(); await f.context.pageAction("reveal", 0); assert.equal(f.requests[0].index, 1);
  f.state.dirty = true; await f.context.pageAction("delete", 0); assert.equal(f.requests.length, 1);
});

test("audit UI: language switching and default/delete actions never discard dirty metadata or page order", async () => {
  const nodes = new Map(), buttons = [];
  const element = () => ({ disabled: false, children: [], value: "", append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; }, setAttribute() {} });
  const $ = (selector) => { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); };
  const f = uiContext(); const languages = { en: { label: "English", pages: ["a"], pageCount: 1, missing: [] }, ja: { label: "Japanese", pages: ["b"], pageCount: 1, missing: [] } };
  Object.assign(f.context, { $, closeLanguagePicker() {}, currentManga: () => ({ id: "example", defaultLanguage: "en", languages }), renderPages() {}, escapeHtml: (value) => value,
    getLanguageDirection: () => "ltr", getLanguageLabel: (code) => code,
    document: { createTextNode: (value) => value, createElement: (name) => { const node = element(); if (name === "button") buttons.push(node); return node; } },
  });
  vm.runInContext(adminSource.slice(adminSource.indexOf("function renderLanguages("), adminSource.indexOf("function renderPages(")), f.context);
  f.context.renderLanguages(); f.state.dirty = true; f.state.workingPages = ["unsaved"];
  buttons[0].onclick(); await $("#default-language").onclick(); await $("#delete-language").onclick();
  assert.equal(f.state.language, "ja"); assert.deepEqual(f.state.workingPages, ["unsaved"]); assert.equal(f.requests.length, 0);
  f.state.dirty = false; buttons[0].onclick(); assert.equal(f.state.language, "en"); assert.deepEqual([...f.state.workingPages], ["a"]);
  assert.equal($("#delete-language").disabled, true);
});

test("audit UI: import controls do not mark metadata dirty; initial language is disabled when hidden", () => {
  const createForm = { elements: { languageType: {}, languageCode: { disabled: false } } }, nodes = new Map([["#create-form", createForm], ["#initial-language-field", {}]]);
  const context = vm.createContext({ $: (selector) => nodes.get(selector) });
  const line = adminSource.split("\n").find((value) => value.startsWith('$("#create-form").elements.languageType.onchange'));
  vm.runInContext(line, context);
  for (const type of ["original", "silent", "multilingual"]) {
    createForm.elements.languageType.onchange({ target: { value: type } });
    assert.equal(createForm.elements.languageCode.disabled, type !== "multilingual");
    assert.equal(nodes.get("#initial-language-field").hidden, type !== "multilingual");
  }
  let handler, dirtied = 0;
  const inputContext = vm.createContext({ form: { addEventListener: (_, callback) => { handler = callback; } }, setDirty: () => dirtied++ });
  vm.runInContext(adminSource.split("\n").find((value) => value.startsWith('form.addEventListener("input"')), inputContext);
  handler({ target: { id: "page-files", name: "" } }); handler({ target: { id: "page-position", name: "" } }); assert.equal(dirtied, 0);
  handler({ target: { name: "title" } }); assert.equal(dirtied, 1);
});
