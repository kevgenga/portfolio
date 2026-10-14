import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createMangaProductionFixture } from "./manga-production-fixture.mjs";
import { getProductionDrawing } from "../manga/production-time.mjs";
import { pause, stopChild } from "./production-time-fixture.mjs";

const f = await createMangaProductionFixture();
let browser, socket;
const errors = [];
try {
  await f.start();
  const profile = path.join(f.temporary, "manga-browser");
  browser = spawn(process.env.PRODUCTION_TIME_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", `--user-data-dir=${profile}`, `${f.base}/mangas.html`], { windowsHide: true, stdio: "ignore" });
  browser.on("error", error => errors.push(error.message));
  let port;
  for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { await pause(); } }
  assert.ok(port, errors.join("; "));
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0; const pending = new Map();
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error(method + " timed out")); }, 15000);
    pending.set(key, response => { clearTimeout(timer); response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  socket.addEventListener("message", event => {
    const response = JSON.parse(event.data);
    if (pending.has(response.id)) { pending.get(response.id)(response); pending.delete(response.id); }
    if (response.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(response.params.exceptionDetails));
    if (response.method === "Page.javascriptDialogOpening") command("Page.handleJavaScriptDialog", { accept: true }).catch(error => errors.push(error.message));
  });
  await command("Page.enable"); await command("Runtime.enable");
  const evaluate = async expression => { const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); assert.ok(!result.exceptionDetails, JSON.stringify(result)); return result.result.value; };
  const until = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(); } assert.fail(`${expression}: ${JSON.stringify(await evaluate("document.querySelector('#toast')?.textContent"))}; ${errors.join("; ")}`); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (kind, hours, minutes, type) => evaluate(`(()=>{const el=document.querySelector('[data-production-editor="${kind}"]');for(const [key,value] of ${JSON.stringify([["hours", hours], ["minutes", minutes], ["kind", type]])}){const control=el.querySelector('[data-time-'+key+']');control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  const fieldValues = kind => evaluate(`(()=>{const el=document.querySelector('[data-production-editor="${kind}"]');return ['hours','minutes','kind'].map(key=>el.querySelector('[data-time-'+key+']').value)})()`);
  const save = async kind => { await click(`[data-production-editor="${kind}"] [data-time-save]`); await until("!document.querySelector('#manga-dialog').inert"); };
  const open = async () => { await until("document.querySelectorAll('[data-edit]').length===2"); await click("[data-edit]"); await until("document.querySelector('#manga-dialog').open"); };
  const navigate = async () => { await command("Page.navigate", { url: `${f.base}/mangas.html` }); await open(); };
  await open(); await click("#manga-tab-information");
  assert.deepEqual(await fieldValues("total"), ["", "", "actual"]);
  await fill("total", "85", "30", "estimated");
  await evaluate("(()=>{const title=document.querySelector('#manga-form [name=title]');title.value='Unsaved title draft';title.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await save("total");
  assert.deepEqual((await f.manga()).productionTime.total, { minutes: 5130, kind: "estimated" });
  assert.equal((await f.manga()).title, f.mangas[0].title);
  assert.equal(await evaluate("document.querySelector('#manga-form [name=title]').value"), "Unsaved title draft");
  await navigate(); await click("#manga-tab-information");
  assert.deepEqual(await fieldValues("total"), ["85", "30", "estimated"]);
  await fill("total", "85", "30", "actual"); await save("total");
  assert.deepEqual((await f.manga()).productionTime.total, { minutes: 5130, kind: "actual" });
  await fill("total", "90", "0", "actual"); await save("total");
  await click('[data-production-editor="total"] [data-time-clear]'); await until("!document.querySelector('#manga-dialog').inert");
  assert.equal((await f.manga()).productionTime, undefined);
  await click("#manga-tab-pages"); await click('.manga-page[data-index="0"] [data-action="time"]');
  assert.deepEqual(await fieldValues("page"), ["", "", "actual"]);
  await fill("page", "2", "30", "actual"); await save("page");
  await navigate(); await click('.manga-page[data-index="0"] [data-action="time"]');
  assert.deepEqual(await fieldValues("page"), ["2", "30", "actual"]);
  await evaluate(`(()=>{const select=document.querySelector('[data-production-target]');select.value=${JSON.stringify(f.pages.french[0])};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click("[data-production-associate]"); await until("!document.querySelector('#manga-dialog').inert");
  assert.equal(getProductionDrawing(await f.manga(), f.pages.english[0]).id, getProductionDrawing(await f.manga(), f.pages.french[0]).id);
  await evaluate("[...document.querySelectorAll('.language-tab')].find(b=>b.textContent.startsWith('Fran')).click()");
  await click('.manga-page[data-index="0"] [data-action="time"]');
  assert.deepEqual(await fieldValues("page"), ["2", "30", "actual"]);
  await click("[data-production-separate]"); await until("!document.querySelector('#manga-dialog').inert");
  assert.notEqual(getProductionDrawing(await f.manga(), f.pages.english[0]).id, getProductionDrawing(await f.manga(), f.pages.french[0]).id);
  assert.deepEqual(getProductionDrawing(await f.manga(), f.pages.english[0]).time, { minutes: 150, kind: "actual" });
  await fill("page", "0", "0", "actual"); await save("page");
  assert.deepEqual(getProductionDrawing(await f.manga(), f.pages.french[0]).time, { minutes: 150, kind: "actual" });
  assert.equal(await evaluate("document.querySelector('[data-production-editor=page] [role=status]').classList.contains('is-error')"), true);
  await fill("page", "3", "15", "estimated");
  await evaluate("document.querySelector('[data-production-editor=page] [data-time-save]').focus()"); await command("Page.bringToFront");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await until("!document.querySelector('#manga-dialog').inert");
  assert.deepEqual(getProductionDrawing(await f.manga(), f.pages.french[0]).time, { minutes: 195, kind: "estimated" });
  for (const width of [375, 768, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 1100, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate("[...document.querySelectorAll('#manga-production-page input,#manga-production-page select')].every(el=>el.labels.length>0)"), true);
    const layout = await evaluate("[...document.querySelectorAll('#manga-production-page,#manga-production-page *')].filter(el=>el.getBoundingClientRect().width).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1})");
    assert.equal(layout, true, `Production panel overflow ${width}`);
  }
  if (process.env.MANGA_PRODUCTION_SCREENSHOT) {
    const result = await command("Page.captureScreenshot", { format: "png" }); await writeFile(path.resolve(process.env.MANGA_PRODUCTION_SCREENSHOT), Buffer.from(result.data, "base64"));
  }
  await click('[data-production-editor="page"] [data-time-clear]'); await until("!document.querySelector('#manga-dialog').inert");
  assert.equal(getProductionDrawing(await f.manga(), f.pages.french[0]).time, undefined);
  assert.equal(getProductionDrawing(await f.manga(), f.pages.english[0]).time.minutes, 150);
  // An external edit causes a visible error and retains the draft.
  await fill("page", "1", "15", "actual"); const external = (await f.currentSource()) + "\n"; await writeFile(f.catalogPath, external);
  await save("page"); assert.equal(await f.currentSource(), external);
  assert.deepEqual(await fieldValues("page"), ["1", "15", "actual"]);
  assert.ok(await evaluate("document.querySelector('#toast').textContent.includes('changé')"));
  const source = await f.manga(); const stripped = { ...source }; delete stripped.productionTime;
  assert.deepEqual(stripped, f.mangas[0]);
  for (const [relative, bytes] of f.media) assert.deepEqual(await readFile(path.join(f.root, "public", relative)), bytes);
  assert.deepEqual(errors, []);
  console.log("Isolated Chrome Manga production: total create/edit/delete/reload, page 2h30/reload/shared French/unlink/update/delete, invalid/zero/error drafts, keyboard, 375/768/1440, original metadata and image bytes OK.");
} finally { socket?.close(); await stopChild(browser); await f.close(); }
