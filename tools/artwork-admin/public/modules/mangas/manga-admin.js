import { analyzeMangaCardMedia, MANGA_CARD_MEDIA } from "./media-policy.js";
import { auditItemAsFile, mountMediaAudit } from "../../media-audit-ui.js";
import { getLanguageDetails, getLanguageDirection, getLanguageLabel, normalizeSupportedLanguageCode, supportedMangaLanguages } from "/shared/language-labels.js";

const state = { mangas: [], report: null, presentationSettings: null, currentId: null, language: null, workingPages: [], savedPages: [], dirty: false, toastTimer: null, createMediaReview: null };
const $ = (selector) => document.querySelector(selector);
const dialog = $("#manga-dialog");
const form = $("#manga-form");
const toast = $("#toast");
let mediaAuditController;
let duplicateRequest = null;
let duplicateSubmitting = false;
let pageReplacementPending = false;
let editorMutationPending = false;
const sectionLabels = {
  completed: "Completed Manga",
  storyboard: "Complete Storyboards",
};
const cardMediaRatio = `${MANGA_CARD_MEDIA.ratioWidth}:${MANGA_CARD_MEDIA.ratioHeight}`;
const mediaDimensions = (width, height) => `${width} × ${height} px`;

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: options.body ? { "Content-Type": "application/json" } : undefined });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erreur HTTP ${response.status}`);
  return body;
}
function message(text, type = "success") {
  clearTimeout(state.toastTimer); toast.textContent = text; toast.className = `toast ${type === "error" ? "error" : type === "warning" ? "warning" : ""}`; toast.hidden = false;
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 5500);
}
function imageUrl(relative) { return relative ? `/api/manga-image/${encodeURIComponent(relative)}` : ""; }
function previewUrl(manga) {
  const adminPreview = manga.presentationSection === "storyboard" ? "?adminPreview=1" : "";
  return `http://127.0.0.1:5173/portfolio${manga.route}${adminPreview}`;
}
function formatBytes(value) { return value ? `${(value / 1024 / 1024).toFixed(2)} Mo` : "—"; }
function currentManga() { return state.mangas.find((manga) => String(manga.id) === String(state.currentId)); }
function languageOption(language) {
  const option = document.createElement("option");
  option.value = language.code; option.textContent = language.label; option.dir = language.dir;
  return option;
}
function closeLanguagePicker() {
  $("#language-picker").hidden = true;
  $("#new-language-code").disabled = true;
  $("#add-language").setAttribute("aria-expanded", "false");
}
function openLanguagePicker() {
  if (!$("#language-picker").hidden) { closeLanguagePicker(); return; }
  const existing = new Set(Object.keys(currentManga().languages).map((code) => getLanguageDetails(code)?.code || code));
  const available = supportedMangaLanguages.filter((language) => !existing.has(language.code));
  if (!available.length) return message("Toutes les langues prises en charge sont déjà présentes.", "warning");
  const select = $("#new-language-code");
  select.disabled = false;
  select.replaceChildren(...available.map((language) => {
    const option = languageOption(language);
    option.textContent = language.adminLabelFr ? `${language.label} — ${language.adminLabelFr}` : language.label;
    return option;
  }));
  select.dir = getLanguageDirection(select.value);
  $("#language-picker").hidden = false;
  $("#add-language").setAttribute("aria-expanded", "true");
  select.focus();
}
function setDirty(value = true) { state.dirty = value; $("#manga-dialog-title").textContent = `${value ? "• " : ""}Modifier le manga`; }
function requireSavedEditor() {
  if (editorMutationPending || pageReplacementPending || duplicateSubmitting) return false;
  if (!state.dirty) return true;
  message("Enregistrez ou annulez les modifications en attente avant cette action.", "warning");
  return false;
}
async function immediateMutation(action, success, language = state.language) {
  if (!requireSavedEditor()) return;
  editorMutationPending = true; dialog.inert = true;
  try { await action(); await reloadEditor(success, language); }
  catch (error) { message(error.message, "error"); }
  finally { editorMutationPending = false; dialog.inert = false; }
}
function switchEditorTab(tabName, focus = false) {
  const tabs = [...document.querySelectorAll("[data-editor-tab]")];
  tabs.forEach((tab) => {
    const active = tab.dataset.editorTab === tabName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  document.querySelectorAll("[data-editor-panel]").forEach((panel) => { panel.hidden = panel.dataset.editorPanel !== tabName; });
}
async function filePayload(file) {
  const dataBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); });
  return { fileName: file.name, lastModified: file.lastModified, dataBase64 };
}

