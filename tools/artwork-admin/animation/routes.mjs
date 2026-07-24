import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const MIME_TYPES = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif",
};

async function pipeAsset(response, file, options) {
  const stream = createReadStream(file, options);
  const closeStream = () => stream.destroy();
  response.once("close", closeStream);
  try {
    await pipeline(stream, response);
  } catch (error) {
    if (error.code !== "ERR_STREAM_PREMATURE_CLOSE" && error.code !== "ECONNRESET") throw error;
  } finally {
    response.off("close", closeStream);
    stream.destroy();
  }
}

export async function handleAnimationRoute(request, response, url, { service, readJson, sendJson }) {
  if (request.method === "GET" && url.pathname === "/api/animations") {
    sendJson(response, 200, await service.report()); return true;
  }
  if (request.method === "POST" && url.pathname === "/api/animations/existing-references") {
    sendJson(response, 201, {
      preparation: await service.prepareExisting(await readJson(request)),
      message: "Fichier Animation existant préparé sans copie.",
    });
    return true;
  }
  const existingReference = url.pathname.match(/^\/api\/animations\/existing-references\/([^/]+)$/);
  if (existingReference && request.method === "DELETE") {
    service.discardExistingPreparation(decodeURIComponent(existingReference[1]));
    sendJson(response, 200, { message: "Préparation Animation annulée." });
    return true;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/animation-asset/")) {
    const asset = service.resolveAsset(decodeURIComponent(url.pathname.slice("/api/animation-asset/".length)));
    const size = (await stat(asset.file)).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || "");
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) {
        response.writeHead(416, { "Content-Range": `bytes */${size}` }); response.end(); return true;
      }
      response.writeHead(206, {
        "Content-Type": MIME_TYPES[asset.extension] || "application/octet-stream", "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff",
      });
      await pipeAsset(response, asset.file, { start, end }); return true;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[asset.extension] || "application/octet-stream",
      "Content-Length": size,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    });
    await pipeAsset(response, asset.file); return true;
  }
  if (request.method === "POST" && url.pathname === "/api/animations") {
    const output = await service.create(await readJson(request));
    sendJson(response, 201, { ...output, message: "Animation créée avec transaction complète." }); return true;
  }
  if (request.method === "POST" && url.pathname === "/api/animations/backup") {
    sendJson(response, 201, { backup: await service.manualBackup(), message: "Sauvegarde Animation créée." }); return true;
  }
  const base = url.pathname.match(/^\/api\/animations\/([^/]+)$/);
  if (base && request.method === "PUT") {
    const output = await service.update(decodeURIComponent(base[1]), await readJson(request));
    sendJson(response, 200, { ...output, message: "Animation enregistrée." }); return true;
  }
  if (base && request.method === "DELETE") {
    const payload = await readJson(request); const output = await service.remove(decodeURIComponent(base[1]), payload.confirmation);
    sendJson(response, 200, { ...output, message: "Animation déplacée dans la corbeille." }); return true;
  }
  const replace = url.pathname.match(/^\/api\/animations\/([^/]+)\/(media|poster)$/);
  if (replace && request.method === "PUT") {
    const id = decodeURIComponent(replace[1]); const payload = await readJson(request);
    const output = replace[2] === "media" ? await service.replaceMedia(id, payload) : await service.replacePoster(id, payload);
    sendJson(response, 200, { ...output, message: `${replace[2] === "media" ? "Média" : "Poster"} remplacé avec succès.` }); return true;
  }
  const reveal = url.pathname.match(/^\/api\/animations\/([^/]+)\/reveal$/);
  if (reveal && request.method === "POST") {
    const result = await service.reveal(decodeURIComponent(reveal[1]), (await readJson(request)).type);
    sendJson(response, 200, {
      ok: true, mode: result.mode,
      message: result.mode === "opened-folder" ? "Dossier ouvert sans sélection automatique." : "Explorateur ouvert avec demande de sélection.",
      ...(result.warning ? { warning: result.warning } : {}), ...(result.simulated ? { simulation: result } : {}),
    }); return true;
  }
  return false;
}
