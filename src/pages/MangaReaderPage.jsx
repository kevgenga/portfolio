import { Navigate, useLocation, useParams } from "react-router-dom";
import { getMangaById } from "../content/mangas";
import { isMangaPresentationSectionVisible } from "../content/mangaPresentation";
import MangaReader from "../components/manga/MangaReader";
import NotFound from "./NotFound";

const MangaReaderPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const manga = getMangaById(id);

  if (!manga) {
    return <NotFound />;
  }

  const isLocalAdminPreview =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("adminPreview") === "1";

  if (!isMangaPresentationSectionVisible(manga) && !isLocalAdminPreview) {
    return <Navigate to="/mangaka" replace />;
  }

  return <MangaReader manga={manga} />;
};

export default MangaReaderPage;
