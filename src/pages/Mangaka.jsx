import { motion } from "framer-motion";
import MangaCard from "../components/manga/MangaCard";
import PageHero from "../components/PageHero";
import { mangas } from "../content/mangas";
import {
  getMangaPresentationSection,
  mangaPresentationSettings,
  MANGA_PRESENTATION_SECTIONS,
} from "../content/mangaPresentation";
import { useLanguage } from "../i18n/languageContext";

const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const MangaSection = ({ mangas: sectionMangas, text, index, t, content }) => (
  <section aria-labelledby={`manga-section-${index}`}>
    <header className="manga-section-heading">
      <div>
        <p className="section-eyebrow">{t.manga.archive} / {index}</p>
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
            t={t}
            content={content}
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
  const { t, content } = useLanguage();
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
        backgroundWord={t.home.mangaWord}
      />

      <div className="mx-auto max-w-[100rem] space-y-20 sm:space-y-24">
        <MangaSection mangas={completedMangas} text={t.manga.sections.completed} index="01" t={t} content={content} />
        {mangaPresentationSettings.showStoryboardSection && (
          <MangaSection mangas={storyboardMangas} text={t.manga.sections.storyboard} index="02" t={t} content={content} />
        )}
      </div>
    </main>
  );
};

export default Mangaka;
