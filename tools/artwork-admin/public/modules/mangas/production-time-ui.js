import { productionTimeFromInputs, splitProductionTime } from "/shared/production-time.js";
import { getLanguageLabel } from "/shared/language-labels.js";

let sequence = 0;
export function createMangaProductionUI({ getManga, getRevision, api, onSaved, canSave, notice, dialog }) {
  const projectRoot = document.querySelector("#manga-production-project");
  const pageRoot = document.querySelector("#manga-production-page");
  let selectedPath = null, projectEditor, pageEditor, busy = false;
  const drawing = path => {
    const p = getManga()?.productionTime;
    return p?.pages?.find(page => page.id === p.bindings?.find(binding => binding.path === path)?.pageId);
  };
  const describeTime = time => {
    if (!time) return "Non renseigné";
    const fields = splitProductionTime(time);
    return `${fields.hours} h ${fields.minutes.padStart(2, "0")} — ${time.kind === "actual" ? "mesuré" : "estimé"}`;
  };
  const caption = path => {
    for (const [code, language] of Object.entries(getManga().languages)) {
      const index = language.pages.indexOf(path);
      if (index >= 0) return `${getLanguageLabel(code, language.label)} — Page ${String(index + 1).padStart(2, "0")} — ${path.split("/").at(-1)}`;
    }
    return path;
  };
  async function commit(action, payload, editor) {
    if (busy || !canSave()) return notice("Une autre opération est en cours. Réessayez après sa fin.", "warning");
    busy = true; dialog.inert = true;
    try {
      const route = action === "total" ? "production-time" : action === "page" ? "production-page" : "production-bindings";
      const result = await api(`/api/mangas/${encodeURIComponent(getManga().id)}/${route}`, {
        method: action === "associate" ? "POST" : action === "separate" ? "DELETE" : "PUT",
        body: JSON.stringify({ ...payload, catalogRevision: getRevision() }),
      });
      onSaved(result);
      if (editor) editor.reset();
      if (action !== "total") renderPage();
      renderHistory();
      notice(result.message);
    } catch (error) {
      if (editor) editor.error(error.message);
      else { const status = pageRoot.querySelector("[data-production-status]"); status.textContent = error.message; status.hidden = false; }
      notice(error.message, "error");
    } finally {
      busy = false; dialog.inert = false;
      const root = action === "total" ? projectRoot : pageRoot;
      root.querySelector(action === "total" ? "[data-time-save]" : "[data-time-hours]")?.focus({ preventScroll: true });
    }
  }
  function fields(title, key, readCurrent, save, clearLabel) {
    const prefix = `manga-time-${++sequence}`;
    const root = document.createElement("fieldset"); root.className = "production-time-fields";
    root.dataset.productionEditor = key;
    root.innerHTML = `<legend>${title}</legend><p class="production-time-status" data-time-value></p>
      <div class="production-time-units"><label class="field" for="${prefix}-hours"><span>Heures</span><input id="${prefix}-hours" data-time-hours type="number" min="0" step="1" inputmode="numeric" /></label><label class="field" for="${prefix}-minutes"><span>Minutes</span><input id="${prefix}-minutes" data-time-minutes type="number" min="0" max="59" step="1" inputmode="numeric" /></label></div>
      <label class="field" for="${prefix}-kind"><span>Type</span><select id="${prefix}-kind" data-time-kind><option value="actual">Temps mesuré</option><option value="estimated">Temps estimé</option></select></label>
      <div class="production-time-actions"><button type="button" class="button button-primary" data-time-save>Enregistrer le temps</button><button type="button" class="button button-secondary" data-time-clear>${clearLabel}</button></div>
      <p id="${prefix}-status" class="production-time-status" role="status" aria-live="polite" hidden></p>`;
    const h = root.querySelector("[data-time-hours]"), m = root.querySelector("[data-time-minutes]"), k = root.querySelector("[data-time-kind]"), status = root.querySelector('[role="status"]');
    for (const input of [h, m, k]) input.setAttribute("aria-describedby", status.id);
    let baseline;
    const snapshot = () => JSON.stringify([h.value, m.value, k.value]);
    const editor = { element: root, dirty: () => baseline !== snapshot(),
      error(text) { status.textContent = text; status.hidden = false; status.classList.add("is-error"); },
      reset() {
        const current = readCurrent(), value = splitProductionTime(current);
        h.value = value.hours; m.value = value.minutes; k.value = value.kind;
        root.querySelector("[data-time-value]").textContent = describeTime(current);
        root.querySelector("[data-time-clear]").hidden = !current;
        baseline = snapshot(); status.hidden = true; root.classList.remove("is-dirty");
      },
    };
    root.oninput = root.onchange = () => { root.classList.toggle("is-dirty", editor.dirty()); status.hidden = true; };
    async function persist(remove = false) {
      let value;
      try { value = remove ? null : productionTimeFromInputs(h.value, m.value, k.value, readCurrent()); }
      catch (error) { editor.error(error.message); return; }
      if (value === undefined) return editor.error("Saisissez une durée. Les champs vides ne suppriment aucune donnée.");
      const question = key === "page" ? "Effacer le temps de ce dessin dans toutes ses versions associées ? Les autres dessins et les images seront conservés." : "Effacer uniquement le temps global ? Les durées des pages et les images seront conservées.";
      if (remove && !confirm(question)) return;
      await save(value, editor);
    }
    root.querySelector("[data-time-save]").onclick = () => persist();
    root.querySelector("[data-time-clear]").onclick = () => persist(true);
    root.onkeydown = event => { if (event.key === "Enter") { event.stopPropagation(); if (event.target.tagName !== "BUTTON") { event.preventDefault(); persist(); } } };
    editor.reset(); return editor;
  }
  function renderHistory() {
    projectRoot.querySelector(".manga-production-history")?.remove();
    const p = getManga().productionTime;
    const history = p?.pages?.filter(page => page.time && !p.bindings?.some(binding => binding.pageId === page.id)) || [];
    if (!history.length) return;
    const details = document.createElement("details"); details.className = "manga-production-history";
    const summary = document.createElement("summary"); summary.textContent = `${history.length} durée(s) historique(s) sans page associée — conservées`;
    details.append(summary);
    for (const page of history) { const item = document.createElement("p"); item.textContent = `${page.id} : ${describeTime(page.time)}`; details.append(item); }
    projectRoot.append(details);
  }
  function renderProject() {
    projectEditor = fields("Temps de réalisation du projet", "total", () => getManga().productionTime?.total, (value, editor) => commit("total", { total: value }, editor), "Effacer le temps global");
    projectRoot.replaceChildren(projectEditor.element); renderHistory();
  }
  function renderPage() {
    if (!selectedPath) { pageRoot.hidden = true; pageEditor = null; return; }
    pageRoot.hidden = false; pageRoot.replaceChildren();
    const heading = document.createElement("div"); heading.className = "manga-production-heading";
    const name = document.createElement("strong"); name.textContent = caption(selectedPath);
    const close = document.createElement("button"); close.type = "button"; close.className = "button button-secondary"; close.textContent = "Fermer";
    close.onclick = () => { if (busy || (pageEditor?.dirty() && !confirm("Abandonner la durée de page non enregistrée ?"))) return; selectedPath = null; renderPage(); };
    heading.append(name, close); pageRoot.append(heading);
    const layout = document.createElement("div"); layout.className = "manga-production-layout";
    pageEditor = fields("Temps de réalisation de la page", "page", () => drawing(selectedPath)?.time, (value, editor) => commit("page", { path: selectedPath, time: value }, editor), "Effacer le temps de la page");
    layout.append(pageEditor.element);
    const associations = document.createElement("div"); associations.className = "manga-production-associations";
    const linked = document.createElement("p"), current = drawing(selectedPath);
    const paths = getManga().productionTime?.bindings?.filter(binding => binding.pageId === current?.id && binding.path !== selectedPath).map(binding => binding.path) || [];
    linked.textContent = paths.length ? `Même dessin : ${paths.map(caption).join(" · ")}` : "Aucune correspondance confirmée.";
    associations.append(linked);
    const label = document.createElement("label"); label.className = "field";
    const text = document.createElement("span"); text.textContent = "Associer à une page d’une autre langue";
    const select = document.createElement("select"); select.dataset.productionTarget = "";
    select.append(new Option("Choisir une correspondance…", ""));
    const sourceCode = Object.keys(getManga().languages).find(code => getManga().languages[code].pages.includes(selectedPath));
    for (const [code, language] of Object.entries(getManga().languages)) if (code !== sourceCode) for (const path of language.pages) if (!paths.includes(path)) select.append(new Option(caption(path), path));
    label.append(text, select); associations.append(label);
    const resolution = document.createElement("label"); resolution.className = "field"; resolution.hidden = true;
    const resolutionText = document.createElement("span"); resolutionText.textContent = "Durées différentes : choisir la durée commune";
    const choice = document.createElement("select"); choice.dataset.productionResolution = "";
    choice.append(new Option("Choisir explicitement…", ""), new Option("Conserver la durée de cette page", "source"), new Option("Conserver la durée de la page cible", "target"));
    resolution.append(resolutionText, choice); associations.append(resolution);
    select.onchange = () => {
      const source = drawing(selectedPath)?.time, target = drawing(select.value)?.time;
      resolution.hidden = !(source && target && (source.minutes !== target.minutes || source.kind !== target.kind));
      choice.value = "";
      resolutionText.textContent = `Durées différentes : ${describeTime(source)} / ${describeTime(target)}. Choisir la durée commune (l’autre sera conservée).`;
    };
    const associate = document.createElement("button"); associate.type = "button"; associate.className = "button button-secondary"; associate.textContent = "Confirmer l’association"; associate.dataset.productionAssociate = "";
    associate.onclick = () => {
      if (pageEditor.dirty()) return notice("Enregistrez le temps de cette page avant de l’associer.", "warning");
      if (!select.value) return notice("Choisissez une page cible.", "warning");
      if (!resolution.hidden && !choice.value) return notice("Choisissez explicitement la durée commune.", "warning");
      const affected = getManga().productionTime?.groups?.some(group => group.pageIds.includes(drawing(selectedPath)?.id) || group.pageIds.includes(drawing(select.value)?.id));
      if (confirm(`Confirmer qu’il s’agit du même dessin ?\n${caption(selectedPath)}\n${caption(select.value)}\nLa durée sera commune. Les durées non retenues seront conservées dans l’historique.${affected ? "\nLes groupes concernés seront mis à jour et leurs membres dédupliqués ; leurs durées totales resteront inchangées. Des recouvrements peuvent en résulter, sans cumul automatique." : ""}`)) commit("associate", { path: selectedPath, targetPath: select.value, ...(choice.value ? { resolution: choice.value } : {}), ...(affected ? { confirmGroups: true } : {}) });
    };
    associations.append(associate);
    if (paths.length) {
      const separateLabel = document.createElement("label"); separateLabel.className = "field";
      const separateText = document.createElement("span"); separateText.textContent = "En retirant l’association sur cette page";
      const mode = document.createElement("select"); mode.dataset.productionSeparateMode = "";
      mode.append(new Option("Conserver sa durée enregistrée", "copy"), new Option("La laisser sans durée (autres versions conservées)", "empty"));
      separateLabel.append(separateText, mode); associations.append(separateLabel);
      const separate = document.createElement("button"); separate.type = "button"; separate.className = "button button-secondary"; separate.textContent = "Retirer cette association"; separate.dataset.productionSeparate = "";
      separate.onclick = () => {
        if (pageEditor.dirty()) return notice("Enregistrez le temps de cette page avant de retirer l’association.", "warning");
        if (confirm(`Séparer ce dessin ? ${mode.value === "copy" ? "La durée actuelle sera conservée sur les deux identités ; vous pourrez la corriger manuellement." : "Cette page sera sans durée. Les autres versions conserveront leur durée."}`)) commit("separate", { path: selectedPath, mode: mode.value });
      };
      associations.append(separate);
    }
    const status = document.createElement("p"); status.dataset.productionStatus = ""; status.setAttribute("role", "status"); status.className = "media-warning"; status.hidden = true;
    associations.append(status); layout.append(associations); pageRoot.append(layout); pageRoot.scrollTop = 0;
  }
  return { drawing, describe: path => describeTime(drawing(path)?.time), isDirty: () => Boolean(projectEditor?.dirty() || pageEditor?.dirty()), isBusy: () => busy,
    reset() { selectedPath = null; renderProject(); renderPage(); },
    closePage() { selectedPath = null; renderPage(); },
    openPage(path) { selectedPath = path; renderPage(); pageRoot.querySelector("[data-time-hours]").focus(); },
  };
}
