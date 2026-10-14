import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

export const pause = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

export async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exited;
}

export async function createProductionFixture() {
  const temporary = await mkdtemp(path.join(tmpdir(), "kevgenga-production-time-"));
  const root = path.join(temporary, "portfolio");
  const runtime = path.join(temporary, "runtime");
  const catalog = path.join(root, "src/content/artworks.js");
  await mkdir(path.dirname(catalog), { recursive: true });
  for (const category of ["illustrations", "paintings", "sketches", "backgrounds", "character-design"]) {
    await mkdir(path.join(root, "public/assets/illustration", category), { recursive: true });
  }
  const artwork = { id: "sample", title: "Internal title", image: "assets/illustration/illustrations/sample.jpg", thumbnail: "",
    category: ["illustrations"], date: "01-01-2025", year: 2025, alt: "Sample image", featured: false, orientation: "" };
  const other = { ...artwork, id: "other", image: "assets/illustration/sketches/other.jpg", category: ["sketches"] };
  const source = `import { assetPath } from "../utils/assetPath";\nexport const artworks = [\n${[artwork, other].map(entry => JSON.stringify(entry).replace(JSON.stringify(entry.image), `assetPath(${JSON.stringify(entry.image)})`)).join(",\n")}\n];\n`;
  await writeFile(catalog, source);
  await writeFile(path.join(root, "src/content/artworkPresentation.js"), "export const artworkPresentationSettings = Object.freeze({hiddenCategories: Object.freeze([])});\n");
  const buffer = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#541526" } }).jpeg().toBuffer();
  const otherBuffer = await sharp({ create: { width: 42, height: 32, channels: 3, background: "#265415" } }).jpeg().toBuffer();
  await writeFile(path.join(root, "public", artwork.image), buffer);
  await writeFile(path.join(root, "public", other.image), otherBuffer);
  let child;
  let base;
  async function start(extraEnv = {}) {
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    base = `http://127.0.0.1:${port}`;
    const logs = [];
    child = spawn(process.execPath, ["tools/artwork-admin/server.mjs"], {
      cwd: path.resolve(import.meta.dirname, "../../.."), windowsHide: true,
      env: { ...process.env, ARTWORK_ADMIN_NO_OPEN: "1", ARTWORK_ADMIN_DISABLE_REVEAL: "1",
        ARTWORK_ADMIN_TEST_ROOT: root, ARTWORK_ADMIN_TEST_RUNTIME: runtime, ARTWORK_ADMIN_PORT: String(port), ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", data => logs.push(String(data)));
    child.stderr.on("data", data => logs.push(String(data)));
    for (let i = 0; i < 100; i++) {
      try { await request("/api/artworks"); return; }
      catch { if (child.exitCode !== null) throw new Error(logs.join("")); await pause(); }
    }
    throw new Error(`Fixture startup failed: ${logs.join("")}`);
  }
  async function request(url, method = "GET", payload) {
    const response = await fetch(base + url, { method,
      headers: payload === undefined ? {} : { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error), { status: response.status });
    return body;
  }
  return { temporary, root, runtime, catalog, source, artwork, other, buffer, request, start,
    get base() { return base; },
    async restart(env) { await stopChild(child); await start(env); },
    async close() {
      await stopChild(child);
      const resolved = path.resolve(temporary);
      assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
      assert.ok(path.basename(resolved).startsWith("kevgenga-production-time-"));
      await rm(resolved, { recursive: true, force: true });
    },
    async sourceNow() { return readFile(catalog, "utf8"); },
  };
}
