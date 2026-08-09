export const artworkPresentationSettings = Object.freeze({
  hiddenCategories: Object.freeze([]),
});

export const isArtworkCategoryVisible = (
  category,
  settings = artworkPresentationSettings,
) => !settings.hiddenCategories.includes(category);

export const getArtworkVisibility = (
  artwork,
  settings = artworkPresentationSettings,
) => {
  const individuallyHidden = artwork?.hidden === true;
  const hiddenCategories = (Array.isArray(artwork?.category) ? artwork.category : [])
    .filter((category) => !isArtworkCategoryVisible(category, settings));
  const hiddenByCategory = hiddenCategories.length > 0;

  return {
    individuallyHidden,
    hiddenByCategory,
    hiddenCategories,
    public: !individuallyHidden && !hiddenByCategory,
  };
};

export const isArtworkPubliclyVisible = (artwork, settings) =>
  getArtworkVisibility(artwork, settings).public;
