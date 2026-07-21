import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { t } from "../../content/ui";

const MODE_STORAGE_KEY = "manga-reader-mode";
const DISPLAY_STORAGE_KEY = "manga-reader-display";
const DEFAULT_MODE = "horizontal";
const DEFAULT_DISPLAY = "single";
const SWIPE_THRESHOLD = 50;

const readPreference = (key, acceptedValues, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return acceptedValues.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

const writePreference = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The reader remains fully functional when storage is unavailable.
  }
};

const getSpreadStart = (pageNumber) => {
  if (pageNumber <= 1) return 1;
  return pageNumber % 2 === 0 ? pageNumber : pageNumber - 1;
};

const getVisiblePageNumbers = (currentPage, pageDisplay, pageCount) => {
  if (pageDisplay === "single") return [currentPage];

  const firstPage = getSpreadStart(currentPage);
  if (firstPage === 1) return [1];

  return [firstPage, firstPage + 1].filter((page) => page <= pageCount);
};

const getVerticalGroups = (pages) => {
  const numberedPages = pages.map((src, index) => ({ src, number: index + 1 }));
  return numberedPages.map((page) => [page]);
};

const isInteractiveElementFocused = () => {
  const activeElement = document.activeElement;
  return Boolean(
    activeElement?.closest(
      "input, textarea, select, button, a, [contenteditable='true'], [role='button']",
    ),
  );
};

const ReaderToggle = ({ label, value, activeValue, onChange, children }) => (
  <button
    type="button"
    aria-label={`${label}: ${children}`}
    aria-pressed={activeValue === value}
    onClick={() => onChange(value)}
    className={`min-h-9 border px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1d1d1b] ${
      activeValue === value
        ? "border-[#d88a7e] bg-[#d88a7e] text-[#1d1d1b]"
        : "border-white/20 text-white hover:border-white/50"
    }`}
  >
    {children}
  </button>
);

const MangaPageImage = ({ page, title, eager = false, className = "" }) => (
  <img
    src={page.src}
    alt={t.mangaReader.pageAlt(title, page.number)}
    className={`block h-auto max-w-full select-none bg-white object-contain ${className}`}
    loading={eager ? "eager" : "lazy"}
    decoding="async"
    draggable="false"
  />
);

