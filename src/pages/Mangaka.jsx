import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { mangas } from "../content/mangas";
import {
  getMangaPresentationSection,
  MANGA_PRESENTATION_SECTIONS,
} from "../content/mangaPresentation";
import { t } from "../content/ui";

const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

const MangaCard = ({ manga }) => (
  <motion.article
    className="group overflow-hidden border border-black/10 bg-[#faf8f4] dark:border-white/10 dark:bg-[#1d1d1b]"
    variants={cardVariants}
  >
    <Link
      to={manga.route}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9b4035]"
    >
      <img
        src={manga.banner || manga.cover}
        alt={t.manga.coverAlt(manga.title)}
        className="aspect-[16/9] w-full bg-[#e8e3da] object-cover transition-opacity duration-300 group-hover:opacity-90 dark:bg-[#262522]"
        loading="lazy"
        decoding="async"
      />
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-3xl font-medium">
            {manga.title}{" "}
            {manga.edition && (
              <span className="block text-sm font-sans uppercase tracking-[0.14em] text-[#9b4035] sm:inline">
                {manga.edition}
              </span>
            )}
          </h3>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a857d]">
            {manga.pageCount} pages
          </span>
        </div>
        <p className="mt-5 whitespace-pre-line text-sm leading-7 text-[#5d5a55] dark:text-[#c8c3ba]">
          {manga.summary}
        </p>
        <span className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#9b4035]">
          {t.manga.read} <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  </motion.article>
);

const MangaSection = ({ mangas: sectionMangas, text }) => (
  <section className="mx-auto max-w-7xl border-t border-black/10 pt-10 first:border-t-0 first:pt-0 dark:border-white/10">
    <div className="mb-8 max-w-2xl">
      <h2 className="text-3xl font-medium sm:text-4xl">{text.title}</h2>
      <p className="mt-3 text-sm leading-7 text-[#68645e] dark:text-[#bbb5ac]">
        {text.description}
      </p>
    </div>
    {sectionMangas.length ? (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={listVariants}
        className="grid gap-8 md:grid-cols-2 xl:grid-cols-3"
      >
        {sectionMangas.map((manga) => (
          <MangaCard key={manga.id} manga={manga} />
        ))}
      </motion.div>
    ) : (
      <p className="border border-dashed border-black/15 px-5 py-6 text-sm text-[#68645e] dark:border-white/15 dark:text-[#bbb5ac]">
        {t.manga.emptySection}
      </p>
    )}
  </section>
);

const Mangaka = () => {
  const publicMangas = mangas.filter(
    (manga) => (manga.visibility || "public") === "public",
  );
  const completedMangas = publicMangas.filter(
    (manga) =>
      getMangaPresentationSection(manga) ===
      MANGA_PRESENTATION_SECTIONS.COMPLETED,
  );
  const storyboardMangas = publicMangas.filter(
    (manga) =>
      getMangaPresentationSection(manga) ===
      MANGA_PRESENTATION_SECTIONS.STORYBOARD,
  );

  return (
    <main className="min-h-screen overflow-x-clip bg-[#f4f1eb] px-5 pb-20 pt-28 text-[#1d1d1b] dark:bg-[#171716] dark:text-[#f4f1eb] sm:px-8 lg:px-10">
      <motion.header
        className="mx-auto mb-12 max-w-7xl border-b border-black/10 pb-10 dark:border-white/10"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="section-eyebrow">{t.manga.eyebrow}</p>
        <h1 className="section-title">{t.manga.title}</h1>
        <p className="mt-5 max-w-xl text-[#68645e] dark:text-[#bbb5ac]">
          {t.manga.introduction}
        </p>
      </motion.header>

      <div className="space-y-16 sm:space-y-20">
        <MangaSection mangas={completedMangas} text={t.manga.sections.completed} />
        <MangaSection mangas={storyboardMangas} text={t.manga.sections.storyboard} />
      </div>
    </main>
  );
};

export default Mangaka;
