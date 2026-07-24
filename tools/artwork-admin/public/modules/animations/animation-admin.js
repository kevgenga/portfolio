import { formatAnimationAdminDate, formatAnimationDisplayDate, parseAnimationDate } from "./date-utils.js";
import { usesCustomAlternativeText } from "./alt-utils.js";
import { mountMediaAudit } from "../../media-audit-ui.js";

const state = {
  animations: [], report: null, currentId: null, dirty: false, toastTimer: null, replacementKind: null,
  previewUrls: new Set(), createExistingMedia: null, createExistingPoster: null, replacementExisting: null,
};
const $ = (selector) => document.querySelector(selector);
const editorDialog = $("#animation-dialog");
const editorForm = $("#animation-form");
const createDialog = $("#create-animation-dialog");
const createForm = $("#create-animation-form");
const replaceDialog = $("#replace-animation-dialog");
const replaceForm = $("#replace-animation-form");
const toast = $("#animation-toast");
let mediaAuditController;
if (typeof toast.showPopover !== "function") toast.removeAttribute("popover");
const categoryLabels = { "court-métrage": "Short Film", "animation 2d": "2D Animation", "animation 3d": "3D Animation" };

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: options.body ? { "Content-Type": "application/json" } : undefined });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erreur HTTP ${response.status}`);
  return body;
}
function hideToast() {
  if (typeof toast.hidePopover === "function" && toast.matches(":popover-open")) toast.hidePopover();
  toast.hidden = true;
}
function message(text, type = "success") {
  clearTimeout(state.toastTimer);
  toast.textContent = text;
  toast.className = `toast ${type === "error" ? "error" : type === "warning" ? "warning" : ""}`;
  const isBlocking = type === "error" || type === "warning";
  toast.setAttribute("role", isBlocking ? "alert" : "status");
  toast.setAttribute("aria-live", isBlocking ? "assertive" : "polite");
  toast.hidden = false;
  if (typeof toast.showPopover === "function" && !toast.matches(":popover-open")) toast.showPopover();
  state.toastTimer = setTimeout(hideToast, 6000);
}
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value ?? ""); return node.innerHTML; }
function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / 1024 / 1024).toFixed(2)} Mo`;
}
function mediaKind(name) {
  const extension = String(name || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if ([".mp4", ".webm"].includes(extension)) return "video";
  if (extension === ".gif") return "gif";
  return [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(extension) ? "image" : "unknown";
}
function assetUrl(relative) { return relative ? `/api/animation-asset/${encodeURIComponent(relative)}` : ""; }
function portfolioUrl() { return "http://127.0.0.1:5173/portfolio/animation"; }
function currentAnimation() { return state.animations.find((entry) => entry.id === state.currentId); }
function displayTitle(entry) { return entry.title || entry.alt || entry.id; }
function setDirty(value = true) { state.dirty = value; $("#animation-dialog-title").textContent = `${value ? "• " : ""}Modifier l’animation`; }
function setAltMode(form, prefix, custom) {
  const checkbox = form.elements.customizeAlt; const input = form.elements.alt; const field = $(`#${prefix}-alt-field`); const help = $(`#${prefix}-alt-help`);
  checkbox.checked = custom; field.hidden = !custom; help.hidden = custom; input.disabled = !custom; input.required = custom;
  if (!custom) input.value = form.elements.title.value.trim();
}
function rememberPreviewUrl(url) { state.previewUrls.add(url); return url; }
function clearPreviewUrls() { for (const url of state.previewUrls) URL.revokeObjectURL(url); state.previewUrls.clear(); }
async function filePayload(file) {
  const dataBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); });
  return { fileName: file.name, lastModified: file.lastModified, dataBase64 };
}
function mediaMarkup(url, kind, alt = "") {
  return kind === "video"
    ? `<video src="${url}" controls preload="metadata" aria-label="${escapeHtml(alt)}"></video>`
    : `<img src="${url}" alt="${escapeHtml(alt)}" />`;
}
function detailsMarkup(details) {
  if (!details) return "<p>Aucun fichier distinct.</p>";
  return `<dl class="asset-facts"><div><dt>Chemin</dt><dd>${escapeHtml(details.path)}</dd></div><div><dt>Fichier</dt><dd>${escapeHtml(details.name)}</dd></div><div><dt>Format</dt><dd>${escapeHtml((details.extension || "—").replace(".", "").toUpperCase())}</dd></div><div><dt>Type</dt><dd>${escapeHtml(details.kind || "—")}</dd></div><div><dt>Dimensions</dt><dd>${details.width && details.height ? `${details.width} × ${details.height} px` : "Détectées par le lecteur si disponibles"}</dd></div><div><dt>Durée</dt><dd>Non stockée dans le catalogue</dd></div><div><dt>Poids</dt><dd>${formatBytes(details.size)}</dd></div><div><dt>SHA-256</dt><dd>${escapeHtml(details.hash || "—")}</dd></div><div><dt>Statut</dt><dd>${details.missing ? "Fichier manquant" : "Présent"}</dd></div></dl>`;
}
function existingReferenceMarkup(reference) {
  return `<span class="queue-status existing">Fichier existant à référencer</span>${mediaMarkup(assetUrl(reference.path), reference.kind, reference.name)}<dl class="asset-facts"><div><dt>Chemin actuel</dt><dd>${escapeHtml(reference.path)}</dd></div><div><dt>Fichier</dt><dd>${escapeHtml(reference.name)}</dd></div><div><dt>Format</dt><dd>${escapeHtml(reference.format)}</dd></div><div><dt>Poids</dt><dd>${formatBytes(reference.size)}</dd></div><div><dt>Dimensions</dt><dd>${reference.width && reference.height ? `${reference.width} × ${reference.height} px` : "Lues par le navigateur si disponibles"}</dd></div><div><dt>SHA-256</dt><dd>${escapeHtml(reference.hash)}</dd></div></dl><p class="muted-copy">Ce fichier est déjà présent dans les assets et sera référencé sans copie, déplacement ni renommage.</p>`;
}
async function prepareExistingReference(item) {
  const output = await api("/api/animations/existing-references", {
    method: "POST",
    body: JSON.stringify({ path: item.path, source: "media-audit", mode: "reference-existing" }),
  });
  return output.preparation;
}
async function discardExistingReference(reference) {
  if (!reference?.token) return;
  await api(`/api/animations/existing-references/${encodeURIComponent(reference.token)}`, { method: "DELETE" }).catch(() => undefined);
}
function renderCreateExistingReferences() {
  const mediaContainer = $("#create-existing-media-review");
  const posterContainer = $("#create-existing-poster-review");
  mediaContainer.hidden = !state.createExistingMedia;
  mediaContainer.innerHTML = state.createExistingMedia ? existingReferenceMarkup(state.createExistingMedia) : "";
  posterContainer.hidden = !state.createExistingPoster;
  posterContainer.innerHTML = state.createExistingPoster ? existingReferenceMarkup(state.createExistingPoster) : "";
  createForm.elements.media.required = !state.createExistingMedia;
  createForm.elements.compressPoster.disabled = Boolean(state.createExistingPoster);
  if (state.createExistingPoster) createForm.elements.compressPoster.checked = false;
}
function renderCardPreview(entry) {
  const relative = entry.effectivePoster;
  if (!relative || entry.mediaDetails?.missing) return `<div class="animation-card-preview"><span>Média manquant</span><span class="animation-type-mark">${escapeHtml(entry.mediaKind)}</span></div>`;
  return `<div class="animation-card-preview"><img src="${assetUrl(relative)}" alt="" loading="lazy" /><span class="animation-type-mark">${escapeHtml(entry.mediaKind)}</span></div>`;
}
function renderList() {
  const search = $("#animation-search").value.trim().toLowerCase(); const category = $("#animation-category").value; const type = $("#animation-type").value; const sort = $("#animation-sort").value;
  let items = state.animations.filter((entry) => {
    const haystack = `${entry.id} ${entry.title} ${entry.alt} ${entry.mediaDetails?.name || ""}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!category || entry.category === category) && (!type || entry.mediaKind === type);
  });
  items = [...items].sort((left, right) => {
    if (sort === "catalog") return left.position - right.position;
    if (sort === "title-asc" || sort === "title-desc") { const result = displayTitle(left).localeCompare(displayTitle(right), "fr", { sensitivity: "base" }); return sort === "title-asc" ? result : -result; }
    const leftDate = parseAnimationDate(left.date)?.getTime(); const rightDate = parseAnimationDate(right.date)?.getTime();
    if (!Number.isFinite(leftDate)) return 1; if (!Number.isFinite(rightDate)) return -1;
    return sort === "oldest" ? leftDate - rightDate : rightDate - leftDate;
  });
  $("#animation-count").textContent = `${items.length} animation(s) sur ${state.animations.length}`;
  $("#animation-grid").replaceChildren(...items.map((entry) => {
    const card = document.createElement("article"); card.className = "animation-card";
    card.innerHTML = `${renderCardPreview(entry)}<div class="animation-card-body"><div><h2 title="${escapeHtml(displayTitle(entry))}">${escapeHtml(displayTitle(entry))}</h2><span class="muted-copy">${escapeHtml(entry.id)} · position ${entry.position}</span></div><dl class="animation-card-meta"><div><dt>Date</dt><dd>${escapeHtml(formatAnimationDisplayDate(entry.date) || "Date invalide")}</dd></div><div><dt>Catégorie</dt><dd>${escapeHtml(categoryLabels[entry.category] || entry.category)}</dd></div><div><dt>Fichier</dt><dd title="${escapeHtml(entry.mediaDetails?.name || "")}">${escapeHtml(entry.mediaDetails?.name || "—")}</dd></div><div><dt>Poids</dt><dd>${formatBytes(entry.mediaDetails?.size)}</dd></div><div><dt>Dimensions</dt><dd>${entry.mediaDetails?.width ? `${entry.mediaDetails.width} × ${entry.mediaDetails.height}` : "—"}</dd></div><div><dt>Durée</dt><dd>${entry.duration || "—"}</dd></div></dl><div class="animation-presence"><span class="presence-status ${entry.mediaDetails?.missing ? "is-missing" : ""}">Média ${entry.mediaDetails?.missing ? "manquant" : "présent"}</span><span class="presence-status ${entry.mediaKind === "video" && (!entry.poster || entry.posterDetails?.missing) ? "is-missing" : ""}">Poster ${entry.poster ? entry.posterDetails?.missing ? "manquant" : "présent" : entry.mediaKind === "video" ? "manquant" : "non requis"}</span></div><div class="animation-card-actions"><button class="button button-primary" type="button" data-edit>Modifier</button><button class="button button-secondary" type="button" data-preview>Prévisualiser</button><button class="button button-secondary" type="button" data-reveal-media>Explorateur média</button><button class="button button-secondary" type="button" data-reveal-poster ${entry.poster ? "" : "disabled"}>Explorateur poster</button><button class="button button-danger" type="button" data-delete>Supprimer</button></div></div>`;
    card.querySelector("[data-edit]").onclick = () => openEditor(entry.id);
    card.querySelector("[data-preview]").onclick = () => window.open(portfolioUrl(), "_blank", "noopener");
    card.querySelector("[data-reveal-media]").onclick = () => reveal(entry.id, "media");
    card.querySelector("[data-reveal-poster]").onclick = () => reveal(entry.id, "poster");
    card.querySelector("[data-delete]").onclick = () => deleteAnimation(entry);
    return card;
  }));
}
async function load() {
  state.report = await api("/api/animations"); state.animations = state.report.animations;
  const categoryOptions = `<option value="">Toutes les catégories</option>${state.report.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabels[category] || category)}</option>`).join("")}`;
  $("#animation-category").innerHTML = categoryOptions;
  for (const form of [editorForm, createForm]) form.elements.category.innerHTML = state.report.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabels[category] || category)}</option>`).join("");
  const report = $("#animation-report"); report.hidden = false;
  report.textContent = `Audit — ${state.report.count} animations · ${state.report.audit.mediaFormats.join(", ")} · posters ${state.report.audit.posterFormats.join(", ") || "aucun"}. ${state.report.issues.length} anomalie(s), ${state.report.unreferenced.length} fichier(s) non référencé(s). Aucune correction automatique.`;
  renderList();
  if (mediaAuditController) mediaAuditController.refresh();
}
function switchEditorTab(name, focus = false) {
  const tabs = [...document.querySelectorAll("[data-animation-tab]")];
  tabs.forEach((tab) => { const active = tab.dataset.animationTab === name; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; if (active && focus) tab.focus(); });
  document.querySelectorAll("[data-animation-panel]").forEach((panel) => { panel.hidden = panel.dataset.animationPanel !== name; });
}
function renderAssetPanel(entry, kind) {
  const isMedia = kind === "media"; const details = isMedia ? entry.mediaDetails : entry.posterDetails; const relative = isMedia ? entry.video : entry.poster; const panel = isMedia ? $("#animation-media-panel") : $("#animation-poster-panel");
  const title = isMedia ? "Média principal" : "Poster";
  panel.innerHTML = `<h3>${title}</h3><div class="asset-admin-panel"><div>${relative && !details?.missing ? `<div class="asset-preview">${mediaMarkup(assetUrl(relative), isMedia ? entry.mediaKind : "image", title)}</div>` : `<div class="empty-asset"><p>${isMedia ? "Média manquant" : entry.mediaKind === "video" ? "Poster manquant — requis pour cette vidéo" : "Aucun poster distinct : le média est utilisé directement"}</p></div>`}</div><div class="asset-details">${detailsMarkup(details)}<div class="asset-actions"><button class="button button-secondary" type="button" data-asset-preview ${relative ? "" : "disabled"}>Aperçu</button><button class="button button-secondary" type="button" data-asset-reveal ${relative ? "" : "disabled"}>Ouvrir dans l’Explorateur</button><button class="button button-primary" type="button" data-asset-replace>${relative ? "Remplacer" : "Ajouter"}</button></div>${isMedia && entry.mediaKind === "video" ? '<p class="muted-copy">Les vidéos sont conservées sans recompression. La durée et les dimensions sont lues par le lecteur HTML5 lorsqu’elles sont disponibles.</p>' : ""}</div></div>`;
  panel.querySelector("[data-asset-preview]").onclick = () => relative && window.open(assetUrl(relative), "_blank", "noopener");
  panel.querySelector("[data-asset-reveal]").onclick = () => reveal(entry.id, kind);
  panel.querySelector("[data-asset-replace]").onclick = () => openReplacement(kind);
}
function openEditor(id) {
  const entry = state.animations.find((item) => item.id === id); state.currentId = id; setDirty(false); switchEditorTab("information");
  for (const field of ["title", "category", "position", "alt"]) editorForm.elements[field].value = entry[field] ?? "";
  editorForm.elements.date.value = formatAnimationAdminDate(entry.date);
  setAltMode(editorForm, "editor", usesCustomAlternativeText(entry.title, entry.alt));
  editorForm.elements.featured.checked = Boolean(entry.featured);
  $("#animation-breadcrumb").textContent = `Animations / ${displayTitle(entry)} / ${entry.id}`;
  renderAssetPanel(entry, "media"); renderAssetPanel(entry, "poster"); if (!editorDialog.open) editorDialog.showModal();
}
async function reloadEditor(success) { const id = state.currentId; await load(); openEditor(id); if (success) message(success); }
function requestEditorClose() { if (state.dirty && !confirm("Abandonner les modifications non enregistrées ?")) return; setDirty(false); editorDialog.close(); }
async function reveal(id, type) {
  try { const result = await api(`/api/animations/${encodeURIComponent(id)}/reveal`, { method: "POST", body: JSON.stringify({ type }) }); message(result.warning || result.message, result.mode === "opened-folder" ? "warning" : "success"); }
  catch (error) { message(error.message, "error"); }
}
async function deleteAnimation(entry = currentAnimation()) {
  const files = [entry.video, entry.poster].filter(Boolean).join("\n"); const confirmation = prompt(`Suppression sécurisée de « ${displayTitle(entry)} ».\n\nFichiers déplacés dans la corbeille :\n${files}\n\nSaisissez le titre ou l’ID :`);
  if (!confirmation) return;
  try { const output = await api(`/api/animations/${encodeURIComponent(entry.id)}`, { method: "DELETE", body: JSON.stringify({ confirmation }) }); if (editorDialog.open) { setDirty(false); editorDialog.close(); } await load(); message(`${output.message} Manifeste : ${output.result.manifest}`); }
  catch (error) { message(error.message, "error"); }
}
async function inspectLocalFile(file) {
  const url = rememberPreviewUrl(URL.createObjectURL(file)); const kind = mediaKind(file.name); let width = null; let height = null; let duration = null;
  if (kind === "video") {
    const video = document.createElement("video"); video.preload = "metadata"; video.src = url;
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error("Vidéo non lisible par le navigateur.")); });
    width = video.videoWidth || null; height = video.videoHeight || null; duration = Number.isFinite(video.duration) ? video.duration : null;
  } else {
    const image = new Image(); image.src = url; await image.decode().catch(() => { throw new Error("Image non lisible par le navigateur."); }); width = image.naturalWidth; height = image.naturalHeight;
  }
  return { file, url, kind, width, height, duration, size: file.size };
}
function uploadPreviewMarkup(info) {
  return `${mediaMarkup(info.url, info.kind, info.file.name)}<dl><div><strong>${escapeHtml(info.file.name)}</strong></div><div>${escapeHtml(info.kind.toUpperCase())} · ${formatBytes(info.size)}</div><div>${info.width && info.height ? `${info.width} × ${info.height} px` : "Dimensions indisponibles"}</div><div>${info.duration ? `${info.duration.toFixed(2)} s` : info.kind === "video" ? "Durée indisponible" : ""}</div></dl>`;
}
async function renderSelectedFile(input, container) {
  const file = input.files[0]; if (!file) { container.hidden = true; container.innerHTML = ""; return null; }
  const info = await inspectLocalFile(file); container.innerHTML = uploadPreviewMarkup(info); container.hidden = false; return info;
}
function compressionPayload(form) {
  return { enabled: form.elements.compressPoster.checked, format: form.elements.posterFormat.value, quality: Number(form.elements.posterQuality.value), maxDimension: form.elements.posterMaxDimension.value || null };
}
function openReplacement(kind, existingReference = null) {
  clearPreviewUrls(); state.replacementKind = kind; state.replacementExisting = existingReference; replaceForm.reset();
  const entry = currentAnimation(); const details = kind === "media" ? entry.mediaDetails : entry.posterDetails; const relative = kind === "media" ? entry.video : entry.poster;
  $("#replace-animation-title").textContent = `${relative ? "Remplacer" : "Ajouter"} ${kind === "media" ? "le média" : "le poster"}`;
  $("#replacement-formats").textContent = kind === "media" ? "MP4, WebM, GIF, JPG, PNG, WebP ou AVIF" : "JPG, PNG, WebP ou AVIF";
  replaceForm.elements.file.accept = kind === "media" ? ".mp4,.webm,.gif,.jpg,.jpeg,.png,.webp,.avif" : ".jpg,.jpeg,.png,.webp,.avif";
  replaceForm.elements.file.required = !existingReference;
  replaceForm.querySelector(".name-strategy").hidden = Boolean(existingReference);
  $("#replacement-compression").hidden = kind !== "poster" || Boolean(existingReference);
  $("#replacement-current").innerHTML = relative && !details?.missing ? `<div class="replacement-current-preview">${mediaMarkup(assetUrl(relative), kind === "media" ? entry.mediaKind : "image", "Fichier actuel")}${detailsMarkup(details)}</div>` : '<div class="empty-asset"><p>Aucun fichier actuel.</p></div>';
  $("#replacement-new").hidden = !existingReference;
  $("#replacement-new").innerHTML = existingReference ? existingReferenceMarkup(existingReference) : "";
  replaceDialog.showModal();
}
async function closeReplacement({ discard = true } = {}) {
  if (discard) await discardExistingReference(state.replacementExisting);
  state.replacementExisting = null;
  clearPreviewUrls();
  replaceDialog.close();
}
async function closeCreate({ discard = true } = {}) {
  if (discard) await Promise.all([discardExistingReference(state.createExistingMedia), discardExistingReference(state.createExistingPoster)]);
  state.createExistingMedia = null;
  state.createExistingPoster = null;
  clearPreviewUrls();
  createForm.reset();
  $("#create-media-preview").hidden = true;
  $("#create-poster-preview").hidden = true;
  renderCreateExistingReferences();
  createDialog.close();
}
async function populateExistingPosterPicker() {
  const report = await mediaAuditController.refresh();
  const posters = report?.unreferenced?.filter((item) => item.type === "poster") || [];
  const picker = $("#create-existing-poster-picker");
  const select = $("#create-existing-poster-select");
  picker.hidden = posters.length === 0;
  select.replaceChildren(...posters.map((item) => {
    const option = document.createElement("option");
    option.value = item.path;
    option.textContent = `${item.name} — ${formatBytes(item.size)}`;
    return option;
  }));
}
async function openCreateDialog() {
  clearPreviewUrls();
  createForm.reset();
  createForm.elements.position.value = state.animations.length + 1;
  setAltMode(createForm, "create", false);
  $("#create-media-preview").hidden = true;
  $("#create-poster-preview").hidden = true;
  renderCreateExistingReferences();
  await populateExistingPosterPicker();
  createDialog.showModal();
}
function configureDropZones() {
  document.querySelectorAll("[data-drop-target]").forEach((zone) => {
    const input = $(`#${zone.dataset.dropTarget}`);
    for (const eventName of ["dragenter", "dragover"]) zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add("is-dragover"); });
    for (const eventName of ["dragleave", "drop"]) zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove("is-dragover"); });
    zone.addEventListener("drop", (event) => { if (!event.dataTransfer.files.length) return; const transfer = new DataTransfer(); transfer.items.add(event.dataTransfer.files[0]); input.files = transfer.files; input.dispatchEvent(new Event("change", { bubbles: true })); });
  });
}

