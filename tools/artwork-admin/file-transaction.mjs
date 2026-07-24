import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

async function ensureDestinationDoesNotExist(destination) {
  try {
    await lstat(destination);
    const error = new Error(`La destination existe déjà : ${destination}`);
    error.code = "EEXIST";
    throw error;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export class FileTransaction {
  #rollbacks = [];
  #rename;

  constructor({ renameImpl = rename } = {}) {
    this.#rename = renameImpl;
  }

  async move(source, destination) {
    await mkdir(path.dirname(destination), { recursive: true });
    await ensureDestinationDoesNotExist(destination);
    await this.#rename(source, destination);
    this.#rollbacks.push(async () => {
      await mkdir(path.dirname(source), { recursive: true });
      await ensureDestinationDoesNotExist(source);
      await this.#rename(destination, source);
    });
  }

  async writeExclusive(destination, content) {
    await mkdir(path.dirname(destination), { recursive: true });
    const handle = await open(destination, "wx");
    try {
      await handle.writeFile(content);
    } finally {
      await handle.close();
    }
    this.#rollbacks.push(() => rm(destination, { force: true }));
  }

  commit() {
    this.#rollbacks = [];
  }

  async rollback() {
    const errors = [];
    for (const rollback of [...this.#rollbacks].reverse()) {
      try {
        await rollback();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#rollbacks = [];
    if (errors.length) throw new AggregateError(errors, "Le rollback des fichiers n’a pas pu être terminé.");
  }
}
