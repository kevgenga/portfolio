import assert from "node:assert/strict";
import fsPromises, { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import vm from "node:vm";
import { createAnimationService } from "../animation/service.mjs";
import { handleAnimationRoute } from "../animation/routes.mjs";
import { createPresentationSettingsStore } from "../presentation-settings.mjs";

async function fixture(t, source = 'export const sitePresentation = Object.freeze({ showAnimationSection: false, selectedMangaSlugs: ["keep-me"] });\n') {
  const root = await mkdtemp(path.join(tmpdir(), "portfolio-presentation-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const file = path.join(root, "src/content/sitePresentation.js"), backupRoot = path.join(root, "runtime/backups/animations");
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, source);
  const store = createPresentationSettingsStore({ file, backupRoot, key: "showAnimationSection", label: "Animation" });
  return { root, file, backupRoot, store, source };
}

test("Animation toggle persists false/true, preserves editorial references and makes backups", async (t) => {
  const f = await fixture(t); assert.deepEqual(await f.store.read(), { showAnimationSection: false });
  await f.store.update({ showAnimationSection: true });
  assert.equal(await readFile(f.file, "utf8"), f.source.replace("false", "true"));
  const service = createAnimationService({ projectRoot: f.root, runtimeRoot: path.join(f.root, "runtime") });
  assert.deepEqual(await service.readPresentationSettings(), { showAnimationSection: true });
  await service.updatePresentationSettings({ showAnimationSection: false });
  assert.equal(await readFile(f.file, "utf8"), f.source);
  const backups = await readdir(f.backupRoot); assert.equal(backups.length, 2);
  assert.equal(await readFile(path.join(f.backupRoot, backups[0]), "utf8"), f.source);
});

test("missing, invalid or duplicated configuration is never masked by fictitious defaults", async (t) => {
  const f = await fixture(t);
  for (const value of ["false", null, 0, undefined]) await assert.rejects(f.store.update({ showAnimationSection: value }), (error) => error.status === 400);
  assert.equal(await readFile(f.file, "utf8"), f.source);
  await writeFile(f.file, "showAnimationSection: false, showAnimationSection: true");
  await assert.rejects(f.store.read(), (error) => error.status === 500);
  await rm(f.file); await assert.rejects(f.store.read(), { code: "ENOENT" });
});

test("concurrent toggle requests are serialized and no-op makes no backup", async (t) => {
  const f = await fixture(t); await f.store.update({ showAnimationSection: false });
  await assert.rejects(readdir(f.backupRoot), { code: "ENOENT" });
  await Promise.all([f.store.update({ showAnimationSection: true }), f.store.update({ showAnimationSection: false })]);
  assert.deepEqual(await f.store.read(), { showAnimationSection: false }); assert.equal((await readdir(f.backupRoot)).length, 2);
});

test("failed atomic replacement leaves the original untouched and removes the temporary file", async (t) => {
  const f = await fixture(t); const originalRename = fsPromises.rename;
  fsPromises.rename = async () => { throw new Error("Simulated Windows access denial"); }; syncBuiltinESMExports();
  try { await assert.rejects(f.store.update({ showAnimationSection: true }), /access denial/); }
  finally { fsPromises.rename = originalRename; syncBuiltinESMExports(); }
  assert.equal(await readFile(f.file, "utf8"), f.source);
  assert.deepEqual(await readdir(path.dirname(f.file)), ["sitePresentation.js"]);
});

test("Animation settings API uses the same service and does not mutate any catalog", async (t) => {
  const f = await fixture(t); const service = createAnimationService({ projectRoot: f.root, runtimeRoot: path.join(f.root, "runtime") });
  const route = async (method, payload) => {
    let result;
    assert.equal(await handleAnimationRoute({ method }, {}, new URL("http://127.0.0.1/api/animation-presentation-settings"), {
      service, readJson: async () => payload, sendJson: (_, status, body) => { result = { status, body }; },
    }), true); return result;
  };
  assert.deepEqual((await route("GET")).body, { showAnimationSection: false });
  assert.equal((await route("PUT", { showAnimationSection: true })).body.showAnimationSection, true);
  assert.equal((await route("GET")).body.showAnimationSection, true);
  assert.deepEqual(await readdir(path.dirname(f.file)), ["sitePresentation.js"]);
});

test("Admin toggle loads persisted state, confirms changes and recovers visibly from an API error", async () => {
  const source = await readFile(new URL("../public/modules/animations/animation-admin.js", import.meta.url), "utf8");
  const nodes = new Map(); const $ = (selector) => { if (!nodes.has(selector)) nodes.set(selector, { disabled: true, setAttribute(name, value) { this[name] = value; } }); return nodes.get(selector); };
  let visible = false, fail = false; const requests = [], notices = [];
  const context = vm.createContext({ $, confirm: () => true, message: (...args) => notices.push(args), api: async (url, options) => {
    requests.push({ url, options }); if (fail) throw new Error("HTTP 500");
    if (options?.body) visible = JSON.parse(options.body).showAnimationSection;
    return { showAnimationSection: visible, message: "Saved" };
  } });
  vm.runInContext(source.slice(source.indexOf("let presentationSettings;"), source.indexOf("Promise.all([load(), loadPresentationSettings()])")), context);
  await context.loadPresentationSettings(); assert.match($("#animation-visibility-state").textContent, /Masquée/);
  await $("#toggle-animation-visibility").onclick(); assert.equal(visible, true); assert.equal($("#toggle-animation-visibility")["aria-pressed"], "true");
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), { showAnimationSection: true });
  context.confirm = () => false; const before = requests.length; await $("#toggle-animation-visibility").onclick(); assert.equal(requests.length, before);
  context.confirm = () => true; fail = true; await $("#toggle-animation-visibility").onclick(); assert.deepEqual(notices.at(-1), ["HTTP 500", "error"]);
  assert.equal($("#toggle-animation-visibility").disabled, false); assert.equal(visible, true);
});
