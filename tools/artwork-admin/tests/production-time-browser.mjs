// Actual isolated Chrome + fixture API, never the user's browser or artistic catalog.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createProductionFixture, pause, stopChild } from "./production-time-fixture.mjs";

const fixture = await createProductionFixture();
const chrome = process.env.PRODUCTION_TIME_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
let browser;
let socket;
const errors = [];
const writes = [];
try {
  await fixture.start();
  const profile = path.join(fixture.temporary, "chrome-profile");
  browser = spawn(chrome, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--window-size=1440,1100",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", `--user-data-dir=${profile}`, fixture.base],
  { windowsHide: true, stdio: "ignore" });
  browser.on("error", error => errors.push(error.message));
  let port;
  for (let i = 0; i < 200 && !port; i++) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); }
    catch { await pause(); }
  }
  assert.ok(port, `Chrome unavailable: ${errors.join("; ")}. Set PRODUCTION_TIME_TEST_CHROME to its executable.`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const pending = new Map();
  let id = 0;
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
    pending.set(key, response => { clearTimeout(timer); response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  socket.addEventListener("message", event => {
    const response = JSON.parse(event.data);
    if (pending.has(response.id)) { pending.get(response.id)(response); pending.delete(response.id); }
    if (response.method === "Runtime.exceptionThrown") errors.push(response.params.exceptionDetails.text);
    if (response.method === "Network.requestWillBeSent" && response.params.request.method !== "GET") writes.push(response.params.request.url);
    if (response.method === "Page.javascriptDialogOpening") command("Page.handleJavaScriptDialog", { accept: true }).catch(error => errors.push(error.message));
  });
  await command("Page.enable"); await command("Runtime.enable"); await command("Network.enable");
  const evaluate = async expression => {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 160; i++) { if (await evaluate(expression)) return; await pause(); }
    assert.fail(`Browser condition failed: ${expression}; ${JSON.stringify(await evaluate("document.querySelector('#toast')?.textContent"))}`);
  };
  const current = async () => (await fixture.request("/api/artworks")).artworks.find(e => e.id === "sample");
  const expectTime = async value => {
    for (let i = 0; i < 100; i++) { if (JSON.stringify((await current()).productionTime) === JSON.stringify(value)) return; await pause(); }
    assert.deepEqual((await current()).productionTime, value);
  };
  await until("document.querySelectorAll('.art-card').length === 1");
  const quick = ".quick-editor .production-time-fields";
  const advanced = "#edit-production-time .production-time-fields";
  const fields = async selector => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});return {hours:el.querySelector('[data-time-hours]').value, minutes:el.querySelector('[data-time-minutes]').value,kind:el.querySelector('[data-time-kind]').value,clearHidden:el.querySelector('.production-time-clear').hidden}})()`);
  const input = async (selector, h, m, k) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});for(const [key,value] of ${JSON.stringify([["hours", h], ["minutes", m], ["kind", k]])}){const control=el.querySelector('[data-time-'+key+']');control.value=value;control.dispatchEvent(new Event(key==='kind'?'change':'input',{bubbles:true}));}return true;})()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const waitIdle = selector => until(`!document.querySelector(${JSON.stringify(selector)}).querySelector('.production-time-save').disabled`);
  await click(".art-card .card-button");
  assert.deepEqual(await fields(quick), { hours: "", minutes: "", kind: "actual", clearHidden: true });
  const emptyWrites = writes.length;
  await click(`${quick} .production-time-save`);
  assert.equal(writes.length, emptyWrites);
  await input(quick, "2", "30", "estimated");
  // The ordinary metadata Save cannot silently discard an unsaved time.
  await click(".quick-actions .button-primary");
  assert.equal(writes.length, emptyWrites);
  assert.equal((await current()).productionTime, undefined);
  await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(quick + " .production-time-save")});button.click();button.click()})()`);
  await expectTime({ minutes: 150, kind: "estimated" }); await waitIdle(quick);
  assert.equal(writes.length, emptyWrites + 1, "Double click submits once");
  // Hide/reopen and reload retain the exact saved value.
  await click(".art-card .card-button"); await click(".art-card .card-button");
  assert.deepEqual(await fields(quick), { hours: "2", minutes: "30", kind: "estimated", clearHidden: false });
  await command("Page.navigate", { url: fixture.base });
  await until("document.querySelector('.quick-editor [data-time-hours]')?.value === '2'");
  await click(".art-card .card-button");
  await click(".art-card .card-button:nth-of-type(2)");
  await until("document.querySelector('#edit-dialog')?.open === true");
  assert.deepEqual(await fields(advanced), { hours: "2", minutes: "30", kind: "estimated", clearHidden: false });
  await input(advanced, "3", "15", "estimated");
  await click(`${advanced} .production-time-save`);
  await expectTime({ minutes: 195, kind: "estimated" }); await waitIdle(advanced);
  await input(advanced, "3", "15", "actual");
  await click(`${advanced} .production-time-save`);
  await expectTime({ minutes: 195, kind: "actual" }); await waitIdle(advanced);
  assert.deepEqual(await fields(quick), { hours: "3", minutes: "15", kind: "actual", clearHidden: false });
  // Invalid / zero values cannot erase a saved time and never issue a request.
  for (const [h, m] of [["0", "0"], ["1", "60"]]) {
    const before = writes.length;
    await input(advanced, h, m, "actual");
    await click(`${advanced} .production-time-save`);
    await until(`${JSON.stringify(advanced)} && document.querySelector(${JSON.stringify(advanced)}).querySelector('.production-time-status').classList.contains('is-error')`);
    assert.equal(writes.length, before);
    assert.deepEqual((await current()).productionTime, { minutes: 195, kind: "actual" });
  }
  // Blank fields preserve the minutes; changing only the kind is possible.
  await input(advanced, "", "", "estimated");
  await click(`${advanced} .production-time-save`);
  await expectTime({ minutes: 195, kind: "estimated" }); await waitIdle(advanced);
  assert.equal((await fields(advanced)).hours, "3");
  // No horizontal overflow, properly associated labels, keyboard save.
  for (const width of [375, 768, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    // Scope layout assertions to the new fields. The existing module navigation
    // has a 4px overflow at 375px; it is intentionally outside this feature's scope.
    const layout = await evaluate("[...document.querySelectorAll('#edit-production-time, #edit-production-time *')].filter(el=>el.getBoundingClientRect().width).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1})");
    assert.equal(layout, true, `Production time fields overflow at ${width}px`);
    assert.equal(await evaluate("[...document.querySelectorAll('#edit-production-time input, #edit-production-time select')].every(el=>el.labels.length>0)"), true);
  }
  // Save only the duration while another advanced metadata field contains a draft.
  await evaluate("document.querySelector('#edit-form [name=alt]').value='Unsaved alt draft'");
  await input(advanced, "3", "15", "actual");
  await evaluate(`document.querySelector(${JSON.stringify(advanced)}).querySelector('[data-time-hours]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
  await expectTime({ minutes: 195, kind: "actual" }); await waitIdle(advanced);
  assert.equal(await evaluate("document.querySelector('#edit-form [name=alt]').value"), "Unsaved alt draft");
  assert.equal((await current()).alt, fixture.artwork.alt);
  await click("#edit-dialog [data-close-dialog]");
  await until("!document.querySelector('#edit-dialog').open");
  if (await evaluate("document.querySelector('.quick-editor').hidden")) await click(".art-card .card-button");
  assert.deepEqual(await fields(quick), { hours: "3", minutes: "15", kind: "actual", clearHidden: false });
  await click(`${quick} .production-time-clear`);
  await expectTime(undefined); await waitIdle(quick);
  assert.deepEqual(await fields(quick), { hours: "", minutes: "", kind: "actual", clearHidden: true });
  const untouched = { ...await current() }; delete untouched.visibility; delete untouched.sizeBytes;
  assert.deepEqual(untouched, fixture.artwork);
  assert.deepEqual(await readFile(path.join(fixture.root, "public", fixture.artwork.image)), fixture.buffer);
  await input(quick, "1", "15", "actual");
  await evaluate(`document.querySelector(${JSON.stringify(quick + " .production-time-save")}).focus()`);
  assert.equal(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(quick + " .production-time-save")})`), true);
  assert.equal(await evaluate(`document.activeElement.matches(':disabled')`), false);
  await command("Page.bringToFront");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await expectTime({ minutes: 75, kind: "actual" }); await waitIdle(quick);
  await click(`${quick} .production-time-clear`);
  await expectTime(undefined); await waitIdle(quick);
  // An external source edit is reported without clearing the user's draft.
  const externalSource = (await fixture.sourceNow()) + "\n";
  await input(quick, "1", "15", "actual");
  await writeFile(fixture.catalog, externalSource);
  await click(`${quick} .production-time-save`);
  await until(`document.querySelector(${JSON.stringify(quick)}).querySelector('.production-time-status').classList.contains('is-error')`);
  await waitIdle(quick);
  assert.equal((await fields(quick)).hours, "1");
  assert.equal((await fields(quick)).minutes, "15");
  assert.equal(await fixture.sourceNow(), externalSource);
  assert.equal((await current()).productionTime, undefined);
  await command("Page.navigate", { url: fixture.base });
  await until("document.querySelector('.quick-editor [data-time-hours]')?.value === ''");
  await click(".art-card .card-button");
  assert.ok(writes.every(url => /\/production-time$|\/replacements\/sessions$|\/(?:replacements|import)\/sessions\/[^/]+$/.test(url)), JSON.stringify(writes));
  assert.deepEqual(errors, []);
  if (process.env.PRODUCTION_TIME_TEST_SCREENSHOT) {
    await evaluate("document.querySelector('.quick-editor').scrollIntoView({block:'center',behavior:'instant'})");
    const screenshot = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(path.resolve(process.env.PRODUCTION_TIME_TEST_SCREENSHOT), Buffer.from(screenshot.data, "base64"));
  }
  console.log("Isolated Chrome: quick/advanced sync, 2h30, reload, 3h15, kind-only, invalid/zero/empty values, explicit clear, keyboard, labels, new fields at 375/768/1440 and unchanged media/metadata OK. Existing module navigation overflows 4px at 375px (not changed).");
} finally {
  if (socket) socket.close();
  await stopChild(browser);
  await fixture.close();
}
