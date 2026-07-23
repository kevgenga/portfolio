import {
  parseArtworkDate,
  resolveArtworkSortPreference,
  sortArtworks,
} from "./sort-utils.js";
import { formatFileSize } from "./file-size-utils.js";
import { CATEGORY_LABELS as labels, createCategoryPicker, normalizeCategorySelection } from "./category-utils.js";
import { createReplacementController } from "./replacement-ui.js";
import { CATEGORY_STORAGE_KEY, resolveCategoryPreference } from "./filter-preference.js";
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);
const SORT_STORAGE_KEY = "artwork-admin-sort";
const invalidDateWarnings = new Set();
const state = {
  artworks: [],
  categories: [],
  editingId: null,
  toastTimer: null,
  queue: [],
  sessionId: null,
  limits: { maxFileBytes: 100 * 1024 * 1024, maxBatchFiles: 100 },
  busy: false,
  batchDateMode: "manual",
  dirtyCards: new Set(),
  replacementPending: false,
};
let batchCategoryPicker;
let editCategoryPicker;

const $ = (selector) => document.querySelector(selector);
const gallery = $("#gallery");
const searchInput = $("#search");
const categoryFilter = $("#category-filter");
const dateSort = $("#date-sort");
const resultCount = $("#result-count");
const emptyState = $("#empty-state");
const editDialog = $("#edit-dialog");
const editForm = $("#edit-form");
const toast = $("#toast");
const importQueue = $("#import-queue");
const importWorkspace = $("#import-workspace");
const importReport = $("#import-report");
const replacementController = createReplacementController({
  api,
  formatBytes,
  showMessage,
  onPendingChange: (pending) => { state.replacementPending = pending; },
  onOptimized: async (response) => {
    await loadArtworks();
    await openEdit(response.artwork.id);
    showMessage(`${response.message} Original : ${response.trashPath}`);
  },
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function imageUrl(assetPath) {
  return `/api/image/${encodeURIComponent(assetPath)}`;
}

function showMessage(message, status = "success") {
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", status === true || status === "error");
  toast.classList.toggle("warning", status === "warning");
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 5000);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) throw new Error(body.error || `Erreur HTTP ${response.status}`);
  return body;
}

function setBusy(busy) {
  state.busy = busy;
  for (const control of document.querySelectorAll("button, input, select, textarea")) {
    if (!control.closest(".topbar") || busy) control.disabled = busy;
  }
  if (!busy) {
    for (const control of document.querySelectorAll("button, input, select, textarea")) control.disabled = false;
    renderQueue();
  }
}

function formatBytes(bytes) {
  return Number.isFinite(bytes) ? formatFileSize(bytes) : "—";
}

function formatDateFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

function today() {
  return formatDateFromTimestamp(Date.now());
}

function filteredArtworks() {
  const query = searchInput.value.trim().toLocaleLowerCase("fr");
  const category = categoryFilter.value;
  const filtered = state.artworks.filter((artwork) => {
    const matchesCategory = !category || artwork.category.includes(category);
    const haystack = [artwork.id, artwork.image, artwork.alt, artwork.title].join(" ").toLocaleLowerCase("fr");
    return matchesCategory && (!query || haystack.includes(query));
  });

  return sortArtworks(filtered, dateSort.value, (artwork) => {
    const warningKey = `${artwork.id}:${artwork.date}`;
    if (invalidDateWarnings.has(warningKey)) return;
    invalidDateWarnings.add(warningKey);
    console.warn(`Date invalide pour l’œuvre « ${artwork.id} » :`, artwork.date);
  });
}

function renderGallery() {
  const artworks = filteredArtworks();
  gallery.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const artwork of artworks) fragment.append(createArtworkCard(artwork));
  gallery.append(fragment);
  resultCount.textContent = `${artworks.length} œuvre${artworks.length > 1 ? "s" : ""} affichée${artworks.length > 1 ? "s" : ""} sur ${state.artworks.length}`;
  emptyState.hidden = artworks.length !== 0;
}