function renderList() {
  const search = $("#manga-search").value.trim().toLowerCase(); const section = $("#manga-section").value; const status = $("#manga-status").value; const language = $("#manga-language").value;
  let items = state.mangas.filter((manga) => (!search || `${manga.title} ${manga.slug}`.toLowerCase().includes(search)) && (!section || manga.presentationSection === section) && (!status || (manga.status || "published") === status) && (!language || manga.languages[language]));
  items = [...items].sort((a, b) => $("#manga-sort").value === "date" ? String(b.date || b.year || "").localeCompare(String(a.date || a.year || "")) : a.title.localeCompare(b.title));
  $("#manga-count").textContent = `${items.length} manga(s)`;
  $("#manga-grid").replaceChildren(...items.map((manga) => {
    const card = document.createElement("article"); card.className = "manga-card";
    const counts = Object.entries(manga.languages).map(([code, item]) => `<bdi dir="${getLanguageDirection(code)}">${escapeHtml(getLanguageLabel(code, item.label))}</bdi> ${item.pageCount}`).join(" · ");
    const temporary = manga.isTemporaryExample ? '<span class="temporary-example">Copie temporaire de test</span>' : "";
    card.innerHTML = `<img src="${imageUrl(manga.primaryMedia.path)}" alt="" /><div class="manga-card-body"><div><h2>${escapeHtml(manga.title)}</h2><span class="manga-card-meta">${escapeHtml(manga.slug)} · ${escapeHtml(manga.status || "published")}</span></div><div class="manga-section-meta"><span>${escapeHtml(sectionLabels[manga.presentationSection] || sectionLabels.completed)}</span>${temporary}</div><div class="language-counts">Défaut : <bdi dir="${getLanguageDirection(manga.defaultLanguage)}">${escapeHtml(getLanguageLabel(manga.defaultLanguage, manga.languages[manga.defaultLanguage]?.label))}</bdi><br>${counts}</div><div class="manga-card-actions"><button class="button button-primary" data-edit>Modifier</button><a class="button button-secondary" href="${previewUrl(manga)}" target="_blank" rel="noopener">Prévisualiser</a></div></div>`;
    card.querySelector("[data-edit]").onclick = () => openEditor(manga.id); return card;
  }));
}
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value ?? ""); return node.innerHTML; }
function mediaReviewMarkup({ url, name, size, width, height, analysis }) {
  return `<figure class="manga-card-preview"><img src="${url}" alt="Aperçu ${cardMediaRatio} de ${escapeHtml(name)}" /><figcaption>Aperçu réel ${cardMediaRatio} avec object-fit: cover</figcaption></figure><dl class="media-facts"><div><dt>Dimensions actuelles</dt><dd>${width} × ${height} px</dd></div><div><dt>Ratio actuel</dt><dd>${(width / height).toFixed(2)}:1</dd></div><div><dt>Poids</dt><dd>${formatBytes(size)}</dd></div><div><dt>Résolution</dt><dd><span class="media-status ${analysis.resolution.level}">${escapeHtml(analysis.resolution.label)}</span></dd></div><div><dt>Ratio</dt><dd><span class="media-status ${analysis.ratioStatus.level}">${escapeHtml(analysis.ratioStatus.label)}</span></dd></div><div><dt>Statut général</dt><dd><span class="media-status ${analysis.level}">${escapeHtml(analysis.label)}</span></dd></div></dl>${analysis.resolution.warning ? `<p class="media-warning">${escapeHtml(analysis.resolution.warning)}</p>` : ""}${analysis.ratioStatus.warning ? `<p class="media-warning">${escapeHtml(analysis.ratioStatus.warning)}</p>` : ""}`;
}
async function inspectLocalMedia(file) {
  const url = URL.createObjectURL(file); const image = new Image(); image.src = url;
  await image.decode().catch(() => { URL.revokeObjectURL(url); throw new Error("Impossible d’analyser cette image."); });
  const details = { url, name: file.name, size: file.size, width: image.naturalWidth, height: image.naturalHeight };
  return { ...details, analysis: analyzeMangaCardMedia(details) };
}
async function reviewReplacementMedia(file) {
  const review = await inspectLocalMedia(file); const reviewDialog = $("#media-review-dialog"); $("#media-review-content").innerHTML = mediaReviewMarkup(review); reviewDialog.showModal();
  return new Promise((resolve) => {
    const finish = (accepted) => { reviewDialog.close(); URL.revokeObjectURL(review.url); resolve(accepted); };
    $("#cancel-media-review").onclick = () => finish(false); $("#accept-media-review").onclick = () => finish(true);
    reviewDialog.oncancel = (event) => { event.preventDefault(); finish(false); };
  });
}

