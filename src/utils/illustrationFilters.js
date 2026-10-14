export const illustrationCategories = Object.freeze([
  "illustrations", "sketches", "paintings", "character-design", "backgrounds",
]);

export const resolveIllustrationFilter = (requested, visibleCategories, hasFeatured = false) => {
  if (requested === "all" || visibleCategories.includes(requested) || (requested === "featured" && hasFeatured)) return requested;
  return visibleCategories.includes("illustrations") ? "illustrations" : "all";
};
