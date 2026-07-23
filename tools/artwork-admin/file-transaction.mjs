import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

export class FileTransaction {
  #rollbacks = [];

  async move(source, destination) {
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(source, destination);
    this.#rollbacks.push(async () => {
      await mkdir(path.dirname(source), { recursive: true });
      await rename(destination, source);
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
