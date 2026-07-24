const MODULE_LABELS = {
  artwork: "Illustration",
  animation: "Animation",
  manga: "Manga",
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / 1024 / 1024).toFixed(2)} Mo`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erreur HTTP ${response.status}`);
  return body;
}

function actionButton(label, action, className = "button button-secondary") {
  const button = node("button", className, label);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}

function facts(item) {
  const list = node("dl", "media-audit-facts");
  const values = [
    ["Chemin", item.path || "—"],
    ["Dossier", item.directory || item.category || "—"],
    ["Catégorie / type supposé", item.category || item.type || "—"],
    ["Langue supposée", item.languageLabel || item.language || ""],
    ["Format", item.format || item.extension?.replace(".", "").toUpperCase() || "—"],
    ["Dimensions", item.width && item.height ? `${item.width} × ${item.height} px` : "—"],
    ["Poids", formatBytes(item.size)],
    ["Modifié", item.modifiedAt ? formatDate(item.modifiedAt) : "—"],
    ["Statut", item.status || "—"],
    ["SHA-256", item.hash || ""],
  ].filter(([, value]) => value !== "");
  for (const [label, value] of values) {
    const row = node("div");
    row.append(node("dt", "", label), node("dd", "", value));
    list.append(row);
  }
  return list;
}

function section(title, count, className = "") {
  const details = node("details", `media-audit-section ${className}`);
  const summary = node("summary");
  summary.append(node("span", "", title), node("span", "media-audit-section-count", String(count)));
  details.append(summary);
  return details;
}

