import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { animations } from "../content/animations";
import { mangas } from "../content/mangas";
import { profile } from "../content/profile";

const workCategories = [
  {
    title: "Manga",
    description: "Original sequential art and complete manga projects.",
    to: "/mangaka",
    image: mangas[0].banner || mangas[0].cover,
  },
  {
    title: "Illustration",
    description: "Illustration, sketches, painting and character design.",
    to: "/illustration",
    image: `${import.meta.env.BASE_URL}assets/illustration/illustrations/page1-v8-bq.jpg`,
  },
  {
    title: "Animation",
    description: "2D animation, short films and motion studies.",
    to: "/animation",
    image: animations[0].poster,
  },
];

const experienceHighlights = [
  "Create original manga characters, illustrations, and dynamic action scenes.",
  "Produce digital artwork using Clip Studio Paint and Adobe Photoshop.",
  "Publish artwork across online platforms and social media.",
  "Develop personal manga and webtoon projects, from character concepts to storyboards.",
  "Participate in international manga and illustration competitions.",
  "Adapt drawing style to project art direction while maintaining quality and meeting deadlines.",
];

const artSkills = [
  "Manga Illustration",
  "Character Design",
  "Action Sketching",
  "Dynamic Poses",
  "Anatomy & Expressions",
  "Perspective",
];

const productionSkills = [
  "Storyboarding",
  "Visual Storytelling",
  "Action Choreography",
  "Composition",
  "Rough-to-Clean Workflow",
  "Style Adaptation",
];

const software = [
  "Clip Studio Paint — Advanced",
  "Adobe Photoshop — Advanced",
  "Adobe After Effects — Advanced",
];

const traditionalTools = [
  { label: "Ink", details: "G-Pen, Maru-Pen" },
  { label: "Painting & Color", details: "Poster Color, Copic Sketch" },
];

