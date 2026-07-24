import { analyzeMangaCardMedia } from "./media-policy.js";
import { auditItemAsFile, mountMediaAudit } from "../../media-audit-ui.js";

const state = { mangas: [], report: null, currentId: null, language: null, workingPages: [], savedPages: [], dirty: false, toastTimer: null, createMediaReview: null };
const $ = (selector) => document.querySelector(selector);
const dialog = $("#manga-dialog");
const form = $("#manga-form");
const toast = $("#toast");
let mediaAuditController;
const sectionLabels = {
  completed: "Completed Manga",
  storyboard: "Complete Storyboards",
};

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
function previewUrl(manga) { return `http://127.0.0.1:5173/portfolio${manga.route}`; }
function formatBytes(value) { return value ? `${(value / 1024 / 1024).toFixed(2)} Mo` : "—"; }
function currentManga() { return state.mangas.find((manga) => String(manga.id) === String(state.currentId)); }
function setDirty(value = true) { state.dirty = value; $("#manga-dialog-title").textContent = `${value ? "• " : ""}Modifier le manga`; }
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
    const counts = Object.entries(manga.languages).map(([code, item]) => `${code.toUpperCase()} ${item.pageCount}`).join(" · ");
    const temporary = manga.isTemporaryExample ? '<span class="temporary-example">Copie temporaire de test</span>' : "";
    card.innerHTML = `<img src="${imageUrl(manga.banner || manga.cover)}" alt="" /><div class="manga-card-body"><div><h2>${escapeHtml(manga.title)}</h2><span class="manga-card-meta">${escapeHtml(manga.slug)} · ${escapeHtml(manga.status || "published")}</span></div><div class="manga-section-meta"><span>${escapeHtml(sectionLabels[manga.presentationSection] || sectionLabels.completed)}</span>${temporary}</div><div class="language-counts">Défaut : ${escapeHtml(manga.defaultLanguage)}<br>${escapeHtml(counts)}</div><div class="manga-card-actions"><button class="button button-primary" data-edit>Modifier</button><a class="button button-secondary" href="${previewUrl(manga)}" target="_blank" rel="noopener">Prévisualiser</a></div></div>`;
    card.querySelector("[data-edit]").onclick = () => openEditor(manga.id); return card;
  }));
}
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value ?? ""); return node.innerHTML; }
function mediaReviewMarkup({ url, name, size, width, height, analysis }) {
  return `<figure class="manga-card-preview"><img src="${url}" alt="Aperçu 16:9 de ${escapeHtml(name)}" /><figcaption>Aperçu réel 16:9 avec object-fit: cover</figcaption></figure><dl class="media-facts"><div><dt>Dimensions actuelles</dt><dd>${width} × ${height} px</dd></div><div><dt>Ratio actuel</dt><dd>${(width / height).toFixed(2)}:1</dd></div><div><dt>Poids</dt><dd>${formatBytes(size)}</dd></div><div><dt>Résolution</dt><dd><span class="media-status ${analysis.resolution.level}">${escapeHtml(analysis.resolution.label)}</span></dd></div><div><dt>Ratio</dt><dd><span class="media-status ${analysis.ratioStatus.level}">${escapeHtml(analysis.ratioStatus.label)}</span></dd></div><div><dt>Statut général</dt><dd><span class="media-status ${analysis.level}">${escapeHtml(analysis.label)}</span></dd></div></dl>${analysis.resolution.warning ? `<p class="media-warning">${escapeHtml(analysis.resolution.warning)}</p>` : ""}${analysis.ratioStatus.warning ? `<p class="media-warning">${escapeHtml(analysis.ratioStatus.warning)}</p>` : ""}`;
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
  const languages = [...new Set(state.mangas.flatMap((manga) => Object.keys(manga.languages)))]; $("#manga-language").innerHTML = `<option value="">Toutes</option>${languages.map((value) => `<option value="${value}">${value === "orig" || value === "original" ? "Original" : value.toUpperCase()}</option>`).join("")}`;
  const report = $("#manga-report"); report.hidden = false; report.textContent = `Audit — ${state.report.count} mangas (${state.report.sectionCounts.completed} Completed Manga, ${state.report.sectionCounts.storyboard} Complete Storyboards), ${state.report.languageVersions} versions linguistiques, ${state.report.totalPages} pages. ${state.report.issues.length ? state.report.issues.join(" · ") : "Aucune anomalie détectée."}`;
  renderList();
  if (mediaAuditController) mediaAuditController.refresh();
}

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
  $("#manga-media").innerHTML = `<h3>Bannière du manga</h3><section class="primary-media-panel"><div class="primary-media-preview-column"><p class="eyebrow">IMAGE PRINCIPALE DE LA CARTE MANGA</p><figure class="manga-card-preview"><img src="${imageUrl(media.path)}" alt="Aperçu de la carte manga" /><figcaption>Aperçu du rendu dans /portfolio/mangaka</figcaption></figure><div class="media-buttons"><a class="button button-secondary" href="${imageUrl(media.path)}" target="_blank" rel="noopener">Aperçu</a><button class="button button-secondary" type="button" data-primary-reveal ${media.path ? "" : "disabled"}>Ouvrir dans l’Explorateur</button><button class="button button-primary" type="button" data-primary-replace>Remplacer</button></div></div><div class="primary-media-details"><p class="muted-copy">Utilisée dans la liste publique, les cartes manga et les aperçus du Manga Admin.${media.fallback ? " Champ historique cover utilisé en fallback : il sera remplacé par une banner canonique lors du prochain remplacement." : ""}</p><dl class="media-facts"><div><dt>Chemin</dt><dd>${escapeHtml(media.path || "Média absent")}</dd></div><div><dt>Dimensions actuelles</dt><dd>${info ? `${info.width} × ${info.height} px` : "—"}</dd></div><div><dt>Ratio actuel</dt><dd>${ratio}:1</dd></div><div><dt>Poids / format</dt><dd>${info ? `${formatBytes(info.size)} · ${escapeHtml(info.extension)}` : "—"}</dd></div><div><dt>Ratio cible</dt><dd>16:9</dd></div><div><dt>Taille idéale Photoshop</dt><dd>1280 × 720 px</dd></div><div><dt>Haute qualité</dt><dd>1600 × 900 px</dd></div><div><dt>Taille acceptable</dt><dd>960 × 540 px ou plus</dd></div><div><dt>Minimum recommandé</dt><dd>800 × 450 px</dd></div><div><dt>Résolution</dt><dd><span class="media-status ${analysis.resolution.level}">${escapeHtml(analysis.resolution.label)}</span></dd></div><div><dt>Ratio</dt><dd><span class="media-status ${analysis.ratioStatus.level}">${escapeHtml(analysis.ratioStatus.label)}</span></dd></div><div><dt>Statut général</dt><dd><span class="media-status ${analysis.level}">${escapeHtml(analysis.label)}</span></dd></div></dl>${analysis.resolution.warning ? `<p class="media-warning">${escapeHtml(analysis.resolution.warning)}</p>` : ""}${analysis.ratioStatus.warning ? `<p class="media-warning">${escapeHtml(analysis.ratioStatus.warning)}</p>` : ""}<p class="media-help">Pour créer une nouvelle bannière dans Photoshop, utilisez idéalement 1280 × 720 px en ratio 16:9. Vous pouvez utiliser 1600 × 900 px pour une qualité supérieure. Évitez de descendre sous 800 × 450 px.</p><p class="media-help">L’image utilise <code>object-fit: cover</code>. Les bords peuvent être légèrement recadrés selon la largeur de l’écran. Gardez les visages, textes et éléments importants dans la zone centrale.</p></div></section>`;
  $("[data-primary-reveal]").onclick = () => reveal({ type: "primary" });
  $("[data-primary-replace]").onclick = () => chooseFile(async (file) => { if (!await reviewReplacementMedia(file)) return; await api(`/api/mangas/${encodeURIComponent(state.currentId)}/media/primary`, { method: "PUT", body: JSON.stringify({ file: await filePayload(file) }) }); await reloadEditor("Image principale remplacée."); });
}
function renderLanguages() {
  const manga = currentManga(); $("#language-tabs").replaceChildren(...Object.entries(manga.languages).map(([code, language]) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `language-tab ${state.language === code ? "is-active" : ""}`; button.textContent = `${language.label} (${language.pageCount})`; button.onclick = () => { state.language = code; renderLanguages(); }; return button;
  }));
  const language = manga.languages[state.language]; state.workingPages = [...language.pages]; state.savedPages = [...language.pages];
  $("#language-summary").innerHTML = `<div class="language-summary-content"><p><strong>${escapeHtml(language.label)}</strong> · ${language.pageCount} pages ${language.missing.length ? `· ⚠ ${language.missing.length} manquante(s)` : ""}</p><div class="language-actions"><button type="button" id="default-language">Définir par défaut</button><button type="button" id="delete-language">Supprimer la langue</button></div></div>`;
  $("#default-language").disabled = manga.defaultLanguage === state.language; $("#default-language").onclick = async () => { await api(`/api/mangas/${encodeURIComponent(manga.id)}`, { method: "PUT", body: JSON.stringify({ defaultLanguage: state.language }) }); await reloadEditor("Langue par défaut modifiée."); };
  $("#delete-language").onclick = async () => { if (!confirm(`Supprimer ${language.label} et déplacer ses pages dans la corbeille ?`)) return; await api(`/api/mangas/${encodeURIComponent(manga.id)}/languages/${state.language}`, { method: "DELETE" }); state.language = manga.defaultLanguage; await reloadEditor("Langue supprimée."); };
  $("#page-position").max = language.pageCount + 1; $("#page-position").value = language.pageCount + 1; renderPages();
}
function renderPages() {
  const manga = currentManga(); const details = new Map(manga.languages[state.language].pageDetails.map((item) => [item.path, item]));
  $("#page-grid").replaceChildren(...state.workingPages.map((page, index) => {
    const info = details.get(page) || { path: page, name: page.split("/").at(-1) }; const card = document.createElement("article"); card.className = "manga-page"; card.draggable = true; card.dataset.index = index;
    card.innerHTML = `<img src="${imageUrl(page)}" alt="Page ${index + 1}" /><strong>Position ${String(index + 1).padStart(2, "0")}</strong><small title="${escapeHtml(info.name)}">${escapeHtml(info.name)}</small><small>${info.width || "?"} × ${info.height || "?"} · ${formatBytes(info.size)}</small><div class="page-actions"><button type="button" data-action="up" title="Monter">↑</button><button type="button" data-action="down" title="Descendre">↓</button><button type="button" data-action="reveal" title="Explorateur">⌕</button><button type="button" data-action="replace" title="Remplacer">↻</button><button type="button" data-action="first" title="Début">⇈</button><button type="button" data-action="last" title="Fin">⇊</button><button type="button" data-action="position" title="Position précise">#</button><button type="button" data-action="delete" title="Supprimer">×</button></div>`;
    card.ondragstart = () => card.classList.add("is-dragging"); card.ondragend = () => card.classList.remove("is-dragging"); card.ondragover = (event) => event.preventDefault(); card.ondrop = (event) => { event.preventDefault(); const source = Number(document.querySelector(".manga-page.is-dragging")?.dataset.index); if (Number.isInteger(source)) movePage(source, index); };
    card.querySelectorAll("button").forEach((button) => button.onclick = () => pageAction(button.dataset.action, index)); return card;
  }));
}
function movePage(from, to) { if (from === to || to < 0 || to >= state.workingPages.length) return; const [page] = state.workingPages.splice(from, 1); state.workingPages.splice(to, 0, page); setDirty(); renderPages(); }
async function pageAction(action, index) {
  if (action === "up") return movePage(index, index - 1); if (action === "down") return movePage(index, index + 1); if (action === "first") return movePage(index, 0);
  if (action === "last") return movePage(index, state.workingPages.length - 1);
  if (action === "position") { const position = Number(prompt(`Nouvelle position (1 à ${state.workingPages.length})`, String(index + 1))); if (Number.isInteger(position)) return movePage(index, position - 1); }
  if (action === "reveal") return reveal({ type: "page", language: state.language, index });
  if (action === "delete" && confirm(`Supprimer la page ${index + 1} ?`)) { await api(`/api/mangas/${encodeURIComponent(state.currentId)}/languages/${state.language}/pages/${index}`, { method: "DELETE" }); await reloadEditor("Page déplacée dans la corbeille."); }
  if (action === "replace") chooseFile(async (file) => { if (!confirm(`Remplacer la page ${index + 1} ?`)) return; await api(`/api/mangas/${encodeURIComponent(state.currentId)}/languages/${state.language}/pages/${index}`, { method: "PUT", body: JSON.stringify({ file: await filePayload(file), keepName: true }) }); await reloadEditor("Page remplacée."); });
}
function chooseFile(callback) { const input = document.createElement("input"); input.type = "file"; input.accept = ".jpg,.jpeg,.png,.webp,.avif,.gif"; input.onchange = () => input.files[0] && callback(input.files[0]).catch((error) => message(error.message, "error")); input.click(); }
async function reveal(descriptor) { try { const result = await api(`/api/mangas/${encodeURIComponent(state.currentId)}/reveal`, { method: "POST", body: JSON.stringify(descriptor) }); message(result.warning || result.message, result.mode === "opened-folder" ? "warning" : "success"); } catch (error) { message(error.message, "error"); } }
async function reloadEditor(success) { const id = state.currentId; await load(); openEditor(id); if (success) message(success); }

