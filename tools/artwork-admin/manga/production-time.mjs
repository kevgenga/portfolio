import { randomUUID } from "node:crypto";
import { validateProductionTime } from "../../../src/utils/productionTime.js";
import { prepareProductionBatch, validateProductionGroups } from "../production-groups.mjs";

const check = (condition, message) => { if (!condition) throw new Error(message); };
function object(value, keys, label) {
  check(value && typeof value === "object" && !Array.isArray(value), `${label} invalide.`);
  check(Reflect.ownKeys(value).every(key => keys.includes(key)), `Champ inconnu dans ${label}.`);
}
function pageLanguage(manga, path) {
  check(typeof path === "string" && !path.includes("\\") && !path.split("/").some(part => part === ".." || part === "." || part.includes("\0")), "Chemin de dessin invalide.");
  const matches = Object.entries(manga.languages).flatMap(([code, language]) => language.pages.filter(page => page === path).map(() => code));
  check(matches.length === 1, "Page absente ou chemin ambigu : aucune durée ne peut être attribuée.");
  return matches[0];
}
export function validateMangaProductionTime(manga) {
  if (!Object.hasOwn(manga, "productionTime")) return;
  const p = manga.productionTime;
  object(p, ["total", "pages", "bindings", "groups"], "productionTime Manga");
  if (Object.hasOwn(p, "total")) validateProductionTime(p.total);
  check(p.pages === undefined || Array.isArray(p.pages), "Dessins de production invalides.");
  check(p.bindings === undefined || Array.isArray(p.bindings), "Associations de production invalides.");
  const ids = new Set(), paths = new Set(), languages = new Set();
  for (const page of p.pages || []) {
    object(page, ["id", "time"], "dessin de production");
    check(typeof page.id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(page.id) && !ids.has(page.id), "Identifiant de dessin invalide ou dupliqué.");
    ids.add(page.id);
    if (Object.hasOwn(page, "time")) validateProductionTime(page.time);
  }
  for (const binding of p.bindings || []) {
    object(binding, ["path", "pageId"], "association de dessin");
    check(ids.has(binding.pageId) && !paths.has(binding.path), "Association inconnue ou chemin dupliqué.");
    const key = `${binding.pageId}:${pageLanguage(manga, binding.path)}`;
    check(!languages.has(key), "Un dessin ne peut pas être associé à deux pages de la même langue. Désassociez d’abord la correspondance incorrecte.");
    languages.add(key); paths.add(binding.path);
  }
  if (p.groups !== undefined) validateProductionGroups(p.groups, "pageIds", ids);
  check(Object.hasOwn(p, "total") || (p.pages || []).length > 0, "Métadonnées de production vides.");
}
export function getProductionDrawing(manga, path) {
  const binding = manga.productionTime?.bindings?.find(item => item.path === path);
  return manga.productionTime?.pages?.find(page => page.id === binding?.pageId);
}
export function ensureDrawing(manga, path) {
  pageLanguage(manga, path);
  let page = getProductionDrawing(manga, path);
  if (page) return page;
  const p = manga.productionTime ||= {};
  p.pages ||= []; p.bindings ||= [];
  page = { id: `drawing-${randomUUID()}` };
  p.pages.push(page); p.bindings.push({ path, pageId: page.id });
  return page;
}
function cleanup(manga) {
  const p = manga.productionTime;
  if (!p) return;
  if (!p.bindings?.length) delete p.bindings;
  // Unbound timed drawings are retained as history, never silently discarded.
  if (p.pages) { p.pages = p.pages.filter(page => page.time || p.bindings?.some(binding => binding.pageId === page.id) || p.groups?.some(group => group.pageIds.includes(page.id))); if (!p.pages.length) delete p.pages; }
  if (!Object.keys(p).length) delete manga.productionTime;
}
export function setProjectTime(manga, payload) {
  if (!Object.hasOwn(payload, "total")) return;
  if (payload.total === null) { if (manga.productionTime) delete manga.productionTime.total; }
  else (manga.productionTime ||= {}).total = validateProductionTime(payload.total);
  cleanup(manga);
}
export function setPageTime(manga, payload) {
  pageLanguage(manga, payload.path);
  if (!Object.hasOwn(payload, "time")) return;
  if (payload.time === null) { const page = getProductionDrawing(manga, payload.path); if (page) delete page.time; }
  else { const time = validateProductionTime(payload.time); ensureDrawing(manga, payload.path).time = time; }
  cleanup(manga);
}
export function associateDrawings(manga, payload) {
  check(pageLanguage(manga, payload.path) !== pageLanguage(manga, payload.targetPath), "Choisissez une page d’une autre langue.");
  const source = ensureDrawing(manga, payload.path), target = ensureDrawing(manga, payload.targetPath);
  if (source.id === target.id) return;
  const affectedGroups = manga.productionTime.groups?.some(group => group.pageIds.includes(source.id) || group.pageIds.includes(target.id));
  check(!affectedGroups || payload.confirmGroups === true, "Des groupes utilisent ces dessins. Confirmez leur mise à jour et la déduplication des membres, sans changement des durées collectives.");
  const different = source.time && target.time && (source.time.minutes !== target.time.minutes || source.time.kind !== target.time.kind);
  check(!different || ["source", "target"].includes(payload.resolution), "Les durées diffèrent. Choisissez explicitement la durée source ou cible ; l’autre sera conservée dans l’historique.");
  if (different && payload.resolution === "target") {
    manga.productionTime.pages.push({ id: `drawing-${randomUUID()}`, time: { ...source.time } });
    source.time = { ...target.time };
  } else if (!source.time && target.time) source.time = { ...target.time };
  for (const binding of manga.productionTime.bindings) if (binding.pageId === target.id) binding.pageId = source.id;
  for (const group of manga.productionTime.groups || []) group.pageIds = [...new Set(group.pageIds.map(id => id === target.id ? source.id : id))];
  cleanup(manga); validateMangaProductionTime(manga);
}
export function dissociateDrawing(manga, payload) {
  pageLanguage(manga, payload.path);
  const drawing = getProductionDrawing(manga, payload.path);
  check(drawing && manga.productionTime.bindings.filter(binding => binding.pageId === drawing.id).length > 1, "Cette page ne possède aucune association multilingue à retirer.");
  check(["copy", "empty"].includes(payload.mode), "Choisissez de conserver la durée sur la page séparée ou de la laisser non renseignée.");
  const page = { id: `drawing-${randomUUID()}` };
  if (payload.mode === "copy" && drawing.time) page.time = { ...drawing.time };
  manga.productionTime.pages.push(page);
  manga.productionTime.bindings.find(binding => binding.path === payload.path).pageId = page.id;
}
export function forgetProductionPaths(manga, paths) {
  if (manga.productionTime?.bindings) manga.productionTime.bindings = manga.productionTime.bindings.filter(binding => !paths.includes(binding.path));
  cleanup(manga);
}
export function moveProductionPath(manga, previous, next) {
  const binding = manga.productionTime?.bindings?.find(item => item.path === previous); if (binding) binding.path = next;
}
export function duplicateProductionDrawing(manga, previous, next) {
  if (getProductionDrawing(manga, previous)) ensureDrawing(manga, next);
}
export function replaceProductionDrawing(manga, previous, next, identity) {
  if (!getProductionDrawing(manga, previous)) return;
  check(["keep", "new"].includes(identity), "Choisissez de conserver l’identité du dessin ou de créer un nouveau dessin sans durée.");
  if (identity === "keep") moveProductionPath(manga, previous, next);
  else { forgetProductionPaths(manga, [previous]); ensureDrawing(manga, next); }
}