async function load() {
  state.report = await api("/api/mangas"); state.mangas = state.report.mangas;
  const statuses = [...new Set(state.mangas.map((manga) => manga.status || "published"))]; $("#manga-status").innerHTML = `<option value="">Tous</option>${statuses.map((value) => `<option>${escapeHtml(value)}</option>`).join("")}`;
  const languages = [...new Set(state.mangas.flatMap((manga) => Object.keys(manga.languages)))]; $("#manga-language").innerHTML = `<option value="">Toutes</option>${languages.map((value) => `<option value="${escapeHtml(value)}" dir="${getLanguageDirection(value)}">${escapeHtml(getLanguageLabel(value, state.mangas.find((manga) => manga.languages[value])?.languages[value].label))}</option>`).join("")}`;
  const report = $("#manga-report"); report.hidden = false; report.textContent = `Audit — ${state.report.count} mangas (${state.report.sectionCounts.completed} Completed Manga, ${state.report.sectionCounts.storyboard} Complete Storyboards), ${state.report.languageVersions} versions linguistiques, ${state.report.totalPages} pages. ${state.report.issues.length ? state.report.issues.join(" · ") : "Aucune anomalie détectée."}`;
  renderList();
  if (mediaAuditController) mediaAuditController.refresh();
}

function renderPresentationSettings() {
  const visible = Boolean(state.presentationSettings?.showStoryboardSection);
  $("#storyboard-visibility-state").textContent = visible
    ? "Visible sur le portfolio"
    : "Masquée sur le portfolio";
  const button = $("#toggle-storyboard-visibility");
  button.textContent = visible
    ? "Masquer la catégorie Storyboards"
    : "Afficher la catégorie Storyboards";
  button.disabled = false;
}

async function loadPresentationSettings() {
  state.presentationSettings = await api("/api/manga-presentation-settings");
  renderPresentationSettings();
}

$("#toggle-storyboard-visibility").onclick = async () => {
  const currentlyVisible = Boolean(state.presentationSettings?.showStoryboardSection);
  const confirmed = confirm(currentlyVisible
    ? "Masquer toute la section Storyboards & Manga Concepts du portfolio public ? Les mangas, pages et fichiers seront conservés dans Manga Admin."
    : "Afficher de nouveau la section Storyboards & Manga Concepts sur le portfolio public ?");
  if (!confirmed) return;
  const button = $("#toggle-storyboard-visibility");
  button.disabled = true;
  try {
    state.presentationSettings = await api("/api/manga-presentation-settings", {
      method: "PUT",
      body: JSON.stringify({ showStoryboardSection: !currentlyVisible }),
    });
    renderPresentationSettings();
    message(state.presentationSettings.message);
  } catch (error) {
    renderPresentationSettings();
    message(error.message, "error");
  }
};

