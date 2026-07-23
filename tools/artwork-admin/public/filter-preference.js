export const CATEGORY_STORAGE_KEY = "artwork-admin-category";
export const DEFAULT_CATEGORY = "illustrations";

export function resolveCategoryPreference(savedCategory, categories) {
  if (savedCategory === "") return "";
  if (categories.includes(savedCategory)) return savedCategory;
  return categories.includes(DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : "";
}
