import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { mangas } from "../content/mangas";
import { t } from "../content/ui";

const Mangaka = () => {
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
        <p className="mt-5 max-w-xl text-[#68645e] dark:text-[#bbb5ac]">{t.manga.introduction}</p>
      </motion.header>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
        }}
        className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2"
      >
        {mangas.map((manga) => (
          <motion.article
            key={manga.id}
            className="group overflow-hidden border border-black/10 bg-[#faf8f4] dark:border-white/10 dark:bg-[#1d1d1b]"
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
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
                  <h2 className="text-3xl font-medium">
                    {manga.title}{" "}
                    {manga.edition && <span className="block text-sm font-sans uppercase tracking-[0.14em] text-[#9b4035] sm:inline">{manga.edition}</span>}
                  </h2>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a857d]">
                    {manga.pageCount} pages
                  </span>
                </div>
                <p className="mt-5 whitespace-pre-line text-sm leading-7 text-[#5d5a55] dark:text-[#c8c3ba]">{manga.summary}</p>
                <span className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#9b4035]">
                  {t.manga.read} <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          </motion.article>
        ))}
      </motion.div>
    </main>
  );
};

export default Mangaka;