export function mountMediaAudit({
  module,
  container,
  onIntegrate = null,
  onOpenMissing = null,
  notify = () => {},
}) {
  const state = { report: null, busy: false };
  container.classList.add("media-audit");

  async function mutate(action, item, extra = {}) {
    state.busy = true;
    render();
    try {
      const output = await request(`/api/media-audit/${module}/${action}`, {
        method: "POST",
        body: JSON.stringify({ path: item.path, ...extra }),
      });
      notify(output.message || "Action terminée.", "success");
      await refresh(true);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  function renderFile(item, ignored = false) {
    const card = node("article", "media-audit-file");
    const heading = node("div", "media-audit-file-heading");
    heading.append(node("strong", "", item.name), node("span", `media-audit-status ${ignored ? "neutral" : "warning"}`, ignored ? "Ignoré" : "Non référencé"));
    const actions = node("div", "media-audit-actions");
    const previewUrl = `/api/media-audit/${module}/file?path=${encodeURIComponent(item.path)}`;
    actions.append(
      actionButton("Prévisualiser", () => window.open(previewUrl, "_blank", "noopener")),
      actionButton("Ouvrir dans l’Explorateur", () => mutate("reveal", item)),
    );
    if (!ignored && onIntegrate) {
      actions.append(actionButton("Intégrer au portfolio", () => onIntegrate({ ...item, previewUrl }).catch((error) => notify(error.message, "error")), "button button-primary"));
    }
    actions.append(ignored
      ? actionButton("Réintégrer dans l’audit", () => mutate("restore", item))
      : actionButton("Ignorer", () => mutate("ignore", item)));
    if (!ignored) {
      actions.append(actionButton("Déplacer vers la corbeille", () => {
        const confirmation = window.prompt(`Saisissez exactement le nom du fichier pour confirmer son déplacement vers la corbeille locale :\n${item.name}`);
        if (confirmation) mutate("trash", item, { confirmation });
      }, "button button-danger"));
    }
    card.append(heading, facts(item), actions);
    return card;
  }

  function renderMissing(item) {
    const card = node("article", "media-audit-file");
    const heading = node("div", "media-audit-file-heading");
    heading.append(node("strong", "", item.title || item.entryId || "Entrée sans titre"), node("span", "media-audit-status error", "Fichier manquant"));
    card.append(heading, facts(item));
    if (onOpenMissing && item.entryId) {
      const actions = node("div", "media-audit-actions");
      actions.append(actionButton("Ouvrir dans l’éditeur", () => onOpenMissing(item)));
      card.append(actions);
    }
    return card;
  }

  function renderDuplicates(items) {
    const list = node("div", "media-audit-compact-list");
    for (const item of items) {
      const card = node("article", "media-audit-duplicate");
      const duplicateLabel = item.type === "same-hash"
        ? "Contenu SHA-256 identique"
        : item.type === "expected-cross-section-copy"
          ? "Duplicata volontaire entre sections"
          : "Chemin répété dans le catalogue";
      card.append(node("strong", "", duplicateLabel));
      const paths = item.paths || item.references?.map((reference) => `${reference.entryId}: ${reference.path}`) || [item.path];
      const values = node("ul");
      for (const value of paths) values.append(node("li", "", value));
      card.append(values);
      if (item.hash) card.append(node("code", "", item.hash));
      list.append(card);
    }
    return list;
  }

  function render() {
    container.replaceChildren();
    const heading = node("div", "media-audit-heading");
    const title = node("div");
    title.append(node("p", "eyebrow", `${MODULE_LABELS[module]} ADMIN`), node("h2", "", "Audit des médias"));
    heading.append(title, actionButton(state.busy ? "Audit en cours…" : "Relancer l’audit", () => refresh(true)));
    container.append(heading);
    if (!state.report) {
      container.append(node("p", "muted-copy", "Analyse des fichiers physiques et du catalogue…"));
      return;
    }
    const { summary } = state.report;
    const metrics = node("div", "media-audit-metrics");
    const metricValues = [
      ["Références valides", summary.referenced, "success"],
      ["Non référencés", summary.unreferenced, summary.unreferenced ? "warning" : "success"],
      ["Références manquantes", summary.missing, summary.missing ? "error" : "success"],
      ["Doublons potentiels", summary.duplicates, summary.duplicates ? "warning" : "success"],
      ["Copies inter-section", summary.expectedCopies || 0, "neutral"],
      ["Ignorés", summary.ignored, "neutral"],
      ["Non pris en charge", summary.unsupported, summary.unsupported ? "neutral" : "success"],
    ];
    for (const [label, value, status] of metricValues) {
      const metric = node("div", `media-audit-metric ${status}`);
      metric.append(node("strong", "", String(value)), node("span", "", label));
      metrics.append(metric);
    }
    container.append(metrics);
    const allClear = summary.unreferenced === 0 && summary.missing === 0 && summary.duplicates === 0;
    container.append(node("p", `media-audit-message ${allClear ? "success" : summary.missing ? "error" : "warning"}`,
      allClear
        ? "Tous les fichiers du catalogue sont correctement référencés."
        : `${summary.unreferenced} fichier(s) présent(s) dans les dossiers du portfolio ne sont pas affiché(s) sur le site. ${summary.missing} référence(s) pointe(nt) vers un fichier manquant.`));

    const sections = [
      ["Voir les fichiers non référencés", state.report.unreferenced, "warning", (item) => renderFile(item)],
      ["Références avec fichier manquant", state.report.missing, "error", renderMissing],
      ["Doublons potentiels", state.report.duplicates, "warning", null],
      ["Duplicatas volontaires entre sections", state.report.expectedCopies || [], "neutral", null],
      ["Voir les fichiers ignorés", state.report.ignored, "neutral", (item) => renderFile(item, true)],
      ["Fichiers non pris en charge", state.report.unsupported, "neutral", (item) => {
        const card = node("article", "media-audit-file");
        card.append(node("strong", "", item.name), facts(item));
        return card;
      }],
    ];
    for (const [label, items, className, renderer] of sections) {
      const details = section(label, items.length, className);
      if (items.length === 0) details.append(node("p", "muted-copy", "Aucun fichier dans cette section."));
      else if (!renderer) details.append(renderDuplicates(items));
      else {
        const list = node("div", "media-audit-file-list");
        list.append(...items.map(renderer));
        details.append(list);
      }
      container.append(details);
    }
    container.append(node("p", "media-audit-generated", `Dernier audit : ${formatDate(state.report.generatedAt)} · ${summary.excluded} élément(s) technique(s) exclu(s).`));
  }

  async function refresh(force = false) {
    state.busy = true;
    render();
    try {
      state.report = await request(`/api/media-audit/${module}${force ? "?refresh=1" : ""}`);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      state.busy = false;
      render();
    }
    return state.report;
  }

  render();
  refresh();
  return { refresh, getReport: () => state.report };
}

export async function auditItemAsFile(item) {
  const response = await fetch(item.previewUrl);
  if (!response.ok) throw new Error(`Impossible de charger ${item.name}.`);
  return new File([await response.blob()], item.name, {
    type: response.headers.get("content-type") || "application/octet-stream",
    lastModified: item.modifiedAt ? new Date(item.modifiedAt).getTime() : Date.now(),
  });
}
