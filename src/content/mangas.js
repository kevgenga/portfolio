import { assetPath } from "../utils/assetPath";

const numberedPages = ({ directory, prefix, start, end, padding }) =>
  Array.from({ length: end - start + 1 }, (_, index) => {
    const pageNumber = String(start + index).padStart(padding, "0");
    return assetPath(`${directory}/${prefix}${pageNumber}.jpg`);
  });

const mangaDefinitions = [
  {
    id: 1,
    route: "/mangas/1",
    title: "SHARING!!",
    edition: "",
    cover: assetPath("assets/mangaka/sharing/447x200.jpg"),
    banner: "",
    summary:
      "An angry spirit devastated everything in its path. Two fighters, each with a different approach, tried to stop it while attempting to understand what was fuelling its rage. Discover the story of SHARING!!",
    genre: "",
    role: "",
    year: "",
    readingDirection: "rtl",
    pages: numberedPages({
      directory: "assets/mangaka/sharing",
      prefix: "BD2_",
      start: 1,
      end: 17,
      padding: 3,
    }),
    featured: false,
  },
  {
    id: 2,
    route: "/mangas/2",
    title: "Stubborn love",
    edition: "",
    cover: assetPath("assets/mangaka/stubborn-love/01.jpg"),
    banner: assetPath("assets/mangaka/stubborn-love/bandeau.jpg"),
    summary:
      "Two childhood friends, Stubborn and Love, are brought to death's door after a fatal accident. Will they survive? The truth about their feelings reaches its climax. Discover the story of Stubborn Love.",
    genre: "",
    role: "",
    year: "",
    readingDirection: "rtl",
    pages: numberedPages({
      directory: "assets/mangaka/stubborn-love",
      prefix: "",
      start: 0,
      end: 12,
      padding: 2,
    }),
    featured: false,
  },
  {
    id: 3,
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
    pages: numberedPages({
      directory: "assets/mangaka/ahes",
      prefix: "page_",
      start: 1,
      end: 31,
      padding: 3,
    }),
    featured: false,
  },
  {
    id: 4,
    route: "/mangas/4",
    title: "SHARING!!",
    edition: "[VERSION EXTENDED]",
    cover: assetPath("assets/mangaka/sharing_version-extended/447x200.jpg"),
    banner: "",
    summary:
      "An angry spirit devastated everything in its path. Two fighters, each with a different approach, tried to stop it while attempting to understand what was fuelling its rage. Discover the story of SHARING!!",
    genre: "",
    role: "",
    year: "",
    readingDirection: "rtl",
    pages: numberedPages({
      directory: "assets/mangaka/sharing_version-extended",
      prefix: "BD2_",
      start: 0,
      end: 30,
      padding: 3,
    }),
    featured: false,
  },
];

export const mangas = mangaDefinitions.map((manga) => ({
  ...manga,
  pageCount: manga.pages.length,
}));

export const getMangaById = (id) =>
  mangas.find((manga) => manga.id === Number(id));