function openEditor(id) {
  const manga = state.mangas.find((item) => String(item.id) === String(id)); state.currentId = manga.id; state.language = manga.defaultLanguage; setDirty(false);
  for (const field of ["title", "edition", "author", "year", "date", "status", "visibility", "presentationSection", "readingDirection", "genre", "role", "description", "summary", "order", "defaultReadingMode"]) form.elements[field].value = manga[field] ?? (field === "status" ? "published" : field === "visibility" ? "public" : field === "presentationSection" ? "completed" : field === "readingDirection" ? "rtl" : "");
  form.elements.tags.value = (manga.tags || []).join(", ");
  form.elements.featured.checked = Boolean(manga.featured); $("#manga-breadcrumb").textContent = `Mangas / ${manga.title} / ${manga.slug}`;
  renderMedia(); renderLanguages(); switchEditorTab("pages"); if (!dialog.open) dialog.showModal();
}
function renderMedia() {
  const manga = currentManga(); const media = manga.primaryMedia; const info = media.details; const analysis = media.analysis;
  const ratio = info?.width && info?.height ? (info.width / info.height).toFixed(2) : "—";
  const fallbackNote = media.fallback
    ? " Le champ historique cover est utilisé en fallback. Le prochain remplacement créera la banner canonique sans supprimer ce cover."
    : "";
  $("#manga-media").innerHTML = `
    <h3>Image de la carte Manga</h3>
    <section class="primary-media-panel">
      <div class="primary-media-preview-column">
        <p class="eyebrow">IMAGE DE LA CARTE MANGA</p>
        <figure class="manga-card-preview">
          <img src="${imageUrl(media.path)}" alt="Aperçu de la carte manga" />
          <figcaption>Aperçu ${cardMediaRatio} du rendu dans /portfolio/mangaka</figcaption>
        </figure>
        <div class="media-buttons">
          <a class="button button-secondary" href="${imageUrl(media.path)}" target="_blank" rel="noopener">Aperçu</a>
          <button class="button button-secondary" type="button" data-primary-reveal ${media.path ? "" : "disabled"}>Ouvrir dans l’Explorateur</button>
          <button class="button button-primary" type="button" data-primary-replace>Remplacer</button>
        </div>
      </div>
      <div class="primary-media-details">
        <p class="muted-copy">Source exacte utilisée dans la carte publique et les aperçus Manga Admin.${fallbackNote}</p>
        <dl class="media-facts">
          <div><dt>Champ actuel</dt><dd><code>${escapeHtml(media.field)}</code></dd></div>
          <div><dt>Chemin</dt><dd>${escapeHtml(media.path || "Média absent")}</dd></div>
          <div><dt>Dimensions actuelles</dt><dd>${info ? mediaDimensions(info.width, info.height) : "—"}</dd></div>
          <div><dt>Ratio actuel</dt><dd>${ratio}:1</dd></div>
          <div><dt>Poids / format</dt><dd>${info ? `${formatBytes(info.size)} · ${escapeHtml(info.extension)}` : "—"}</dd></div>
          <div><dt>Ratio cible</dt><dd>${cardMediaRatio}</dd></div>
          <div><dt>Taille idéale Photoshop</dt><dd>${mediaDimensions(MANGA_CARD_MEDIA.idealWidth, MANGA_CARD_MEDIA.idealHeight)}</dd></div>
          <div><dt>Haute qualité</dt><dd>${mediaDimensions(MANGA_CARD_MEDIA.highQualityWidth, MANGA_CARD_MEDIA.highQualityHeight)}</dd></div>
          <div><dt>Taille acceptable</dt><dd>${mediaDimensions(MANGA_CARD_MEDIA.acceptableWidth, MANGA_CARD_MEDIA.acceptableHeight)} ou plus</dd></div>
          <div><dt>Minimum recommandé</dt><dd>${mediaDimensions(MANGA_CARD_MEDIA.minimumWidth, MANGA_CARD_MEDIA.minimumHeight)}</dd></div>
          <div><dt>Résolution</dt><dd><span class="media-status ${analysis.resolution.level}">${escapeHtml(analysis.resolution.label)}</span></dd></div>
          <div><dt>Ratio</dt><dd><span class="media-status ${analysis.ratioStatus.level}">${escapeHtml(analysis.ratioStatus.label)}</span></dd></div>
          <div><dt>Statut général</dt><dd><span class="media-status ${analysis.level}">${escapeHtml(analysis.label)}</span></dd></div>
        </dl>
        ${analysis.resolution.warning ? `<p class="media-warning">${escapeHtml(analysis.resolution.warning)}</p>` : ""}
        ${analysis.ratioStatus.warning ? `<p class="media-warning">${escapeHtml(analysis.ratioStatus.warning)}</p>` : ""}
        <p class="media-help">Pour Photoshop, utilisez idéalement ${mediaDimensions(MANGA_CARD_MEDIA.idealWidth, MANGA_CARD_MEDIA.idealHeight)} au ratio ${cardMediaRatio}. La haute qualité correspond à ${mediaDimensions(MANGA_CARD_MEDIA.highQualityWidth, MANGA_CARD_MEDIA.highQualityHeight)}.</p>
        <p class="media-help">L’image utilise <code>object-fit: cover</code>. Gardez les visages, textes et éléments importants dans la zone centrale.</p>
      </div>
    </section>`;
  $("[data-primary-reveal]").onclick = () => reveal({ type: "primary" });
  $("[data-primary-replace]").onclick = () => { if (!requireSavedEditor()) return; chooseFile(async (file) => {
    if (!await reviewReplacementMedia(file)) return;
    await immediateMutation(async () => api(`/api/mangas/${encodeURIComponent(state.currentId)}/media/primary`, { method: "PUT", body: JSON.stringify({ file: await filePayload(file) }) }), "Image de la carte Manga remplacée.");
  }); };
}
function renderLanguages() {
  closeLanguagePicker();
  const manga = currentManga(); $("#language-tabs").replaceChildren(...Object.entries(manga.languages).map(([code, language]) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `language-tab ${state.language === code ? "is-active" : ""}`;
    const label = document.createElement("bdi"); label.dir = getLanguageDirection(code); label.textContent = getLanguageLabel(code, language.label);
    button.append(label, document.createTextNode(` (${language.pageCount})`)); button.onclick = () => { if (code === state.language || !requireSavedEditor()) return; state.language = code; renderLanguages(); }; return button;
  }));
  const language = manga.languages[state.language]; state.workingPages = [...language.pages]; state.savedPages = [...language.pages];
  const languageLabel = getLanguageLabel(state.language, language.label);
  $("#language-summary").innerHTML = `<div class="language-summary-content"><p><strong><bdi dir="${getLanguageDirection(state.language)}">${escapeHtml(languageLabel)}</bdi></strong> · ${language.pageCount} pages ${language.missing.length ? `· ⚠ ${language.missing.length} manquante(s)` : ""}</p><div class="language-actions"><button type="button" id="default-language">Définir par défaut</button><button type="button" id="delete-language">Supprimer la langue</button></div></div>`;
  $("#default-language").disabled = manga.defaultLanguage === state.language; $("#default-language").onclick = () => immediateMutation(() => api(`/api/mangas/${encodeURIComponent(manga.id)}`, { method: "PUT", body: JSON.stringify({ defaultLanguage: state.language }) }), "Langue par défaut modifiée.");
  $("#delete-language").disabled = Object.keys(manga.languages).length === 1 || manga.defaultLanguage === state.language;
  $("#delete-language").onclick = async () => { if (!requireSavedEditor() || !confirm(`Retirer ${languageLabel} ? Ses fichiers non partagés seront déplacés dans la corbeille.`)) return; await immediateMutation(() => api(`/api/mangas/${encodeURIComponent(manga.id)}/languages/${encodeURIComponent(state.language)}`, { method: "DELETE" }), "Langue supprimée.", manga.defaultLanguage); };
  $("#page-position").max = language.pageCount + 1; $("#page-position").value = language.pageCount + 1; renderPages();
}
function renderPages() {
  const manga = currentManga(); const details = new Map(manga.languages[state.language].pageDetails.map((item) => [item.path, item]));
  $("#page-grid").replaceChildren(...state.workingPages.map((page, index) => {
    const info = details.get(page) || { path: page, name: page.split("/").at(-1) }; const card = document.createElement("article"); card.className = "manga-page"; card.draggable = true; card.dataset.index = index;
    card.innerHTML = `<img src="${imageUrl(page)}" alt="Page ${index + 1}" /><strong>Position ${String(index + 1).padStart(2, "0")}</strong><small title="${escapeHtml(info.name)}">${escapeHtml(info.name)}</small><small>${info.width || "?"} × ${info.height || "?"} · ${formatBytes(info.size)}</small><div class="page-actions"><button type="button" data-action="up" title="Monter">↑</button><button type="button" data-action="down" title="Descendre">↓</button><button type="button" data-action="reveal" title="Explorateur">⌕</button><button type="button" data-action="replace" title="Remplacer cette page" aria-label="Remplacer cette page">↻</button><button type="button" data-action="first" title="Début">⇈</button><button type="button" data-action="last" title="Fin">⇊</button><button type="button" data-action="position" title="Position précise">#</button><button type="button" data-action="delete" title="Supprimer">×</button><button type="button" data-action="duplicate" title="Dupliquer cette page" aria-label="Dupliquer cette page">Dupliquer</button></div>`;
    card.ondragstart = () => card.classList.add("is-dragging"); card.ondragend = () => card.classList.remove("is-dragging"); card.ondragover = (event) => event.preventDefault(); card.ondrop = (event) => { event.preventDefault(); const source = Number(document.querySelector(".manga-page.is-dragging")?.dataset.index); if (Number.isInteger(source)) movePage(source, index); };
    card.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-label", `${button.title} — Position ${index + 1}`);
      button.disabled = (["up", "first"].includes(button.dataset.action) && index === 0) || (["down", "last"].includes(button.dataset.action) && index === state.workingPages.length - 1);
      button.onclick = () => pageAction(button.dataset.action, index);
    }); return card;
  }));
}
function openDuplicatePage(index) {
  if (state.dirty) return message("Enregistrez vos modifications avant de dupliquer une page.", "warning");
  const source = state.workingPages[index]; if (!source) return;
  duplicateRequest = { id: state.currentId, language: state.language, index, source };
  $("#duplicate-page-source").textContent = `Source : Position ${String(index + 1).padStart(2, "0")} — ${source.split("/").at(-1)}`;
  const position = $("#duplicate-page-position");
  position.max = state.workingPages.length + 1; position.value = position.max;
  $("#duplicate-page-error").hidden = true;
  $("#duplicate-page-dialog").showModal(); position.focus(); position.select();
}
function closeDuplicatePage() {
  if (duplicateSubmitting) return;
  $("#duplicate-page-dialog").close(); duplicateRequest = null;
}
async function submitDuplicatePage(event) {
  event.preventDefault();
  if (duplicateSubmitting || !duplicateRequest || !$("#duplicate-page-form").reportValidity()) return;
  const request = duplicateRequest;
  duplicateSubmitting = true;
  $("#confirm-duplicate-page").disabled = true; $("#cancel-duplicate-page").disabled = true;
  $("#duplicate-page-error").hidden = true;
  try {
    await api(`/api/mangas/${encodeURIComponent(request.id)}/languages/${encodeURIComponent(request.language)}/pages/${request.index}/duplicate`, {
      method: "POST", body: JSON.stringify({ source: request.source, position: Number($("#duplicate-page-position").value) }),
    });
    $("#duplicate-page-dialog").close(); duplicateRequest = null;
    await reloadEditor(); state.language = request.language; renderLanguages();
    $("#manga-tab-pages").focus(); message("Page dupliquée.");
  } catch (error) {
    if (!$("#duplicate-page-dialog").open) message(error.message, "error");
    else { $("#duplicate-page-error").textContent = error.message; $("#duplicate-page-error").hidden = false; }
  } finally {
    duplicateSubmitting = false;
    $("#confirm-duplicate-page").disabled = false; $("#cancel-duplicate-page").disabled = false;
  }
}
$("#duplicate-page-form").onsubmit = submitDuplicatePage;
$("#cancel-duplicate-page").onclick = closeDuplicatePage;
$("#duplicate-page-dialog").addEventListener("cancel", (event) => {
  if (duplicateSubmitting) event.preventDefault(); else duplicateRequest = null;
});
function movePage(from, to) { if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= state.workingPages.length || from === to || to < 0 || to >= state.workingPages.length) return; const [page] = state.workingPages.splice(from, 1); state.workingPages.splice(to, 0, page); setDirty(); renderPages(); }
async function pageAction(action, index) {
  if (action === "duplicate") return openDuplicatePage(index);
  if (action === "up") return movePage(index, index - 1); if (action === "down") return movePage(index, index + 1); if (action === "first") return movePage(index, 0);
  if (action === "last") return movePage(index, state.workingPages.length - 1);
  if (action === "position") { const position = Number(prompt(`Nouvelle position (1 à ${state.workingPages.length})`, String(index + 1))); if (Number.isInteger(position)) return movePage(index, position - 1); }
  if (action === "reveal") return reveal({ type: "page", language: state.language, index: state.savedPages.indexOf(state.workingPages[index]) });
  if (action === "delete" && requireSavedEditor() && confirm(`Retirer la page ${index + 1} ? Le fichier sera placé dans la corbeille sauf s’il est partagé.`)) return immediateMutation(() => api(`/api/mangas/${encodeURIComponent(state.currentId)}/languages/${encodeURIComponent(state.language)}/pages/${index}`, { method: "DELETE", body: JSON.stringify({ source: state.workingPages[index] }) }), "Page retirée.");
  if (action === "replace") return replacePageImage(index);
}
function replacePageImage(index) {
  if (pageReplacementPending) return;
  if (state.dirty) return message("Enregistrez les modifications en attente avant de remplacer une page.", "warning");
  const request = { id: state.currentId, language: state.language, index, source: state.workingPages[index] };
  if (!request.source) return;
  const stillCurrent = () => !state.dirty && state.currentId === request.id && state.language === request.language && state.workingPages[index] === request.source;
  chooseFile(async (file) => {
    if (pageReplacementPending) return;
    if (!stillCurrent()) return message("La sélection ou les modifications ont changé. Enregistrez et réessayez.", "warning");
    if (!/\.(jpe?g|png|webp|avif|gif)$/i.test(file.name)) return message("Format d’image non autorisé.", "error");
    if (!confirm(`Remplacer Position ${String(index + 1).padStart(2, "0")} — ${request.source.split("/").at(-1)} par ${file.name} ?`)) return;
    pageReplacementPending = true;
    try {
      const upload = await filePayload(file);
      if (!stillCurrent()) return message("La sélection ou les modifications ont changé. Enregistrez et réessayez.", "warning");
      // Keep local edits/selection from changing while the server replaces this page.
      dialog.inert = true;
      await api(`/api/mangas/${encodeURIComponent(request.id)}/languages/${encodeURIComponent(request.language)}/pages/${request.index}`, {
        method: "PUT", body: JSON.stringify({ file: upload, keepName: true, source: request.source }),
      });
      await reloadEditor(); state.language = request.language; renderLanguages();
      message("Page remplacée.");
    } finally { dialog.inert = false; pageReplacementPending = false; }
  });
}
function chooseFile(callback) { const input = document.createElement("input"); input.type = "file"; input.accept = ".jpg,.jpeg,.png,.webp,.avif,.gif"; input.onchange = () => input.files[0] && callback(input.files[0]).catch((error) => message(error.message, "error")); input.click(); }
async function reveal(descriptor) { try { const result = await api(`/api/mangas/${encodeURIComponent(state.currentId)}/reveal`, { method: "POST", body: JSON.stringify(descriptor) }); message(result.warning || result.message, result.mode === "opened-folder" ? "warning" : "success"); } catch (error) { message(error.message, "error"); } }
async function reloadEditor(success, language = state.language) { const id = state.currentId; await load(); openEditor(id); if (currentManga().languages[language]) { state.language = language; renderLanguages(); } if (success) message(success); }