function createArtworkCard(artwork) {
  const card = element("article", "art-card");
  const image = element("img", "art-thumb");
  image.src = imageUrl(artwork.image);
  image.alt = artwork.alt || "Aperçu sans texte alternatif";
  image.loading = "lazy";
  image.decoding = "async";
  const info = element("div", "art-info");
  info.append(element("p", "art-file", artwork.image.split("/").at(-1)));
  const pathLine = element("p", "art-path", artwork.image);
  pathLine.title = artwork.image;
  info.append(pathLine);
  const chips = element("div", "chips");
  for (const category of artwork.category) chips.append(element("span", "chip", labels[category] || category));
  info.append(chips);

  const metadata = element("dl", "art-meta");
  for (const [name, value, wide = false] of [
    ["Date", artwork.date],
    ["Année", artwork.year],
    ["Poids", formatFileSize(artwork.sizeBytes)],
    ["ID", artwork.id],
    ["Alt", artwork.alt || "—", true],
  ]) {
    const group = element("div", wide ? "art-meta-wide" : "");
    group.append(element("dt", "", name), element("dd", "", String(value)));
    metadata.append(group);
  }
  info.append(metadata);

  const quickButton = element("button", "button button-secondary card-button", "Édition rapide");
  quickButton.type = "button";
  const quickEditor = createQuickEditor(artwork, card);
  quickEditor.hidden = true;
  quickButton.addEventListener("click", () => {
    quickEditor.hidden = !quickEditor.hidden;
    quickButton.textContent = quickEditor.hidden ? "Édition rapide" : "Masquer l’édition";
  });
  const advancedButton = element("button", "button button-secondary card-button", "Modifier / renommer / supprimer");
  advancedButton.type = "button";
  advancedButton.addEventListener("click", () => openEdit(artwork.id));
  info.append(quickButton, quickEditor, advancedButton);
  card.append(image, info);
  return card;
}

function createQuickEditor(artwork, card) {
  const form = element("form", "quick-editor");
  const dateLabel = element("label", "field");
  dateLabel.append(element("span", "", "Date"));
  const dateInput = document.createElement("input");
  dateInput.name = "date";
  dateInput.value = artwork.date;
  dateInput.pattern = "\\d{2}-\\d{2}-\\d{4}";
  dateLabel.append(dateInput);
  const altLabel = element("label", "field");
  altLabel.append(element("span", "", "Alt"));
  const altInput = document.createElement("textarea");
  altInput.name = "alt";
  altInput.value = artwork.alt;
  altLabel.append(altInput);
  const categoryLabel = element("div", "field");
  categoryLabel.append(element("span", "", "Catégories"));
  const categoryPicker = createCategoryPicker({
    categories: state.categories,
    selected: artwork.category,
    labels,
    compact: true,
    onChange: () => { if (form.isConnected) markDirty(); },
  });
  categoryLabel.append(categoryPicker.element);
  const dirty = element("span", "dirty-indicator", "Modifications non enregistrées");
  dirty.hidden = true;
  const actions = element("div", "quick-actions");
  const save = element("button", "button button-primary", "Enregistrer");
  save.type = "submit";
  const cancel = element("button", "button button-secondary", "Annuler");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    state.dirtyCards.delete(artwork.id);
    renderGallery();
  });
  actions.append(save, cancel);
  form.append(dateLabel, altLabel, categoryLabel, dirty, actions);

  const markDirty = () => {
    state.dirtyCards.add(artwork.id);
    dirty.hidden = false;
    card.classList.add("is-dirty");
  };
  form.addEventListener("input", markDirty);
  form.addEventListener("change", markDirty);
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      state.dirtyCards.delete(artwork.id);
      renderGallery();
    } else if (event.key === "Enter" && (event.ctrlKey || event.target.tagName !== "TEXTAREA")) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveExistingArtwork(artwork, {
      fileName: artwork.image.split("/").at(-1),
      categories: categoryPicker.getValue(),
      date: dateInput.value,
      alt: altInput.value,
    }, form);
  });
  return form;
}

async function saveExistingArtwork(artwork, payload, form) {
  for (const control of form.elements) control.disabled = true;
  try {
    const response = await api(`/api/artworks/${encodeURIComponent(artwork.id)}`, { method: "PUT", body: JSON.stringify(payload) });
    state.dirtyCards.delete(artwork.id);
    await loadArtworks();
    showMessage(response.message);
  } catch (error) {
    showMessage(error.message, true);
    for (const control of form.elements) control.disabled = false;
  }
}