form.addEventListener("input", () => setDirty());
form.onsubmit = async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.featured = form.elements.featured.checked; data.tags = String(data.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  try {
    await api(`/api/mangas/${encodeURIComponent(state.currentId)}`, { method: "PUT", body: JSON.stringify(data) });
    if (JSON.stringify(state.workingPages) !== JSON.stringify(state.savedPages)) await api(`/api/mangas/${encodeURIComponent(state.currentId)}/languages/${state.language}/pages`, { method: "PUT", body: JSON.stringify({ pages: state.workingPages }) });
    setDirty(false); dialog.close(); await load(); message("Manga et ordre des pages enregistrés.");
  } catch (error) { message(error.message, "error"); }
};
$("#add-pages").onclick = async () => { const files = [...$("#page-files").files]; if (!files.length) return message("Sélectionnez des pages.", "warning"); try { const payloads = await Promise.all(files.map(filePayload)); await api(`/api/mangas/${encodeURIComponent(state.currentId)}/languages/${state.language}/pages`, { method: "POST", body: JSON.stringify({ files: payloads, position: Number($("#page-position").value) }) }); $("#page-files").value = ""; await reloadEditor(`${files.length} page(s) ajoutée(s).`); } catch (error) { message(error.message, "error"); } };
$("#add-language").onclick = async () => { const code = prompt("Code de langue (orig, fr, en, ja…)"); if (!code) return; try { await api(`/api/mangas/${encodeURIComponent(state.currentId)}/languages`, { method: "POST", body: JSON.stringify({ code }) }); state.language = code.toLowerCase(); await reloadEditor("Langue ajoutée."); } catch (error) { message(error.message, "error"); } };
$("#delete-manga").onclick = async () => { const manga = currentManga(); const confirmation = prompt(`Suppression sécurisée : saisissez « ${manga.slug} » ou le titre.`); if (!confirmation) return; try { await api(`/api/mangas/${encodeURIComponent(manga.id)}`, { method: "DELETE", body: JSON.stringify({ confirmation }) }); setDirty(false); dialog.close(); await load(); message("Manga déplacé dans la corbeille."); } catch (error) { message(error.message, "error"); } };