form.addEventListener("input", (event) => { if (event.target.name) setDirty(); });
form.onsubmit = async (event) => {
  event.preventDefault(); if (editorMutationPending || pageReplacementPending || duplicateSubmitting) return;
  const data = Object.fromEntries(new FormData(form)); data.featured = form.elements.featured.checked; data.tags = String(data.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  if (JSON.stringify(state.workingPages) !== JSON.stringify(state.savedPages)) data.pageOrder = { language: state.language, pages: [...state.workingPages], expectedPages: [...state.savedPages] };
  editorMutationPending = true; dialog.inert = true;
  try {
    await api(`/api/mangas/${encodeURIComponent(state.currentId)}`, { method: "PUT", body: JSON.stringify(data) });
    setDirty(false); dialog.close(); await load(); message("Manga et ordre des pages enregistrés.");
  } catch (error) { message(error.message, "error"); }
  finally { editorMutationPending = false; dialog.inert = false; }
};
$("#add-pages").onclick = async () => { const files = [...$("#page-files").files]; if (!files.length) return message("Sélectionnez des pages.", "warning"); if (!$("#page-position").reportValidity()) return; await immediateMutation(async () => { const payloads = await Promise.all(files.map(filePayload)); await api(`/api/mangas/${encodeURIComponent(state.currentId)}/languages/${encodeURIComponent(state.language)}/pages`, { method: "POST", body: JSON.stringify({ files: payloads, position: Number($("#page-position").value) }) }); $("#page-files").value = ""; }, `${files.length} page(s) ajoutée(s).`); };
$("#add-language").onclick = openLanguagePicker;
$("#cancel-add-language").onclick = () => { closeLanguagePicker(); $("#add-language").focus(); };
$("#new-language-code").onchange = (event) => { event.currentTarget.dir = getLanguageDirection(event.currentTarget.value); };
$("#confirm-add-language").onclick = async () => {
  if (!requireSavedEditor()) return;
  const button = $("#confirm-add-language"); if (button.disabled) return;
  button.disabled = true;
  try {
    const code = normalizeSupportedLanguageCode($("#new-language-code").value);
    await immediateMutation(() => api(`/api/mangas/${encodeURIComponent(state.currentId)}/languages`, { method: "POST", body: JSON.stringify({ code }) }), "Langue ajoutée.", code); $("#add-language").focus();
  } catch (error) { message(error.message, "error"); }
  finally { button.disabled = false; }
};
$("#delete-manga").onclick = async () => { if (!requireSavedEditor()) return; const manga = currentManga(); const confirmation = prompt(`Déplacer le manga et son dossier dans la corbeille : saisissez « ${manga.slug} » ou le titre.`); if (!confirmation) return; editorMutationPending = true; dialog.inert = true; try { await api(`/api/mangas/${encodeURIComponent(manga.id)}`, { method: "DELETE", body: JSON.stringify({ confirmation }) }); setDirty(false); dialog.close(); await load(); message("Manga déplacé dans la corbeille."); } catch (error) { message(error.message, "error"); } finally { editorMutationPending = false; dialog.inert = false; } };

function requestClose() { if (pageReplacementPending || editorMutationPending || duplicateSubmitting) return; if (state.dirty && !confirm("Abandonner les modifications non enregistrées ?")) return; state.workingPages = [...state.savedPages]; setDirty(false); dialog.close(); }
document.querySelectorAll("[data-close]").forEach((button) => button.onclick = requestClose); dialog.addEventListener("cancel", (event) => { event.preventDefault(); requestClose(); });
window.addEventListener("beforeunload", (event) => { if (state.dirty) event.preventDefault(); });
for (const selector of ["#manga-search", "#manga-section", "#manga-status", "#manga-language", "#manga-sort"]) $(selector).addEventListener("input", renderList);

const editorTabs = [...document.querySelectorAll("[data-editor-tab]")];
editorTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => switchEditorTab(tab.dataset.editorTab));
  tab.addEventListener("keydown", (event) => {
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % editorTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + editorTabs.length) % editorTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = editorTabs.length - 1;
    else return;
    event.preventDefault();
    switchEditorTab(editorTabs[nextIndex].dataset.editorTab, true);
  });
});

