const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1]));
    reader.addEventListener("error", () => reject(new Error("Impossible de lire ce fichier.")));
    reader.readAsDataURL(file);
  });
}

export function createReplacementController({ api, formatBytes, showMessage, onPendingChange = () => {}, onOptimized = () => {} }) {
  const elements = {
    fileInput: document.querySelector("#replacement-file"),
    dropZone: document.querySelector("#replacement-drop-zone"),
    newPanel: document.querySelector("#replacement-new-panel"),
    preview: document.querySelector("#replacement-preview"),
    options: document.querySelector("#replacement-options"),
    remove: document.querySelector("#remove-replacement-button"),
    estimateButton: document.querySelector("#estimate-replacement-button"),
    estimate: document.querySelector("#replacement-estimate"),
    compression: document.querySelector("#replacement-compression"),
    compressionSettings: document.querySelector("#replacement-compression-settings"),
    compressionSize: document.querySelector("#replacement-compression-size"),
    quality: document.querySelector("#replacement-quality"),
    qualityOutput: document.querySelector("#replacement-quality-output"),
    format: document.querySelector("#replacement-format"),
    metadata: document.querySelector("#replacement-metadata"),
    customNameField: document.querySelector("#replacement-custom-name-field"),
    customName: document.querySelector("#replacement-custom-name"),
    status: document.querySelector("#replacement-status"),
    thumbnailWarning: document.querySelector("#thumbnail-warning"),
    optimizationToggle: document.querySelector("#toggle-current-optimization"),
    optimizationPanel: document.querySelector("#current-optimization-panel"),
    optimizationFormat: document.querySelector("#current-optimization-format"),
    optimizationQuality: document.querySelector("#current-optimization-quality"),
    optimizationQualityOutput: document.querySelector("#current-optimization-quality-output"),
    optimizationSize: document.querySelector("#current-optimization-size"),
    optimizationMetadata: document.querySelector("#current-optimization-metadata"),
    optimizationAnalyze: document.querySelector("#analyze-current-optimization"),
    optimizationCommit: document.querySelector("#commit-current-optimization"),
    optimizationReport: document.querySelector("#current-optimization-report"),
  };
  let sessionId = null;
  let staged = null;
  let currentDetails = null;
  let localUrl = null;
  let busy = false;
  let thumbnailMode = "preserve";
  let maxFileBytes = 100 * 1024 * 1024;

  function compressionSettings() {
    const size = elements.compressionSize.value;
    return {
      enabled: elements.compression.checked,
      maxDimension: size,
      quality: Number(elements.quality.value),
      format: elements.format.value,
      preserveMetadata: elements.metadata.checked,
    };
  }

  function currentOptimizationSettings() {
    return {
      enabled: true,
      maxDimension: elements.optimizationSize.value,
      quality: Number(elements.optimizationQuality.value),
      format: elements.optimizationFormat.value,
      preserveMetadata: elements.optimizationMetadata.value === "preserve",
    };
  }

  function resetCurrentOptimization() {
    elements.optimizationPanel.hidden = true;
    elements.optimizationToggle.setAttribute("aria-expanded", "false");
    elements.optimizationFormat.value = "original";
    elements.optimizationQuality.value = "92";
    elements.optimizationQualityOutput.value = "92";
    elements.optimizationSize.value = "original";
    elements.optimizationMetadata.value = "preserve";
    elements.optimizationReport.hidden = true;
    elements.optimizationReport.replaceChildren();
  }

  function renderOptimizationReport(result) {
    const before = document.createElement("div");
    const after = document.createElement("div");
    before.innerHTML = `<strong>Avant</strong><span>${result.originalFormat.toUpperCase()}</span><span>${result.originalWidth} × ${result.originalHeight} px</span><span>${formatBytes(result.originalSize)}</span>`;
    after.innerHTML = `<strong>Après</strong><span>${result.outputFormat.toUpperCase()}</span><span>${result.outputWidth} × ${result.outputHeight} px</span><span>${formatBytes(result.outputSize)}</span><span>Gain : ${formatBytes(result.savedBytes)} (${result.savedPercent} %)</span>`;
    const comparison = document.createElement("div");
    comparison.className = "optimization-comparison";
    comparison.append(before, after);
    elements.optimizationReport.replaceChildren(comparison);
    for (const warning of result.warnings || []) {
      const warningNode = document.createElement("p");
      warningNode.className = "optimization-warning";
      warningNode.textContent = warning;
      elements.optimizationReport.append(warningNode);
    }
    elements.optimizationReport.hidden = false;
  }

  function selectedNameMode() {
    return document.querySelector('input[name="replacementNameMode"]:checked')?.value || "current";
  }

  function setPending(pending) {
    onPendingChange(pending);
  }

  function clearLocalUrl() {
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = null;
  }

  function resetReplacementUi() {
    clearLocalUrl();
    staged = null;
    elements.newPanel.hidden = true;
    elements.options.hidden = true;
    elements.estimate.hidden = true;
    elements.estimate.textContent = "";
    elements.fileInput.value = "";
    elements.compression.checked = false;
    elements.compressionSettings.hidden = true;
    elements.compressionSize.value = "original";
    elements.quality.value = "92";
    elements.qualityOutput.value = "92";
    elements.format.value = "original";
    elements.metadata.checked = false;
    elements.customName.value = "";
    elements.customNameField.hidden = true;
    const currentMode = document.querySelector('input[name="replacementNameMode"][value="current"]');
    if (currentMode) currentMode.checked = true;
    resetCurrentOptimization();
    setPending(false);
  }

  async function discardSession() {
    clearLocalUrl();
    if (!sessionId) return;
    try {
      await api(`/api/import/sessions/${sessionId}`, { method: "DELETE" });
    } catch {
      // Une session déjà validée ou expirée ne nécessite plus de nettoyage.
    }
    sessionId = null;
    staged = null;
  }

  function renderCurrent(details) {
    currentDetails = details;
    document.querySelector("#current-file-name").textContent = details.file.name;
    document.querySelector("#current-file-path").textContent = details.file.path;
    document.querySelector("#current-file-format").textContent = details.file.extension.replace(".", "").toUpperCase();
    document.querySelector("#current-file-dimensions").textContent = `${details.file.width} × ${details.file.height} px`;
    document.querySelector("#current-file-size").textContent = formatBytes(details.file.size);
    elements.thumbnailWarning.replaceChildren();
    if (details.thumbnail.status === "distinct") {
      const message = document.createElement("p");
      message.textContent = `Cette œuvre utilise une miniature distincte (${details.thumbnail.path}). Elle ne sera pas remplacée automatiquement.`;
      const select = document.createElement("select");
      select.append(new Option("Conserver la miniature actuelle", "preserve"), new Option("Utiliser la nouvelle image comme miniature", "use-new"));
      select.addEventListener("change", () => { thumbnailMode = select.value; });
      elements.thumbnailWarning.append(message, select);
      elements.thumbnailWarning.hidden = false;
    } else {
      elements.thumbnailWarning.hidden = true;
      thumbnailMode = "preserve";
    }
  }

  async function open(artworkId) {
    await discardSession();
    resetReplacementUi();
    const response = await api("/api/replacements/sessions", {
      method: "POST",
      body: JSON.stringify({ artworkId }),
    });
    sessionId = response.id;
    maxFileBytes = response.limits?.maxFileBytes || maxFileBytes;
    renderCurrent(response.details);
    return response.details;
  }

  async function stageFile(file) {
    if (busy || !file) return;
    const extension = file.name.split(".").at(-1).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      showMessage(`${file.name} refusé : format non accepté.`, true);
      return;
    }
    if (currentDetails && file.size > maxFileBytes) {
      showMessage(`Cette image dépasse la limite de ${Math.round(maxFileBytes / 1024 / 1024)} Mo.`, true);
      return;
    }

    clearLocalUrl();
    localUrl = URL.createObjectURL(file);
    elements.preview.src = localUrl;
    elements.newPanel.hidden = false;
    elements.options.hidden = false;
    elements.status.textContent = "Analyse de la nouvelle image…";
    setPending(true);
    busy = true;
    try {
      const response = await api(`/api/replacements/sessions/${sessionId}/file`, {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          lastModified: file.lastModified,
          dataBase64: await fileToBase64(file),
        }),
      });
      if (response.identicalCurrent) {
        resetReplacementUi();
        showMessage(response.message, true);
        return;
      }
      staged = response.file;
      elements.preview.src = staged.previewUrl;
      clearLocalUrl();
      document.querySelector("#replacement-file-name").textContent = staged.originalName;
      document.querySelector("#replacement-file-format").textContent = staged.extension.replace(".", "").toUpperCase();
      document.querySelector("#replacement-file-dimensions").textContent = `${staged.width} × ${staged.height} px`;
      document.querySelector("#replacement-file-size").textContent = formatBytes(staged.size);
      elements.status.textContent = `Remplacement non enregistré · nom proposé : ${staged.suggestedName}`;
      elements.newPanel.hidden = false;
      elements.options.hidden = false;
      setPending(true);
    } catch (error) {
      resetReplacementUi();
      showMessage(error.message, true);
    } finally {
      busy = false;
    }
  }

  async function removeReplacement() {
    if (!staged && !localUrl) return;
    await discardSession();
    resetReplacementUi();
    if (currentDetails) {
      const response = await api("/api/replacements/sessions", {
        method: "POST",
        body: JSON.stringify({ artworkId: currentDetails.artwork.id }),
      });
      sessionId = response.id;
    }
  }

  async function estimate() {
    if (!staged) return;
    elements.estimateButton.disabled = true;
    try {
      const response = await api(`/api/replacements/sessions/${sessionId}/estimate`, {
        method: "POST",
        body: JSON.stringify({ token: staged.token, compression: compressionSettings() }),
      });
      const result = response.result;
      elements.estimate.textContent = `${result.originalWidth} × ${result.originalHeight} px · ${formatBytes(result.originalSize)} → ${result.outputWidth} × ${result.outputHeight} px · ${formatBytes(result.outputSize)} · ${result.savedPercent}% économisé${result.warning ? ` · ${result.warning}` : ""}`;
      elements.estimate.hidden = false;
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      elements.estimateButton.disabled = false;
    }
  }

  async function analyzeCurrentOptimization() {
    if (!currentDetails || busy) return;
    elements.optimizationAnalyze.disabled = true;
    try {
      const response = await api(`/api/artworks/${encodeURIComponent(currentDetails.artwork.id)}/optimize/estimate`, {
        method: "POST",
        body: JSON.stringify({ compression: currentOptimizationSettings() }),
      });
      renderOptimizationReport(response.result);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      elements.optimizationAnalyze.disabled = false;
    }
  }

  async function commitCurrentOptimization() {
    if (!currentDetails || busy || !window.confirm("Confirmer l’optimisation de l’image actuelle ? L’original sera placé dans la corbeille locale.")) return;
    busy = true;
    elements.optimizationCommit.disabled = true;
    try {
      const response = await api(`/api/artworks/${encodeURIComponent(currentDetails.artwork.id)}/optimize`, {
        method: "POST",
        body: JSON.stringify({ compression: currentOptimizationSettings() }),
      });
      await onOptimized(response);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      busy = false;
      elements.optimizationCommit.disabled = false;
    }
  }

  async function commit(metadata) {
    if (!staged) return null;
    const response = await api(`/api/replacements/sessions/${sessionId}/commit`, {
      method: "POST",
      body: JSON.stringify({
        token: staged.token,
        categories: metadata.categories,
        date: metadata.date,
        alt: metadata.alt,
        nameMode: selectedNameMode(),
        customName: elements.customName.value,
        compression: compressionSettings(),
        thumbnailMode,
      }),
    });
    sessionId = null;
    staged = null;
    clearLocalUrl();
    setPending(false);
    return response;
  }

  elements.dropZone.addEventListener("click", () => elements.fileInput.click());
  elements.dropZone.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) { event.preventDefault(); elements.fileInput.click(); }
  });
  for (const eventName of ["dragenter", "dragover"]) {
    elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.add("is-dragging"); });
  }
  for (const eventName of ["dragleave", "drop"]) {
    elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.remove("is-dragging"); });
  }
  elements.dropZone.addEventListener("drop", (event) => stageFile(event.dataTransfer.files[0]));
  elements.fileInput.addEventListener("change", (event) => { stageFile(event.target.files[0]); event.target.value = ""; });
  elements.remove.addEventListener("click", removeReplacement);
  elements.estimateButton.addEventListener("click", estimate);
  elements.compression.addEventListener("change", () => { elements.compressionSettings.hidden = !elements.compression.checked; elements.estimate.hidden = true; });
  elements.compressionSize.addEventListener("change", () => { elements.estimate.hidden = true; });
  elements.quality.addEventListener("input", () => { elements.qualityOutput.value = elements.quality.value; elements.estimate.hidden = true; });
  elements.format.addEventListener("change", () => { elements.estimate.hidden = true; });
  elements.optimizationToggle.addEventListener("click", () => {
    elements.optimizationPanel.hidden = !elements.optimizationPanel.hidden;
    elements.optimizationToggle.setAttribute("aria-expanded", String(!elements.optimizationPanel.hidden));
  });
  elements.optimizationAnalyze.addEventListener("click", analyzeCurrentOptimization);
  elements.optimizationCommit.addEventListener("click", commitCurrentOptimization);
  for (const control of [elements.optimizationFormat, elements.optimizationSize, elements.optimizationMetadata]) {
    control.addEventListener("change", () => { elements.optimizationReport.hidden = true; });
  }
  elements.optimizationQuality.addEventListener("input", () => {
    elements.optimizationQualityOutput.value = elements.optimizationQuality.value;
    elements.optimizationReport.hidden = true;
  });
  for (const radio of document.querySelectorAll('input[name="replacementNameMode"]')) {
    radio.addEventListener("change", () => { elements.customNameField.hidden = selectedNameMode() !== "custom"; });
  }

  return {
    open,
    commit,
    discard: discardSession,
    hasPending: () => Boolean(staged || localUrl),
    hasReplacement: () => Boolean(staged),
    getCurrentDetails: () => currentDetails,
  };
}
