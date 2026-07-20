import { useParams } from "react-router-dom";
import { getMangaById } from "../content/mangas";
import MangaReader from "../components/manga/MangaReader";
import NotFound from "./NotFound";

const MangaReaderPage = () => {
  const { id } = useParams();
  const manga = getMangaById(id);

  if (!manga) {
    return <NotFound />;
  }

  return <MangaReader manga={manga} />;
};

export default MangaReaderPage;