function populateCategoryControls() {
  for (const category of state.categories) {
    categoryFilter.append(new Option(labels[category] || category, category));
  }
  let savedCategory = null;
  try { savedCategory = window.localStorage.getItem(CATEGORY_STORAGE_KEY); } catch { /* stockage indisponible */ }
  categoryFilter.value = resolveCategoryPreference(savedCategory, state.categories);
  batchCategoryPicker = createCategoryPicker({ categories: state.categories, selected: ["illustrations"], labels });
  editCategoryPicker = createCategoryPicker({ categories: state.categories, selected: ["illustrations"], labels });
  $("#batch-categories").append(batchCategoryPicker.element);
  $("#edit-categories-v21").append(editCategoryPicker.element);
}

async function loadArtworks() {
  const data = await api("/api/artworks");
  state.artworks = data.artworks;
  state.limits = data.limits || state.limits;
  if (state.categories.length === 0) {
    state.categories = data.categories;
    populateCategoryControls();
  }
  const report = $("#category-report");
  const categoryReport = data.categoryReport;
  const inconsistencies = categoryReport.withoutCategory.length
    + categoryReport.unknownCategories.length
    + categoryReport.primaryFolderMismatch.length;
  report.hidden = false;
  report.classList.toggle("has-errors", inconsistencies > 0);
  report.textContent = `Rapport catégories — ${categoryReport.singleCategory.length} œuvres avec une catégorie, ${categoryReport.multipleCategories.length} avec plusieurs catégories, ${categoryReport.withoutCategory.length} sans catégorie, ${categoryReport.unknownCategories.length} avec une catégorie inconnue, ${categoryReport.primaryFolderMismatch.length} avec un dossier différent de la catégorie principale. Aucune correction automatique.`;
  $("#import-limits").textContent = `Maximum ${state.limits.maxBatchFiles} images par lot et ${Math.round(state.limits.maxFileBytes / 1024 / 1024)} Mo par fichier.`;
  renderGallery();
}

async function openEdit(id) {
  const artwork = state.artworks.find((item) => item.id === id);
  if (!artwork) return;
  try {
    const details = await replacementController.open(id);
    state.editingId = id;
    editForm.elements.originalId.value = id;
    editForm.elements.fileName.value = artwork.image.split("/").at(-1);
    editForm.elements.date.value = artwork.date;
    editForm.elements.alt.value = artwork.alt;
    editCategoryPicker.setValue(artwork.category);
    $("#edit-id").textContent = artwork.id;
    $("#edit-year").textContent = artwork.year;
    $("#edit-preview").src = imageUrl(artwork.image);
    $("#edit-preview").alt = details.artwork.alt || "Aperçu de l’œuvre";
    editDialog.showModal();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function switchPanel(panelId) {
  for (const panel of document.querySelectorAll(".admin-panel")) panel.hidden = panel.id !== panelId;
  for (const tab of document.querySelectorAll(".admin-tab")) {
    const active = tab.dataset.panel === panelId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
}

async function ensureImportSession() {
  if (state.sessionId) return state.sessionId;
  const session = await api("/api/import/sessions", { method: "POST" });
  state.sessionId = session.id;
  state.limits = session.limits;
  return session.id;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1]));
    reader.addEventListener("error", () => reject(new Error("Impossible de lire ce fichier.")));
    reader.readAsDataURL(file);
  });
}

function queueItemDefaults(file, localUrl) {
  return {
    clientId: crypto.randomUUID(),
    token: null,
    originalName: file.name,
    suggestedName: file.name,
    finalName: file.name,
    extension: `.${file.name.split(".").at(-1).toLowerCase()}`,
    size: file.size,
    width: null,
    height: null,
    lastModified: file.lastModified,
    previewUrl: localUrl,
    localUrl,
    categories: batchCategoryPicker?.getValue() || ["illustrations"],
    date: today(),
    alt: "",
    selected: true,
    compressionEnabled: false,
    status: "uploading",
    error: "",
    estimate: null,
  };
}

