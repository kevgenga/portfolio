import { productionTimeFromInputs, splitProductionTime } from "/shared/production-time.js";

let sequence = 0;

// One editor for both forms; persistence is a metadata-only API operation.
export function createProductionTimeFields({ artwork, revision, save }) {
  const prefix = `production-time-${++sequence}`;
  const root = document.createElement("fieldset");
  root.className = "production-time-fields";
  root.innerHTML = `<legend>Temps de réalisation</legend>
    <div class="production-time-units">
      <label class="field" for="${prefix}-hours"><span>Heures</span><input id="${prefix}-hours" data-time-hours type="number" min="0" step="1" inputmode="numeric" /></label>
      <label class="field" for="${prefix}-minutes"><span>Minutes</span><input id="${prefix}-minutes" data-time-minutes type="number" min="0" max="59" step="1" inputmode="numeric" /></label>
    </div>
    <label class="field" for="${prefix}-kind"><span>Type</span><select id="${prefix}-kind" data-time-kind><option value="actual">Temps mesuré</option><option value="estimated">Temps estimé</option></select></label>
    <small class="production-time-help">Facultatif. Une saisie vide conserve le temps enregistré.</small>
    <div class="production-time-actions">
      <button type="button" class="button button-primary production-time-save">Enregistrer le temps</button>
      <button type="button" class="button button-secondary production-time-clear">Effacer le temps de réalisation</button>
    </div>
    <p id="${prefix}-status" class="production-time-status" role="status" aria-live="polite" hidden></p>`;
  const hours = root.querySelector("[data-time-hours]");
  const minutes = root.querySelector("[data-time-minutes]");
  const kind = root.querySelector("[data-time-kind]");
  const status = root.querySelector(".production-time-status");
  const clear = root.querySelector(".production-time-clear");
  for (const input of [hours, minutes, kind]) input.setAttribute("aria-describedby", status.id);
  let current;
  let expectedRevision;
  let baseline;
  let busy = false;
  const snapshot = () => JSON.stringify([hours.value, minutes.value, kind.value]);
  const isDirty = () => snapshot() !== baseline;
  const set = (entry, catalogRevision) => {
    current = entry.productionTime;
    expectedRevision = catalogRevision;
    const fields = splitProductionTime(current);
    hours.value = fields.hours;
    minutes.value = fields.minutes;
    kind.value = fields.kind;
    clear.hidden = current === undefined;
    baseline = snapshot();
    root.classList.remove("is-dirty");
    status.hidden = true;
  };
  const showStatus = (message, error = false) => {
    status.textContent = message;
    status.hidden = false;
    status.classList.toggle("is-error", error);
    for (const input of [hours, minutes, kind]) input.setAttribute("aria-invalid", String(error));
  };
  const change = () => { root.classList.toggle("is-dirty", isDirty()); status.hidden = true; };
  root.addEventListener("input", change);
  root.addEventListener("change", change);
  async function persist(remove = false) {
    if (busy) return;
    let value;
    try { value = remove ? null : productionTimeFromInputs(hours.value, minutes.value, kind.value, current); }
    catch (error) { showStatus(error.message, true); return; }
    if (value === undefined) { showStatus("Aucun temps renseigné. Rien n’a été effacé."); return; }
    if (remove && !window.confirm("Effacer uniquement le temps de réalisation ? L’image et les autres données seront conservées.")) return;
    busy = true;
    // Prevent another submit/rename/replacement while this form's time is saving.
    const controls = [...root.closest("form").elements].map(control => [control, control.disabled]);
    for (const [control] of controls) control.disabled = true;
    try {
      const result = await save({ productionTime: value, catalogRevision: expectedRevision });
      set(result.artwork, result.catalogRevision);
      showStatus(result.message);
    } catch (error) { showStatus(error.message, true); }
    finally {
      for (const [control, disabled] of controls) control.disabled = disabled;
      busy = false;
    }
  }
  root.querySelector(".production-time-save").addEventListener("click", () => persist());
  clear.addEventListener("click", () => persist(true));
  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      // Preserve native keyboard activation of our buttons; do not let the
      // quick editor's Enter shortcut submit unrelated metadata instead.
      event.stopPropagation();
      if (event.target.tagName !== "BUTTON") { event.preventDefault(); persist(); }
    }
  });
  set(artwork, revision);
  return { element: root, isDirty, isBusy: () => busy, set };
}
