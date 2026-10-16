// Explicit, language-local page references. Positions are derived, never stored.
function validateSpreadMode(language, field, label) {
  if (language[field] === undefined) return true;
  if (!Array.isArray(language[field])) throw new Error(`Liste de doubles pages ${label} invalide.`);
  const used = new Set();
  for (const pair of language[field]) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(page => typeof page !== "string" || !language.pages.includes(page))) {
      throw new Error(`Double page ${label} : deux références de pages existantes de la même langue sont nécessaires. Dissociez la double page avant de supprimer une page.`);
    }
    if (pair.some(page => used.has(page))) throw new Error(`Une page appartient déjà à une double page ${label}. Dissociez-la d’abord.`);
    if (language.pages.indexOf(pair[1]) !== language.pages.indexOf(pair[0]) + 1) {
      throw new Error(`Cette opération séparerait ou inverserait une double page ${label}. Dissociez la double page avant de modifier cet ordre ou d’insérer une page entre ses membres.`);
    }
    if (field === "horizontalSpreads" && pair[0] === language.pages[0]) throw new Error("La couverture doit rester seule en lecture horizontale. Dissociez cette paire avant de la déplacer en début de manga.");
    pair.forEach(page => used.add(page));
  }
  return true;
}

export const validateVerticalSpreads = language => validateSpreadMode(language, "verticalSpreads", "verticale");
export function validateMangaSpreads(language) {
  validateVerticalSpreads(language);
  validateSpreadMode(language, "horizontalSpreads", "horizontale");
}

export function moveVerticalSpreadPath(language, previous, next) {
  if (language.verticalSpreads) language.verticalSpreads = language.verticalSpreads.map(pair => pair.map(page => page === previous ? next : page));
}

export function moveMangaSpreadPath(language, previous, next) {
  moveVerticalSpreadPath(language, previous, next);
  if (language.horizontalSpreads) language.horizontalSpreads = language.horizontalSpreads.map(pair => pair.map(page => page === previous ? next : page));
}

export function getValidSpreadStarts(pages, spreads = [], { keepCoverSingle = false } = {}) {
  // A manually damaged/legacy public catalog must not hide or duplicate pages.
  const pairs = new Map();
  const used = new Set();
  for (const pair of Array.isArray(spreads) ? spreads : []) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(page => used.has(page))) continue;
    const first = pages.indexOf(pair[0]);
    if (first < 0 || (keepCoverSingle && first === 0) || pages[first + 1] !== pair[1]) continue;
    pairs.set(first, true); pair.forEach(page => used.add(page));
  }
  return pairs;
}

export function getVerticalReadingGroups(pages, verticalSpreads = []) {
  const pairs = getValidSpreadStarts(pages, verticalSpreads);
  const groups = [];
  for (let index = 0; index < pages.length;) {
    const count = pairs.has(index) ? 2 : 1;
    groups.push(Array.from({ length: count }, (_, offset) => ({ src: pages[index + offset], number: index + offset + 1 })));
    index += count;
  }
  return groups;
}