async function addFiles(files) {
  const available = state.limits.maxBatchFiles - state.queue.length;
  if (files.length > available) {
    showMessage(`Limite dépassée : ${state.limits.maxBatchFiles} images maximum par lot.`, true);
    return;
  }
  await ensureImportSession();
  switchPanel("import-panel");
  importReport.hidden = true;

  for (const file of files) {
    const extension = file.name.split(".").at(-1).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      showMessage(`${file.name} refusé : format non accepté.`, true);
      continue;
    }
    if (file.size > state.limits.maxFileBytes) {
      showMessage(`${file.name} dépasse ${Math.round(state.limits.maxFileBytes / 1024 / 1024)} Mo.`, true);
      continue;
    }

    const localUrl = URL.createObjectURL(file);
    const queued = queueItemDefaults(file, localUrl);
    state.queue.push(queued);
    renderQueue();
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await api(`/api/import/sessions/${state.sessionId}/files`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, lastModified: file.lastModified, dataBase64 }),
      });
      URL.revokeObjectURL(localUrl);
      Object.assign(queued, response.file, {
        localUrl: null,
        finalName: response.file.suggestedName,
        status: response.file.animated ? "warning" : "ready",
        error: response.file.animated ? "GIF animé : l’original sera conservé si la compression est activée." : "",
      });
    } catch (error) {
      queued.status = "error";
      queued.error = error.message;
      queued.selected = false;
    }
    renderQueue();
  }
}

function batchCompression() {
  const size = $("#compression-size").value;
  return {
    enabled: $("#batch-compression").checked,
    maxDimension: size === "custom" ? $("#compression-custom-size").value : size,
    quality: Number($("#compression-quality").value),
    format: $("#compression-format").value,
    preserveMetadata: $("#compression-metadata").checked,
  };
}

function itemCompression(item) {
  return { ...batchCompression(), enabled: item.compressionEnabled };
}

function applyBatch(scope) {
  const targets = state.queue.filter((item) => item.token && (scope === "all" || item.selected));
  if (!targets.length) {
    showMessage(scope === "all" ? "La file est vide." : "Aucune image sélectionnée.", true);
    return;
  }
  const categories = batchCategoryPicker.getValue();
  const globalAlt = $("#batch-alt").value;
  for (const item of targets) {
    item.categories = [...categories];
    item.date = state.batchDateMode === "file" ? formatDateFromTimestamp(item.lastModified) : $("#batch-date").value;
    item.alt = globalAlt;
    item.compressionEnabled = $("#batch-compression").checked;
    item.estimate = null;
  }
  renderQueue();
  showMessage(`Paramètres appliqués à ${targets.length} image(s).`);
}

function renderQueue() {
  importQueue.replaceChildren();
  for (const item of state.queue) importQueue.append(createQueueCard(item));
  const selected = state.queue.filter((item) => item.selected && item.token).length;
  $("#selected-count").textContent = `${selected} image${selected > 1 ? "s" : ""} sélectionnée${selected > 1 ? "s" : ""}`;
  $("#queue-count").textContent = `${state.queue.length} image${state.queue.length > 1 ? "s" : ""}`;
  const tabCount = $("#tab-queue-count");
  tabCount.textContent = state.queue.length;
  tabCount.hidden = state.queue.length === 0;
  importWorkspace.hidden = state.queue.length === 0 && importReport.hidden;
  $("#save-batch-button").disabled = state.busy || !state.queue.some((item) => item.token);
}

