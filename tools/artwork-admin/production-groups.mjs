import { createHash, randomUUID } from "node:crypto";
import vm from "node:vm";
import { validateProductionTime } from "../../src/utils/productionTime.js";

const check = (condition, message) => { if (!condition) throw new Error(message); };
export function validateProductionGroups(groups, field, validIds) {
  check(Array.isArray(groups), "Liste de groupes invalide.");
  const ids = new Set();
  for (const group of groups) {
    check(group && typeof group === "object" && !Array.isArray(group) && Reflect.ownKeys(group).every(key => ["id", "name", "time", field].includes(key)), "Structure de groupe invalide.");
    check(typeof group.id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(group.id) && !ids.has(group.id), "Identifiant de groupe invalide ou dupliqué.");
    ids.add(group.id);
    check(group.name === undefined || (typeof group.name === "string" && group.name.length <= 160), "Nom de groupe invalide (160 caractères maximum).");
    validateProductionTime(group.time);
    check(Array.isArray(group[field]) && group[field].length > 0 && new Set(group[field]).size === group[field].length, "Le groupe doit contenir des membres distincts. Supprimez explicitement un groupe devenu vide.");
    check(group[field].every(id => typeof id === "string" && validIds.has(id)), "Le groupe contient une référence inconnue.");
  }
}

export function parseArtworkProductionGroups(source) {
  const hasGroups = /export\s+const\s+artworkProductionGroups\b/.test(source);
  if (!hasGroups) return { groups: [], hasGroups: false };
  const match = source.match(/export\s+const\s+artworkProductionGroups\s*=\s*(\[[\s\S]*\]);\s*$/);
  check(match, "Export artworkProductionGroups invalide.");
  const groups = vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
  return { groups: structuredClone(groups), hasGroups: true };
}
export const serializeArtworkProductionGroups = groups => `export const artworkProductionGroups = ${JSON.stringify(groups, null, 2)};\n`;

// Pure plan construction: callers supply isolated catalog snapshots and persist
// only after the exact same preview has been explicitly confirmed.
export function prepareProductionBatch({ groups, selectedIds, selectionCount, field, readTime, setTime, clearTime, payload, revision }) {
  check(payload && typeof payload === "object" && !Array.isArray(payload), "Requête groupée invalide.");
  check(Object.keys(payload).every(key => ["catalogRevision", "operation", "ids", "selection", "time", "name", "groupId", "strategy", "token", "confirmed", "confirmOverwrite", "confirmOverlap"].includes(key)), "Champ groupé inconnu.");
  check(["individual", "individual-clear", "group-create", "group-update", "group-delete"].includes(payload.operation), "Opération groupée inconnue.");
  const clearing = payload.operation === "individual-clear";
  if (clearing) check(!["time", "strategy", "name", "groupId"].some(key => Object.hasOwn(payload, key)), "L’effacement individuel n’accepte ni durée, ni groupe, ni politique de remplacement.");
  const current = ["group-update", "group-delete"].includes(payload.operation) ? groups.find(group => group.id === payload.groupId) : undefined;
  if (["group-update", "group-delete"].includes(payload.operation)) check(current, "Groupe introuvable.");
  const members = payload.operation === "group-delete" ? [...current[field]] : [...new Set(selectedIds)];
  check(members.length > 0, "Sélectionnez au moins un élément.");
  let time;
  if (payload.operation !== "group-delete" && !clearing) time = validateProductionTime(Object.hasOwn(payload, "time") ? payload.time : current?.time);
  const name = Object.hasOwn(payload, "name") ? payload.name : current?.name || "";
  check(typeof name === "string" && name.length <= 160, "Nom de groupe invalide (160 caractères maximum).");
  const existing = members.filter(id => readTime(id) !== undefined).length;
  let created = 0, replaced = 0, skipped = 0, erased = 0, preserved = existing;
  const overlaps = payload.operation.startsWith("group-") && payload.operation !== "group-delete" ? groups.filter(group => group.id !== current?.id).flatMap(group => {
    const shared = group[field].filter(id => members.includes(id)).length;
    return shared ? [{ id: group.id, name: group.name || "Groupe de production", shared, identical: shared === members.length && shared === group[field].length }] : [];
  }) : [];
  if (clearing) {
    for (const id of members) {
      if (readTime(id) === undefined) { skipped++; continue; }
      check(typeof clearTime === "function", "Effacement individuel non pris en charge.");
      clearTime(id); erased++;
    }
    preserved = 0;
  } else if (payload.operation === "individual") {
    check(["replace", "missing"].includes(payload.strategy), "Choisissez de remplacer les durées ou de renseigner uniquement les éléments sans durée.");
    for (const id of members) {
      const present = readTime(id) !== undefined;
      if (present && payload.strategy === "missing") { skipped++; continue; }
      if (present) replaced++; else created++;
      setTime(id, { ...time });
    }
    preserved = skipped;
  } else if (payload.operation === "group-delete") groups.splice(groups.indexOf(current), 1);
  else {
    const next = { id: current?.id || `group-${randomUUID()}`, name: name.trim(), time, [field]: members };
    if (current) groups.splice(groups.indexOf(current), 1, next); else groups.push(next);
  }
  const summary = { operation: payload.operation, files: payload.operation === "group-delete" ? members.length : selectionCount,
    logicalCount: members.length, existing, created, replaced, preserved, erased, skipped, time: time || current?.time, groupName: name.trim() || "Groupe de production", overlaps };
  const intent = Object.fromEntries(Object.entries(payload).filter(([key]) => !["token", "confirmed", "confirmOverwrite", "confirmOverlap"].includes(key)));
  const token = createHash("sha256").update(JSON.stringify({ revision, intent, summary })).digest("hex");
  return { ...summary, token };
}
export function verifyProductionConfirmation(payload, plan) {
  check(payload.confirmed === true && payload.token === plan.token, "Prévisualisez de nouveau l’opération puis confirmez-la explicitement.");
  check(!plan.replaced || payload.confirmOverwrite === true, "Confirmez explicitement le remplacement des durées existantes.");
  check(!plan.overlaps.length || payload.confirmOverlap === true, "Confirmez explicitement les recouvrements ou groupes identiques.");
}
