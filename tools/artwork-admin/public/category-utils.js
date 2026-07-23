export const CATEGORY_VALUES = Object.freeze([
  "backgrounds",
  "character-design",
  "illustrations",
  "paintings",
  "sketches",
]);

export const CATEGORY_LABELS = Object.freeze({
  backgrounds: "Backgrounds",
  "character-design": "Character Design",
  illustrations: "Illustrations",
  paintings: "Paintings",
  sketches: "Sketches",
});

export function normalizeCategorySelection(values) {
  if (!Array.isArray(values)) throw new Error("Les catégories doivent être fournies sous forme de tableau.");
  const normalized = [];
  for (const value of values) {
    if (!CATEGORY_VALUES.includes(value)) throw new Error(`Catégorie inconnue : ${value}`);
    if (!normalized.includes(value)) normalized.push(value);
  }
  if (!normalized.length) throw new Error("Choisissez au moins une catégorie.");
  return normalized;
}

export function createCategoryReport(artworks) {
  const report = {
    singleCategory: [],
    multipleCategories: [],
    withoutCategory: [],
    unknownCategories: [],
    primaryFolderMismatch: [],
  };

  for (const artwork of artworks) {
    const categories = Array.isArray(artwork.category) ? artwork.category : [];
    if (categories.length === 0) report.withoutCategory.push(artwork.id);
    else if (categories.length === 1) report.singleCategory.push(artwork.id);
    else report.multipleCategories.push(artwork.id);

    const unknown = categories.filter((category) => !CATEGORY_VALUES.includes(category));
    if (unknown.length) report.unknownCategories.push({ id: artwork.id, categories: unknown });

    const physicalFolder = typeof artwork.image === "string" ? artwork.image.split("/")[2] : "";
    if (categories[0] && physicalFolder !== categories[0]) {
      report.primaryFolderMismatch.push({ id: artwork.id, primary: categories[0], physicalFolder, image: artwork.image });
    }
  }
  return report;
}

export function createCategoryPicker({ categories = CATEGORY_VALUES, selected = [], labels = CATEGORY_LABELS, onChange = () => {}, compact = false } = {}) {
  const root = document.createElement("fieldset");
  root.className = `multi-category-picker${compact ? " is-compact" : ""}`;
  const legend = document.createElement("legend");
  legend.textContent = "Catégories";
  const summary = document.createElement("p");
  summary.className = "category-picker-summary";
  const options = document.createElement("div");
  options.className = "category-picker-options";
  root.append(legend, summary, options);

  let current = [...new Set(selected.filter((category) => categories.includes(category)))];
  const primaryGroup = `primary-${crypto.randomUUID()}`;

  function update() {
    summary.textContent = current.length
      ? `${current.length} sélectionnée${current.length > 1 ? "s" : ""} · principale : ${labels[current[0]]}`
      : "Aucune catégorie sélectionnée";
    summary.classList.toggle("is-error", current.length === 0);
    for (const row of options.children) {
      const checkbox = row.querySelector('[data-role="selected"]');
      const primary = row.querySelector('[data-role="primary"]');
      checkbox.checked = current.includes(checkbox.value);
      primary.checked = current[0] === checkbox.value;
      primary.disabled = !checkbox.checked;
      row.classList.toggle("is-primary", primary.checked);
    }
    onChange([...current]);
  }

  for (const category of categories) {
    const row = document.createElement("div");
    row.className = "category-picker-option";
    const selectionLabel = document.createElement("label");
    selectionLabel.className = "category-selection-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = category;
    checkbox.dataset.role = "selected";
    const name = document.createElement("span");
    name.textContent = labels[category] || category;
    const primaryLabel = document.createElement("span");
    primaryLabel.className = "primary-choice";
    const primary = document.createElement("input");
    primary.type = "radio";
    primary.name = primaryGroup;
    primary.value = category;
    primary.dataset.role = "primary";
    const primaryText = document.createElement("span");
    primaryText.textContent = "Principale";
    primaryLabel.append(primary, primaryText);
    selectionLabel.append(checkbox, name);
    row.append(selectionLabel, primaryLabel);
    options.append(row);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) current.push(category);
      else current = current.filter((value) => value !== category);
      update();
    });
    primary.addEventListener("change", () => {
      if (!primary.checked || !current.includes(category)) return;
      current = [category, ...current.filter((value) => value !== category)];
      update();
    });
  }

  update();
  return {
    element: root,
    getValue: () => [...current],
    setValue(values) {
      current = [...new Set(values.filter((category) => categories.includes(category)))];
      update();
    },
  };
}