function createQueueCard(item) {
  const card = element("article", "queue-card");
  card.dataset.clientId = item.clientId;
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "queue-select";
  checkbox.checked = item.selected;
  checkbox.disabled = !item.token || state.busy;
  checkbox.setAttribute("aria-label", `Sélectionner ${item.originalName}`);
  checkbox.addEventListener("change", () => { item.selected = checkbox.checked; renderQueue(); });

  const preview = element("div", "queue-preview");
  const image = document.createElement("img");
  image.src = item.previewUrl;
  image.alt = `Aperçu de ${item.originalName}`;
  preview.append(image);
  const fileInfo = element("div", "queue-file");
  fileInfo.append(element("strong", "", item.originalName));
  fileInfo.append(element("small", "", `${item.extension.replace(".", "").toUpperCase()} · ${item.width || "?"} × ${item.height || "?"} px · ${formatBytes(item.size)}`));
  const status = element("span", `queue-status ${item.status === "error" || item.status === "warning" ? "warning" : ""}`, item.status === "uploading" ? "Analyse…" : item.status === "error" ? "À ignorer" : item.status === "warning" ? "Avertissement" : "Prête");
  fileInfo.append(status);
  if (item.error) fileInfo.append(element("small", "", item.error));

  const mainFields = element("div", "queue-fields");
  const nameLabel = element("label", "field");
  nameLabel.append(element("span", "", "Nom final"));
  const nameInput = document.createElement("input");
  nameInput.value = item.finalName;
  nameInput.disabled = !item.token || state.busy;
  nameInput.addEventListener("input", () => { item.finalName = nameInput.value; });
  nameLabel.append(nameInput);
  const categoryLabel = element("div", "field");
  categoryLabel.append(element("span", "", "Catégories"));
  const categoryPicker = createCategoryPicker({
    categories: state.categories,
    selected: item.categories,
    labels,
    compact: true,
    onChange: (categories) => { item.categories = categories; },
  });
  for (const input of categoryPicker.element.querySelectorAll("input")) input.disabled = !item.token || state.busy;
  categoryLabel.append(categoryPicker.element);
  mainFields.append(nameLabel, categoryLabel);

  const detailFields = element("div", "queue-fields");
  const dateLabel = element("label", "field");
  dateLabel.append(element("span", "", "Date"));
  const dateInput = document.createElement("input");
  dateInput.value = item.date;
  dateInput.disabled = !item.token || state.busy;
  dateInput.addEventListener("input", () => { item.date = dateInput.value; });
  const shortcuts = element("span", "date-shortcuts");
  for (const [action, text] of [["today", "Aujourd’hui"], ["file", "Date fichier"], ["clear", "Effacer"]]) {
    const button = element("button", "", text);
    button.type = "button";
    button.disabled = !item.token || state.busy;
    button.addEventListener("click", () => {
      item.date = action === "today" ? today() : action === "file" ? formatDateFromTimestamp(item.lastModified) : "";
      renderQueue();
    });
    shortcuts.append(button);
  }
  dateLabel.append(dateInput, shortcuts);
  const altLabel = element("label", "field");
  altLabel.append(element("span", "", "Alt facultatif"));
  const altInput = document.createElement("textarea");
  altInput.rows = 2;
  altInput.value = item.alt;
  altInput.disabled = !item.token || state.busy;
  altInput.addEventListener("input", () => { item.alt = altInput.value; });
  altLabel.append(altInput);
  detailFields.append(dateLabel, altLabel);

  const compression = element("div", "queue-compression");
  const compressionToggle = element("label", "toggle-field");
  const compressionInput = document.createElement("input");
  compressionInput.type = "checkbox";
  compressionInput.checked = item.compressionEnabled;
  compressionInput.disabled = !item.token || state.busy;
  compressionInput.addEventListener("change", () => { item.compressionEnabled = compressionInput.checked; item.estimate = null; renderQueue(); });
  compressionToggle.append(compressionInput, document.createTextNode("Compression"));
  compression.append(compressionToggle);
  if (item.estimate) {
    const estimate = element("p", "estimate", `${item.estimate.originalWidth} × ${item.estimate.originalHeight} → ${item.estimate.outputWidth} × ${item.estimate.outputHeight}\n${formatBytes(item.estimate.originalSize)} → ${formatBytes(item.estimate.outputSize)} (${item.estimate.savedPercent}% économisé)`);
    if (item.estimate.warning) estimate.append(document.createElement("br"), document.createTextNode(item.estimate.warning));
    compression.append(estimate);
  }

  const remove = element("button", `remove-queue-button ${item.status === "error" ? "ignore-button" : ""}`, item.status === "error" ? "Ignorer" : "×");
  remove.type = "button";
  remove.disabled = state.busy;
  remove.setAttribute("aria-label", `Retirer ${item.originalName}`);
  remove.addEventListener("click", () => removeQueueItem(item));
  card.append(checkbox, preview, fileInfo, mainFields, detailFields, compression, remove);
  return card;
}