editorForm.addEventListener("input", () => setDirty());
editorForm.onsubmit = async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(editorForm)); data.featured = editorForm.elements.featured.checked; data.useTitleAsAlt = !editorForm.elements.customizeAlt.checked; data.alt = data.useTitleAsAlt ? editorForm.elements.title.value.trim() : editorForm.elements.alt.value.trim();
  try { await api(`/api/animations/${encodeURIComponent(state.currentId)}`, { method: "PUT", body: JSON.stringify(data) }); setDirty(false); editorDialog.close(); await load(); message("Animation enregistrée."); }
  catch (error) { message(error.message, "error"); }
};
document.querySelectorAll("[data-close-editor]").forEach((button) => { button.onclick = requestEditorClose; });
editorDialog.addEventListener("cancel", (event) => { if (state.dirty && !confirm("Abandonner les modifications non enregistrées ?")) event.preventDefault(); else setDirty(false); });
$("#delete-animation").onclick = () => deleteAnimation();

const editorTabs = [...document.querySelectorAll("[data-animation-tab]")];
editorTabs.forEach((tab, index) => {
  tab.onclick = () => switchEditorTab(tab.dataset.animationTab);
  tab.onkeydown = (event) => { let next; if (event.key === "ArrowRight") next = (index + 1) % editorTabs.length; else if (event.key === "ArrowLeft") next = (index - 1 + editorTabs.length) % editorTabs.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = editorTabs.length - 1; else return; event.preventDefault(); switchEditorTab(editorTabs[next].dataset.animationTab, true); };
});