function requestClose() { if (state.dirty && !confirm("Abandonner les modifications non enregistrées ?")) return; setDirty(false); dialog.close(); }
document.querySelectorAll("[data-close]").forEach((button) => button.onclick = requestClose); dialog.addEventListener("cancel", (event) => { if (state.dirty && !confirm("Abandonner les modifications non enregistrées ?")) event.preventDefault(); else setDirty(false); });
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
$("#create-form").elements.languageType.onchange = (event) => { $("#initial-language-field").hidden = event.target.value !== "multilingual"; };
$("#create-form").elements.primaryImage.onchange = async (event) => { const file = event.target.files[0]; const container = $("#create-media-review"); if (state.createMediaReview?.url) URL.revokeObjectURL(state.createMediaReview.url); if (!file) { state.createMediaReview = null; container.hidden = true; return; } try { state.createMediaReview = await inspectLocalMedia(file); container.innerHTML = mediaReviewMarkup(state.createMediaReview); container.hidden = false; } catch (error) { message(error.message, "error"); event.target.value = ""; } };
$("#create-form").onsubmit = async (event) => { event.preventDefault(); const createForm = event.currentTarget; const data = new FormData(createForm); const pages = await Promise.all([...createForm.elements.pages.files].map(filePayload)); const primaryFile = createForm.elements.primaryImage.files[0]; const payload = { title: data.get("title"), slug: data.get("slug"), presentationSection: data.get("presentationSection"), languageType: data.get("languageType"), languageCode: data.get("languageCode"), summary: data.get("summary"), pages, primaryImage: primaryFile ? await filePayload(primaryFile) : null }; const risk = state.createMediaReview?.analysis.level === "error" ? "\n\nAttention : la résolution ou le ratio nécessite une correction importante." : ""; if (!confirm(`Créer « ${payload.title} » dans ${sectionLabels[payload.presentationSection]} avec ${pages.length} page(s) ?${risk}`)) return; try { await api("/api/mangas", { method: "POST", body: JSON.stringify(payload) }); $("#create-dialog").close(); createForm.reset(); if (state.createMediaReview?.url) URL.revokeObjectURL(state.createMediaReview.url); state.createMediaReview = null; $("#create-media-review").hidden = true; await load(); message("Manga créé avec transaction complète."); } catch (error) { message(error.message, "error"); } };

mediaAuditController = mountMediaAudit({
  module: "manga",
  container: $("#manga-media-audit"),
  notify: message,
  onOpenMissing: (item) => {
    if (!state.mangas.some((manga) => String(manga.id) === String(item.entryId))) return;
    openEditor(item.entryId);
    if (item.role === "page" && item.language && currentManga().languages[item.language]) {
      state.language = item.language;
      renderLanguages();
      switchEditorTab("pages");
    } else switchEditorTab("media");
  },
  onIntegrate: async (item) => {
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
    if (!confirm("Utiliser ce fichier comme image principale du manga ? L’ancien média sera déplacé dans la corbeille.")) return;
    await api(`/api/mangas/${encodeURIComponent(manga.id)}/media/primary`, { method: "PUT", body: JSON.stringify({ file: await filePayload(file) }) });
    await reloadEditor("Image principale intégrée après validation.");
  },
});
load().catch((error) => message(error.message, "error"));