$("#create-manga").onclick = () => $("#create-dialog").showModal(); document.querySelectorAll("[data-close-create]").forEach((button) => button.onclick = () => { if (state.createMediaReview?.url) URL.revokeObjectURL(state.createMediaReview.url); state.createMediaReview = null; $("#create-media-review").hidden = true; $("#create-dialog").close(); });
$("#create-form").elements.languageType.onchange = (event) => { const hidden = event.target.value !== "multilingual"; $("#initial-language-field").hidden = hidden; $("#create-form").elements.languageCode.disabled = hidden; };
$("#create-form").elements.primaryImage.onchange = async (event) => { const file = event.target.files[0]; const container = $("#create-media-review"); if (state.createMediaReview?.url) URL.revokeObjectURL(state.createMediaReview.url); if (!file) { state.createMediaReview = null; container.hidden = true; return; } try { state.createMediaReview = await inspectLocalMedia(file); container.innerHTML = mediaReviewMarkup(state.createMediaReview); container.hidden = false; } catch (error) { message(error.message, "error"); event.target.value = ""; } };
let createPending = false;
$("#create-form").onsubmit = async (event) => {
  event.preventDefault(); if (createPending) return;
  const createForm = event.currentTarget; createPending = true; createForm.inert = true;
  try {
    const data = new FormData(createForm);
    const pages = await Promise.all([...createForm.elements.pages.files].map(filePayload));
    const primaryFile = createForm.elements.primaryImage.files[0];
    const languageType = data.get("languageType");
    const payload = { title: data.get("title"), slug: data.get("slug"), presentationSection: data.get("presentationSection"), languageType, ...(languageType === "multilingual" ? { languageCode: data.get("languageCode") } : {}), summary: data.get("summary"), pages, primaryImage: primaryFile ? await filePayload(primaryFile) : null };
    const risk = state.createMediaReview?.analysis.level === "error" ? "\n\nAttention : la résolution ou le ratio nécessite une correction importante." : "";
    if (!confirm(`Créer « ${payload.title} » dans ${sectionLabels[payload.presentationSection]} avec ${pages.length} page(s) ?${risk}`)) return;
    await api("/api/mangas", { method: "POST", body: JSON.stringify(payload) });
    $("#create-dialog").close(); createForm.reset(); createForm.elements.languageCode.disabled = false; $("#initial-language-field").hidden = false;
    if (state.createMediaReview?.url) URL.revokeObjectURL(state.createMediaReview.url);
    state.createMediaReview = null; $("#create-media-review").hidden = true;
    await load(); message("Manga créé avec transaction complète.");
  } catch (error) { message(error.message, "error"); }
  finally { createPending = false; createForm.inert = false; }
};
$("#create-dialog").addEventListener("cancel", (event) => { if (createPending) event.preventDefault(); });