async function removeQueueItem(item) {
  if (item.token && state.sessionId) {
    try { await api(`/api/import/sessions/${state.sessionId}/files/${item.token}`, { method: "DELETE" }); }
    catch (error) { showMessage(error.message, true); return; }
  }
  if (item.localUrl) URL.revokeObjectURL(item.localUrl);
  state.queue = state.queue.filter((queued) => queued.clientId !== item.clientId);
  renderQueue();
}

async function clearQueue(requireConfirmation = true) {
  if (!state.queue.length) return;
  if (requireConfirmation && !window.confirm("Retirer toutes les images de la file d’import ?")) return;
  for (const item of state.queue) if (item.localUrl) URL.revokeObjectURL(item.localUrl);
  if (state.sessionId) {
    try { await api(`/api/import/sessions/${state.sessionId}`, { method: "DELETE" }); }
    catch (error) { showMessage(error.message, true); return; }
  }
  state.queue = [];
  state.sessionId = null;
  renderQueue();
}

async function estimateCompression() {
  const items = state.queue.filter((item) => item.token);
  if (!items.length) return;
  setBusy(true);
  try {
    const response = await api(`/api/import/sessions/${state.sessionId}/estimate`, {
      method: "POST",
      body: JSON.stringify({ items: items.map((item) => ({ token: item.token, compression: itemCompression(item) })) }),
    });
    for (const result of response.results) {
      const item = state.queue.find((queued) => queued.token === result.token);
      if (item) item.estimate = result;
    }
    showMessage("Analyse de compression terminée.");
  } catch (error) {
    showMessage(`${error.message} Vous pouvez désactiver la compression et recommencer.`, true);
  } finally {
    setBusy(false);
  }
}

function validateQueue() {
  const errors = [];
  const ready = state.queue.filter((item) => item.token);
  if (!ready.length) errors.push("Aucune image valide à enregistrer.");
  for (const item of ready) {
    try { normalizeCategorySelection(item.categories); }
    catch (error) { errors.push(`${item.originalName} : ${error.message}`); }
    if (parseArtworkDate(item.date) === null) errors.push(`${item.originalName} : date invalide (${item.date || "vide"}).`);
    if (!item.finalName.trim()) errors.push(`${item.originalName} : nom final vide.`);
  }
  const blocked = state.queue.filter((item) => item.status === "error");
  if (blocked.length) errors.push(`${blocked.length} doublon(s) ou fichier(s) en erreur doivent être ignorés ou retirés.`);
  return { errors, ready };
}

function renderImportReport(content, isError = false) {
  importReport.replaceChildren();
  importReport.classList.toggle("error", isError);
  if (Array.isArray(content)) {
    const list = document.createElement("ul");
    for (const line of content) list.append(element("li", "", line));
    importReport.append(list);
  } else {
    importReport.textContent = content;
  }
  importReport.hidden = false;
  importWorkspace.hidden = false;
}

async function pollProgress() {
  if (!state.sessionId) return;
  try {
    const status = await api(`/api/import/sessions/${state.sessionId}/status`);
    $("#import-progress").hidden = false;
    $("#progress-message").textContent = status.message;
    const percent = status.total ? Math.round(status.current / status.total * 100) : 0;
    $("#progress-bar").style.width = `${percent}%`;
  } catch {
    // La réponse finale peut supprimer la session avant le dernier polling.
  }
}