const HomePage = () => {
  const location = useLocation();
  const aboutSection = useRef(null);
  const instagramContainer = useRef(null);
  const instagramWidget = useRef(null);
  const [instagramReady, setInstagramReady] = useState(false);

  const scrollToAbout = useCallback(() => {
    aboutSection.current?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    if (location.hash !== "#about") return undefined;

    const frame = requestAnimationFrame(scrollToAbout);
    return () => cancelAnimationFrame(frame);
  }, [location.hash, scrollToAbout]);

  useEffect(() => {
    const container = instagramContainer.current;
    const widget = instagramWidget.current;
    if (!container || !widget) return undefined;

    let scrollFrame;
    const keepAboutAligned = () => {
      if (location.hash !== "#about") return;
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(scrollToAbout);
    };
    const detectWidget = () => {
      if (widget.children.length > 0) setInstagramReady(true);
    };

    const mutationObserver = new MutationObserver(() => {
      detectWidget();
      keepAboutAligned();
    });
    mutationObserver.observe(widget, { childList: true, subtree: true });

    const resizeObserver = new ResizeObserver(keepAboutAligned);
    resizeObserver.observe(container);
    detectWidget();

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(scrollFrame);
    };
  }, [location.hash, scrollToAbout]);

  return (
    <main className="min-h-screen overflow-x-clip bg-[#f4f1eb] text-[#1d1d1b] dark:bg-[#171716] dark:text-[#f4f1eb]">
      <section className="mx-auto grid min-h-[88vh] max-w-7xl items-center gap-10 px-5 pb-16 pt-28 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:pt-32">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="max-w-3xl"
        >
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-[#9b4035]">
            Portfolio · {profile.name}
          </p>
          <h1 className="max-w-4xl text-5xl font-medium leading-[0.98] tracking-[-0.035em] text-[#1d1d1b] dark:text-[#f4f1eb] sm:text-6xl lg:text-7xl">
            Manga Artist, Illustrator &amp; 2D Animator
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[#5d5a55] dark:text-[#c8c3ba] sm:text-xl">
            {profile.name} — {profile.role}.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link className="button-primary" to="/illustration">
              View Portfolio
            </Link>
            <Link className="button-secondary" to="/contact">
              Contact Me
            </Link>
          </div>
        </motion.div>

        <motion.figure
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.65 }}
          className="relative mx-auto w-full max-w-xl"
        >
          <div className="absolute -bottom-4 -left-4 h-full w-full border border-[#9b4035]/45" aria-hidden="true" />
          <img
            src={profile.image}
            alt="Artwork by KEVGENGA"
            className="relative aspect-[4/5] w-full bg-[#e8e3da] object-cover"
            fetchPriority="high"
            decoding="async"
          />
        </motion.figure>
      </section>

      <section className="border-y border-black/10 bg-[#faf8f4] py-20 dark:border-white/10 dark:bg-[#1d1d1b]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="mb-10 max-w-2xl">
            <p className="section-eyebrow">Portfolio</p>
            <h2 className="section-title">Explore the work</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {workCategories.map((category) => (
              <Link
                key={category.title}
                to={category.to}
                className="group border border-black/10 bg-[#f4f1eb] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b4035] dark:border-white/10 dark:bg-[#171716]"
              >
                <img
                  src={category.image}
                  alt=""
                  className="aspect-[4/3] w-full object-cover transition-opacity duration-300 group-hover:opacity-90"
                  loading="lazy"
                  decoding="async"
                />
                <div className="p-4 pb-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-2xl font-medium">{category.title}</h3>
                    <span className="text-[#9b4035]" aria-hidden="true">↗</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[#68645e] dark:text-[#bbb5ac]">
                    {category.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <div className="max-w-2xl">
          <p className="section-eyebrow">@kevgenga</p>
          <h2 className="section-title">Social Media</h2>
          <p className="mt-4 text-base leading-relaxed text-[#68645e] dark:text-[#bbb5ac]">
            Recent sketches, studies and manga artwork published on Instagram.
          </p>
        </div>
        <div
          ref={instagramContainer}
          className="relative mt-10 min-h-[560px] overflow-x-hidden border border-black/10 bg-[#faf8f4] p-3 dark:border-white/10 dark:bg-[#1d1d1b] sm:min-h-[620px] sm:p-6 lg:min-h-[680px]"
          aria-busy={!instagramReady}
        >
          {!instagramReady && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center" role="status">
              <div>
                <p className="section-eyebrow">Sketchbook</p>
                <p className="mt-2 text-sm text-[#68645e] dark:text-[#bbb5ac]">Recent work loading</p>
              </div>
            </div>
          )}
          <div
            ref={instagramWidget}
            className="elfsight-app-d28a8d13-61ef-48e5-acf8-2adecc403d9e relative z-10 mx-auto min-h-[520px] w-full max-w-6xl overflow-x-hidden sm:min-h-[580px] lg:min-h-[640px]"
            data-elfsight-app-lazy
          />
        </div>
      </section>

      <section
        ref={aboutSection}
        id="about"
        className="scroll-mt-[88px] border-y border-black/10 bg-[#faf8f4] py-20 dark:border-white/10 dark:bg-[#1d1d1b]"
      >
        <div className="mx-auto grid max-w-7xl gap-x-16 gap-y-12 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:px-10">
          <header>
            <p className="section-eyebrow">About</p>
            <h2 className="section-title">Drawing stories into life.</h2>
          </header>

          <div className="max-w-3xl lg:pt-7">
            <p className="text-xl leading-relaxed text-[#403e3a] dark:text-[#d8d3ca]">
              Self-taught manga artist with 15+ years of experience in character design, expressive sketch work, and dynamic action scenes.
            </p>
          </div>

          <div className="space-y-14 lg:col-span-2 lg:space-y-16">
            <section className="border-t border-black/15 pt-8 dark:border-white/15" aria-labelledby="awards-title">
              <div className="mb-7 sm:flex sm:items-end sm:justify-between sm:gap-8">
                <h3 id="awards-title" className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9b4035]">
                  Awards &amp; Recognition
                </h3>
                <p className="mt-2 text-sm text-[#68645e] dark:text-[#bbb5ac] sm:mt-0">
                  International Manga Competitions
                </p>
              </div>

              <div className="grid border-y border-black/10 dark:border-white/10 sm:grid-cols-2 sm:divide-x sm:divide-black/10 dark:sm:divide-white/10">
                <article className="py-6 sm:pr-8">
                  <p className="text-lg font-semibold">First Prize</p>
                  <p className="mt-3 leading-relaxed text-[#403e3a] dark:text-[#d8d3ca]">
                    MangaDraft × Manga-io × XP-PEN
                  </p>
                  <p className="text-sm text-[#68645e] dark:text-[#bbb5ac]">Illustration Contest</p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#9b4035]">2022</p>
                </article>

                <article className="border-t border-black/10 py-6 dark:border-white/10 sm:border-t-0 sm:pl-8">
                  <p className="text-lg font-semibold">Finalist</p>
                  <p className="mt-3 leading-relaxed text-[#403e3a] dark:text-[#d8d3ca]">
                    KADOKAWA WORLD MANGA CONTEST
                  </p>
                  <p className="text-sm text-[#68645e] dark:text-[#bbb5ac]" lang="ja">“精霊の世！”</p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#9b4035]">2026</p>
                </article>
              </div>
            </section>

            <section className="border-t border-black/15 pt-8 dark:border-white/15" aria-labelledby="experience-title">
              <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
                <div>
                  <h3 id="experience-title" className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9b4035]">
                    Experience
                  </h3>
                  <p className="mt-4 text-xl font-medium">Independent Manga Artist</p>
                  <p className="mt-1 text-sm text-[#68645e] dark:text-[#bbb5ac]">2010–Present</p>
                </div>
                <ul className="grid gap-x-8 gap-y-3 text-sm leading-relaxed text-[#5d5a55] dark:text-[#c8c3ba] sm:grid-cols-2">
                  {experienceHighlights.map((highlight) => (
                    <li key={highlight} className="relative pl-4 before:absolute before:left-0 before:top-[0.65em] before:h-1 before:w-1 before:bg-[#9b4035]">
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="border-t border-black/15 pt-8 dark:border-white/15" aria-labelledby="skills-title">
              <h3 id="skills-title" className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9b4035]">
                Skills
              </h3>
              <div className="mt-7 grid gap-9 md:grid-cols-2">
                {[
                  ["Art Skills", artSkills],
                  ["Production Skills", productionSkills],
                ].map(([label, skills]) => (
                  <div key={label}>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.14em]">{label}</h4>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {skills.map((skill) => (
                        <li key={skill} className="border border-black/15 px-3 py-2 text-sm text-[#5d5a55] dark:border-white/20 dark:text-[#c8c3ba]">
                          {skill}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-t border-black/15 pt-8 dark:border-white/15" aria-labelledby="tools-title">
              <h3 id="tools-title" className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9b4035]">
                Tools
              </h3>
              <div className="mt-7 grid gap-10 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-[0.14em]">Software</h4>
                  <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#5d5a55] dark:text-[#c8c3ba]">
                    {software.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-[0.14em]">Traditional</h4>
                  <dl className="mt-4 space-y-4 text-sm leading-relaxed">
                    {traditionalTools.map((item) => (
                      <div key={item.label}>
                        <dt className="font-medium text-[#403e3a] dark:text-[#d8d3ca]">{item.label}</dt>
                        <dd className="text-[#5d5a55] dark:text-[#c8c3ba]">{item.details}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-24 text-center sm:px-8">
        <p className="section-eyebrow">Contact</p>
        <h2 className="section-title mx-auto max-w-3xl">Let’s discuss your next project.</h2>
        <p className="mx-auto mt-5 max-w-xl text-[#68645e] dark:text-[#bbb5ac]">
          For project enquiries and professional opportunities.
        </p>
        <Link className="button-primary mt-8" to="/contact">
          Get in Touch
        </Link>
      </section>
    </main>
  );
};

export default HomePage;
