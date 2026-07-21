import { assetPath } from "../utils/assetPath";

const numberedPages = ({ directory, prefix, suffix = ".jpg", start, end, padding }) =>
  Array.from({ length: end - start + 1 }, (_, index) => {
    const pageNumber = String(start + index).padStart(padding, "0");
    return assetPath(`${directory}/${prefix}${pageNumber}${suffix}`);
  });

const mangaDefinitions = [
  {
    id: "legend-of-animiste",
    slug: "legend-of-animiste",
    route: "/mangas/legend-of-animiste",
    title: "Legend of Animiste",
    edition: "",
    cover: assetPath("assets/mangaka/legend-of-animiste/300x300-v2.jpg"),
    banner: assetPath("assets/mangaka/legend-of-animiste/447x200.jpg"),
    summary:
      "Legend of Animiste follows a young fighter drawn into a world shaped by spirits, ancient powers, and dangerous conflicts.\n\nDiscover the story of Legend of Animiste.",
    genre: "",
    role: "",
    year: "",
    readingDirection: "rtl",
    defaultLanguage: "original",
    languages: {
      original: {
        label: "Original",
        shortLabel: "ORIG",
        pages: numberedPages({
          directory: "assets/mangaka/legend-of-animiste",
          prefix: "Legend of animiste_Kevgenga_Page_",
          suffix: "_Image_0001.jpg",
          start: 1,
          end: 19,
          padding: 2,
        }),
      },
    },
    featured: false,
  },
  {
    id: 2,
    slug: "stubborn-love",
    route: "/mangas/2",
    title: "Stubborn love",
    edition: "",
    cover: assetPath("assets/mangaka/stubborn-love/300x300.jpg"),
    banner: assetPath("assets/mangaka/stubborn-love/bandeau.jpg"),
    summary:
      "Two childhood friends, Stubborn and Love, are brought to death's door after a fatal accident. Will they survive? The truth about their feelings reaches its climax. Discover the story of Stubborn Love.",
    genre: "",
    role: "",
    year: "",
    readingDirection: "rtl",
    defaultLanguage: "en",
    languages: {
      en: {
        label: "English",
        shortLabel: "ENG",
        pages: numberedPages({
          directory: "assets/mangaka/stubborn-love/english",
          prefix: "",
          start: 1,
          end: 13,
          padding: 2,
        }),
      },
      fr: {
        label: "French",
        shortLabel: "FR",
        pages: numberedPages({
          directory: "assets/mangaka/stubborn-love/french",
          prefix: "",
          suffix: ".webp",
          start: 1,
          end: 13,
          padding: 2,
        }),
      },
    },
    featured: false,
  },
  {
    id: 3,
    slug: "ahes",
    route: "/mangas/3",
    title: "Ahès",
    edition: "",
    cover: assetPath("assets/mangaka/ahes/page_001.jpg"),
    banner: "",
    summary:
      "Locked away in her castle for centuries, Princess Ahès finally escapes to discover the outside world that had been forbidden to her. Faced with the destruction of her kingdom, she will have to fight against her destiny. Discover the story of Ahès.",
    genre: "",
    role: "",
    year: "",
    readingDirection: "rtl",
    defaultLanguage: "original",
    languages: {
      original: {
        label: "Original",
        shortLabel: "ORIG",
        pages: numberedPages({
          directory: "assets/mangaka/ahes",
          prefix: "page_",
          start: 1,
          end: 31,
          padding: 3,
        }),
      },
    },
    featured: false,
  },
];

export const mangas = mangaDefinitions.map((manga) => {
  const pages = manga.languages[manga.defaultLanguage].pages;

  return {
    ...manga,
    pages,
    pageCount: pages.length,
  };
});

export const getMangaById = (id) =>
  mangas.find((manga) => String(manga.id) === String(id));
