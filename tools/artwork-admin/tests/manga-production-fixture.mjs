import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createProductionFixture } from "./production-time-fixture.mjs";
import { serializeMangaCatalog } from "../manga/catalog.mjs";
import { createMangaService } from "../manga/service.mjs";

export async function createMangaProductionFixture(options = {}) {
  const f = await createProductionFixture();
  const prefix = "assets/mangaka/completed-manga/duration-manga";
  const pages = Object.fromEntries([["english", 3], ["french", 2], ["ja", 1], ["original", 1]].map(([code, count]) => [code, Array.from({ length: count }, (_, i) => `${prefix}/${code}/${String(i + 1).padStart(2, "0")}.jpg`)]));
  const mangas = [{ id: 2, slug: "duration-manga", route: "/mangas/2", title: "Duration Manga", summary: "Original summary", presentationSection: "completed", cover: pages.english[0], defaultLanguage: "english", readingDirection: "rtl",
    languages: Object.fromEntries(Object.entries(pages).map(([code, pages]) => [code, { label: code, shortLabel: code, pages }])) },
  { id: "other", slug: "other", route: "/mangas/other", title: "Other", presentationSection: "completed", cover: "assets/mangaka/completed-manga/other/orig/01.jpg", defaultLanguage: "orig", languages: { orig: { label: "Original", pages: ["assets/mangaka/completed-manga/other/orig/01.jpg"] } } }];
  const media = new Map();
  for (const [i, relative] of [...Object.values(pages).flat(), mangas[1].cover].entries()) {
    const bytes = await sharp({ create: { width: 40 + i, height: 60 + i, channels: 3, background: { r: 20 + i * 20, g: 40, b: 80 } } }).jpeg().toBuffer();
    const file = path.join(f.root, "public", relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); media.set(relative, bytes);
  }
  const catalogPath = path.join(f.root, "src/content/mangas.js");
  await writeFile(catalogPath, serializeMangaCatalog(mangas));
  await writeFile(path.join(f.root, "src/content/mangaPresentation.js"), "export const mangaPresentationSettings = Object.freeze({showStoryboardSection:false});\n");
  const service = createMangaService({ projectRoot: f.root, runtimeRoot: f.runtime, ...options }); await service.initialize();
  const original = await readFile(catalogPath, "utf8");
  const edit = async (action, payload) => service.editProduction(2, action, { catalogRevision: (await service.report()).catalogRevision, ...payload });
  const upload = async (name = "new.jpg", color = "#aabbcc") => ({ fileName: name, dataBase64: (await sharp({ create: { width: 18, height: 27, channels: 3, background: color } }).jpeg().toBuffer()).toString("base64") });
  return { ...f, pages, mangas, catalogPath, original, media, service, edit, upload,
    // Preserve the base getter; spreading an accessor would freeze its initial undefined value.
    get base() { return f.base; },
    async manga() { return (await service.readCatalog())[0]; },
    async currentSource() { return readFile(catalogPath, "utf8"); },
  };
}
