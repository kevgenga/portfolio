import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import PageHero from "../components/PageHero";
import { mangas } from "../content/mangas";
import {
  getMangaPresentationSection,
  mangaPresentationSettings,
  MANGA_PRESENTATION_SECTIONS,
} from "../content/mangaPresentation";
import { t } from "../content/ui";
import { getMangaCardImage } from "../utils/mangaCardMedia";

const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

const MangaCard = ({ manga, index, categoryLabel }) => (
  <motion.article className="manga-card" variants={cardVariants}>
    <Link to={manga.route} className="manga-card__link">
      <div className="manga-card__media">
        <img
          src={getMangaCardImage(manga)}
          alt={t.manga.coverAlt(manga.title)}
          loading="lazy"
          decoding="async"
        />
        <span className="manga-card__index" aria-hidden="true">
          {String(index).padStart(2, "0")}
        </span>
      </div>
      <div className="manga-card__body">
        <p className="manga-card__meta">
          <span>{categoryLabel}</span>
          {manga.status && <span>{manga.status}</span>}
          {manga.genre && <span>{manga.genre}</span>}
        </p>
        <div className="manga-card__heading">
          <h3 className="manga-card__title">
            {manga.title}
            {manga.edition && (
              <span className="manga-card__edition">
                {manga.edition}
              </span>
            )}
          </h3>
          <span className="manga-card__pages">
            {manga.pageCount} pages
          </span>
        </div>
        <p className="manga-card__description line-clamp-4">
          {manga.summary}
        </p>
        <span className="manga-card__cta">
          {t.manga.read} <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  </motion.article>
);

const MangaSection = ({ mangas: sectionMangas, text, index }) => (
  <section aria-labelledby={`manga-section-${index}`}>
    <header className="manga-section-heading">
      <div>
        <p className="section-eyebrow">Archive / {index}</p>
        <h2 id={`manga-section-${index}`} className="mt-2 text-4xl uppercase leading-none sm:text-6xl">
          {text.title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-muted">{text.description}</p>
      </div>
      <span className="manga-section-heading__index" aria-hidden="true">{index}</span>
    </header>
    {sectionMangas.length ? (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={listVariants}
        className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {sectionMangas.map((manga, mangaIndex) => (
          <MangaCard
            key={manga.id}
            manga={manga}
            index={mangaIndex + 1}
            categoryLabel={text.title}
          />
        ))}
      </motion.div>
    ) : (
      <p className="border-[3px] border-dashed border-line px-5 py-8 text-sm font-semibold text-muted">
        {t.manga.emptySection}
      </p>
    )}
  </section>
);

const Mangaka = () => {
  const publicMangas = mangas.filter((manga) => (manga.visibility || "public") === "public");
  const completedMangas = publicMangas.filter(
    (manga) => getMangaPresentationSection(manga) === MANGA_PRESENTATION_SECTIONS.COMPLETED,
  );
  const storyboardMangas = publicMangas.filter(
    (manga) => getMangaPresentationSection(manga) === MANGA_PRESENTATION_SECTIONS.STORYBOARD,
  );

  return (
    <main className="public-page px-5 pb-20 pt-24 sm:px-8 lg:px-10">
      <PageHero
        index="01"
        eyebrow={t.manga.eyebrow}
        title={t.manga.title}
        introduction={t.manga.introduction}
        backgroundWord="MANGA"
      />

      <div className="mx-auto max-w-[100rem] space-y-20 sm:space-y-24">
        <MangaSection mangas={completedMangas} text={t.manga.sections.completed} index="01" />
        {mangaPresentationSettings.showStoryboardSection && (
          <MangaSection mangas={storyboardMangas} text={t.manga.sections.storyboard} index="02" />
        )}
      </div>
    </main>
  );
};

export default Mangaka;
