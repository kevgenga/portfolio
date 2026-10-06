import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";
import sharp from "sharp";
import * as languageRegistry from "../../../src/utils/languageLabels.js";
import { serializeMangaCatalog } from "../manga/catalog.mjs";
import { handleMangaRoute } from "../manga/routes.mjs";
import { createMangaService } from "../manga/service.mjs";

const adminSource = await readFile(new URL("../public/modules/mangas/manga-admin.js", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../public/mangas.html", import.meta.url), "utf8");
async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "manga-reorder-"));
  assert.ok(path.resolve(directory).startsWith(path.join(tmpdir(), "manga-reorder-")));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return directory;
}

test("native HTML validation allows global Save while the add-language selector is closed", async (t) => {
  const candidates = [process.env.MANGA_ADMIN_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
  let executable;
  for (const candidate of candidates) { try { await access(candidate); executable = candidate; break; } catch { /* Optional native-browser test on machines without Chromium. */ } }
  if (!executable) return t.skip("Chrome/Edge unavailable; set MANGA_ADMIN_TEST_BROWSER to a Chromium executable.");
  const directory = await temporaryDirectory(t);
  const htmlPath = path.join(directory, "validation.html");
  // Load the real form markup, without portfolio scripts, APIs or real data.
  const script = `<script>
    const form = document.getElementById("manga-form");
    form.elements.title.value = "Temporary Manga";
    document.getElementById("page-position").value = "-5";
    const result = { submitted: 0, invalid: [], valid: form.checkValidity() };
    form.addEventListener("submit", (event) => { event.preventDefault(); result.submitted++; });
    form.addEventListener("invalid", (event) => result.invalid.push(event.target.id || event.target.name), true);
    document.getElementById("manga-dialog").showModal();
    form.requestSubmit(form.querySelector('button[type="submit"]'));
    const output = document.createElement("pre"); output.id = "validation-result"; output.textContent = JSON.stringify(result); document.body.append(output);
  </script>`;
  await writeFile(htmlPath, adminHtml.replace(/<script\b[^>]*src=[^>]*><\/script>/g, "").replace(/<link\b[^>]*>/g, "").replace("</body>", `${script}</body>`));
  const child = spawn(executable, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${path.join(directory, "browser-profile")}`, "--dump-dom", "--virtual-time-budget=1000", pathToFileURL(htmlPath).href], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => stdout += chunk.toString()); child.stderr.on("data", (chunk) => stderr += chunk.toString());
  const timeout = setTimeout(() => child.kill(), 20000);
  try {
    const exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    assert.equal(exitCode, 0, stderr);
    const match = stdout.match(/<pre id="validation-result">([^<]+)<\/pre>/); assert.ok(match, stdout + stderr);
    const result = JSON.parse(match[1]);
    assert.deepEqual(result, { submitted: 1, invalid: [], valid: true });
  } finally { clearTimeout(timeout); }
});

test("the language picker enables its required selector only while it is open", () => {
  const nodes = new Map();
  const element = () => ({ hidden: true, disabled: false, attributes: {}, value: "", children: [], replaceChildren(...children) { this.children = children; this.value = children[0]?.value || ""; }, setAttribute(name, value) { this.attributes[name] = value; }, focus() {} });
  const $ = (id) => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const manga = { languages: { en: { pages: [] }, fr: { pages: [] }, ja: { pages: [] } } };
  const notices = [];
  const context = vm.createContext({ ...languageRegistry, $, currentManga: () => manga, document: { createElement: element }, message: (text) => notices.push(text) });
  vm.runInContext(adminSource.slice(adminSource.indexOf("function languageOption("), adminSource.indexOf("function setDirty(")), context);
  context.closeLanguagePicker(); assert.equal($("#new-language-code").disabled, true);
  context.openLanguagePicker(); assert.equal($("#new-language-code").disabled, false); assert.equal($("#language-picker").hidden, false);
  assert.ok($("#new-language-code").children.every((option) => !["en", "fr", "ja"].includes(option.value)));
  context.closeLanguagePicker(); assert.equal($("#new-language-code").disabled, true);
  context.openLanguagePicker(); assert.equal($("#new-language-code").disabled, false);
  context.openLanguagePicker(); assert.equal($("#new-language-code").disabled, true);
  manga.languages = Object.fromEntries(languageRegistry.supportedMangaLanguages.map((language) => [language.code, { pages: [] }]));
  context.openLanguagePicker(); assert.equal($("#new-language-code").disabled, true); assert.equal($("#language-picker").hidden, true); assert.equal(notices.length, 1);
});

async function fixture(t) {
  const directory = await temporaryDirectory(t); const root = path.join(directory, "portfolio");
  const prefix = "assets/mangaka/completed-manga/example";
  const pages = Array.from({ length: 24 }, (_, index) => `${prefix}/ja/${index === 23 ? "0000-copy.jpg" : `bd2-${String(index).padStart(3, "0")}.jpg`}`);
  const otherPages = [`${prefix}/english/01.jpg`, `${prefix}/french/01.jpg`, "assets/mangaka/completed-manga/other/en/01.jpg"];
  const bytes = await sharp({ create: { width: 8, height: 12, channels: 3, background: "#123456" } }).jpeg().toBuffer();
  const files = new Map();
  for (const relative of [...pages, ...otherPages]) {
    const file = path.join(root, "public", relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); files.set(relative, bytes);
  }
  const catalog = [
    { id: "example", slug: "example", route: "/mangas/example", title: "Example", presentationSection: "completed", featured: false, tags: [], cover: pages[0], defaultLanguage: "en", readingDirection: "rtl", languages: {
      en: { label: "English", shortLabel: "ENG", pages: [otherPages[0]] },
      ja: { label: "日本語", shortLabel: "JA", pages }, fr: { label: "Français", shortLabel: "FR", pages: [otherPages[1]] },
    } },
    { id: "other", slug: "other", route: "/mangas/other", title: "Other", presentationSection: "completed", cover: otherPages[2], defaultLanguage: "en", languages: { en: { label: "English", pages: [otherPages[2]] } } },
  ];
  const catalogPath = path.join(root, "src/content/mangas.js"); await mkdir(path.dirname(catalogPath), { recursive: true }); await writeFile(catalogPath, serializeMangaCatalog(catalog));
  const service = createMangaService({ projectRoot: root, runtimeRoot: path.join(directory, "runtime") }); await service.initialize();
  return { root, service, pages, catalogPath, files, original: await readFile(catalogPath), before: await service.readCatalog() };
}
async function uiFixture(t) {
  const f = await fixture(t);
  const state = { currentId: "example", language: "ja", workingPages: [...f.pages], savedPages: [...f.pages], dirty: false };
  const requests = [], notices = []; let renders = 0;
  const form = { elements: { featured: { checked: false } }, addEventListener() {} };
  const dialog = { open: true, inert: false, close() { this.open = false; }, addEventListener() {} };
  const context = vm.createContext({
    state, form, dialog, JSON, encodeURIComponent, prompt: () => "", confirm: () => true,
    document: { querySelectorAll: () => [] }, setDirty: (value = true) => { state.dirty = value; }, renderPages: () => { renders++; },
    FormData: class { *[Symbol.iterator]() { yield ["title", "Example"]; yield ["tags", ""]; } },
    message: (text, type) => notices.push({ text, type }),
    api: async (url, options) => {
      requests.push({ url, payload: JSON.parse(options.body) });
      if (context.failRequest) throw new Error("Erreur HTTP 500 : ordre non enregistré.");
      let output;
      const handled = await handleMangaRoute({ method: options.method }, {}, new URL(url, "http://localhost"), {
        service: f.service, readJson: async () => JSON.parse(options.body), sendJson: (_, status, body) => { assert.equal(status, 200); output = body; },
      }); assert.equal(handled, true); return output;
    },
    load: async () => { state.catalog = await f.service.readCatalog(); },
  });
  const moves = adminSource.slice(adminSource.indexOf("function movePage("), adminSource.indexOf("function replacePageImage("));
  const submit = adminSource.slice(adminSource.indexOf('form.addEventListener("input"'), adminSource.indexOf('$("#add-pages").onclick'));
  const cancel = adminSource.slice(adminSource.indexOf("function requestClose("), adminSource.indexOf('window.addEventListener("beforeunload"'));
  vm.runInContext(`let pageReplacementPending = false, editorMutationPending = false, duplicateSubmitting = false;\n${moves}\n${submit}\n${cancel}`, context);
  return { ...f, state, context, requests, notices, form, dialog, renders: () => renders };
}
async function assertPhysicalFilesUnchanged(f) {
  const actual = [];
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(file); else actual.push(path.relative(path.join(f.root, "public"), file).replaceAll("\\", "/"));
    }
  }
  await scan(path.join(f.root, "public")); assert.deepEqual(actual.sort(), [...f.files.keys()].sort());
  for (const [relative, bytes] of f.files) assert.deepEqual(await readFile(path.join(f.root, "public", relative)), bytes);
}
function expectedMove(pages, from, to) { const result = [...pages]; const [page] = result.splice(from - 1, 1); result.splice(to - 1, 0, page); return result; }

for (const [from, to] of [[24, 23], [23, 24], [1, 24], [24, 1], [3, 8], [8, 3]]) {
  test(`position ${from} → ${to} saves via the global handler and persists without touching files or other languages/mangas`, async (t) => {
    const f = await uiFixture(t); f.context.prompt = () => String(to);
    await f.context.pageAction("position", from - 1);
    const expected = expectedMove(f.pages, from, to);
    assert.deepEqual([...f.state.workingPages], expected); assert.equal(f.state.dirty, true);
    assert.equal(f.state.workingPages.length, 24); assert.equal(new Set(f.state.workingPages).size, 24);
    await f.form.onsubmit({ preventDefault() {} });
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, "/api/mangas/example");
    assert.deepEqual(f.requests[0].payload.pageOrder.pages, expected);
    const persisted = await f.service.readCatalog(); assert.deepEqual(persisted[0].languages.ja.pages, expected);
    const restored = structuredClone(persisted); restored[0].languages.ja.pages = f.before[0].languages.ja.pages; assert.deepEqual(restored, f.before);
    assert.equal(f.state.dirty, false); assert.equal(f.dialog.open, false);
    assert.deepEqual(f.state.catalog[0].languages.ja.pages, expected);
    const serialized = await readFile(f.catalogPath, "utf8");
    // Verify the emitted public reader data, not alphabetic filename order.
    const readerPages = vm.runInNewContext(`${serialized.replace(/^import[^\n]+\n/m, "").replaceAll("export const", "const")}\n;mangas[0].languages.ja.pages`, { assetPath: (value) => value });
    assert.deepEqual([...readerPages], expected);
    await assertPhysicalFilesUnchanged(f);
  });
}

for (const position of [24, 0, 25, 1.5, "bad", null]) {
  test(`same or invalid position ${position} leaves the list and dirty state unchanged`, async (t) => {
    const f = await uiFixture(t); f.context.prompt = () => position === null ? null : String(position);
    await f.context.pageAction("position", 23);
    assert.deepEqual([...f.state.workingPages], f.pages); assert.equal(f.state.dirty, false); assert.equal(f.renders(), 0); assert.equal(f.requests.length, 0);
    assert.deepEqual(await readFile(f.catalogPath), f.original); await assertPhysicalFilesUnchanged(f);
  });
}

for (const [action, index, from, to] of [["up", 23, 24, 23], ["down", 22, 23, 24], ["first", 23, 24, 1], ["last", 0, 1, 24]]) {
  test(`${action} keeps using the existing move logic and saves the expected order`, async (t) => {
    const f = await uiFixture(t); await f.context.pageAction(action, index);
    assert.deepEqual([...f.state.workingPages], expectedMove(f.pages, from, to));
    await f.form.onsubmit({ preventDefault() {} });
    assert.deepEqual((await f.service.readCatalog())[0].languages.ja.pages, expectedMove(f.pages, from, to)); await assertPhysicalFilesUnchanged(f);
  });
}

test("a server failure keeps the editor open, preserves local edits and allows retry", async (t) => {
  const f = await uiFixture(t); f.context.movePage(23, 22); const desired = [...f.state.workingPages]; f.context.failRequest = true;
  await f.form.onsubmit({ preventDefault() {} });
  assert.equal(f.dialog.open, true); assert.equal(f.state.dirty, true); assert.deepEqual([...f.state.workingPages], desired);
  assert.equal(f.notices.at(-1).type, "error"); assert.match(f.notices.at(-1).text, /500.*non enregistré/);
  assert.deepEqual((await f.service.readCatalog())[0].languages.ja.pages, f.pages);
  f.context.failRequest = false; await f.form.onsubmit({ preventDefault() {} });
  assert.equal(f.dialog.open, false); assert.equal(f.state.dirty, false); assert.deepEqual((await f.service.readCatalog())[0].languages.ja.pages, desired);
  await assertPhysicalFilesUnchanged(f);
});

test("Cancel abandons the pending reorder, and reopening restores the saved pages", async (t) => {
  const f = await uiFixture(t); f.context.movePage(23, 22); f.context.requestClose();
  assert.equal(f.dialog.open, false); assert.equal(f.state.dirty, false); assert.equal(f.requests.length, 0);
  assert.deepEqual(await readFile(f.catalogPath), f.original);
  // Exercise the real openEditor handler with rendering adapters, not a save.
  f.state.mangas = (await f.service.report()).mangas;
  f.form.elements = Object.fromEntries(["title", "edition", "author", "year", "date", "status", "visibility", "presentationSection", "readingDirection", "genre", "role", "description", "summary", "order", "defaultReadingMode", "tags", "featured"].map((name) => [name, {}]));
  f.context.$ = () => ({}); f.context.renderMedia = () => {}; f.context.switchEditorTab = () => {}; f.dialog.showModal = () => { f.dialog.open = true; };
  f.context.renderLanguages = () => { const language = f.context.currentManga().languages[f.state.language]; f.state.workingPages = [...language.pages]; f.state.savedPages = [...language.pages]; };
  vm.runInContext(`${adminSource.slice(adminSource.indexOf("function currentManga("), adminSource.indexOf("function languageOption("))}\n${adminSource.slice(adminSource.indexOf("function openEditor("), adminSource.indexOf("function renderMedia("))}`, f.context);
  f.context.openEditor("example"); f.state.language = "ja"; f.context.renderLanguages();
  assert.deepEqual([...f.state.workingPages], f.pages); assert.equal(f.state.dirty, false); await assertPhysicalFilesUnchanged(f);
});

test("the existing reorder service rejects duplicate, missing and foreign paths without modifying the catalog", async (t) => {
  const f = await fixture(t);
  const duplicate = [...f.pages]; duplicate[23] = duplicate[22];
  const foreign = [...f.pages]; foreign[23] = f.before[0].languages.fr.pages[0];
  for (const pages of [duplicate, foreign, f.pages.slice(1)]) await assert.rejects(f.service.reorderPages("example", "ja", pages));
  assert.deepEqual(await readFile(f.catalogPath), f.original); await assertPhysicalFilesUnchanged(f);
});