async function saveBatch() {
  const { errors, ready } = validateQueue();
  if (errors.length) {
    renderImportReport(errors, true);
    return;
  }
  const categoryCounts = ready.reduce((counts, item) => {
    for (const category of item.categories) counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const compressed = ready.filter((item) => item.compressionEnabled).length;
  const summary = [
    `${ready.length} œuvre(s) seront ajoutée(s).`,
    `Catégories : ${Object.entries(categoryCounts).map(([category, count]) => `${labels[category]} (${count})`).join(", ")}.`,
    `Compression : ${compressed ? `${compressed} image(s)` : "désactivée"}.`,
    "Une seule sauvegarde et une seule écriture atomique seront effectuées.",
  ];
  renderImportReport(summary);
  if (!window.confirm(`${summary.join("\n")}\n\nConfirmer l’import ?`)) return;

  setBusy(true);
  $("#import-progress").hidden = false;
  importReport.hidden = true;
  const polling = window.setInterval(pollProgress, 250);
  try {
    const response = await api(`/api/import/sessions/${state.sessionId}/commit`, {
      method: "POST",
      body: JSON.stringify({
        items: ready.map((item) => ({
          token: item.token,
          categories: item.categories,
          date: item.date,
          alt: item.alt,
          finalName: item.finalName,
          compression: itemCompression(item),
        })),
      }),
    });
    const warnings = response.results.filter((result) => result.warning).map((result) => `${result.originalName} : ${result.warning}`);
    for (const item of state.queue) if (item.localUrl) URL.revokeObjectURL(item.localUrl);
    state.queue = [];
    state.sessionId = null;
    await loadArtworks();
    $("#progress-bar").style.width = "100%";
    $("#progress-message").textContent = `Traitement ${response.count} / ${response.count} — import terminé`;
    renderImportReport([`${response.count} œuvre(s) ajoutée(s) avec succès.`, `Sauvegarde : ${response.backup}`, ...warnings]);
    renderQueue();
    showMessage(response.message);
  } catch (error) {
    renderImportReport([error.message, "Aucun fichier partiel n’a été conservé. Corrigez les réglages ou recommencez sans compression."], true);
  } finally {
    window.clearInterval(polling);
    await pollProgress();
    setBusy(false);
  }
}

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const artwork = state.artworks.find((item) => item.id === state.editingId);
  if (!artwork) return;
  const form = new FormData(editForm);
  let categories;
  try {
    categories = normalizeCategorySelection(editCategoryPicker.getValue());
  } catch (error) {
    showMessage(error.message, true);
    return;
  }
  for (const control of editForm.elements) control.disabled = true;
  try {
    if (replacementController.hasReplacement()) {
      if (!window.confirm("Confirmer le remplacement de l’image et l’enregistrement de toutes les modifications ?")) return;
      const response = await replacementController.commit({ categories, date: form.get("date"), alt: form.get("alt") });
      showMessage(`${response.message} Ancienne image : ${response.trashPath}`);
    } else {
      const response = await api(`/api/artworks/${encodeURIComponent(artwork.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          fileName: form.get("fileName"),
          categories,
          date: form.get("date"),
          alt: form.get("alt"),
        }),
      });
      showMessage(response.message);
      await replacementController.discard();
    }
    state.dirtyCards.delete(artwork.id);
    editDialog.close();
    await loadArtworks();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    for (const control of editForm.elements) control.disabled = false;
  }
});

async function requestCloseEdit() {
  if (replacementController.hasPending() && !window.confirm("Abandonner le remplacement d’image non enregistré ?")) return;
  await replacementController.discard();
  editDialog.close();
}

$("#reveal-file-button").addEventListener("click", async (event) => {
  if (!state.editingId) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await api("/api/artworks/reveal-file", {
      method: "POST",
      body: JSON.stringify({ artworkId: state.editingId }),
    });
    showMessage(response.warning || response.message, response.mode === "opened-folder" ? "warning" : "success");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$("#delete-button").addEventListener("click", async () => {
  const artwork = state.artworks.find((item) => item.id === state.editingId);
  if (!artwork || !window.confirm(`Supprimer « ${artwork.image.split("/").at(-1)} » ?\n\nL’image sera déplacée dans la corbeille locale.`)) return;
  for (const control of editForm.elements) control.disabled = true;
  try {
    const response = await api(`/api/artworks/${encodeURIComponent(state.editingId)}`, { method: "DELETE" });
    await replacementController.discard();
    editDialog.close();
    await loadArtworks();
    showMessage(`${response.message} ${response.trashPath}`);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    for (const control of editForm.elements) control.disabled = false;
  }
});

for (const tab of document.querySelectorAll(".admin-tab")) tab.addEventListener("click", () => switchPanel(tab.dataset.panel));
$("#open-import-button").addEventListener("click", () => switchPanel("import-panel"));
$("#drop-zone").addEventListener("click", () => $("#import-files").click());
$("#drop-zone").addEventListener("keydown", (event) => {
  if (["Enter", " "].includes(event.key)) { event.preventDefault(); $("#import-files").click(); }
});
for (const eventName of ["dragenter", "dragover"]) {
  $("#drop-zone").addEventListener(eventName, (event) => { event.preventDefault(); $("#drop-zone").classList.add("is-dragging"); });
}
for (const eventName of ["dragleave", "drop"]) {
  $("#drop-zone").addEventListener(eventName, (event) => { event.preventDefault(); $("#drop-zone").classList.remove("is-dragging"); });
}
$("#drop-zone").addEventListener("drop", (event) => addFiles([...event.dataTransfer.files]));
$("#import-files").addEventListener("change", (event) => { addFiles([...event.target.files]); event.target.value = ""; });
$("#apply-all-button").addEventListener("click", () => applyBatch("all"));
$("#apply-selected-button").addEventListener("click", () => applyBatch("selected"));
$("#estimate-button").addEventListener("click", estimateCompression);
$("#select-all-button").addEventListener("click", () => { for (const item of state.queue) if (item.token) item.selected = true; renderQueue(); });
$("#deselect-all-button").addEventListener("click", () => { for (const item of state.queue) item.selected = false; renderQueue(); });
$("#clear-queue-button").addEventListener("click", () => clearQueue(true));
$("#save-batch-button").addEventListener("click", saveBatch);

for (const button of document.querySelectorAll("[data-date-action]")) {
  button.addEventListener("click", () => {
    const action = button.dataset.dateAction;
    state.batchDateMode = action === "file" ? "file" : "manual";
    $("#batch-date").value = action === "today" ? today() : "";
  });
}
$("#batch-date").value = today();
$("#batch-date").addEventListener("input", () => { state.batchDateMode = "manual"; });
$("#batch-compression").addEventListener("change", (event) => { $("#compression-settings").hidden = !event.target.checked; });
$("#compression-size").addEventListener("change", (event) => { $("#custom-size-field").hidden = event.target.value !== "custom"; });
$("#compression-quality").addEventListener("input", (event) => { $("#quality-output").value = event.target.value; });

searchInput.addEventListener("input", renderGallery);
categoryFilter.addEventListener("change", () => {
  try { window.localStorage.setItem(CATEGORY_STORAGE_KEY, categoryFilter.value); } catch { /* stockage indisponible */ }
  renderGallery();
});
dateSort.addEventListener("change", () => {
  try { window.localStorage.setItem(SORT_STORAGE_KEY, dateSort.value); } catch { /* stockage indisponible */ }
  renderGallery();
});
for (const button of document.querySelectorAll("[data-close-dialog]")) button.addEventListener("click", requestCloseEdit);
editDialog.addEventListener("click", (event) => { if (event.target === editDialog) requestCloseEdit(); });
editDialog.addEventListener("cancel", (event) => { event.preventDefault(); requestCloseEdit(); });
$("#backup-button").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  try {
    const response = await api("/api/backup", { method: "POST" });
    showMessage(`${response.message} ${response.backup}`);
  } catch (error) { showMessage(error.message, true); }
  finally { event.currentTarget.disabled = false; }
});
$("#preview-button").addEventListener("click", async () => {
  try {
    const { url } = await api("/api/preview", { method: "POST" });
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (error) { showMessage(error.message, true); }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.queue.length && !state.dirtyCards.size && !state.replacementPending) return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("unload", () => {
  for (const item of state.queue) if (item.localUrl) URL.revokeObjectURL(item.localUrl);
  replacementController.discard();
});

try {
  const savedSort = window.localStorage.getItem(SORT_STORAGE_KEY);
  dateSort.value = resolveArtworkSortPreference(savedSort);
} catch {
  dateSort.value = "newest";
}

loadArtworks().catch((error) => showMessage(error.message, true));
