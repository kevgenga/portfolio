export const artworkIsPublic = (artwork) =>
  artwork?.visibility?.public ?? artwork?.hidden !== true;

export const matchesArtworkVisibility = (artwork, filter) => {
  if (filter === "displayed") return artworkIsPublic(artwork);
  if (filter === "hidden") return !artworkIsPublic(artwork);
  return true;
};

export const summarizeArtworkVisibility = (artworks) => ({
  total: artworks.length,
  displayed: artworks.filter(artworkIsPublic).length,
  individuallyHidden: artworks.filter((artwork) =>
    artwork?.visibility?.individuallyHidden ?? artwork?.hidden === true).length,
  hiddenByCategory: artworks.filter((artwork) =>
    artwork?.visibility?.hiddenByCategory === true).length,
});
