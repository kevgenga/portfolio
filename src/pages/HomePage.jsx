import { useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import HeroArtworkCards from "../components/about/HeroArtworkCards";
import InstagramSketchbook from "../components/about/InstagramSketchbook";
import ProfessionalStatus from "../components/about/ProfessionalStatus";
import RecognitionSeal from "../components/about/RecognitionSeal";
import SectionLabel from "../components/SectionLabel";
import MangaCard from "../components/manga/MangaCard";
import { artworks } from "../content/artworks";
import { isArtworkCategoryVisible, isArtworkPubliclyVisible } from "../content/artworkPresentation";
import { mangas } from "../content/mangas";
import { getMangaPresentationSection, MANGA_PRESENTATION_SECTIONS } from "../content/mangaPresentation";
import { profile } from "../content/profile";
import { sitePresentation } from "../content/sitePresentation";
import { useLanguage } from "../i18n/languageContext";

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
};

const RecognitionEvent = ({
  event,
  mangaTitle,
  mangaUrl,
  officialUrl,
  tone,
  ariaLabel,
}) => {
  const resultUrl = mangaUrl || officialUrl;
  const titleStart = event.indexOf(mangaTitle);
  if (titleStart === -1 || !resultUrl) return event;

  return (
    <>
      {event.slice(0, titleStart)}
      <a
        href={resultUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={`recognition-manga-link recognition-manga-link--${tone}`}
      >
        {mangaTitle}
      </a>
      {event.slice(titleStart + mangaTitle.length)}
    </>
  );
};

const HomePage = () => {
  const { t, content, locale } = useLanguage();
  const heroRef = useRef(null);
  useLayoutEffect(() => {
    const hero = heroRef.current;
    const header = document.querySelector(".brand-link")?.closest("nav");
    if (!hero || !header) return undefined;
    // Fixed navigation overlays the Hero. Measure its real border-box;
    // do not duplicate Navbar dimensions in this page.
    const measureHeader = () => hero.style.setProperty("--home-header-height", `${header.getBoundingClientRect().height}px`);
    measureHeader();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measureHeader);
      observer.observe(header);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measureHeader);
    return () => window.removeEventListener("resize", measureHeader);
  }, []);
  const about = content?.about || profile.about;
  const selectedMangas = sitePresentation.selectedMangaSlugs.map((slug) => mangas.find((manga) => manga.slug === slug))
    .filter((manga) => manga && (manga.visibility || "public") === "public" && getMangaPresentationSection(manga) === MANGA_PRESENTATION_SECTIONS.COMPLETED);
  const heroCards = [...sitePresentation.heroCards].sort((a, b) => a.order - b.order)
    .map((selection) => ({ ...selection, artwork: artworks.find((artwork) => artwork.id === selection.artworkId) }))
    .filter(({ category, artwork }) => artwork && artwork.category.includes(category) && isArtworkCategoryVisible(category) && isArtworkPubliclyVisible(artwork));
  return (
  <main className="public-page">
    <motion.section
      id="about"
      ref={heroRef}
      className="about-hero manga-home-hero scroll-mt-[72px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45 }}
      aria-labelledby="about-title"
    >
      <motion.div
        className="about-hero__copy"
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="page-kicker">{t.home.kicker}</p>
        <h1 id="about-title" className="about-hero__name">{profile.name}</h1>
        <p className="about-hero__roles">
          {about.roles.map((role) => (
            <span key={role} className="block">{role}</span>
          ))}
        </p>
        <p className="about-hero__meta">
          <span>{about.experienceLabel}</span>
          <span>{t.home.location}</span>
        </p>
        <p className="about-hero__summary">{t.home.heroSummary}</p>
        <ProfessionalStatus {...about.availability} />
        <div className="manga-home-hero__actions">
          <Link className="home-cta home-cta--primary" to="/mangaka">{t.home.viewManga} <span aria-hidden="true">↓</span></Link>
          <Link className="home-cta" to="/illustration">{t.home.viewWorks} <span aria-hidden="true">↓</span></Link>
        </div>
      </motion.div>

      <HeroArtworkCards cards={heroCards} />
    </motion.section>

    <motion.section
      id="selected-manga"
      className="home-selection mx-auto max-w-[100rem] px-5 py-12 sm:px-8 sm:py-16 lg:px-10"
      aria-labelledby="selected-manga-title"
      {...reveal}
    >
      <SectionLabel index="01" label={t.home.selectedMangaLabel} note={t.home.selectedMangaNote} />
      <div className="home-selection__heading">
        <h2 id="selected-manga-title" className="section-title">{t.home.selectedMangaTitle}</h2>
        <Link className="home-text-link" to="/mangaka">{t.home.allManga} <span aria-hidden="true">↗</span></Link>
      </div>
      <div className="home-manga-grid">
        {selectedMangas.map((manga, index) => <MangaCard key={manga.id} manga={manga} index={index + 1} categoryLabel={t.manga.sections.completed.title} t={t} content={content} />)}
      </div>
    </motion.section>

    <motion.section
      className="border-y-[3px] border-line bg-surface text-foreground"
      aria-labelledby="recognition-title"
      {...reveal}
    >
      <div className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
        <SectionLabel
          index="02"
          label={t.home.recognitionLabel}
          note={t.home.recognitionNote}
        />
        <h2 id="recognition-title" className="sr-only">{t.home.recognitionLabel}</h2>
        <div className="recognition-grid mt-10 sm:mt-14">
          {profile.recognition.map((recognition, index) => {
            const localized = content?.recognition[recognition.id] || {};
            return (
            <article key={recognition.id} className="recognition-entry">
              <RecognitionSeal {...recognition} {...localized} index={index + 1} />
              <div>
                <p className="section-eyebrow">
                  <span className={recognition.tone === "yellow" ? "recognition-award-highlight" : undefined}>
                    {localized.award || recognition.award} · {recognition.year}
                  </span>
                </p>
                <h3 className="mt-3 text-3xl uppercase leading-[0.95] sm:text-5xl">
                  {recognition.organization}
                </h3>
                <p
                  className="mt-4 text-sm font-semibold leading-relaxed text-ink/70"
                  lang={locale}
                >
                  <RecognitionEvent {...recognition} event={localized.event || recognition.event}
                    ariaLabel={t.home.officialResults(recognition.mangaTitle)} />
                </p>
              </div>
            </article>
          ); })}
        </div>
      </div>
    </motion.section>

    <motion.section
      className="border-y-[3px] border-ink bg-surface"
      aria-labelledby="sketchbook-title"
      {...reveal}
    >
      <div className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
        <SectionLabel index="03" label={t.home.sketchbookLabel} note="@kevgenga" />
        <h2 id="sketchbook-title" className="section-title">{t.home.sketchbookTitle}</h2>
        <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-muted sm:text-base">
          {t.home.sketchbookDescription}
        </p>
        <InstagramSketchbook />
      </div>
    </motion.section>
  </main>
  );
};

export default HomePage;
