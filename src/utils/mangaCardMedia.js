export const MANGA_CARD_IMAGE_FIELDS = Object.freeze({
  canonical: "banner",
  fallback: "cover",
});

export const getMangaCardMedia = (manga) => {
  const canonicalPath = manga?.[MANGA_CARD_IMAGE_FIELDS.canonical];
  if (canonicalPath) {
    return {
      field: MANGA_CARD_IMAGE_FIELDS.canonical,
      path: canonicalPath,
      fallback: false,
    };
  }

  const fallbackPath = manga?.[MANGA_CARD_IMAGE_FIELDS.fallback];
  if (fallbackPath) {
    return {
      field: MANGA_CARD_IMAGE_FIELDS.fallback,
      path: fallbackPath,
      fallback: true,
    };
  }

  return {
    field: MANGA_CARD_IMAGE_FIELDS.canonical,
    path: "",
    fallback: false,
  };
};

export const getMangaCardImage = (manga) => getMangaCardMedia(manga).path;
