const IMAGE_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif" };

export async function handleMangaRoute(request, response, url, { service, readJson, sendJson }) {
  if (request.method === "GET" && url.pathname === "/api/mangas") {
    sendJson(response, 200, await service.report()); return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/manga-image/")) {
    const asset = await service.readAsset(decodeURIComponent(url.pathname.slice("/api/manga-image/".length)));
    response.writeHead(200, { "Content-Type": IMAGE_TYPES[asset.extension] || "application/octet-stream", "Content-Length": asset.content.length, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" });
    response.end(asset.content); return true;
  }
  if (request.method === "POST" && url.pathname === "/api/mangas") {
    const output = await service.create(await readJson(request)); sendJson(response, 201, { ...output, message: "Manga créé avec succès." }); return true;
  }
  const base = url.pathname.match(/^\/api\/mangas\/([^/]+)$/);
  if (base && request.method === "PUT") {
    const output = await service.update(decodeURIComponent(base[1]), await readJson(request)); sendJson(response, 200, { ...output, message: "Manga enregistré." }); return true;
  }
  if (base && request.method === "DELETE") {
    const output = await service.removeManga(decodeURIComponent(base[1]), (await readJson(request)).confirmation); sendJson(response, 200, { ...output, message: "Manga déplacé dans la corbeille." }); return true;
  }
  const language = url.pathname.match(/^\/api\/mangas\/([^/]+)\/languages(?:\/([^/]+))?$/);
  if (language && request.method === "POST" && !language[2]) {
    const output = await service.addLanguage(decodeURIComponent(language[1]), await readJson(request)); sendJson(response, 201, { ...output, message: "Langue ajoutée." }); return true;
  }
  if (language && request.method === "DELETE" && language[2]) {
    const output = await service.deleteLanguage(decodeURIComponent(language[1]), decodeURIComponent(language[2])); sendJson(response, 200, { ...output, message: "Langue déplacée dans la corbeille." }); return true;
  }
  const pages = url.pathname.match(/^\/api\/mangas\/([^/]+)\/languages\/([^/]+)\/pages$/);
  if (pages && request.method === "POST") {
    const output = await service.addPages(decodeURIComponent(pages[1]), decodeURIComponent(pages[2]), await readJson(request)); sendJson(response, 201, { ...output, message: "Pages ajoutées." }); return true;
  }
  if (pages && request.method === "PUT") {
    const output = await service.reorderPages(decodeURIComponent(pages[1]), decodeURIComponent(pages[2]), (await readJson(request)).pages); sendJson(response, 200, { ...output, message: "Ordre des pages enregistré." }); return true;
  }
  const page = url.pathname.match(/^\/api\/mangas\/([^/]+)\/languages\/([^/]+)\/pages\/(\d+)$/);
  if (page && request.method === "PUT") {
    const output = await service.replacePage(decodeURIComponent(page[1]), decodeURIComponent(page[2]), Number(page[3]), await readJson(request)); sendJson(response, 200, { ...output, message: "Page remplacée ; ancienne image placée dans la corbeille." }); return true;
  }
  if (page && request.method === "DELETE") {
    const output = await service.deletePage(decodeURIComponent(page[1]), decodeURIComponent(page[2]), Number(page[3])); sendJson(response, 200, { ...output, message: "Page déplacée dans la corbeille." }); return true;
  }
  const media = url.pathname.match(/^\/api\/mangas\/([^/]+)\/media\/(cover|banner|thumbnail|presentation)$/);
  if (media && request.method === "PUT") {
    const output = await service.replaceMedia(decodeURIComponent(media[1]), media[2], await readJson(request)); sendJson(response, 200, { ...output, message: "Média manga remplacé." }); return true;
  }
  const primaryMedia = url.pathname.match(/^\/api\/mangas\/([^/]+)\/media\/primary$/);
  if (primaryMedia && request.method === "PUT") {
    const output = await service.replacePrimaryMedia(decodeURIComponent(primaryMedia[1]), await readJson(request)); sendJson(response, 200, { ...output, message: "Image principale de la carte manga remplacée." }); return true;
  }
  const reveal = url.pathname.match(/^\/api\/mangas\/([^/]+)\/reveal$/);
  if (reveal && request.method === "POST") {
    const result = await service.reveal(decodeURIComponent(reveal[1]), await readJson(request)); sendJson(response, 200, { ok: true, mode: result.mode, message: result.mode === "opened-folder" ? "Dossier ouvert sans sélection automatique." : "Explorateur ouvert avec demande de sélection.", ...(result.warning ? { warning: result.warning } : {}), ...(result.simulated ? { simulation: result } : {}) }); return true;
  }
  return false;
}