$("#create-animation").onclick = () => openCreateDialog().catch((error) => message(error.message, "error"));
document.querySelectorAll("[data-close-create]").forEach((button) => { button.onclick = () => closeCreate(); });
createDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeCreate(); });
$("#create-media-input").onchange = async (event) => {
  if (event.target.files[0] && state.createExistingMedia) {
    await discardExistingReference(state.createExistingMedia);
    state.createExistingMedia = null;
    renderCreateExistingReferences();
  }
  renderSelectedFile(event.target, $("#create-media-preview")).catch((error) => { event.target.value = ""; message(error.message, "error"); });
};
$("#create-poster-input").onchange = async (event) => {
  if (event.target.files[0] && state.createExistingPoster) {
    await discardExistingReference(state.createExistingPoster);
    state.createExistingPoster = null;
    renderCreateExistingReferences();
  }
  renderSelectedFile(event.target, $("#create-poster-preview")).catch((error) => { event.target.value = ""; message(error.message, "error"); });
};
$("#use-existing-poster").onclick = async () => {
  const selectedPath = $("#create-existing-poster-select").value;
  if (!selectedPath) return;
  await discardExistingReference(state.createExistingPoster);
  state.createExistingPoster = await prepareExistingReference({ path: selectedPath });
  createForm.elements.poster.value = "";
  $("#create-poster-preview").hidden = true;
  renderCreateExistingReferences();
  message("Poster existant préparé sans copie.", "warning");
};
createForm.onsubmit = async (event) => {
  event.preventDefault(); const data = new FormData(createForm); const mediaFile = createForm.elements.media.files[0]; const posterFile = createForm.elements.poster.files[0];
  const effectiveMediaKind = state.createExistingMedia?.kind || mediaKind(mediaFile?.name);
  if (!state.createExistingMedia && !mediaFile) return message("Le média principal est obligatoire.", "warning");
  if (effectiveMediaKind === "video" && !posterFile && !state.createExistingPoster) return message("Un poster est obligatoire pour une vidéo.", "warning");
  const referenceCount = Number(Boolean(state.createExistingMedia)) + Number(Boolean(state.createExistingPoster));
  if (!confirm(`Créer « ${data.get("title")} » ? ${referenceCount ? `${referenceCount} fichier(s) existant(s) seront uniquement référencés, sans copie.` : "Les nouveaux fichiers seront copiés dans les assets Animation."}`)) return;
  const useTitleAsAlt = !createForm.elements.customizeAlt.checked;
  const payload = { title: data.get("title"), date: data.get("date"), category: data.get("category"), alt: useTitleAsAlt ? String(data.get("title")).trim() : createForm.elements.alt.value.trim(), useTitleAsAlt, position: data.get("position"), featured: createForm.elements.featured.checked, media: mediaFile ? await filePayload(mediaFile) : null, mediaReference: state.createExistingMedia ? { token: state.createExistingMedia.token, source: "media-audit", mode: "reference-existing" } : null, poster: posterFile ? await filePayload(posterFile) : null, posterReference: state.createExistingPoster ? { token: state.createExistingPoster.token, source: "media-audit", mode: "reference-existing" } : null, posterCompression: state.createExistingPoster ? { enabled: false } : compressionPayload(createForm) };
  try { const output = await api("/api/animations", { method: "POST", body: JSON.stringify(payload) }); await closeCreate({ discard: false }); await load(); message(`${output.message} Sauvegarde : ${output.backup}`); }
  catch (error) { message(error.message, "error"); }
};

