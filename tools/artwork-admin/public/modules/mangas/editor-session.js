// Tab-local recovery only. Never writes catalog data or silently applies stale drafts.
export function createEditorSession({ id, capture, restore, revision, notice }) {
  const key = `manga-editor-draft:${id}`;
  let stale = false, disabled = false, storageWarning = false;
  const read = () => { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; } };
  const clear = () => { try { sessionStorage.removeItem(key); } catch { /* Navigation guard remains available. */ } };
  const save = () => {
    if (stale || disabled) return;
    try { sessionStorage.setItem(key, JSON.stringify({ version: 1, revision: revision(), ...capture() })); }
    catch { if (!storageWarning) { storageWarning = true; notice("Le navigateur ne permet pas de conserver le brouillon local. Restez sur cette page et enregistrez avant de la quitter.", "warning"); } }
  };
  const recover = () => {
    const draft = read(); if (!draft) return;
    if (draft.version !== 1 || draft.revision !== revision()) {
      stale = true;
      document.querySelector("#editor-recovery").hidden = false;
      document.querySelector("#editor-recovery-message").textContent = "Un brouillon local existe, mais le catalogue a changé. Il n’a pas été appliqué. Téléchargez-le pour le consulter ou supprimez-le avant de continuer.";
      document.querySelector("#manga-form").inert = true;
      return;
    }
    restore(draft);
    if (draft.dirty || draft.production?.total?.dirty || draft.production?.page?.dirty) notice("Brouillon local restauré. Aucune modification envoyée au serveur.", "warning");
  };
  document.querySelector("#download-draft").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(read(), null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "manga-editor-draft.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.querySelector("#discard-draft").onclick = () => { clear(); stale = false; document.querySelector("#editor-recovery").hidden = true; document.querySelector("#manga-form").inert = false; notice("Brouillon local supprimé. Le catalogue est inchangé."); };
  return { save, recover, clear, suspend() { disabled = true; }, resume() { disabled = false; } };
}
