import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import path from "node:path";
import sharp from "sharp";
import { createMangaProductionFixture } from "./manga-production-fixture.mjs";
import { pause, stopChild } from "./production-time-fixture.mjs";

const f = await createMangaProductionFixture({ pageCounts: [["english", 150], ["french", 2], ["ja", 1]] });
let browser, socket;
const errors = [], requests = [], dialogs = [];
try {
  await f.start();
  const initial = await f.service.readCatalog();
  for (const [query, status] of [["id=2", 200], ["id=other", 200], ["id=missing", 404], ["", 400], ["id=../private", 400], ["id=2&id=other", 400], ["id=2&tab=bad", 400], ["id=2&language=xx", 400], ["id=2&file=secret", 400], ["id=%22%3E%3Cscript%3E", 404]]) {
    const response = await fetch(`${f.base}/manga-edit.html?${query}`);
    assert.equal(response.status, status, query);
    const html = await response.text(); assert.match(html, /data-editor-id=/); assert.doesNotMatch(html, /<dialog id="manga-dialog"/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  }
  const thumb = await fetch(`${f.base}/api/manga-thumbnail/${encodeURIComponent(f.pages.english[0])}`);
  assert.equal(thumb.status, 200); assert.equal(thumb.headers.get("content-type"), "image/webp");
  const metadata = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata(); assert.ok(metadata.width <= 240 && metadata.height <= 320);
  for (const headers of [{ Origin: "https://kevgenga.github.io" }, { "Sec-Fetch-Site": "cross-site" }]) {
    const response = await fetch(`${f.base}/api/mangas`, { method: "POST", headers, body: "{}" }); assert.equal(response.status, 403);
  }
  const spoofed = await new Promise((resolve, reject) => { const request = httpRequest(`${f.base}/api/mangas`, { headers: { Host: "localhost:evil.example" } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode)); }); request.on("error", reject); request.end(); });
  assert.equal(spoofed, 403);
  const traversal = await fetch(`${f.base}/api/manga-thumbnail/${encodeURIComponent("../src/content/mangas.js")}`); assert.ok([400, 403, 404].includes(traversal.status));
  assert.equal(await f.currentSource(), f.original);

  const profile = path.join(f.temporary, "editor-browser");
  browser = spawn(process.env.PRODUCTION_TIME_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", `--user-data-dir=${profile}`, `${f.base}/mangas.html`], { windowsHide: true, stdio: "ignore" });
  browser.on("error", error => errors.push(error.message));
  let port;
  for (let i = 0; i < 160 && !port; i++) { try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { await pause(); } }
  assert.ok(port, errors.join("; "));
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, response => { clearTimeout(timer); response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result); }); socket.send(JSON.stringify({ id, method, params }));
  });
  socket.addEventListener("message", event => {
    const response = JSON.parse(event.data);
    if (pending.has(response.id)) { pending.get(response.id)(response); pending.delete(response.id); }
    if (response.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(response.params.exceptionDetails));
    if (response.method === "Network.requestWillBeSent") requests.push(response.params.request);
    if (response.method === "Page.javascriptDialogOpening") { dialogs.push(response.params.type); command("Page.handleJavaScriptDialog", { accept: true }).catch(error => errors.push(error.message)); }
  });
  await command("Page.enable"); await command("Runtime.enable"); await command("Network.enable");
  const evaluate = async expression => { const output = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); assert.ok(!output.exceptionDetails, JSON.stringify(output)); return output.result.value; };
  const until = async expression => { for (let i = 0; i < 160; i++) { try { if (await evaluate(expression)) return; } catch (error) { if (!error.message.includes("context")) throw error; } await pause(); } assert.fail(`${expression}; ${await evaluate("document.querySelector('#editor-error')?.textContent+' '+document.querySelector('#toast')?.textContent")}; ${errors.join("; ")}`); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const realClick = async selector => {
    const point = await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center'});const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await command("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});
  };
  const set = (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const ready = () => until("!window.__navigationPending && document.readyState==='complete' && location.pathname==='/manga-edit.html' && document.querySelectorAll('.manga-page').length===150 && !document.querySelector('#editor-error').textContent");
  const reload = async () => { await evaluate("window.__navigationPending=true"); await command("Page.reload"); await ready(); };
  await until("document.querySelectorAll('[data-edit]').length===2");
  await click("[data-edit]"); await ready();
  assert.equal(await evaluate("new URLSearchParams(location.search).get('id')"), "2");
  await until("[...document.querySelectorAll('.page-thumbnail img')].some(img=>img.complete&&img.naturalWidth>0)");
  assert.equal(await evaluate("document.querySelector('#manga-dialog').tagName"), "SECTION");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#page-grid')).overflowY"), "visible");
  assert.ok(requests.filter(request => request.url.includes("/api/manga-thumbnail/")).length < 100, "150 originals are not fetched eagerly");
  await click('.manga-page[data-index="1"] input'); await click('.manga-page[data-index="2"] input');
  await evaluate("window.__firstCard=document.querySelector('.manga-page')");
  for (const view of ["list", "cards"]) { await click(`[data-pages-view="${view}"]`); assert.equal(await evaluate("window.__firstCard===document.querySelector('.manga-page')"), true); assert.equal(await evaluate("document.querySelectorAll('.manga-page input:checked').length"), 2); }
  await realClick('#manga-tab-information'); await set('#manga-form [name=title]', 'Temporary draft'); await click('#manga-tab-pages');
  await click('.manga-page[data-index="0"] [data-action=last]');
  await click('[data-pages-view=list]');
  assert.equal(await evaluate("document.querySelector('.manga-page[data-index=\"149\"] .page-filename').textContent"), "01.jpg");
  await reload();
  assert.equal(await evaluate("document.querySelector('#manga-form [name=title]').value"), "Temporary draft");
  assert.equal(await evaluate("document.querySelector('#page-grid').dataset.view"), "list");
  assert.equal(await evaluate("document.querySelectorAll('.manga-page input:checked').length"), 2);
  assert.equal(await evaluate("document.querySelector('.manga-page[data-index=\"149\"] .page-filename').textContent"), "01.jpg");
  assert.equal(await f.currentSource(), f.original);
  await evaluate("window.scrollTo(0,1800)"); const scrollBefore = await evaluate("scrollY");
  await click('.manga-page[data-index="8"] .page-thumbnail'); await until("document.querySelector('#page-preview-dialog').open && document.querySelector('#page-preview-image').naturalWidth>0");
  assert.match(await evaluate("document.querySelector('#page-preview-image').src"), /\/api\/manga-image\//);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until("!document.querySelector('#page-preview-dialog').open"); assert.ok(Math.abs((await evaluate("scrollY")) - scrollBefore) <= 1);
  // Save keeps the route, fields and ordering are actually persisted in the fixture.
  await click('#manga-form button[type=submit]'); await until("!document.querySelector('#manga-dialog').inert && document.querySelector('#toast').textContent.includes('enregistrés')");
  assert.equal(await evaluate("location.pathname"), "/manga-edit.html");
  assert.equal((await f.manga()).title, "Temporary draft"); assert.equal((await f.manga()).languages.english.pages.at(-1), f.pages.english[0]);
  // Production drafts survive CSS view switches and a reload without a write.
  await click('.manga-page[data-index="0"] [data-action=time]'); await set('[data-production-editor=page] [data-time-hours]', "12");
  const saved = await f.currentSource();
  for (const view of ["cards", "list"]) { await click(`[data-pages-view=${view}]`); assert.equal(await evaluate("document.querySelector('[data-production-editor=page] [data-time-hours]').value"), "12"); }
  await reload(); assert.equal(await evaluate("document.querySelector('[data-production-editor=page] [data-time-hours]').value"), "12"); assert.equal(await f.currentSource(), saved);
  await click('#manga-dialog [data-close]'); await until("document.querySelector('#manga-production-page').hidden");
  // Native confirmations retain keyboard access, with foreground notices.
  await click('.manga-page[data-index="0"] [data-action=duplicate]'); await until("document.querySelector('#duplicate-page-dialog').open");
  assert.equal(await evaluate("document.querySelector('#toast').parentElement.id"), "duplicate-page-dialog");
  await click('#cancel-duplicate-page');
  await click('[data-clear-selection]'); await click('.manga-page[data-index="1"] input'); await click('.manga-page[data-index="2"] input');
  await click('#configure-spread'); await until("document.querySelector('#spread-title').closest('dialog').open");
  await click('[data-spread-cancel]'); assert.equal(await f.currentSource(), saved);
  // Native DnD handlers in both presentations use the same real order.
  for (const view of ["cards", "list"]) {
    await click(`[data-pages-view=${view}]`);
    await evaluate("window.scrollTo(0,0);document.querySelector('.manga-page[data-index=\"1\"]').dispatchEvent(new DragEvent('dragstart',{bubbles:true}));document.dispatchEvent(new DragEvent('dragover',{bubbles:true,clientY:innerHeight-5}));");
    await pause(180); assert.ok(await evaluate("scrollY>0"), `document auto-scroll during ${view} drag`);
    await evaluate("document.dispatchEvent(new DragEvent('dragend',{bubbles:true}));document.querySelectorAll('.manga-page.is-dragging').forEach(card=>card.classList.remove('is-dragging'));window.__movedName=document.querySelector('.manga-page[data-index=\"1\"] .page-filename').textContent;");
    await evaluate("(()=>{const cards=document.querySelectorAll('.manga-page');cards[1].dispatchEvent(new DragEvent('dragstart',{bubbles:true}));cards[8].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}));document.dispatchEvent(new DragEvent('dragend',{bubbles:true}));})()");
    assert.equal(await evaluate("document.querySelector('.manga-page[data-index=\"8\"] .page-filename').textContent===window.__movedName"), true);
    assert.equal(await evaluate("document.querySelector('#manga-dialog-title').textContent.startsWith('•')"), true);
    await click('#manga-dialog [data-close]');
  }
  for (const width of [320,375,390,430,768,1024,1440,1920]) for (const height of [540,900]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    for (const view of ["cards", "list"]) {
      await click(`[data-pages-view=${view}]`);
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      const layout = await evaluate("({width:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,grid:document.querySelector('#page-grid').scrollWidth,gridClient:document.querySelector('#page-grid').clientWidth})");
      assert.ok(layout.scroll <= width + 1 && layout.grid <= layout.gridClient + 1, JSON.stringify({ width,height,view,layout }));
      assert.equal(await evaluate("(()=>{const card=document.querySelector('.manga-page'),a=card.querySelector('.production-select').getBoundingClientRect(),b=card.querySelector('.page-position').getBoundingClientRect();return a.right<=b.left||a.bottom<=b.top||b.bottom<=a.top})()"), true, `selection/position overlap ${width} ${view}`);
      for (const tab of ["information", "media", "pages"]) { await click(`#manga-tab-${tab}`); assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `overflow ${tab} ${width}`); }
      if (process.env.MANGA_EDITOR_CAPTURE_DIR && height === 900 && [375,1440].includes(width)) {
        await evaluate("scrollTo(0,0)"); await mkdir(process.env.MANGA_EDITOR_CAPTURE_DIR,{recursive:true});
        const shot = await command("Page.captureScreenshot",{format:"png"});
        await writeFile(path.join(process.env.MANGA_EDITOR_CAPTURE_DIR,`manga-editor-${view}-${width}.png`),Buffer.from(shot.data,"base64"));
        if(width===375) {
          await evaluate("document.querySelector('.manga-page').scrollIntoView({block:'start'});scrollBy(0,-130)");
          const scrolled = await command("Page.captureScreenshot",{format:"png"});
          await writeFile(path.join(process.env.MANGA_EDITOR_CAPTURE_DIR,`manga-editor-${view}-${width}-pages.png`),Buffer.from(scrolled.data,"base64"));
        }
      }
    }
  }
  await command("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await click('[data-pages-view=cards]'); await evaluate("scrollTo(0,0)");
  if (process.env.MANGA_EDITOR_CAPTURE_DIR) { await mkdir(process.env.MANGA_EDITOR_CAPTURE_DIR,{recursive:true}); const shot = await command("Page.captureScreenshot",{format:"png"}); await writeFile(path.join(process.env.MANGA_EDITOR_CAPTURE_DIR,"manga-editor-1440.png"),Buffer.from(shot.data,"base64")); }
  // Actual back/forward navigation uses distinct documents, not a modal history hack.
  await click('#back-to-mangas'); await until("location.pathname==='/mangas.html' && document.querySelectorAll('[data-edit]').length===2");
  await evaluate("history.back()"); await ready();
  await evaluate("history.forward()"); await until("location.pathname==='/mangas.html'");
  await command("Page.navigate", { url: `${f.base}/manga-edit.html?id=other` }); await until("document.querySelectorAll('.manga-page').length===1 && document.querySelector('#manga-breadcrumb').textContent.includes('Other')");
  assert.equal(await evaluate("document.querySelectorAll('.manga-page input:checked').length"), 0);
  await command("Page.navigate", { url: `${f.base}/manga-edit.html?id=missing` }); await until("!document.querySelector('#editor-error').hidden");
  assert.match(await evaluate("document.querySelector('#editor-error').textContent"), /n’existe plus/);
  // A conflict recovery cannot overwrite either the current catalog or the stale draft.
  await command("Page.navigate", { url: `${f.base}/manga-edit.html?id=2` }); await ready();
  await set('#manga-form [name=title]', 'Recover me'); await writeFile(f.catalogPath, (await f.currentSource()) + "\n");
  await reload(); await until("!document.querySelector('#editor-recovery').hidden");
  assert.equal(await evaluate("document.querySelector('#manga-form').inert"), true);
  const conflictSource = await f.currentSource(); await click('#discard-draft'); assert.equal(await evaluate("document.querySelector('#manga-form').inert"), false); assert.equal(await f.currentSource(), conflictSource);
  assert.ok(dialogs.includes("beforeunload"), "Reloading dirty drafts requests the native warning");
  assert.deepEqual((await f.service.readCatalog())[1], initial[1]);
  assert.deepEqual((await f.manga()).languages.french, initial[0].languages.french); assert.deepEqual((await f.manga()).languages.ja, initial[0].languages.ja);
  for (const [relative, bytes] of f.media) assert.deepEqual(await readFile(path.join(f.root,"public",relative)),bytes);
  assert.deepEqual(errors, []);
  console.log("Dedicated Manga editor: validated URLs/HTTP/Host/Origin, 150 pages, lazy read-only thumbnails, cards/list same DOM, selection/order/production draft recovery, real save staying on page, Escape preview/scroll, DnD, tabs/languages, 320–1920 × 540/900, back/forward, missing project, stale recovery and all original fixture image bytes OK.");
} finally { socket?.close(); await stopChild(browser); await f.close(); }
