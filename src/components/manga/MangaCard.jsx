import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { getMangaCardImage } from "../../utils/mangaCardMedia";
import ProductionTimeBadge from "../ProductionTimeBadge";

const cardVariants = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

const MangaCard = ({ manga, index, categoryLabel, t, content }) => (
  <motion.article className="manga-card" variants={cardVariants}>
    <Link to={manga.route} className="manga-card__link">
      <div className="manga-card__media">
        <img src={getMangaCardImage(manga)} alt={t.manga.coverAlt(manga.title)} loading="lazy" decoding="async" />
        <span className="manga-card__index" aria-hidden="true">{String(index).padStart(2, "0")}</span>
      </div>
      <div className="manga-card__body">
        <p className="manga-card__meta">
          <span>{categoryLabel}</span>
          {manga.status && <span>{t.manga.status[manga.status] || manga.status}</span>}
          {manga.genre && <span>{manga.genre}</span>}
        </p>
        <div className="manga-card__heading">
          <h3 className="manga-card__title">{manga.title}{manga.edition && <span className="manga-card__edition">{manga.edition}</span>}</h3>
          <span className="manga-card__pages">{t.manga.pageCount(manga.pageCount)}</span>
        </div>
        <ProductionTimeBadge time={manga.productionTime?.total} context="manga" />
        <p className="manga-card__description line-clamp-4">
          {content?.mangaSummaries[manga.slug] || (content?.storyboardSummary && /^Sketch storyboard$/i.test(manga.summary) ? content.storyboardSummary : manga.summary)}
        </p>
        <span className="manga-card__cta">{t.manga.read} <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  </motion.article>
);

export default MangaCard;
