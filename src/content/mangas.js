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
      "Un esprit en colère dévastait tout sur son passage. Deux combattants, chacun avec une approche différente, cherchaient à l'arrêter tout en tentant de comprendre ce qui alimentait sa rage.\nDécouvrez l'histoire de SHARING!!",
    genre: "",
    role: "",
    year: "",
    readingDirection: "ltr",
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
      "Deux amis d'enfance \"Stubborn\" et \"Love\" sont transportés devant la porte de la mort suite à un accident mortel. Pourront-ils y survivre ? La vérité sur leurs sentiments est à son paroxysme. Découvrez l'histoire de Stubborn Love.",
    genre: "",
    role: "",
    year: "",
    readingDirection: "ltr",
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
      "Enfermée dans son château depuis des siècles, la princesse Ahès finit par s'enfuir pour découvrir le monde extérieur qui lui était interdit... Face à la destruction de son royaume, elle devra lutter contre son destin. Découvrez l'histoire de Ahès.",
    genre: "",
    role: "",
    year: "",
    readingDirection: "ltr",
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
      "Un esprit en colère dévastait tout sur son passage. Deux combattants, chacun avec une approche différente, cherchaient à l'arrêter tout en tentant de comprendre ce qui alimentait sa rage.\nDécouvrez l'histoire de SHARING!!",
    genre: "",
    role: "",
    year: "",
    readingDirection: "ltr",
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