export function prepareMangaProductionBatch(manga, payload, revision) {
  const clearing = payload.operation === "individual-clear";
  const current = manga.productionTime?.groups?.find(group => group.id === payload.groupId);
  const selection = payload.operation === "group-delete" ? [] : payload.selection ?? current?.pageIds.map(pageId => ({ pageId }));
  check(Array.isArray(selection), "Sélection de dessins invalide.");
  const selectedIds = [], uniqueFiles = new Set();
  for (const item of selection) {
    object(item, ["path", "pageId"], "élément sélectionné");
    let page;
    if (item.path !== undefined) {
      pageLanguage(manga, item.path);
      check(!uniqueFiles.has(item.path), "Un fichier est sélectionné deux fois."); uniqueFiles.add(item.path);
      page = getProductionDrawing(manga, item.path);
      if (item.pageId !== undefined) check(page?.id === item.pageId, "L’identité du dessin a changé. Actualisez.");
      if (!clearing) page ||= ensureDrawing(manga, item.path);
    } else {
      page = manga.productionTime?.pages?.find(page => page.id === item.pageId);
      check(page, "Dessin logique introuvable dans ce manga.");
      check(!uniqueFiles.has(item.pageId), "Dessin sélectionné deux fois."); uniqueFiles.add(item.pageId);
    }
    // Untimed, untracked files still count as distinct selected drawings, but
    // clearing never creates a persistent identity or a linguistic binding.
    selectedIds.push(page?.id || `untracked:${item.path}`);
  }
  const p = clearing ? manga.productionTime || {} : manga.productionTime ||= {};
  const groups = clearing ? p.groups || [] : p.groups ||= [];
  const byId = new Map((p.pages || []).map(page => [page.id, page]));
  const plan = prepareProductionBatch({ groups, selectedIds, selectionCount: selection.length, field: "pageIds", payload, revision,
    readTime: id => byId.get(id)?.time, setTime: (id, time) => { byId.get(id).time = time; }, clearTime: id => { delete byId.get(id).time; } });
  // Do not prune even untimed historical drawings: this action removes time
  // only, never IDs, bindings, groups, group members or the manual total.
  if (clearing) { validateMangaProductionTime(manga); return plan; }
  if (!groups.length) delete p.groups;
  cleanup(manga); validateMangaProductionTime(manga);
  return plan;
}
