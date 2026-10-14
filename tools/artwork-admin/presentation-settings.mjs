import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Same source-of-truth, backup and atomic-write policy for public section toggles.
export function createPresentationSettingsStore({ file, backupRoot, key, label }) {
  let queue = Promise.resolve();
  const pattern = new RegExp(`(${key}\\s*:\\s*)(true|false)`, "g");
  function fail(message, status) { const error = new Error(message); error.status = status; throw error; }
  function parse(source) {
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) fail(`Configuration de présentation ${label} invalide.`, 500);
    return { [key]: matches[0][2] === "true" };
  }
  async function atomic(source) {
    parse(source);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, source, { flag: "wx" }); await rename(temporary, file); }
    finally { await rm(temporary, { force: true }); }
  }
  async function read() { return parse(await readFile(file, "utf8")); }
  async function write(payload) {
    if (typeof payload?.[key] !== "boolean") fail(`Valeur de visibilité ${label} invalide.`, 400);
    const original = await readFile(file, "utf8"); const current = parse(original);
    if (current[key] === payload[key]) return current;
    const next = original.replace(pattern, (_, prefix) => `${prefix}${payload[key]}`);
    await mkdir(backupRoot, { recursive: true });
    const backup = path.join(backupRoot, `${new Date().toISOString().replaceAll(":", "-")}-presentation-settings-${randomUUID()}.js`);
    await copyFile(file, backup, constants.COPYFILE_EXCL);
    let written = false;
    try {
      await atomic(next); written = true;
      const saved = await read();
      if (saved[key] !== payload[key]) fail(`Configuration ${label} enregistrée incohérente.`, 500);
      return saved;
    } catch (error) { if (written) await atomic(original); throw error; }
  }
  function update(payload) { const result = queue.then(() => write(payload)); queue = result.catch(() => undefined); return result; }
  return { read, update };
}