const MangaReader = ({ manga }) => {
  const { id, pages, pageCount, readingDirection, title } = manga;
  const [readingMode, setReadingMode] = useState(() =>
    readPreference(MODE_STORAGE_KEY, ["vertical", "horizontal"], DEFAULT_MODE),
  );
  const [pageDisplay, setPageDisplay] = useState(() =>
    readingMode === "vertical"
      ? "single"
      : readPreference(DISPLAY_STORAGE_KEY, ["single", "double"], DEFAULT_DISPLAY),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [isInterfaceVisible, setIsInterfaceVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsFullscreen, setSupportsFullscreen] = useState(false);
  const readerRoot = useRef(null);
  const verticalPageElements = useRef([]);
  const thumbnailElements = useRef([]);
  const touchStartX = useRef(null);
  const suppressZoneClick = useRef(false);
  const shouldReduceMotion = useReducedMotion();

  const visiblePageNumbers = useMemo(
    () => getVisiblePageNumbers(currentPage, pageDisplay, pageCount),
    [currentPage, pageCount, pageDisplay],
  );
  const verticalGroups = useMemo(
    () => getVerticalGroups(pages),
    [pages],
  );

  const visiblePages = visiblePageNumbers.map((pageNumber) => ({
    src: pages[pageNumber - 1],
    number: pageNumber,
  }));

  const counterLabel =
    visiblePageNumbers.length === 1
      ? `Page ${visiblePageNumbers[0]} of ${pageCount}`
      : `Pages ${visiblePageNumbers[0]}–${visiblePageNumbers.at(-1)} of ${pageCount}`;

  const canGoPrevious = visiblePageNumbers[0] > 1;
  const canGoNext = visiblePageNumbers.at(-1) < pageCount;

  const goToPage = useCallback(
    (pageNumber, { scroll = readingMode === "vertical" } = {}) => {
      const targetPage = Math.min(Math.max(pageNumber, 1), pageCount);
      setCurrentPage(targetPage);

      if (scroll) {
        requestAnimationFrame(() => {
          verticalPageElements.current[targetPage - 1]?.scrollIntoView({
            behavior: shouldReduceMotion ? "auto" : "smooth",
            block: "start",
          });
        });
      }
    },
    [pageCount, readingMode, shouldReduceMotion],
  );

  const goToNext = useCallback(() => {
    if (!canGoNext) return;

    const nextPage =
      pageDisplay === "double"
        ? visiblePageNumbers[0] === 1
          ? 2
          : visiblePageNumbers[0] + 2
        : currentPage + 1;
    goToPage(nextPage, { scroll: readingMode === "vertical" });
  }, [
    canGoNext,
    currentPage,
    goToPage,
    pageDisplay,
    readingMode,
    visiblePageNumbers,
  ]);

  const goToPrevious = useCallback(() => {
    if (!canGoPrevious) return;

    const previousPage =
      pageDisplay === "double"
        ? visiblePageNumbers[0] === 2
          ? 1
          : visiblePageNumbers[0] - 2
        : currentPage - 1;
    goToPage(previousPage, { scroll: readingMode === "vertical" });
  }, [
    canGoPrevious,
    currentPage,
    goToPage,
    pageDisplay,
    readingMode,
    visiblePageNumbers,
  ]);

  useEffect(() => {
    writePreference(MODE_STORAGE_KEY, readingMode);
  }, [readingMode]);

  useEffect(() => {
    writePreference(DISPLAY_STORAGE_KEY, pageDisplay);
  }, [pageDisplay]);

  useEffect(() => {
    if (readingMode === "vertical" && pageDisplay !== "single") {
      setPageDisplay("single");
    }
  }, [pageDisplay, readingMode]);

  useEffect(() => {
    const root = readerRoot.current;
    setSupportsFullscreen(Boolean(root?.requestFullscreen && document.exitFullscreen));

    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === root);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setIsInterfaceVisible(true);
    verticalPageElements.current = [];
    thumbnailElements.current = [];
  }, [id]);

  useEffect(() => {
    if (readingMode !== "vertical") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

        if (visibleEntry) {
          setCurrentPage(Number(visibleEntry.target.dataset.page));
        }
      },
      { rootMargin: "-18% 0px -58%", threshold: [0.1, 0.5, 0.9] },
    );

    verticalPageElements.current.forEach((page) => page && observer.observe(page));
    return () => observer.disconnect();
  }, [pages, readingMode]);

  useEffect(() => {
    if (readingMode !== "horizontal") return;

    const activeThumbnail = thumbnailElements.current[currentPage - 1];
    activeThumbnail?.scrollIntoView({
      behavior: shouldReduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [currentPage, readingMode, shouldReduceMotion, visiblePageNumbers]);

  const toggleInterface = useCallback(() => {
    setIsInterfaceVisible((isVisible) => !isVisible);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (readerRoot.current?.requestFullscreen) {
        await readerRoot.current.requestFullscreen();
      }
    } catch {
      // The browser can refuse fullscreen outside an allowed user gesture.
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (!isInterfaceVisible) {
          setIsInterfaceVisible(true);
        }
        return;
      }

      if (
        readingMode !== "horizontal" ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isInteractiveElementFocused()
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToNext();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToPrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrevious, isInterfaceVisible, readingMode]);

  const handleTouchStart = (event) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
    suppressZoneClick.current = false;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null) return;

    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = touchEndX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(distance) < SWIPE_THRESHOLD) return;
    suppressZoneClick.current = true;
    if (distance < 0) goToNext();
    else goToPrevious();
  };

  const handleZoneAction = (action) => {
    if (suppressZoneClick.current) {
      suppressZoneClick.current = false;
      return;
    }
    action();
  };

  const selectMode = (mode) => {
    setReadingMode(mode);
    if (mode === "vertical") setPageDisplay("single");
  };

  const interfaceTransition = shouldReduceMotion
    ? ""
    : "transition-[max-height,opacity] duration-200 ease-out";

  return (
    <main
      ref={readerRoot}
      className={`relative flex min-h-[100dvh] flex-col overflow-x-clip bg-[#111110] text-[#f4f1eb] ${
        readingMode === "horizontal" ? "h-[100dvh] overflow-y-hidden" : ""
      }`}
      dir="ltr"
      data-reading-direction={readingDirection}
      data-reader-mode={readingMode}
      data-page-display={pageDisplay}
      data-reader-interface={isInterfaceVisible ? "visible" : "hidden"}
      data-reader-fullscreen={isFullscreen ? "true" : "false"}
    >
      <div
        className={`absolute inset-x-0 top-0 z-30 overflow-hidden text-white ${interfaceTransition} ${
          isInterfaceVisible
            ? "max-h-64 opacity-100"
            : "pointer-events-none max-h-0 opacity-0"
        }`}
        aria-hidden={!isInterfaceVisible}
        inert={isInterfaceVisible ? undefined : ""}
        data-reader-header
      >
        <header className="min-h-0 overflow-hidden bg-black/80 shadow-lg backdrop-blur-md">
          <div className="mx-auto max-w-[1600px] px-3 py-2 sm:px-5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4">
              <nav className="flex min-w-0 items-center gap-1 sm:gap-2" aria-label="Reader navigation">
                <Link
                  to="/"
                  onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })}
                  aria-label="KEVGENGA home"
                  className="px-2 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] sm:text-sm"
                >
                  KEVGENGA
                </Link>
                <Link
                  to="/mangaka"
                  className="border border-white/25 px-2 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] transition-colors hover:border-[#d88a7e] hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] sm:px-3"
                >
                  Manga
                </Link>
              </nav>

              <h1 className="truncate text-center text-sm font-semibold sm:text-lg" title={title}>
                {title}
              </h1>

              <button
                type="button"
                onClick={toggleInterface}
                aria-label="Hide reader interface"
                className="flex min-h-9 min-w-9 items-center justify-center gap-2 border border-white/20 px-2 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:border-[#d88a7e] hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e]"
              >
                <span aria-hidden="true">×</span>
                <span className="hidden sm:inline">Hide</span>
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
              <div className="flex gap-1" role="group" aria-label="Reading mode">
                <ReaderToggle label="Reading mode" value="vertical" activeValue={readingMode} onChange={selectMode}>Vertical</ReaderToggle>
                <ReaderToggle label="Reading mode" value="horizontal" activeValue={readingMode} onChange={selectMode}>Horizontal</ReaderToggle>
              </div>

              <div className="flex gap-1" role="group" aria-label="Page display">
                <ReaderToggle label="Page display" value="single" activeValue={pageDisplay} onChange={setPageDisplay}>1 Page</ReaderToggle>
                {readingMode === "horizontal" && (
                  <ReaderToggle label="Page display" value="double" activeValue={pageDisplay} onChange={setPageDisplay}>2 Pages</ReaderToggle>
                )}
              </div>

              <p
                className="ml-auto text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#d88a7e] sm:text-xs"
                aria-live="polite"
                aria-atomic="true"
                data-reader-counter
              >
                {counterLabel}
              </p>

              {supportsFullscreen && (
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  className="flex min-h-9 items-center justify-center gap-2 border border-white/25 px-2 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:border-[#d88a7e] hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] sm:px-3"
                >
                  <span aria-hidden="true">{isFullscreen ? "×" : "⛶"}</span>
                  <span className="hidden sm:inline">{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
                </button>
              )}
            </div>
          </div>
        </header>
      </div>

      {readingMode === "vertical" ? (
        <section
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 bg-[#111110] px-0 py-0 sm:gap-4 sm:px-4"
          aria-label={`${title} vertical reader`}
          data-vertical-reader
        >
          <div
            className="fixed inset-0 z-20 grid grid-rows-3"
            data-vertical-click-zones
          >
            <button
              type="button"
              onClick={() => handleZoneAction(goToPrevious)}
              aria-label="Previous page"
              className="cursor-n-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d88a7e]"
            />
            <button
              type="button"
              onClick={() => handleZoneAction(toggleInterface)}
              aria-label={isInterfaceVisible ? "Hide reader interface" : "Show reader interface"}
              className="cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d88a7e]"
            />
            <button
              type="button"
              onClick={() => handleZoneAction(goToNext)}
              aria-label="Next page"
              className="cursor-s-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d88a7e]"
            />
          </div>

          {verticalGroups.map((group) => (
            <div
              key={group[0].number}
              className="mx-auto grid w-full grid-cols-1 items-start justify-center gap-2 sm:gap-3"
              dir="ltr"
              data-page-group={group.map((page) => page.number).join("-")}
            >
              {group.map((page) => (
                <figure
                  key={page.src}
                  ref={(element) => {
                    verticalPageElements.current[page.number - 1] = element;
                  }}
                  className="mx-auto flex w-full scroll-mt-0 justify-center bg-white md:w-auto"
                  data-page={page.number}
                  dir="ltr"
                >
                  <MangaPageImage
                    page={page}
                    title={title}
                    eager={page.number === 1}
                    className="max-h-[100dvh] w-auto"
                  />
                </figure>
              ))}
            </div>
          ))}
        </section>
      ) : (
        <section
          className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden p-0"
          aria-label={`${title} horizontal reader`}
          data-horizontal-reader
        >
          <div
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden bg-[#111110] px-11 py-0 sm:px-16"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            data-horizontal-stage
          >
            <div className="absolute inset-0 z-10 grid grid-cols-3" data-horizontal-click-zones>
              <button
                type="button"
                onClick={() => handleZoneAction(goToNext)}
                aria-label="Next page or spread"
                className="cursor-w-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d88a7e]"
              />
              <button
                type="button"
                onClick={() => handleZoneAction(toggleInterface)}
                aria-label={isInterfaceVisible ? "Hide reader interface" : "Show reader interface"}
                className="cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d88a7e]"
              />
              <button
                type="button"
                onClick={() => handleZoneAction(goToPrevious)}
                aria-label="Previous page or spread"
                className="cursor-e-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d88a7e]"
              />
            </div>

            <button
              type="button"
              onClick={goToNext}
              disabled={!canGoNext}
              aria-label="Next page or spread"
              className={`absolute left-1 top-1/2 z-20 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center border border-white/20 bg-black/55 text-3xl text-white transition-opacity hover:border-[#d88a7e] hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] disabled:cursor-not-allowed disabled:opacity-25 sm:left-3 ${
                isInterfaceVisible ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              ←
            </button>

            <div
              className={`flex w-full items-center justify-center gap-0 ${
                isInterfaceVisible ? "max-h-[78dvh]" : "max-h-[100dvh]"
              }`}
              dir={visiblePages.length > 1 ? "rtl" : "ltr"}
              data-horizontal-pages={visiblePageNumbers.join("-")}
            >
              {visiblePages.map((page, index) => (
                <figure
                  key={page.src}
                  className={`min-h-0 items-center justify-center p-0 ${
                    visiblePages.length > 1
                      ? `${index > 0 ? "hidden md:flex" : "flex"} flex-none md:max-w-[50%]`
                      : "flex w-full"
                  }`}
                  data-page={page.number}
                  dir="ltr"
                >
                  <MangaPageImage
                    page={page}
                    title={title}
                    eager
                    className={`w-auto max-w-full ${
                      isInterfaceVisible ? "max-h-[76dvh]" : "max-h-[100dvh]"
                    }`}
                  />
                </figure>
              ))}
            </div>

            <button
              type="button"
              onClick={goToPrevious}
              disabled={!canGoPrevious}
              aria-label="Previous page or spread"
              className={`absolute right-1 top-1/2 z-20 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center border border-white/20 bg-black/55 text-3xl text-white transition-opacity hover:border-[#d88a7e] hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] disabled:cursor-not-allowed disabled:opacity-25 sm:right-3 ${
                isInterfaceVisible ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              →
            </button>
          </div>

          <div
            className={`absolute inset-x-0 bottom-0 z-30 overflow-hidden ${interfaceTransition} ${
              isInterfaceVisible
                ? "max-h-32 opacity-100"
                : "pointer-events-none max-h-0 opacity-0"
            }`}
            aria-hidden={!isInterfaceVisible}
            inert={isInterfaceVisible ? undefined : ""}
            data-thumbnail-interface
          >
            <div className="min-h-0 overflow-hidden border-x border-b border-black/10 bg-[#d9d3c9] p-3 dark:border-white/10 dark:bg-[#1d1d1b]">
              <div
              className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2"
              dir="rtl"
              role="list"
              aria-label="Manga pages"
              data-thumbnail-strip
              >
              {pages.map((page, index) => {
                const pageNumber = index + 1;
                const isActive = visiblePageNumbers.includes(pageNumber);

                return (
                  <div key={page} role="listitem" className="w-16 shrink-0 sm:w-20">
                    <button
                      ref={(element) => {
                        thumbnailElements.current[index] = element;
                      }}
                      type="button"
                      aria-label={`Open page ${pageNumber}`}
                      aria-pressed={isActive}
                      onClick={() => goToPage(pageNumber, { scroll: false })}
                      className={`relative w-full border-2 bg-white p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b4035] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1d1d1b] ${
                        isActive
                          ? "border-[#9b4035]"
                          : "border-transparent opacity-65 hover:opacity-100"
                      }`}
                      data-thumbnail-page={pageNumber}
                    >
                      <img
                        src={page}
                        alt=""
                        className="aspect-[3/4] w-full object-cover object-top"
                        loading="lazy"
                        decoding="async"
                        draggable="false"
                      />
                      <span className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 text-[0.6rem] font-semibold text-white" dir="ltr">
                        {pageNumber}
                      </span>
                    </button>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
};

export default MangaReader;
