import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { t } from "../../content/ui";

const MODE_STORAGE_KEY = "manga-reader-mode";
const DEFAULT_MODE = "horizontal";
const SWIPE_THRESHOLD = 50;
const DOUBLE_PAGE_MIN_WIDTH = 900;
const LANGUAGE_MENU_WIDTH = 176;
const LANGUAGE_MENU_MARGIN = 8;
const LANGUAGE_MENU_GAP = 8;

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

const LanguageSelector = ({ languages, activeLanguage, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState(() => document.fullscreenElement || document.body);
  const [menuPosition, setMenuPosition] = useState({
    top: LANGUAGE_MENU_MARGIN,
    left: LANGUAGE_MENU_MARGIN,
    width: LANGUAGE_MENU_WIDTH,
  });
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const optionElements = useRef([]);
  const activeOption = languages.find(([code]) => code === activeLanguage) ?? languages[0];
  const [, activeLanguageData] = activeOption;

  const updateMenuPosition = useCallback(() => {
    const triggerElement = trigger.current;
    if (!triggerElement) return;

    const triggerRect = triggerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const availableWidth = Math.max(0, viewportWidth - LANGUAGE_MENU_MARGIN * 2);
    const width = Math.min(LANGUAGE_MENU_WIDTH, availableWidth);
    const menuHeight = menu.current?.getBoundingClientRect().height ?? 0;
    const belowTop = triggerRect.bottom + LANGUAGE_MENU_GAP;
    const aboveTop = triggerRect.top - LANGUAGE_MENU_GAP - menuHeight;
    const top = belowTop + menuHeight <= viewportHeight - LANGUAGE_MENU_MARGIN
      ? belowTop
      : Math.max(LANGUAGE_MENU_MARGIN, aboveTop);
    const left = Math.min(
      Math.max(LANGUAGE_MENU_MARGIN, triggerRect.right - width),
      Math.max(LANGUAGE_MENU_MARGIN, viewportWidth - LANGUAGE_MENU_MARGIN - width),
    );

    setMenuPosition({ top, left, width });
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setPortalTarget(document.fullscreenElement || document.body);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    const currentPortalTarget = document.fullscreenElement || document.body;
    if (portalTarget !== currentPortalTarget) {
      setPortalTarget(currentPortalTarget);
      return undefined;
    }

    updateMenuPosition();
    const frame = requestAnimationFrame(updateMenuPosition);
    const handleViewportChange = () => updateMenuPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, portalTarget, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        !root.current?.contains(event.target) &&
        !menu.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      trigger.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [isOpen]);

  if (languages.length === 1) {
    return (
      <span
        className="inline-flex min-h-9 items-center justify-center border border-white/20 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-white sm:px-3"
        aria-label={`Language: ${activeLanguageData.label}`}
        data-reader-language-label
      >
        {activeLanguageData.shortLabel}
      </span>
    );
  }

  const focusOption = (index) => {
    const optionCount = optionElements.current.length;
    if (!optionCount) return;
    optionElements.current[(index + optionCount) % optionCount]?.focus();
  };

  const handleMenuKeyDown = (event) => {
    const currentIndex = optionElements.current.indexOf(document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(languages.length - 1);
    }
  };

  const selectLanguage = (code) => {
    onChange(code);
    setIsOpen(false);
    trigger.current?.focus();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={`Language: ${activeLanguageData.label}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setIsOpen(true);
          requestAnimationFrame(() => {
            const activeIndex = languages.findIndex(([code]) => code === activeLanguage);
            focusOption(activeIndex >= 0 ? activeIndex : 0);
          });
        }}
        className="inline-flex min-h-9 min-w-11 items-center justify-center border border-white/25 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:border-[#d88a7e] hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] sm:px-3"
        data-reader-language-trigger
      >
        {activeLanguageData.shortLabel}
      </button>

      {isOpen && portalTarget && createPortal(
        <div
          ref={menu}
          role="menu"
          aria-label="Language"
          onKeyDown={handleMenuKeyDown}
          className="fixed z-[9999] max-w-[calc(100vw-1rem)] border border-white/20 bg-[#1d1d1b] p-2 text-white shadow-2xl"
          style={menuPosition}
          data-reader-language-menu
        >
          <p className="px-2 pb-2 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#d88a7e]">
            Language
          </p>
          {languages.map(([code, language], index) => {
            const isActive = code === activeLanguage;

            return (
              <button
                key={code}
                ref={(element) => {
                  optionElements.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => selectLanguage(code)}
                className={`flex min-h-10 w-full items-center gap-2 px-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d88a7e] ${
                  isActive
                    ? "bg-[#d88a7e]/15 text-[#f4f1eb]"
                    : "text-[#c8c3ba] hover:bg-white/10 hover:text-white"
                }`}
              >
                <span aria-hidden="true" className="w-3 text-[#d88a7e]">
                  {isActive ? "●" : "○"}
                </span>
                {language.label}
              </button>
            );
          })}
        </div>,
        portalTarget,
      )}
    </div>
  );
};

const MangaPageImage = ({ page, title, eager = false, className = "" }) => (
  <img
    src={page.src}
    alt={t.mangaReader.pageAlt(title, page.number)}
    className={`block select-none bg-white object-contain ${className}`}
    loading={eager ? "eager" : "lazy"}
    decoding="async"
    draggable="false"
  />
);

const ThumbnailStrip = ({
  pages,
  activePages,
  isVisible,
  interfaceTransition,
  thumbnailElements,
  onSelect,
}) => (
  <div
    className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-black/70 shadow-[0_-8px_24px_rgba(0,0,0,0.24)] backdrop-blur-md ${interfaceTransition} ${
      isVisible
        ? "translate-y-0 opacity-100"
        : "pointer-events-none translate-y-full opacity-0"
    }`}
    aria-hidden={!isVisible}
    inert={isVisible ? undefined : ""}
    data-thumbnail-interface
  >
    <div className="min-h-0 overflow-hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <div
        className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2"
        dir="rtl"
        role="list"
        aria-label="Manga pages"
        data-thumbnail-strip
      >
        {pages.map((page, index) => {
          const pageNumber = index + 1;
          const isActive = activePages.includes(pageNumber);

          return (
            <div key={page} role="listitem" className="w-16 shrink-0 sm:w-20">
              <button
                ref={(element) => {
                  thumbnailElements.current[index] = element;
                }}
                type="button"
                aria-label={`Open page ${pageNumber}`}
                aria-pressed={isActive}
                onClick={() => onSelect(pageNumber)}
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
);

const MangaReader = ({ manga }) => {
  const { defaultLanguage, id, languages, readingDirection, slug, title } = manga;
  const languageOptions = useMemo(() => Object.entries(languages), [languages]);
  const languageCodes = useMemo(() => languageOptions.map(([code]) => code), [languageOptions]);
  const languageStorageKey = `manga-language:${slug || id}`;
  const [activeLanguage, setActiveLanguage] = useState(() =>
    readPreference(languageStorageKey, languageCodes, defaultLanguage),
  );
  const resolvedLanguage = languages[activeLanguage] ? activeLanguage : defaultLanguage;
  const pages = languages[resolvedLanguage].pages;
  const pageCount = pages.length;
  const [readingMode, setReadingMode] = useState(() =>
    readPreference(MODE_STORAGE_KEY, ["vertical", "horizontal"], DEFAULT_MODE),
  );
  const [isWideReader, setIsWideReader] = useState(() =>
    window.innerWidth >= DOUBLE_PAGE_MIN_WIDTH,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [isInterfaceVisible, setIsInterfaceVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsFullscreen, setSupportsFullscreen] = useState(false);
  const readerRoot = useRef(null);
  const verticalPageElements = useRef([]);
  const thumbnailElements = useRef([]);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const suppressZoneClick = useRef(false);
  const shouldReduceMotion = useReducedMotion();
  const pageDisplay = readingMode === "horizontal" && isWideReader ? "double" : "single";

  const selectLanguage = useCallback(
    (language) => {
      const nextPages = languages[language]?.pages;
      if (!nextPages) return;

      setActiveLanguage(language);
      setCurrentPage((page) => Math.min(page, nextPages.length));
      verticalPageElements.current = [];
      thumbnailElements.current = [];
    },
    [languages],
  );

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
    writePreference(languageStorageKey, resolvedLanguage);
  }, [languageStorageKey, resolvedLanguage]);

  useEffect(() => {
    const root = readerRoot.current;
    if (!root) return undefined;

    const updateReaderWidth = (width) => {
      setIsWideReader(width >= DOUBLE_PAGE_MIN_WIDTH);
    };

    updateReaderWidth(root.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => updateReaderWidth(root.getBoundingClientRect().width);
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const observer = new ResizeObserver(([entry]) => {
      updateReaderWidth(entry.contentRect.width);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

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
    setActiveLanguage(
      readPreference(languageStorageKey, languageCodes, defaultLanguage),
    );
    setCurrentPage(1);
    setIsInterfaceVisible(true);
    verticalPageElements.current = [];
    thumbnailElements.current = [];
  }, [defaultLanguage, id, languageCodes, languageStorageKey]);

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
    const touch = event.changedTouches[0];
    touchStartX.current = touch?.clientX ?? null;
    touchStartY.current = touch?.clientY ?? null;
    suppressZoneClick.current = false;
  };

  const handleTouchEnd = (event) => {
    if (
      readingMode !== "horizontal" ||
      touchStartX.current === null ||
      touchStartY.current === null
    ) {
      return;
    }

    const touch = event.changedTouches[0];
    const touchEndX = touch?.clientX ?? touchStartX.current;
    const touchEndY = touch?.clientY ?? touchStartY.current;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (
      Math.abs(deltaX) < SWIPE_THRESHOLD ||
      Math.abs(deltaX) <= Math.abs(deltaY)
    ) {
      return;
    }

    suppressZoneClick.current = true;
    const isNextSwipe = readingDirection === "rtl" ? deltaX > 0 : deltaX < 0;
    if (isNextSwipe) goToNext();
    else goToPrevious();
  };

  const handleZoneAction = (action) => {
    if (suppressZoneClick.current) {
      suppressZoneClick.current = false;
      return;
    }
    action();
  };

  const selectMode = (mode) => setReadingMode(mode);

  const interfaceTransition = shouldReduceMotion
    ? ""
    : "transition-[transform,opacity] duration-200 ease-out";

  return (
    <main
      ref={readerRoot}
      className={`relative flex min-h-[100dvh] w-[100dvw] flex-col overflow-x-clip bg-[#111110] text-[#f4f1eb] ${
        readingMode === "horizontal" ? "h-[100dvh] overflow-y-hidden" : ""
      }`}
      dir="ltr"
      data-reading-direction={readingDirection}
      data-reader-mode={readingMode}
      data-page-display={pageDisplay}
      data-reader-interface={isInterfaceVisible ? "visible" : "hidden"}
      data-reader-fullscreen={isFullscreen ? "true" : "false"}
      data-reader-language={resolvedLanguage}
    >
      <div
        className={`fixed inset-x-0 top-0 z-40 text-white ${interfaceTransition} ${
          isInterfaceVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-full opacity-0"
        }`}
        aria-hidden={!isInterfaceVisible}
        inert={isInterfaceVisible ? undefined : ""}
        data-reader-header
      >
        <header className="border-b border-white/[0.08] bg-black/70 shadow-lg backdrop-blur-md">
          <div className="mx-auto max-w-[1600px] px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
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

              <div className="flex items-center justify-end gap-1 sm:gap-2">
                <LanguageSelector
                  languages={languageOptions}
                  activeLanguage={resolvedLanguage}
                  onChange={selectLanguage}
                />
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
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
              <div className="flex gap-1" role="group" aria-label="Reading mode">
                <ReaderToggle label="Reading mode" value="vertical" activeValue={readingMode} onChange={selectMode}>Vertical</ReaderToggle>
                <ReaderToggle label="Reading mode" value="horizontal" activeValue={readingMode} onChange={selectMode}>Horizontal</ReaderToggle>
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
                    className="h-auto max-h-[100dvh] w-auto max-w-full"
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
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden bg-[#111110] p-0"
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
              tabIndex={isInterfaceVisible ? 0 : -1}
              aria-label="Next page or spread"
              aria-hidden={!isInterfaceVisible}
              className={`absolute left-1 top-1/2 z-20 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center border border-white/20 bg-black/55 text-3xl text-white transition-opacity hover:border-[#d88a7e] hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] disabled:cursor-not-allowed disabled:opacity-25 sm:left-3 ${
                isInterfaceVisible ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              ←
            </button>

            <div
              className="flex h-full min-h-0 w-full items-center justify-center gap-0"
              dir={visiblePages.length > 1 ? "rtl" : "ltr"}
              data-horizontal-pages={visiblePageNumbers.join("-")}
            >
              {visiblePages.map((page) => (
                <figure
                  key={page.src}
                  className={`m-0 min-h-0 border-0 p-0 ${
                    visiblePages.length > 1
                      ? "contents"
                      : "flex h-full w-full items-center justify-center"
                  }`}
                  data-page={page.number}
                  dir="ltr"
                >
                  <MangaPageImage
                    page={page}
                    title={title}
                    eager
                    className={`m-0 h-full max-h-[100dvh] w-auto flex-none border-0 p-0 object-contain ${
                      visiblePages.length > 1 ? "max-w-[50%]" : "max-w-full"
                    }`}
                  />
                </figure>
              ))}
            </div>

            <button
              type="button"
              onClick={goToPrevious}
              disabled={!canGoPrevious}
              tabIndex={isInterfaceVisible ? 0 : -1}
              aria-label="Previous page or spread"
              aria-hidden={!isInterfaceVisible}
              className={`absolute right-1 top-1/2 z-20 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center border border-white/20 bg-black/55 text-3xl text-white transition-opacity hover:border-[#d88a7e] hover:text-[#d88a7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d88a7e] disabled:cursor-not-allowed disabled:opacity-25 sm:right-3 ${
                isInterfaceVisible ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              →
            </button>
          </div>

        </section>
      )}

      <ThumbnailStrip
        pages={pages}
        activePages={visiblePageNumbers}
        isVisible={isInterfaceVisible}
        interfaceTransition={interfaceTransition}
        thumbnailElements={thumbnailElements}
        onSelect={goToPage}
      />
    </main>
  );
};

export default MangaReader;