document.querySelectorAll("[data-close-replace]").forEach((button) => { button.onclick = () => closeReplacement(); });
replaceDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeReplacement(); });
$("#replacement-file").onchange = async (event) => {
  if (event.target.files[0] && state.replacementExisting) {
    await discardExistingReference(state.replacementExisting);
    state.replacementExisting = null;
    replaceForm.querySelector(".name-strategy").hidden = false;
    $("#replacement-compression").hidden = state.replacementKind !== "poster";
  }
  renderSelectedFile(event.target, $("#replacement-new")).catch((error) => { event.target.value = ""; message(error.message, "error"); });
};
[...replaceForm.elements.nameMode].forEach((radio) => { radio.onchange = () => { $("#custom-name-field").hidden = replaceForm.elements.nameMode.value !== "custom"; }; });
replaceForm.onsubmit = async (event) => {
  event.preventDefault(); const file = replaceForm.elements.file.files[0]; if (!file && !state.replacementExisting) return;
  const kind = state.replacementKind; const data = new FormData(replaceForm);
  const confirmation = state.replacementExisting
    ? `Référencer ${state.replacementExisting.path} comme ${kind === "media" ? "média" : "poster"} sans déplacer le fichier ?`
    : `Confirmer le remplacement ${kind === "media" ? "du média" : "du poster"} ? L’ancien fichier sera placé dans la corbeille.`;
  if (!confirm(confirmation)) return;
  const payload = state.replacementExisting
    ? { existingReference: { token: state.replacementExisting.token, source: "media-audit", mode: "reference-existing" } }
    : { file: await filePayload(file), nameMode: data.get("nameMode"), customName: data.get("customName"), ...(kind === "poster" ? { compression: compressionPayload(replaceForm) } : {}) };
  try { const output = await api(`/api/animations/${encodeURIComponent(state.currentId)}/${kind}`, { method: "PUT", body: JSON.stringify(payload) }); await closeReplacement({ discard: false }); await reloadEditor(`${output.message} Sauvegarde : ${output.backup}`); }
  catch (error) { message(error.message, "error"); }
};

