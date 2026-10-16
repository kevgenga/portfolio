import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  const open = async () => { await until("document.querySelectorAll('[data-edit]').length===2"); await click("[data-edit]"); await until("location.pathname==='/manga-edit.html' && document.querySelectorAll('.manga-page').length>0 && !document.querySelector('#editor-error').textContent"); };
  const navigate = async () => { await command("Page.navigate", { url: `${f.base}/mangas.html` }); await open(); };
  await open();
  // The same selection drives explicit vertical pairs, never production groups.
  await click('#configure-spread');
  assert.ok((await evaluate("document.querySelector('#toast').textContent")).includes('exactement deux'));
  await click('.manga-page[data-index="0"] input[data-production-key]');
  await click('.manga-page[data-index="2"] input[data-production-key]');
  await click('#configure-spread');
  assert.ok((await evaluate("document.querySelector('#toast').textContent")).includes('consécutives'));
  await click('[data-clear-selection]');
  await click('.manga-page[data-index="1"] input[data-production-key]');
  await click('.manga-page[data-index="2"] input[data-production-key]');
  await click('#configure-spread'); await until("document.querySelector('#spread-title').closest('dialog').open");
  assert.equal(await evaluate("document.querySelector('.vertical-spread-preview').dir"),'rtl');
  const spreadRects=await evaluate("[...document.querySelectorAll('.vertical-spread-preview img')].map(el=>el.getBoundingClientRect().left)");
  assert.ok(spreadRects[0]>spreadRects[1]);
  for(const width of [320,375,390,430,768,1024,1440,1920]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    const layout=await evaluate("(()=>{const modal=document.querySelector('#spread-title').closest('dialog'),r=modal.getBoundingClientRect();return {width:innerWidth,visual:visualViewport.width,left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:modal.clientWidth,scroll:modal.scrollWidth,labels:[...modal.querySelectorAll('input')].every(input=>input.labels.length===1)}})()");
    assert.ok(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=900&&layout.scroll<=layout.client+1,JSON.stringify({width,layout}));assert.equal(layout.labels,true);
    if(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR&&[320,1440].includes(width)) {
      await mkdir(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'});
      await writeFile(path.join(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR,`manga-spread-config-admin-${width}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  await evaluate("document.querySelector('[data-spread-horizontal]').focus()");
  const beforeKeyboard=await f.currentSource();
  for(let i=0;i<2;i++){
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.equal(await evaluate("document.querySelector('[data-spread-horizontal]').checked"),i===0);
  }
  assert.equal(await f.currentSource(),beforeKeyboard,'Keyboard toggles do not save');
  await click('[data-spread-cancel]'); assert.equal((await f.manga()).languages.english.verticalSpreads,undefined);
  await click('#configure-spread');
  assert.equal(await evaluate("document.querySelector('[data-spread-vertical]').checked"),true);
  assert.equal(await evaluate("document.querySelector('[data-spread-horizontal]').checked"),false);
  const spreadOriginal=await f.currentSource();
  await evaluate("window.__originalFetch=window.fetch;window.fetch=async(url,...args)=>String(url).endsWith('/spreads')?new Response(JSON.stringify({error:'Conflit simulé : actualisez.'}),{status:409,headers:{'Content-Type':'application/json'}}):window.__originalFetch(url,...args)");
  await click('[data-spread-confirm]');await until("!document.querySelector('[data-spread-error]').hidden&&!document.querySelector('[data-spread-confirm]').disabled");
  assert.equal(await evaluate("document.querySelector('#spread-title').closest('dialog').open"),true);
  assert.equal(await evaluate("document.querySelector('[data-spread-vertical]').checked"),true);
  assert.equal(await f.currentSource(),spreadOriginal);
  await evaluate("window.fetch=window.__originalFetch");await click('[data-spread-confirm]');
  await until("document.querySelectorAll('.manga-page--vertical-spread').length===2&&!document.querySelector('#manga-dialog').inert");
  assert.deepEqual((await f.manga()).languages.english.verticalSpreads,[f.pages.english.slice(1,3)]);
  assert.equal((await f.manga()).productionTime,undefined);
  await navigate(); assert.equal(await evaluate("document.querySelectorAll('.manga-page--vertical-spread').length"),2);
  const openPair=async()=>{await click('[data-action=configure-spread]');await until("document.querySelector('#spread-title').closest('dialog').open");};
  await f.service.update(2,{readingDirection:'ltr'});await navigate();await openPair();
  assert.equal(await evaluate("document.querySelector('.vertical-spread-preview').dir"),'ltr');
  const ltrRects=await evaluate("[...document.querySelectorAll('.vertical-spread-preview img')].map(el=>el.getBoundingClientRect().left)");assert.ok(ltrRects[0]<ltrRects[1]);
  await click('[data-spread-cancel]');await f.service.update(2,{readingDirection:'rtl'});await navigate();
  const changeModes=async(vertical,horizontal)=>{
    await evaluate(`for(const [key,value] of ${JSON.stringify([['vertical',vertical],['horizontal',horizontal]])}){const box=document.querySelector('[data-spread-'+key+']');box.checked=value;box.dispatchEvent(new Event('change',{bubbles:true}))}`);
  };
  const saveModes=async(vertical,horizontal)=>{
    await openPair();await changeModes(vertical,horizontal);
    const before=await f.currentSource();await pause();assert.equal(await f.currentSource(),before,'Checkbox changes never save');
    await click('[data-spread-confirm]');await until("!document.querySelector('#spread-title').closest('dialog').open&&!document.querySelector('#manga-dialog').inert");
    const m=await f.manga();assert.deepEqual(m.languages.english.verticalSpreads,vertical?[f.pages.english.slice(1,3)]:undefined);assert.deepEqual(m.languages.english.horizontalSpreads,horizontal?[f.pages.english.slice(1,3)]:undefined);
    assert.equal(m.productionTime,undefined);
  };
  await openPair();assert.equal(await evaluate("document.querySelector('[data-spread-vertical]').checked"),true);assert.equal(await evaluate("document.querySelector('[data-spread-horizontal]').checked"),false);await click('[data-spread-cancel]');
  await saveModes(true,true);await saveModes(false,true);await saveModes(true,true);await saveModes(true,false);await saveModes(false,true);
  await navigate();await openPair();assert.equal(await evaluate("document.querySelector('[data-spread-horizontal]').checked"),true);
  await changeModes(false,false);await click('[data-spread-confirm]');
  assert.equal(await evaluate("document.querySelector('#spread-title').closest('dialog').open"),true,'Both removals require explicit confirmation');
  await click('[data-spread-removal-confirm]');await click('[data-spread-confirm]');
  await until("document.querySelectorAll('.manga-page--vertical-spread').length===0&&!document.querySelector('#manga-dialog').inert");
  assert.equal((await f.manga()).languages.english.verticalSpreads,undefined);
  await click('[data-clear-selection]'); await click("#manga-tab-information");
  assert.deepEqual(await fieldValues("total"), ["", "", "actual"]);
  await fill("total", "85", "30", "estimated");
  await evaluate("(()=>{const title=document.querySelector('#manga-form [name=title]');title.value='Unsaved title draft';title.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await save("total");
  assert.deepEqual((await f.manga()).productionTime.total, { minutes: 5130, kind: "estimated" });
  assert.equal((await f.manga()).title, f.mangas[0].title);
  assert.equal(await evaluate("document.querySelector('#manga-form [name=title]').value"), "Unsaved title draft");
  // Leaving/reopening now intentionally preserves drafts; explicitly discard this one.
  await click('#manga-dialog [data-close]'); await until("!document.querySelector('#manga-form [name=title]').value.includes('Unsaved')");
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
