import { readFile } from "node:fs/promises";

const escapeAttribute = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

// IDs are catalog identifiers, never filesystem paths. One canonical editor template.
export async function serveMangaEditor(response, url, service, templatePath) {
  let status = 200, error = "", id = url.searchParams.get("id");
  const allowed = new Set(["id", "language", "tab"]);
  if (!id || id.length > 160 || /[/\\]/u.test(id) || [...id].some(character => character.charCodeAt(0) < 32) || [...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) {
    status = 400; error = "URL d’édition invalide : un identifiant de manga est requis.";
  } else {
    const catalog = await service.readCatalog();
    const manga = catalog.find(item => String(item.id) === id);
    if (!manga) { status = 404; error = "Ce manga n’existe plus ou son identifiant est incorrect."; }
    else if ((url.searchParams.has("language") && !Object.hasOwn(manga.languages, url.searchParams.get("language"))) || (url.searchParams.has("tab") && !["information", "pages", "media"].includes(url.searchParams.get("tab")))) {
      status = 400; error = "Langue ou onglet d’édition invalide pour ce manga.";
    }
  }
  const template = await readFile(templatePath, "utf8");
  const content = template.replace('<body>', `<body class="manga-edit-page" data-editor-id="${escapeAttribute(id || "")}" data-editor-error="${escapeAttribute(error)}">`).replace('<main id="manga-editor-shell" hidden>', '<main id="manga-editor-shell">').replace('<main id="manga-dashboard">', '<main id="manga-dashboard" hidden>');
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" });
  response.end(content);
}
