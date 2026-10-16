import { productionTimeFromInputs, splitProductionTime } from "/shared/production-time.js";

// Shared local Admin UI. Adapters supply catalog identities, never array indices.
export function mountProductionBatch({ container, getItems, getVisible, getGroups, getRevision, request, applyResult, canOperate, notice, memberField, scope = () => "artwork" }) {
  const selected = new Map();
  let currentScope, busy = false, plan = null, prepared = null, editingGroup = null, operation = "individual";
  let editing = false, previewTimer, previewVersion = 0, previewKey = null;
  const dialog = document.createElement("dialog"); dialog.className = "dialog production-batch-dialog";
  dialog.setAttribute("aria-label", "Temps de réalisation — modification groupée");
  dialog.innerHTML = `<form class="dialog-panel production-batch-form">
    <div class="dialog-heading"><h2>Temps de réalisation</h2><button type="button" class="icon-button" data-batch-close aria-label="Fermer">×</button></div>
    <div class="production-group-list" data-batch-groups hidden></div>
    <p class="production-batch-help" data-batch-help>Choisissez l’opération, renseignez les informations, vérifiez le récapitulatif automatique puis confirmez.</p>
    <div data-batch-fields>
      <label class="field"><span>Opération — trois actions distinctes</span><select data-batch-mode><option value="individual">A — Même durée individuelle pour chaque élément</option><option value="group-create">B — Durée totale de l’ensemble — groupe</option><option value="individual-clear">C — Effacer les durées individuelles de la sélection</option></select></label>
      <p class="muted-copy" data-batch-explanation></p>
      <label class="field" data-batch-strategy-field><span>Durées individuelles existantes</span><select data-batch-strategy><option value="missing">Renseigner uniquement les éléments sans durée</option><option value="replace">Remplacer les durées de tous les éléments sélectionnés</option></select></label>
      <label class="field" data-batch-name-field hidden><span>Nom administratif du groupe (facultatif)</span><input data-batch-name maxlength="160" /></label>
      <div class="production-batch-time-fields" data-batch-time-fields>
        <div class="production-time-units"><label class="field"><span>Heures</span><input data-batch-hours type="number" min="0" step="1" inputmode="numeric" /></label><label class="field"><span>Minutes</span><input data-batch-minutes type="number" min="0" max="59" step="1" inputmode="numeric" /></label></div>
        <label class="field"><span>Type</span><select data-batch-kind><option value="actual">Temps mesuré</option><option value="estimated">Temps estimé</option></select></label>
      </div>
      <details data-batch-members-wrap hidden><summary>Modifier les membres du groupe</summary><button type="button" class="button button-secondary" data-batch-use-selection>Utiliser la sélection courante</button><div class="production-group-members" data-batch-members></div></details>
    </div>
    <div class="production-batch-preview" data-batch-preview role="status" aria-live="polite" hidden></div>
    <label class="toggle-field" data-batch-ack-field hidden><input type="checkbox" data-batch-ack /><span>Je confirme les remplacements de durées et/ou les recouvrements signalés, y compris les groupes identiques.</span></label>
    <p class="media-warning" data-batch-error role="alert" hidden></p>
    <div class="dialog-actions"><button type="button" class="button button-secondary" data-batch-close>Annuler</button><button type="button" class="button button-secondary" data-batch-preview-button>Actualiser le récapitulatif</button><button type="submit" class="button button-primary" data-batch-confirm disabled>Confirmer l’opération</button></div>
  </form>`;
  document.body.append(dialog);
  const $ = name => dialog.querySelector(`[data-batch-${name}]`);
  container.classList.add("production-selection-bar");
  container.innerHTML = `<p data-production-count role="status" aria-live="polite"></p><div><button type="button" class="button button-secondary" data-select-filtered>Sélectionner les cartes affichées</button><button type="button" class="button button-secondary" data-clear-selection>Effacer la sélection</button><button type="button" class="button button-primary" data-edit-selection>Temps — modification groupée</button><button type="button" class="button button-secondary" data-manage-groups>Groupes de production</button></div>`;
  const uniqueItems = () => [...new Map(getItems().map(item => [item.logicalKey, item])).values()];
  const labelTime = time => { const parts = splitProductionTime(time); return `${parts.hours} h ${parts.minutes.padStart(2, "0")} — ${time.kind === "actual" ? "mesuré" : "estimé"}`; };
  const error = text => { $("error").textContent = text; $("error").hidden = false; };
  function invalidate() {
    clearTimeout(previewTimer); previewVersion++; previewKey = null; plan = null; prepared = null;
    $("confirm").disabled = true; $("preview").hidden = true; $("ack-field").hidden = true; $("ack").checked = false; $("error").hidden = true;
  }
  function status(text) { $("preview").textContent = text; $("preview").hidden = false; }
  function refreshCount() {
    const visible = new Set(getVisible()); const hidden = [...selected.keys()].filter(key => !visible.has(key)).length;
    const logical = new Set([...selected.values()].map(item => item.logicalKey)).size;
    container.querySelector("[data-production-count]").textContent = `${selected.size} élément(s) sélectionné(s) · ${logical} dessin(s) distinct(s)${hidden ? ` · ${hidden} hors des cartes affichées` : ""}`;
    container.querySelector("[data-select-filtered]").textContent = `Sélectionner les cartes filtrées affichées (${visible.size})`;
    container.querySelector("[data-edit-selection]").disabled = selected.size === 0;
    for (const box of document.querySelectorAll("input[data-production-key]")) box.checked = selected.has(box.dataset.productionKey);
    schedulePreview();
  }
  function sync() {
    const nextScope = scope();
    if (currentScope !== undefined && nextScope !== currentScope && selected.size) { selected.clear(); notice("Sélection réinitialisée : changement de projet Manga.", "warning"); }
    currentScope = nextScope;
    const all = new Map(getItems().map(item => [item.key, item]));
    let removed = 0;
    for (const [key, previous] of selected) {
      if (all.has(key)) selected.set(key, all.get(key));
      else {
        const replacement = [...all.values()].find(item => item.logicalKey === previous.logicalKey && !item.archived);
        selected.delete(key); if (replacement) selected.set(replacement.key, replacement); else removed++;
      }
    }
    if (removed) notice(`${removed} élément(s) retiré(s) de la sélection : référence modifiée ou supprimée.`, "warning");
    refreshCount();
  }
  function checkbox(item) {
    const label = document.createElement("label"); label.className = "production-select";
    const input = document.createElement("input"); input.type = "checkbox"; input.dataset.productionKey = item.key;
    input.setAttribute("aria-label", `Sélectionner ${item.label}`); input.checked = selected.has(item.key);
    input.onchange = () => { if (input.checked) selected.set(item.key, item); else selected.delete(item.key); refreshCount(); };
    label.onclick = event => event.stopPropagation();
    label.append(input, document.createTextNode("Sélectionner")); return label;
  }
  function renderMembers(group) {
    const members = new Set(group[memberField]);
    $("members").replaceChildren(...uniqueItems().map(item => {
      const label = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox";
      input.dataset.memberKey = item.key; input.checked = members.has(item.logicalKey);
      label.append(input, document.createTextNode(item.label)); return label;
    }));
  }
  function setMode() {
    const clearing = operation === "individual-clear", needsTime = !clearing && operation !== "group-delete";
    $("strategy-field").hidden = operation !== "individual";
    $("strategy").disabled = operation !== "individual";
    $("name-field").hidden = !["group-create", "group-update"].includes(operation);
    $("name").disabled = $("name-field").hidden;
    $("time-fields").hidden = !needsTime;
    for (const key of ["hours", "minutes", "kind"]) $(key).disabled = !needsTime;
    $("members-wrap").hidden = operation !== "group-update";
    $("explanation").textContent = operation === "individual" ? "Chaque dessin distinct recevra sa propre durée. Aucun groupe ne sera créé."
      : clearing ? "Supprime uniquement les temps de réalisation individuels déjà renseignés sur les œuvres sélectionnées. Les éléments sans durée seront ignorés. Aucun groupe ni temps global Manga ne sera modifié."
      : operation === "group-delete" ? "Seul le groupe sera supprimé. Ses œuvres, médias et durées individuelles seront conservés."
        : "Durée AU TOTAL pour ce groupe : aucune répartition, modification individuelle ou addition au total du manga.";
    $("confirm").className = `button ${clearing ? "button-danger production-batch-clear" : "button-primary"}`;
    $("confirm").textContent = clearing ? "Effacer les durées" : "Confirmer l’opération";
  }
  function openBatch(group = null, deletion = false) {
    if (busy || !canOperate()) return notice("Enregistrez ou annulez les modifications en cours avant cette opération.", "warning");
    editing = false; invalidate(); sync(); editingGroup = group;
    operation = group ? deletion ? "group-delete" : "group-update" : "individual";
    $("groups").hidden = true; $("help").hidden = false; $("fields").hidden = deletion; $("mode").disabled = Boolean(group);
    $("preview-button").hidden = false;
    $("mode").value = group ? "group-create" : "individual";
    const values = splitProductionTime(group?.time);
    $("hours").value = values.hours; $("minutes").value = values.minutes || "0"; $("kind").value = values.kind;
    $("name").value = group?.name || ""; $("strategy").value = "missing";
    if (group) renderMembers(group);
    setMode(); if (!dialog.open) dialog.showModal(); editing = true;
    (deletion ? $("close") : $("hours")).focus(); schedulePreview();
  }
  function showGroups() {
    if (busy || !canOperate()) return notice("Enregistrez les modifications en cours avant de gérer les groupes.", "warning");
    editing = false; sync(); invalidate(); $("groups").hidden = false; $("help").hidden = true; $("fields").hidden = true; $("preview-button").hidden = true;
    $("confirm").textContent = "Confirmer l’opération"; $("confirm").className = "button button-primary";
    const items = new Map(uniqueItems().map(item => [item.logicalKey, item]));
    $("groups").replaceChildren(...getGroups().map(group => {
      const card = document.createElement("article"); const title = document.createElement("strong");
      title.textContent = `${group.name || "Groupe de production"} · ${group[memberField].length} membre(s) · ${labelTime(group.time)} AU TOTAL`;
      const details = document.createElement("details"); const summary = document.createElement("summary"); summary.textContent = "Consulter les membres"; details.append(summary);
      for (const id of group[memberField]) { const p = document.createElement("p"); p.textContent = items.get(id)?.label || `${id} — référence historique`; details.append(p); }
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "button button-secondary"; edit.textContent = "Modifier le groupe"; edit.onclick = () => { $("preview-button").hidden = false; openBatch(group); };
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button-danger"; remove.textContent = "Supprimer le groupe"; remove.onclick = () => { $("preview-button").hidden = false; openBatch(group, true); };
      card.append(title, details, edit, remove); return card;
    }));
    if (!getGroups().length) $("groups").textContent = "Aucun groupe de production renseigné.";
    if (!dialog.open) dialog.showModal();
  }
  function payload() {
    const keys = operation === "group-update" ? [...$("members").querySelectorAll("input:checked")].map(box => box.dataset.memberKey) : [...selected.keys()];
    const byKey = new Map(getItems().map(item => [item.key, item]));
    const items = keys.map(key => { const item = byKey.get(key); if (!item) throw new Error("La sélection a changé. Rechargez les données."); return item; });
    return { catalogRevision: getRevision(), operation, ...(editingGroup ? { groupId: editingGroup.id } : {}),
      ...(operation === "group-delete" ? {} : {
        ...(memberField === "artworkIds" ? { ids: items.map(item => item.logicalKey) } : { selection: items.map(item => item.descriptor) }),
        ...(operation === "individual-clear" ? {} : {
          time: productionTimeFromInputs($("hours").value, $("minutes").value, $("kind").value, editingGroup?.time),
          ...(operation === "individual" ? { strategy: $("strategy").value } : { name: $("name").value }),
        }),
      }),
    };
  }
  const intentKey = intent => JSON.stringify({ scope: scope(), intent });
  const currentKey = () => { try { return intentKey(payload()); } catch { return null; } };
  function schedulePreview(immediate = false) {
    if (busy || !editing || !dialog.open) return;
    let intent;
    try {
      intent = payload();
      if (!["group-delete", "individual-clear"].includes(intent.operation) && !intent.time) throw new Error("Renseignez une durée valide pour afficher le récapitulatif.");
      if (intent.operation !== "group-delete" && !(intent.ids || intent.selection).length) {
        invalidate(); status("Sélectionnez au moins un élément pour afficher le récapitulatif."); return;
      }
    } catch (e) {
      invalidate();
      if (/durée valide|heures entières|Temps invalide/.test(e.message)) status("Renseignez une durée valide pour afficher le récapitulatif. Heures entières ≥ 0, minutes de 0 à 59.");
      else { status("Récapitulatif indisponible : vérifiez la sélection et actualisez les données."); error(e.message); }
      return;
    }
    const key = intentKey(intent);
    if (!immediate && key === previewKey) return;
    invalidate(); previewKey = key; status("Préparation du récapitulatif…");
    const version = previewVersion;
    previewTimer = setTimeout(() => calculatePreview(intent, key, version), immediate ? 0 : 250);
  }
  async function calculatePreview(intent, key, version) {
    const isCurrent = () => dialog.open && editing && !busy && version === previewVersion && key === currentKey();
    if (!isCurrent()) return;
    try {
      // Read/validate only. Keep fields editable while the server responds.
      const response = await request("preview", intent);
      if (!isCurrent()) return;
      plan = response.plan; prepared = intent;
      const clearing = plan.operation === "individual-clear";
      const action = clearing ? "EFFACER LES DURÉES INDIVIDUELLES DE LA SÉLECTION"
        : plan.operation === "individual" ? `Chaque dessin recevra ${labelTime(plan.time)}.`
          : plan.operation === "group-delete" ? `Supprimer le groupe « ${plan.groupName} » uniquement.`
            : `${plan.groupName} : ${labelTime(plan.time)} AU TOTAL. Aucune durée individuelle modifiée.`;
      $("preview").replaceChildren();
      for (const line of [
        `${plan.files} élément(s)/fichier(s) sélectionné(s) → ${plan.logicalCount} dessin(s) distinct(s).`, action,
        `Durées déjà présentes : ${plan.existing} · créées : ${plan.created} · remplacées : ${plan.replaced} · conservées : ${plan.preserved} · effacées : ${plan.erased} · ignorées : ${plan.skipped}.`,
        ...(clearing ? [plan.erased ? `L’opération effacera ${plan.erased} durée(s). ${plan.skipped} élément(s) sans durée seront ignorés.` : `${plan.files} élément(s) sélectionné(s) — aucune durée de réalisation à effacer.`, "Les œuvres, images, associations, groupes et temps globaux Manga resteront intacts."] : []),
        ...plan.overlaps.map(group => `${group.identical ? "Groupe IDENTIQUE" : "Recouvrement"} : ${group.name} (${group.shared} membre(s) commun(s)). Aucun cumul automatique.`),
        "Vérifiez ce récapitulatif automatique avant de confirmer.",
      ]) { const p = document.createElement("p"); p.textContent = line; $("preview").append(p); }
      $("preview").hidden = false; $("ack-field").hidden = !plan.replaced && !plan.overlaps.length; $("ack").checked = false;
      $("confirm").textContent = clearing ? plan.erased === 0 ? "Aucune durée à effacer" : plan.erased === 1 ? "Effacer la durée" : `Effacer les ${plan.erased} durées` : "Confirmer l’opération";
      $("confirm").disabled = clearing && plan.erased === 0; $("error").hidden = true;
    } catch (e) {
      if (!isCurrent()) return;
      invalidate(); status("Récapitulatif indisponible : la confirmation reste désactivée. Corrigez les informations ou actualisez les données."); error(e.message);
    }
  }
  $("preview-button").onclick = () => schedulePreview(true);
  dialog.querySelector("form").onsubmit = async event => {
    event.preventDefault(); if (busy || !plan || !prepared) return;
    if (currentKey() !== previewKey) { schedulePreview(true); return; }
    if (plan.operation === "individual-clear" && !plan.erased) return;
    if (!$("ack-field").hidden && !$("ack").checked) return error("Confirmez explicitement les remplacements ou recouvrements signalés.");
    busy = true; clearTimeout(previewTimer); previewVersion++; dialog.inert = true;
    try {
      const response = await request("commit", { ...prepared, token: plan.token, confirmed: true, confirmOverwrite: $("ack").checked, confirmOverlap: $("ack").checked });
      await applyResult(response); dialog.close(); sync(); notice(response.message || "Opération groupée enregistrée.");
    } catch (e) { invalidate(); status("Écriture refusée ou échouée. Votre saisie est conservée ; actualisez le récapitulatif ou rechargez les données en cas de conflit."); error(e.message); }
    finally { busy = false; dialog.inert = false; }
  };
  const changed = event => { if (event.target === $("ack")) return; if (event.target === $("mode")) { operation = $("mode").value; setMode(); } schedulePreview(); };
  dialog.querySelector("form").addEventListener("input", changed);
  dialog.querySelector("form").addEventListener("change", changed);
  $("use-selection").onclick = () => { const chosen = new Set([...selected.values()].map(item => item.logicalKey)); for (const box of $("members").querySelectorAll("input")) box.checked = chosen.has(getItems().find(item => item.key === box.dataset.memberKey)?.logicalKey); schedulePreview(); };
  for (const close of dialog.querySelectorAll("[data-batch-close]")) close.onclick = () => { if (!busy) dialog.close(); };
  dialog.oncancel = event => { if (busy) event.preventDefault(); };
  // Native close events are queued: a late event from the previous opening
  // must not invalidate a dialog that has already been reopened.
  dialog.addEventListener("close", () => { if (!dialog.open) { editing = false; invalidate(); } });
  container.querySelector("[data-select-filtered]").onclick = () => { const all = new Map(getItems().map(item => [item.key, item])); for (const key of getVisible()) if (all.has(key)) selected.set(key, all.get(key)); refreshCount(); };
  container.querySelector("[data-clear-selection]").onclick = () => { selected.clear(); refreshCount(); };
  container.querySelector("[data-edit-selection]").onclick = () => { $("preview-button").hidden = false; openBatch(); };
  container.querySelector("[data-manage-groups]").onclick = showGroups;
  return { checkbox, sync, getSelectedKeys: () => [...selected.keys()], restoreSelection(keys) { selected.clear(); for (const item of getItems()) if (keys.includes(item.key)) selected.set(item.key, item); sync(); }, isBusy: () => busy, rekey(oldKey, newKey) { if (selected.has(oldKey)) { const old = selected.get(oldKey); selected.delete(oldKey); selected.set(newKey, { ...old, key: newKey, logicalKey: newKey }); } } };
}
