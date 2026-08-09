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

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
};

const HomePage = () => (
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
        <p className="page-kicker">Manga artist portfolio / 2026</p>
        <h1 id="about-title" className="about-hero__name">{profile.name}</h1>
        <p className="about-hero__roles">
          {profile.about.roles.map((role) => (
            <span key={role} className="block">{role}</span>
          ))}
        </p>
        <p className="about-hero__meta">
          <span>{profile.about.experienceLabel}</span>
          <span>{profile.about.location}</span>
        </p>
        <p className="about-hero__summary">{profile.about.summary}</p>
        <ProfessionalStatus {...profile.about.availability} />
      </motion.div>

      <ArtworkHero artwork={sitePresentation.hero} />
      <p className="about-signature">Drawing stories into life.</p>
    </motion.section>

    <motion.section
      className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24"
      aria-labelledby="artwork-first-title"
      {...reveal}
    >
      <SectionLabel index="01" label="Artwork first" note="Selected manga, characters and action" />
      <h2 id="artwork-first-title" className="section-title my-10 max-w-5xl sm:my-14">
        Lines. Motion. Character.
      </h2>
      <ArtworkStrip artworks={sitePresentation.aboutShowcase} />
    </motion.section>

    <motion.section
      className="border-y-[3px] border-line bg-surface text-foreground"
      aria-labelledby="recognition-title"
      {...reveal}
    >
      <div className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
        <SectionLabel
          index="02"
          label="Selected recognition"
          note="International manga and illustration competitions"
        />
        <h2 id="recognition-title" className="sr-only">Selected recognition</h2>
        <div className="recognition-grid mt-10 sm:mt-14">
          {profile.recognition.map((recognition, index) => (
            <article key={recognition.id} className="recognition-entry">
              <RecognitionSeal {...recognition} index={index + 1} />
              <div>
                <p className="section-eyebrow">
                  {recognition.award} · {recognition.year}
                </p>
                <h3 className="mt-3 text-3xl uppercase leading-[0.95] sm:text-5xl">
                  {recognition.organization}
                </h3>
                <p
                  className="mt-4 text-sm font-semibold leading-relaxed text-ink/70"
                  lang={recognition.eventLanguage}
                >
                  {recognition.event}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </motion.section>

    <motion.section
      className="capability-section-dark bg-ink text-paper"
      aria-labelledby="experience-title"
      {...reveal}
    >
      <div className="mx-auto max-w-[100rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
        <SectionLabel index="03" label="Experience" note="Practice and capabilities" inverse />
        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(15rem,0.32fr)_minmax(0,0.68fr)] lg:gap-16">
          <div>
            <h2 id="experience-title" className="text-4xl uppercase leading-[0.9] text-paper sm:text-6xl">
              {profile.experience.role}
            </h2>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-primary">
              {profile.experience.period}
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {profile.capabilities.map((group, index) => (
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
      <SectionLabel index="04" label="Tools" note="Digital and traditional" />
      <h2 id="tools-title" className="sr-only">Tools</h2>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {profile.tools.map((group, index) => (
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
        <SectionLabel index="05" label="Sketchbook" note="@kevgenga" />
        <h2 id="sketchbook-title" className="section-title mt-10 sm:mt-14">Recent work.</h2>
        <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-muted sm:text-base">
          Recent sketches, studies and manga artwork published on Instagram.
        </p>
        <InstagramSketchbook />
      </div>
    </motion.section>
  </main>
);

export default HomePage;
