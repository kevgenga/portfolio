import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createMangaProductionFixture } from "./manga-production-fixture.mjs";
import { getProductionDrawing } from "../manga/production-time.mjs";
import { pause, stopChild } from "./production-time-fixture.mjs";

// Only synthetic catalogs/media and a temporary browser profile. No real Admin,
// Vite server, public data or external request is used by this browser test.
const f = await createMangaProductionFixture();
let browser, socket;
const errors = [];
try {
  const third = { ...f.artwork, id: "third", image: "assets/illustration/illustrations/third.jpg" };
  const thirdBytes = await sharp({ create: { width: 46, height: 35, channels: 3, background: "#778899" } }).jpeg().toBuffer();
  await writeFile(path.join(f.root, "public", third.image), thirdBytes);
  await writeFile(f.catalog, (await f.sourceNow()).replace("\n];", `,\n${JSON.stringify(third).replace(JSON.stringify(third.image), `assetPath(${JSON.stringify(third.image)})`)}\n];`));
  await f.edit("total", { total: { minutes: 9000, kind: "actual" } });
  await f.edit("associate", { path: f.pages.english[0], targetPath: f.pages.french[0] });
  await f.start();
  const profile = path.join(f.temporary, "production-groups-browser");
  browser = spawn(process.env.PRODUCTION_TIME_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", `--user-data-dir=${profile}`, `${f.base}/`], { windowsHide: true, stdio: "ignore" });
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
  const until = async expression => { for (let i = 0; i < 160; i++) { if (await evaluate(expression)) return; await pause(); } assert.fail(`${expression}: ${JSON.stringify(await evaluate("document.querySelector('[data-batch-error]')?.textContent || document.querySelector('#toast')?.textContent"))}; ${errors.join("; ")}`); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const set = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const open = async () => { await click("[data-edit-selection]"); await until("document.querySelector('.production-batch-dialog').open"); };
  const close = async () => { await click("[data-batch-close]"); await until("!document.querySelector('.production-batch-dialog').open"); };
  // No refresh/preview click: the existing scenarios now assert the automatic
  // server-validated recap before allowing any commit.
  const preview = async () => { if (await evaluate("document.querySelector('[data-batch-hours]').value!=='' && document.querySelector('[data-batch-minutes]').value===''") ) await set("[data-batch-minutes]", "0"); await until("!document.querySelector('[data-batch-confirm]').disabled && !document.querySelector('.production-batch-dialog').inert"); };
  const commit = async () => { await click("[data-batch-confirm]"); await until("!document.querySelector('.production-batch-dialog').open"); };
  const groupButton = async text => evaluate(`(()=>{const button=[...document.querySelectorAll('[data-batch-groups] button')].find(b=>b.textContent.startsWith(${JSON.stringify(text)}));button.click()})()`);
  const count = () => evaluate("document.querySelector('[data-production-count]').textContent");
  const navigateArtwork = async () => { await command("Page.navigate", { url: `${f.base}/` }); await until("document.querySelectorAll('.art-card').length>0"); };
  const navigateManga = async (index = 0) => { await command("Page.navigate", { url: `${f.base}/mangas.html` }); await until("document.querySelectorAll('[data-edit]').length===2"); await evaluate(`document.querySelectorAll('[data-edit]')[${index}].click()`); await until("location.pathname==='/manga-edit.html' && document.querySelectorAll('.manga-page').length>0"); };
  const checkLayout = async (container) => {
    for (const width of [375, 390, 768, 1024, 1440, 1920]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: width < 768 ? 844 : 1100, deviceScaleFactor: 1, mobile: width < 768 });
      const bad = await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(container)});return [root,...root.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&((r.left<0||r.right>innerWidth+1)||el.scrollWidth>el.clientWidth+1)}).map(el=>({tag:el.tagName,cls:el.className,w:el.clientWidth,sw:el.scrollWidth,r:el.getBoundingClientRect().right}));})()`);
      assert.deepEqual(bad, [], `${container} overflow at ${width}`);
    }
  };
  const screenshot = async name => {
    if (!process.env.PRODUCTION_GROUPS_SCREENSHOT_DIR) return;
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    const result = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(process.env.PRODUCTION_GROUPS_SCREENSHOT_DIR, name + ".png"), Buffer.from(result.data, "base64"));
  };
  await until("document.querySelectorAll('.art-card').length===2"); // Default Illustrations, not all three.
  await click("[data-select-filtered]"); assert.match(await count(), /^2 .*2 dessin/);
  await set("#category-filter", "sketches"); await until("document.querySelectorAll('.art-card').length===1");
  assert.match(await count(), /2 hors des cartes/);
  await click(".art-card input[data-production-key]"); assert.match(await count(), /^3 .*3 dessin/);
  await set("#category-filter", ""); await set("#search", "sample");
  assert.match(await count(), /^3 /);
  await set("#date-sort", "oldest"); await set("#search", "");
  await checkLayout("#artwork-production-selection");
  await open(); await set("[data-batch-hours]", "2"); await set("[data-batch-minutes]", "30"); await preview();
  assert.match(await evaluate("document.querySelector('[data-batch-preview]').textContent"), /3 .*3 dessin/);
  await checkLayout(".production-batch-dialog");
  await screenshot("artwork-batch-desktop");
  await command("Emulation.setDeviceMetricsOverride", { width: 375, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot("artwork-batch-mobile");
  assert.equal(await evaluate("[...document.querySelectorAll('.production-batch-dialog input,.production-batch-dialog select')].every(el=>el.labels.length>0)"), true);
  await evaluate("document.querySelector('[data-batch-confirm]').focus()"); await command("Page.bringToFront");
  assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), true);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await until("!document.querySelector('.production-batch-dialog').open");
  assert.ok((await f.request("/api/artworks")).artworks.every(a => a.productionTime.minutes === 150));
  await open(); await set("[data-batch-strategy]", "replace"); await set("[data-batch-hours]", "1"); await preview();
  const beforeDenied = await f.sourceNow(); await click("[data-batch-confirm]");
  assert.equal(await f.sourceNow(), beforeDenied); assert.equal(await evaluate("document.querySelector('[data-batch-error]').hidden"), false);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until("!document.querySelector('.production-batch-dialog').open"); assert.equal(await f.sourceNow(), beforeDenied);
  await open(); await set("[data-batch-mode]", "group-create"); await set("[data-batch-hours]", "5"); await set("[data-batch-name]", "Three studies"); await preview(); await commit();
  let data = await f.request("/api/artworks"); assert.equal(data.artworkProductionGroups[0].artworkIds.length, 3); assert.ok(data.artworks.every(a => a.productionTime.minutes === 150));
  await navigateArtwork(); await click("[data-manage-groups]"); assert.match(await evaluate("document.querySelector('[data-batch-groups]').textContent"), /Three studies/);
  await groupButton("Modifier"); await set("[data-batch-name]", "Two studies"); await set("[data-batch-hours]", "6");
  await click("[data-batch-members-wrap] summary"); await click('[data-member-key="other"]'); await preview(); await commit();
  data = await f.request("/api/artworks"); assert.equal(data.artworkProductionGroups[0].artworkIds.length, 2); assert.equal(data.artworkProductionGroups[0].time.minutes, 360);
  await click("[data-clear-selection]"); await set("#category-filter", "illustrations"); await click("[data-select-filtered]"); await open(); await set("[data-batch-mode]", "group-create"); await set("[data-batch-hours]", "9"); await preview();
  assert.match(await evaluate("document.querySelector('[data-batch-preview]').textContent"), /Groupe IDENTIQUE/);
  const beforeOverlap = await f.sourceNow(); await click("[data-batch-confirm]"); assert.equal(await f.sourceNow(), beforeOverlap);
  await click("[data-batch-ack]"); await commit(); assert.equal((await f.request("/api/artworks")).artworkProductionGroups.length, 2);
  await click("[data-manage-groups]"); await groupButton("Supprimer"); await preview(); await commit();
  assert.equal((await f.request("/api/artworks")).artworkProductionGroups.length, 1);
  await click("[data-manage-groups]"); await groupButton("Supprimer"); await preview(); await commit();
  assert.equal((await f.request("/api/artworks")).artworkProductionGroups.length, 0);
  assert.ok((await f.request("/api/artworks")).artworks.every(a => a.productionTime.minutes === 150));

  // Real browser Mode C: clear all three; then create 1h without a preview click,
  // reload, and clear a mixed five-element selection while keeping its group.
  await set("#category-filter", ""); await click("[data-clear-selection]"); await click("[data-select-filtered]");
  const beforeClearThree = (await f.request("/api/artworks")).artworks;
  await open(); await set("[data-batch-mode]", "individual-clear"); await preview();
  assert.equal(await evaluate("document.querySelector('[data-batch-confirm]').textContent"), "Effacer les 3 durées");
  assert.equal(await evaluate("document.querySelector('[data-batch-confirm]').classList.contains('production-batch-clear')"), true);
  assert.equal(await evaluate("document.querySelector('[data-batch-time-fields]').hidden && ['hours','minutes','kind','strategy'].every(key=>document.querySelector('[data-batch-'+key+']').disabled)"), true);
  await checkLayout(".production-batch-dialog"); await screenshot("artwork-clear-desktop");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot("artwork-clear-mobile"); await commit(); await navigateArtwork();
  const stripTime = value => { const next = { ...value }; delete next.productionTime; return next; };
  assert.deepEqual((await f.request("/api/artworks")).artworks, beforeClearThree.map(stripTime));
  await click("[data-select-filtered]"); await open();
  assert.equal(await evaluate("document.querySelector('[data-batch-confirm]').disabled"), true);
  const noAutoWrite = await f.sourceNow(); await set("[data-batch-hours]", "1"); await preview();
  assert.equal(await f.sourceNow(), noAutoWrite, "Automatic recap never persists a duration"); await commit();
  await navigateArtwork(); assert.ok((await f.request("/api/artworks")).artworks.every(a=>a.productionTime.minutes===60));
  await click("[data-select-filtered]"); await open(); await set("[data-batch-mode]", "group-create"); await set("[data-batch-name]", "Protected clear group"); await set("[data-batch-hours]", "8"); await preview(); await commit();
  for (let i = 0; i < 2; i++) {
    const bytes = await sharp({ create: { width: 48+i, height: 35, channels: 3, background: { r: 70+i*40, g: 100, b: 180 } } }).jpeg().toBuffer();
    await f.request("/api/artworks", "POST", { category: "illustrations", date: "04-04-2026", fileName: `untimed-${i}.jpg`, dataBase64: bytes.toString("base64") });
  }
  await navigateArtwork(); await click("[data-select-filtered]");
  const mixedBefore = await f.request("/api/artworks"), mixedBytes = await Promise.all(mixedBefore.artworks.map(a=>readFile(path.join(f.root,"public",a.image))));
  assert.equal(mixedBefore.artworks.length, 5);
  await open(); await set("[data-batch-mode]", "individual-clear"); await preview();
  assert.match(await evaluate("document.querySelector('[data-batch-preview]').textContent"), /effacées : 3 · ignorées : 2/);
  await commit(); await navigateArtwork();
  const mixedAfter = await f.request("/api/artworks"); assert.deepEqual(mixedAfter.artworks, mixedBefore.artworks.map(stripTime));
  assert.deepEqual(mixedAfter.artworkProductionGroups, mixedBefore.artworkProductionGroups);
  for (const [i, artwork] of mixedAfter.artworks.entries()) assert.deepEqual(await readFile(path.join(f.root,"public",artwork.image)),mixedBytes[i]);
  await click("[data-select-filtered]"); await open(); await set("[data-batch-mode]", "individual-clear");
  await until("document.querySelector('[data-batch-preview]').textContent.includes('aucune durée de réalisation à effacer')");
  const noOpSource = await f.sourceNow(), noOpBackups = await readdir(path.join(f.runtime,"backups"));
  assert.equal(await evaluate("document.querySelector('[data-batch-confirm]').disabled"), true);
  await click("[data-batch-confirm]"); await close(); assert.equal(await f.sourceNow(), noOpSource);
  assert.deepEqual(await readdir(path.join(f.runtime,"backups")),noOpBackups);
  await click("[data-manage-groups]"); await groupButton("Supprimer"); await preview(); await commit();
  await click("[data-select-filtered]"); await open(); await set("[data-batch-mode]", "group-create"); await set("[data-batch-hours]", "3"); await preview();
  const external = (await f.sourceNow()) + "\n"; await writeFile(f.catalog, external);
  await click("[data-batch-confirm]"); await until("!document.querySelector('[data-batch-error]').hidden && !document.querySelector('.production-batch-dialog').inert");
  assert.equal(await f.sourceNow(), external); assert.equal(await evaluate("document.querySelector('[data-batch-hours]').value"), "3"); await close();

  await navigateManga();
  await click('.manga-page[data-index="0"] input[data-production-key]'); await click('.manga-page[data-index="1"] input[data-production-key]');
  await evaluate("[...document.querySelectorAll('.language-tab')].find(b=>b.textContent.startsWith('Fran')).click()");
  await click('.manga-page[data-index="0"] input[data-production-key]'); assert.match(await count(), /^3 .*2 dessin/);
  await open(); await set("[data-batch-hours]", "4"); await set("[data-batch-kind]", "estimated"); await preview(); await commit();
  let m = await f.manga(); assert.equal(m.productionTime.pages.filter(p => p.time).length, 2); assert.equal(m.productionTime.total.minutes, 9000);
  assert.equal(getProductionDrawing(m, f.pages.french[0]).time.minutes, 240);
  await open(); await set("[data-batch-mode]", "group-create"); await set("[data-batch-hours]", "10"); await set("[data-batch-name]", "Manga scene"); await preview();
  await checkLayout(".production-batch-dialog"); await commit();
  m = await f.manga(); assert.equal(m.productionTime.groups[0].pageIds.length, 2); assert.equal(m.productionTime.groups[0].time.minutes, 600);
  assert.equal(m.productionTime.total.minutes, 9000); assert.ok(m.productionTime.pages.filter(p=>p.time).every(p=>p.time.minutes===240));
  const group = structuredClone(m.productionTime.groups[0]);
  await checkLayout("#manga-production-selection");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Emulation.setTouchEmulationEnabled", { enabled: true });
  await evaluate("document.querySelector('#manga-production-selection').scrollIntoView({block:'end'})");
  await screenshot("manga-selection-mobile");
  const touch = await evaluate("(()=>{const el=document.querySelector('.manga-page[data-index=\"1\"] .production-select');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await command("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch] });
  await command("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.equal(await evaluate("document.querySelector('.manga-page[data-index=\"1\"] input[data-production-key]').checked"), true, JSON.stringify({ touch, hit: await evaluate(`document.elementFromPoint(${touch.x},${touch.y})?.outerHTML`), grid: await evaluate("JSON.stringify(document.querySelector('#page-grid').getBoundingClientRect())") }));
  await click("[data-manage-groups]"); assert.match(await evaluate("document.querySelector('[data-batch-groups]').textContent"), /Manga scene/); await close();
  await evaluate("[...document.querySelectorAll('.language-tab')].find(b=>b.textContent.startsWith('English')).click()");
  await click('.manga-page[data-index="0"] [data-action="down"]');
  await click("#manga-form button[type=submit]"); await until("!document.querySelector('#manga-dialog').inert");
  assert.deepEqual((await f.manga()).productionTime.groups[0], group);
  await navigateManga(); await click("[data-manage-groups]"); await groupButton("Modifier"); await set("[data-batch-hours]", "12"); await preview(); await commit();
  assert.equal((await f.manga()).productionTime.groups[0].time.minutes, 720);
  await click('.manga-page input[data-production-key]'); await navigateManga(1);
  assert.equal(await evaluate("new URLSearchParams(location.search).get('id')"), "other");
  assert.match(await count(), /^0 /);
  assert.equal((await f.service.readCatalog())[1].productionTime, undefined);

  await f.edit("page", { path: f.pages.english[2], time: { minutes: 45, kind: "actual" } });
  await navigateManga();
  await click('.manga-page[data-index="0"] input[data-production-key]'); await click('.manga-page[data-index="1"] input[data-production-key]');
  await evaluate("[...document.querySelectorAll('.language-tab')].find(b=>b.textContent.startsWith('Fran')).click()");
  await click('.manga-page[data-index="0"] input[data-production-key]'); await click('.manga-page[data-index="1"] input[data-production-key]');
  const mangaClearBefore = await f.manga(); await open(); await set("[data-batch-mode]", "individual-clear"); await preview();
  const mangaClearText = await evaluate("document.querySelector('[data-batch-preview]').textContent");
  assert.match(mangaClearText,/4 .*3 dessin/); assert.match(mangaClearText,/effacées : 2 · ignorées : 1/);
  await checkLayout(".production-batch-dialog"); await commit(); await navigateManga();
  const mangaClearAfter = await f.manga(), mangaExpected = structuredClone(mangaClearBefore);
  for (const p of mangaExpected.productionTime.pages) if ([getProductionDrawing(mangaClearBefore,f.pages.english[0]).id,getProductionDrawing(mangaClearBefore,f.pages.english[1]).id].includes(p.id)) delete p.time;
  assert.deepEqual(mangaClearAfter,mangaExpected);
  assert.equal(mangaClearAfter.productionTime.total.minutes,9000);
  assert.equal(getProductionDrawing(mangaClearAfter,f.pages.english[2]).time.minutes,45);

  // Controlled transport around the real read-only preview endpoint: responses
  // can deliberately arrive late/out of order. Commit requests are simulated
  // and rejected, so this portion cannot write even to the fixture catalog.
  await navigateArtwork(); const raceSource = await f.sourceNow();
  await evaluate(`(async()=>{
    const {mountProductionBatch}=await import('/production-batch-ui.js');
    const data=await (await fetch('/api/artworks')).json();
    const root=document.createElement('section');root.id='async-preview-controls';document.body.append(root);
    const h=window.batchTransportTest={calls:[],applied:0,items:data.artworks.map(a=>({key:a.id,logicalKey:a.id,label:a.image.split('/').at(-1),time:a.productionTime}))};
    h.visible=h.items.slice(0,3).map(a=>a.key);
    h.controller=mountProductionBatch({container:root,memberField:'artworkIds',getItems:()=>h.items,getVisible:()=>h.visible,getGroups:()=>data.artworkProductionGroups,getRevision:()=>data.catalogRevision,scope:()=> 'transport-test',canOperate:()=>true,notice:()=>{},applyResult:async()=>{h.applied++},
      request:(step,intent)=>new Promise((resolve,reject)=>{const call={step,intent,resolve,reject,ready:false};h.calls.push(call);
        if(step==='commit'){call.ready=true;return;}
        fetch('/api/artworks/production-batch/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)})
          .then(async response=>({ok:response.ok,body:await response.json()})).then(result=>{if(!result.ok){reject(new Error(result.body.error));return;}call.response=result.body;call.ready=true;}).catch(reject);
      })});
    h.dialog=[...document.querySelectorAll('.production-batch-dialog')].at(-1);h.dialog.id='async-preview-dialog';
    for(const item of h.items)root.append(h.controller.checkbox(item));
  })()`);
  const asyncDialog = "#async-preview-dialog";
  const callReady = async n => until(`window.batchTransportTest.calls[${n}]?.ready===true`);
  const deliver = n => evaluate(`window.batchTransportTest.calls[${n}].resolve(window.batchTransportTest.calls[${n}].response)`);
  const readyRecap = () => until("!document.querySelector('#async-preview-dialog [data-batch-confirm]').disabled");
  await click("#async-preview-controls [data-select-filtered]"); await click("#async-preview-controls [data-edit-selection]");
  assert.match(await evaluate("document.querySelector('#async-preview-dialog [data-batch-preview]').textContent"),/Renseignez une durée valide/);
  await pause(350); assert.equal(await evaluate("window.batchTransportTest.calls.length"),0);
  await set(`${asyncDialog} [data-batch-hours]`,"1"); await callReady(0);
  assert.equal(await evaluate("document.querySelector('#async-preview-dialog [data-batch-confirm]').disabled && !document.querySelector('#async-preview-dialog').inert"),true);
  await set(`${asyncDialog} [data-batch-hours]`,"2"); await callReady(1); await deliver(1); await readyRecap();
  assert.match(await evaluate("document.querySelector('#async-preview-dialog [data-batch-preview]').textContent"),/2 h 00/);
  await deliver(0); await pause();
  assert.match(await evaluate("document.querySelector('#async-preview-dialog [data-batch-preview]').textContent"),/2 h 00/);
  await set(`${asyncDialog} [data-batch-minutes]`,"15");
  assert.equal(await evaluate("document.querySelector('#async-preview-dialog [data-batch-confirm]').disabled"),true);
  await set(`${asyncDialog} [data-batch-kind]`,"estimated"); await set(`${asyncDialog} [data-batch-strategy]`,"replace");
  await callReady(2); assert.equal(await evaluate("window.batchTransportTest.calls.length"),3,"Debounce coalesces multiple edits");
  await deliver(2); await readyRecap();
  assert.match(await evaluate("document.querySelector('#async-preview-dialog [data-batch-preview]').textContent"),/2 h 15 — estimé/);
  await set(`${asyncDialog} [data-batch-hours]`,"-1"); await pause(350);
  assert.equal(await evaluate("document.querySelector('#async-preview-dialog [data-batch-confirm]').disabled"),true);
  assert.equal(await evaluate("window.batchTransportTest.calls.length"),3,"Invalid data makes no API request");
  await set(`${asyncDialog} [data-batch-hours]`,"3"); await callReady(3); await click(`${asyncDialog} [data-batch-close]`); await deliver(3); await pause();
  await click("#async-preview-controls [data-edit-selection]");
  assert.equal(await evaluate("document.querySelector('#async-preview-dialog [data-batch-confirm]').disabled"),true,"A late response cannot reactivate a reopened dialog");
  await set(`${asyncDialog} [data-batch-mode]`,"group-create"); await set(`${asyncDialog} [data-batch-hours]`,"5"); await set(`${asyncDialog} [data-batch-name]`,"Transport group"); await callReady(4); await deliver(4); await readyRecap();
  assert.match(await evaluate("document.querySelector('#async-preview-dialog [data-batch-preview]').textContent"),/Transport group.*5 h 00.*AU TOTAL/);
  await set(`${asyncDialog} [data-batch-name]`,"Updated group"); await callReady(5); await deliver(5); await readyRecap();
  assert.match(await evaluate("document.querySelector('#async-preview-dialog [data-batch-preview]').textContent"),/Updated group/);
  await set(`${asyncDialog} [data-batch-mode]`,"individual-clear"); await callReady(6); await deliver(6);
  await until("document.querySelector('#async-preview-dialog [data-batch-preview]').textContent.includes('aucune durée de réalisation à effacer')");
  assert.equal(await evaluate("document.querySelector('#async-preview-dialog [data-batch-confirm]').disabled"),true);
  await evaluate("window.batchTransportTest.visible=window.batchTransportTest.items.slice(0,2).map(a=>a.key)");
  await click("#async-preview-controls [data-clear-selection]"); await click("#async-preview-controls [data-select-filtered]");
  await callReady(7); await deliver(7);
  await until("document.querySelector('#async-preview-dialog [data-batch-preview]').textContent.includes('2 élément(s)/fichier(s)')");
  await set(`${asyncDialog} [data-batch-mode]`,"individual"); await callReady(8);
  await evaluate("window.batchTransportTest.calls[8].reject(new Error('HTTP 500 — simulated preview failure'))");
  await until("!document.querySelector('#async-preview-dialog [data-batch-error]').hidden");
  assert.equal(await evaluate("document.querySelector('#async-preview-dialog [data-batch-confirm]').disabled"),true);
  assert.equal(await evaluate("document.querySelector('#async-preview-dialog [data-batch-hours]').value"),"5");
  await click(`${asyncDialog} [data-batch-preview-button]`); await callReady(9); await deliver(9); await readyRecap();
  await set(`${asyncDialog} [data-batch-hours]`,"6"); await callReady(10);
  await evaluate("window.batchTransportTest.calls[10].reject(new Error('HTTP 409 — simulated catalog conflict: reload the catalog'))");
  await until("document.querySelector('#async-preview-dialog [data-batch-error]').textContent.includes('409')");
  assert.equal(await evaluate("document.querySelector('#async-preview-dialog [data-batch-confirm]').disabled"),true);
  await click(`${asyncDialog} [data-batch-preview-button]`); await callReady(11); await deliver(11); await readyRecap();
  await evaluate("(()=>{const form=document.querySelector('#async-preview-dialog form');form.requestSubmit();form.requestSubmit()})()");
  await callReady(12);
  assert.equal(await evaluate("window.batchTransportTest.calls.filter(c=>c.step==='commit').length"),1,"Double submission is guarded");
  await evaluate("window.batchTransportTest.calls[12].reject(new Error('Simulated commit failure; no catalog write'))");
  await until("!document.querySelector('#async-preview-dialog').inert");
  assert.equal(await evaluate("window.batchTransportTest.applied"),0);
  await click(`${asyncDialog} [data-batch-close]`);
  assert.equal(await f.sourceNow(),raceSource,"Every controlled preview is read-only");

  for (const [relative, bytes] of f.media) assert.deepEqual(await readFile(path.join(f.root, "public", relative)), bytes);
  assert.deepEqual(await readFile(path.join(f.root, "public", f.artwork.image)), f.buffer);
  assert.deepEqual(await readFile(path.join(f.root, "public", third.image)), thirdBytes);
  assert.deepEqual(errors, []);
  console.log("Isolated Chrome Phase 3: automatic server recap (no mandatory preview click), debounce/out-of-order/late/error/conflict/double-submit guards; Artwork A/B/C, clear 3 and mixed 5/3/2, no-op, group protection/reload; Manga linked deduplication/A/B/C, preserved total/groups/IDs/bindings/unselected times, touch/keyboard/Escape, 375/390/768/1024/1440/1920, original media intact OK.");
} finally { socket?.close(); await stopChild(browser); await f.close(); }