for (const selector of ["#animation-search", "#animation-category", "#animation-type", "#animation-sort"]) $(selector).addEventListener("input", renderList);
for (const [form, prefix] of [[editorForm, "editor"], [createForm, "create"]]) {
  form.elements.customizeAlt.addEventListener("change", () => setAltMode(form, prefix, form.elements.customizeAlt.checked));
  form.elements.title.addEventListener("input", () => { if (!form.elements.customizeAlt.checked) form.elements.alt.value = form.elements.title.value.trim(); });
}
$("#animation-preview").onclick = () => window.open(portfolioUrl(), "_blank", "noopener");
$("#animation-backup").onclick = async () => { try { const output = await api("/api/animations/backup", { method: "POST", body: JSON.stringify({}) }); message(`${output.message} ${output.backup}`); } catch (error) { message(error.message, "error"); } };
window.addEventListener("beforeunload", (event) => { if (state.dirty) event.preventDefault(); });
configureDropZones();
mediaAuditController = mountMediaAudit({
  module: "animation",
  container: $("#animation-media-audit"),
  notify: message,
  onOpenMissing: (item) => {
    if (!state.animations.some((entry) => entry.id === item.entryId)) return;
    openEditor(item.entryId);
    switchEditorTab(item.role === "poster" ? "poster" : "media");
  },
  onIntegrate: async (item) => {
    if (!state.report) await load();
    const preparation = await prepareExistingReference(item);
    if (item.type === "poster") {
      const target = prompt("ID ou titre de l’animation à laquelle rattacher ce poster :");
      const entry = state.animations.find((candidate) => candidate.id === target || displayTitle(candidate) === target);
      if (!entry) {
        await discardExistingReference(preparation);
        throw new Error("Animation cible introuvable.");
      }
      openEditor(entry.id);
      switchEditorTab("poster");
      openReplacement("poster", preparation);
      message("Poster existant préparé sans copie. Vérifiez puis confirmez.", "warning");
      return;
    }
    await openCreateDialog();
    state.createExistingMedia = preparation;
    createForm.elements.category.value = preparation.suggestedCategory || "animation 2d";
    renderCreateExistingReferences();
    message("Média existant préparé sans copie. Complétez les informations avant enregistrement.", "warning");
  },
});
load().catch((error) => message(error.message, "error"));