mediaAuditController = mountMediaAudit({
  module: "manga",
  container: $("#manga-media-audit"),
  notify: message,
  onOpenMissing: (item) => {
    if (!requireSavedEditor()) return;
    if (!state.mangas.some((manga) => String(manga.id) === String(item.entryId))) return;
    openEditor(item.entryId);
    if (item.role === "page" && item.language && currentManga().languages[item.language]) {
      state.language = item.language;
      renderLanguages();
      switchEditorTab("pages");
    } else switchEditorTab("media");
  },
  onIntegrate: async (item) => {
    if (!requireSavedEditor()) return;
    if (!state.report) await load();
    const file = await auditItemAsFile(item);
    let manga = state.mangas.find((candidate) => String(candidate.id) === String(item.mangaId) || candidate.slug === item.mangaSlug);
    if (!manga) {
      const target = prompt("ID, slug ou titre du manga cible :");
      manga = state.mangas.find((candidate) => String(candidate.id) === target || candidate.slug === target || candidate.title === target);
    }
    if (!manga) throw new Error("Manga cible introuvable.");
    openEditor(manga.id);
    if (item.type === "page" || item.type === "orphan-language" || item.type === "page-or-legacy") {
      const language = item.language && manga.languages[item.language] ? item.language : prompt(`Code de langue cible (${Object.keys(manga.languages).join(", ")}) :`, manga.defaultLanguage);
      if (!language || !manga.languages[language]) throw new Error("Langue cible introuvable.");
      state.language = language;
      renderLanguages();
      switchEditorTab("pages");
      const maximum = manga.languages[language].pageCount + 1;
      const position = Number(prompt(`Position d’insertion (1 à ${maximum}) :`, String(maximum)));
      if (!Number.isInteger(position) || position < 1 || position > maximum) throw new Error("Position d’insertion invalide.");
      const transfer = new DataTransfer();
      transfer.items.add(file);
      $("#page-files").files = transfer.files;
      $("#page-position").value = position;
      message("Page préparée dans le workflow existant. Vérifiez la langue et la position, puis cliquez sur « Ajouter les pages ».", "warning");
      return;
    }
    switchEditorTab("media");
    if (!await reviewReplacementMedia(file)) return;
    if (!confirm("Utiliser ce fichier comme image de la carte Manga ? L’ancien média sera déplacé dans la corbeille.")) return;
    await immediateMutation(async () => api(`/api/mangas/${encodeURIComponent(manga.id)}/media/primary`, { method: "PUT", body: JSON.stringify({ file: await filePayload(file) }) }), "Image de la carte Manga intégrée après validation.");
  },
});
document.querySelectorAll("select[name='languageCode']").forEach((select) => {
  select.replaceChildren(...supportedMangaLanguages.filter((language) => language.code !== "orig").map(languageOption));
  select.dir = getLanguageDirection(select.value);
  select.onchange = () => { select.dir = getLanguageDirection(select.value); };
});
Promise.all([load(), loadPresentationSettings()]).catch((error) => message(error.message, "error"));
