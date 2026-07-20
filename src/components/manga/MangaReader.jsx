import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import Lightbox from "../gallery/Lightbox";
import { t } from "../../content/ui";

const MangaReader = ({ manga }) => {
  const { id, pages, pageCount, readingDirection, title } = manga;
  const [currentPage, setCurrentPage] = useState(1);
  const pageElements = useRef([]);
  const shouldReduceMotion = useReducedMotion();
  const galleryName = `manga-${id}`;
  const selector = `[data-fancybox='${galleryName}']`;

  const goToPage = useCallback(
    (pageNumber) => {
      const targetPage = Math.min(Math.max(pageNumber, 1), pageCount);
      pageElements.current[targetPage - 1]?.scrollIntoView({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        block: "start",
      });
      setCurrentPage(targetPage);
    },
    [pageCount, shouldReduceMotion],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry) {
          setCurrentPage(Number(visibleEntry.target.dataset.page));
        }
      },
      { rootMargin: "-20% 0px -55%", threshold: [0.1, 0.5, 0.9] },
    );

    pageElements.current.forEach((page) => page && observer.observe(page));
    return () => observer.disconnect();
  }, [pages]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector(".fancybox__container") ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        return;
      }

      const previousKey = readingDirection === "rtl" ? "ArrowRight" : "ArrowLeft";
      const nextKey = readingDirection === "rtl" ? "ArrowLeft" : "ArrowRight";

      if (event.key === previousKey && currentPage > 1) {
        event.preventDefault();
        goToPage(currentPage - 1);
      }

      if (event.key === nextKey && currentPage < pageCount) {
        event.preventDefault();
        goToPage(currentPage + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, goToPage, pageCount, readingDirection]);

  return (
    <main
      className="min-h-screen overflow-x-clip bg-light-background pt-20 dark:bg-dark-background"
      dir={readingDirection}
    >
      <Lightbox selector={selector} refreshKey={id} />

      <header className="mx-auto max-w-4xl px-4 pb-6 pt-4 text-center sm:px-6">
        <h1 className="mb-5 text-3xl font-bold sm:text-4xl">{t.mangaReader.title}</h1>
        <Link
          to="/mangaka"
          className="inline-block rounded-md bg-gray-700 px-5 py-2 text-center text-white hover:bg-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
        >
          {t.mangaReader.back}
        </Link>
      </header>

      <div
        className="sticky top-[72px] z-30 mx-auto mb-4 flex w-fit items-center gap-2 rounded-md bg-gray-900/90 px-2 py-2 text-sm text-white shadow-md backdrop-blur sm:gap-4 sm:px-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="rounded px-2 py-1 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t.mangaReader.previous}
        >
          {readingDirection === "rtl" ? "→" : "←"}
        </button>
        <span>{t.mangaReader.progress(currentPage, pageCount)}</span>
        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === pageCount}
          className="rounded px-2 py-1 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t.mangaReader.next}
        >
          {readingDirection === "rtl" ? "←" : "→"}
        </button>
      </div>

      <section
        className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-0 pb-10 sm:gap-5 sm:px-4"
        aria-label={title}
      >
        {pages.map((page, index) => {
          const pageNumber = index + 1;

          return (
            <a
              key={page}
              ref={(element) => {
                pageElements.current[index] = element;
              }}
              href={page}
              data-fancybox={galleryName}
              data-caption={t.mangaReader.pageCaption(pageNumber)}
              data-page={pageNumber}
              className="block w-full scroll-mt-32 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500 sm:w-auto"
            >
              <img
                src={page}
                alt={t.mangaReader.pageAlt(title, pageNumber)}
                className="mx-auto h-auto max-h-[calc(100dvh-8rem)] w-full object-contain sm:w-auto"
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </a>
          );
        })}
      </section>
    </main>
  );
};

export default MangaReader;
