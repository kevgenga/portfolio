import { motion } from "framer-motion";
import ArtworkHero from "../components/about/ArtworkHero";
import ArtworkStrip from "../components/about/ArtworkStrip";
import CapabilityGroup from "../components/about/CapabilityGroup";
import InstagramSketchbook from "../components/about/InstagramSketchbook";
import ProfessionalStatus from "../components/about/ProfessionalStatus";
import RecognitionSeal from "../components/about/RecognitionSeal";
import SectionLabel from "../components/SectionLabel";
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
  const about = content?.about || profile.about;
  const experience = content?.experience || profile.experience;
  const localizeGroups = (groups) => groups.map((group) => ({
    ...group,
    label: content?.capabilityLabels[group.label] || group.label,
    items: group.items.map((item) => content?.capabilityItems[item] || item),
  }));
  return (
  <main className="public-page">
    <motion.section
      id="about"
      className="about-hero scroll-mt-[72px]"
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
        <p className="about-hero__summary">{about.summary}</p>
        <ProfessionalStatus {...about.availability} />
      </motion.div>

      <ArtworkHero artwork={sitePresentation.hero} alt={t.home.heroAlt} caption={t.home.heroCaption} />
      <p className="about-signature">{t.home.signature}</p>
    </motion.section>

    <motion.section
      className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24"
      aria-labelledby="artwork-first-title"
      {...reveal}
    >
      <SectionLabel index="01" label={t.home.artworkLabel} note={t.home.artworkNote} />
      <h2 id="artwork-first-title" className="section-title my-10 max-w-5xl sm:my-14">
        {t.home.artworkTitle}
      </h2>
      <ArtworkStrip artworks={sitePresentation.aboutShowcase.map((artwork) => ({
        ...artwork,
        ...t.home.showcase?.[artwork.id],
      }))} />
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
      className="capability-section-dark bg-ink text-paper"
      aria-labelledby="experience-title"
      {...reveal}
    >
      <div className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
        <SectionLabel index="03" label={t.home.experienceLabel} note={t.home.experienceNote} inverse />
        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(15rem,0.32fr)_minmax(0,0.68fr)] lg:gap-16">
          <div>
            <h2 id="experience-title" className="text-4xl uppercase leading-[0.9] text-paper sm:text-6xl">
              {experience.role}
            </h2>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-primary">
              {experience.period}
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {localizeGroups(profile.capabilities).map((group, index) => (
              <CapabilityGroup key={group.label} {...group} index={index + 1} />
            ))}
          </div>
        </div>
      </div>
    </motion.section>

    <motion.section
      className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24"
      aria-labelledby="tools-title"
      {...reveal}
    >
      <SectionLabel index="04" label={t.home.toolsLabel} note={t.home.toolsNote} />
      <h2 id="tools-title" className="sr-only">{t.home.toolsLabel}</h2>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {localizeGroups(profile.tools).map((group, index) => (
          <CapabilityGroup key={group.label} {...group} index={index + 1} />
        ))}
      </div>
    </motion.section>

    <motion.section
      className="border-y-[3px] border-ink bg-surface"
      aria-labelledby="sketchbook-title"
      {...reveal}
    >
      <div className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
        <SectionLabel index="05" label={t.home.sketchbookLabel} note="@kevgenga" />
        <h2 id="sketchbook-title" className="section-title mt-10 sm:mt-14">{t.home.sketchbookTitle}</h2>
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
