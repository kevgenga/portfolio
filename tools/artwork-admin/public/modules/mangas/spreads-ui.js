// One page selection and one dialog for two independent, explicit mode settings.
export function createSpreadsUI({ getManga, getLanguage, getLanguageLabel, getPages, getSelection, getRevision, requireSaved, api, mutate, imageUrl, notice }) {
  const modal = document.createElement("dialog");
  modal.className = "dialog compact-dialog spread-config-dialog";
  modal.setAttribute("aria-labelledby", "spread-title");
  modal.innerHTML = `<form class="dialog-panel"><div class="dialog-heading"><h2 id="spread-title">Configurer une double page</h2></div><p data-spread-description></p><div class="vertical-spread-preview"></div>
    <label class="spread-mode-option"><input type="checkbox" data-spread-vertical /><span><strong>Lecture verticale</strong><small>Afficher les deux pages côte à côte pendant le défilement vertical.</small></span></label>
    <label class="spread-mode-option"><input type="checkbox" data-spread-horizontal /><span><strong>Lecture horizontale</strong><small>Forcer les deux pages dans le même panneau sur PC, tablette et smartphone. La couverture reste seule.</small></span></label>
    <p class="muted-copy">Une case horizontale décochée signifie « pas d’association horizontale forcée ». Le regroupement automatique habituel continue ; les pages ne resteront pas forcément isolées.</p>
    <p data-spread-summary role="status" aria-live="polite"></p>
    <label class="spread-mode-option" data-spread-removal hidden><input type="checkbox" data-spread-removal-confirm /><span>Je confirme la suppression des associations explicites de cette paire.</span></label>
    <p class="media-warning" data-spread-error role="alert" hidden></p>
    <p class="muted-copy">Aucun fichier ni temps de réalisation ne sera modifié. Rien n’est enregistré avant confirmation.</p><div class="dialog-actions"><button type="button" class="button button-secondary" data-spread-cancel>Annuler</button><button type="submit" class="button button-primary" data-spread-confirm>Confirmer la configuration</button></div></form>`;
  document.body.append(modal);
  let request = null, busy = false;
  const $ = name => modal.querySelector(`[data-spread-${name}]`);
  const close = () => { modal.close(); request = null; };
  $("cancel").onclick = () => { if (!busy) close(); };
  modal.addEventListener("cancel", event => { if (busy) event.preventDefault(); else request = null; });
  function updateSummary() {
    if (!request) return;
    const vertical = $("vertical").checked, horizontal = $("horizontal").checked;
    $("summary").textContent = vertical || horizontal
      ? `Les pages ${request.numbers.join("–")} seront affichées ensemble ${vertical && horizontal ? "dans les deux modes de lecture" : vertical ? "en lecture verticale uniquement" : "en lecture horizontale forcée uniquement"}.`
      : "Aucune association explicite : pages séparées en vertical, regroupement automatique habituel en horizontal.";
    const removing = request.wasAssociated && !vertical && !horizontal;
    $("removal").hidden = !removing; $("removal-confirm").required = removing;
    $("error").hidden = true;
  }
  for (const name of ["vertical", "horizontal"]) $(name).onchange = () => { $("removal-confirm").checked = false; updateSummary(); };
  function open(selected = getSelection()) {
    if (!requireSaved()) return;
    const manga = getManga(), code = getLanguage(), pages = getPages();
    if (selected.length !== 2 || new Set(selected).size !== 2 || selected.some(page => !pages.includes(page))) {
      return notice("Sélectionnez exactement deux pages dans la même langue (effacez aussi les sélections des autres langues).", "warning");
    }
    const pair = [...selected].sort((a, b) => pages.indexOf(a) - pages.indexOf(b));
    if (pages.indexOf(pair[1]) !== pages.indexOf(pair[0]) + 1) return notice("Sélectionnez deux pages consécutives dans l’ordre actuel.", "warning");
    const matches = entry => entry[0] === pair[0] && entry[1] === pair[1];
    const language = manga.languages[code];
    const vertical = Boolean(language.verticalSpreads?.some(matches));
    const horizontal = Boolean(language.horizontalSpreads?.some(matches));
    const numbers = pair.map(page => pages.indexOf(page) + 1);
    request = { id: manga.id, code, pages: pair, numbers, catalogRevision: getRevision(), wasAssociated: vertical || horizontal };
    $("vertical").checked = request.wasAssociated ? vertical : true;
    $("horizontal").checked = horizontal; $("horizontal").disabled = numbers[0] === 1;
    $("removal-confirm").checked = false;
    modal.querySelector("[data-spread-description]").textContent = `Pages ${numbers.join("–")} · ${getLanguageLabel(code, manga.languages[code].label)} · ${manga.readingDirection === "rtl" ? "droite à gauche" : "gauche à droite"}`;
    const preview = modal.querySelector(".vertical-spread-preview");
    preview.dir = manga.readingDirection === "rtl" ? "rtl" : "ltr";
    preview.replaceChildren(...pair.map((page, i) => {
      const figure = document.createElement("figure"), image = document.createElement("img"), caption = document.createElement("figcaption");
      image.src = imageUrl(page); image.alt = `Page ${numbers[i]}`; caption.textContent = `Page ${numbers[i]}`;
      figure.append(image, caption); return figure;
    }));
    updateSummary();
    modal.showModal(); modal.querySelector("[data-spread-confirm]").focus();
  }
  modal.querySelector("form").onsubmit = async event => {
    event.preventDefault(); if (!request || busy || !modal.querySelector("form").reportValidity()) return;
    const prepared = request;
    busy = true; $("confirm").disabled = true; $("cancel").disabled = true;
    const controls = [$("vertical"), $("horizontal"), $("removal-confirm")].map(input => ({ input, disabled: input.disabled }));
    controls.forEach(({input}) => { input.disabled = true; });
    try {
      // Keep this dialog and its checkbox draft on an HTTP/conflict failure.
      await mutate(() => api(`/api/mangas/${encodeURIComponent(prepared.id)}/languages/${encodeURIComponent(prepared.code)}/spreads`, {
        method: "PUT", body: JSON.stringify({ pages: prepared.pages, vertical: $("vertical").checked, horizontal: $("horizontal").checked, confirmRemoval: $("removal-confirm").checked, catalogRevision: prepared.catalogRevision }),
      }));
      close();
      notice("Configuration de la double page enregistrée.");
    } catch (error) { $("error").textContent = error.message; $("error").hidden = false; }
    finally { busy = false; $("confirm").disabled = false; $("cancel").disabled = false; controls.forEach(({input, disabled}) => { input.disabled = disabled; }); }
  };
  return { open };
}
