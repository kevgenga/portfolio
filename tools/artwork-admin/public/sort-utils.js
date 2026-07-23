export function parseArtworkDate(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1000) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;

  return valid ? date.getTime() : null;
}

export const ARTWORK_SORT_VALUES = Object.freeze([
  "newest",
  "oldest",
  "heaviest",
  "lightest",
]);

export function resolveArtworkSortPreference(value) {
  return ARTWORK_SORT_VALUES.includes(value) ? value : "newest";
}

export function sortArtworks(artworks, sort = "newest", onInvalidDate = () => {}) {
  const normalizedSort = resolveArtworkSortPreference(sort);
  const sortsBySize = normalizedSort === "heaviest" || normalizedSort === "lightest";

  return artworks
    .map((artwork, initialIndex) => {
      const value = sortsBySize
        ? (Number.isFinite(artwork.sizeBytes) && artwork.sizeBytes >= 0 ? artwork.sizeBytes : null)
        : parseArtworkDate(artwork.date);
      if (!sortsBySize && value === null) onInvalidDate(artwork);
      return { artwork, initialIndex, value };
    })
    .sort((left, right) => {
      const leftInvalid = left.value === null;
      const rightInvalid = right.value === null;

      if (leftInvalid !== rightInvalid) return leftInvalid ? 1 : -1;
      if (leftInvalid || left.value === right.value) return left.initialIndex - right.initialIndex;

      const descending = normalizedSort === "newest" || normalizedSort === "heaviest";
      return descending ? right.value - left.value : left.value - right.value;
    })
    .map(({ artwork }) => artwork);
}

export function sortArtworksByDate(artworks, direction = "newest", onInvalidDate = () => {}) {
  return sortArtworks(artworks, direction, onInvalidDate);
}
