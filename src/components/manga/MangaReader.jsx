import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { t } from "../../content/ui";
import {
  canStartReaderPointerGesture,
  finishReaderPointerGesture,
  getReaderDragOffset,
  getReaderRailPanelRoles,
  getReaderRailSnapOffset,
  getReaderRailTransform,
  getReaderSwipeDirectionAction,
  isHorizontalDragIntent,
  isVerticalDragIntent,
} from "./readerGestures";

const MODE_STORAGE_KEY = "manga-reader-mode";
const DEFAULT_MODE = "horizontal";
const DOUBLE_PAGE_MIN_WIDTH = 900;
const LANGUAGE_MENU_WIDTH = 176;
const LANGUAGE_MENU_MARGIN = 8;
const LANGUAGE_MENU_GAP = 8;
// Reader tutorial timing in milliseconds
const READER_TUTORIAL_TIMING = {
  delay: 180,
  duration: 3500,
  fade: 200,
};
const DRAG_RESET_DURATION = 180;
const DRAG_SNAP_DURATION = 210;
const DRAG_SNAP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const GHOST_CLICK_DURATION = 450;
const HORIZONTAL_RAIL_ROLES = getReaderRailPanelRoles();

const capturePointer = (element, pointerId) => {
  if (typeof element?.setPointerCapture !== "function") return false;

  try {
    element.setPointerCapture(pointerId);
    return typeof element.hasPointerCapture !== "function" || element.hasPointerCapture(pointerId);
  } catch {
    return false;
  }
};

const releasePointer = (element, pointerId) => {
  if (
    typeof element?.hasPointerCapture !== "function" ||
    typeof element?.releasePointerCapture !== "function" ||
    !element.hasPointerCapture(pointerId)
  ) {
    return;
  }

  try {
    element.releasePointerCapture(pointerId);
  } catch {
    // The browser may already have released capture after pointercancel.
  }
};

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
    className={`min-h-9 border bg-[#181818] px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd500] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151515] ${
      activeValue === value
        ? "border-[#f4f1e8] bg-[#f4f1e8] text-[#111111] shadow-[inset_0_-3px_0_#ffd500]"
        : "border-white/20 text-[#f4f1e8] hover:border-white/45 hover:bg-[#222222]"
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
        className="inline-flex min-h-9 items-center justify-center border border-white/20 bg-[#181818] px-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#f4f1e8] sm:px-3"
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
        className="inline-flex min-h-9 min-w-11 items-center justify-center border border-white/25 bg-[#181818] px-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#f4f1e8] transition-colors hover:border-white/45 hover:bg-[#222222] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd500] sm:px-3"
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
          className="fixed z-[9999] max-w-[calc(100vw-1rem)] border border-white/20 bg-[#181818] p-2 text-[#f4f1e8]"
          style={menuPosition}
          data-reader-language-menu
        >
          <p className="px-2 pb-2 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#aaa69d]">
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
                className={`flex min-h-10 w-full items-center gap-2 px-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd500] ${
                  isActive
                    ? "bg-white/10 text-[#f4f1e8] shadow-[inset_3px_0_0_#ffd500]"
                    : "text-[#c8c3ba] hover:bg-white/10 hover:text-white"
                }`}
              >
                <span aria-hidden="true" className="w-3 text-[#ffd500]">
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

const HorizontalRailPanel = ({ panel, title }) => (
  <div
    className="flex h-full min-h-0 w-full flex-none items-center justify-center overflow-hidden"
    aria-hidden={panel.role !== "current"}
    data-rail-panel={panel.role}
    data-rail-pages={panel.pageNumbers.join("-")}
  >
    <div
      className="flex h-full min-h-0 w-full items-center justify-center gap-0"
      dir={panel.pages.length > 1 ? "rtl" : "ltr"}
    >
      {panel.pages.map((page) => (
        <figure
          key={page.src}
          className={`m-0 min-h-0 border-0 p-0 ${
            panel.pages.length > 1
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
              panel.pages.length > 1 ? "max-w-[50%]" : "max-w-full"
            }`}
          />
        </figure>
      ))}
    </div>
  </div>
);

const ReaderTutorial = ({
  isVisible,
  readingDirection,
  readingMode,
  shouldReduceMotion,
}) => {
  const isHorizontal = readingMode === "horizontal";
  const directionLabel = readingDirection === "rtl" ? "Right to left" : "Left to right";

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-4 ${
        shouldReduceMotion ? "" : "transition-opacity ease-out"
      } ${isVisible ? "opacity-100" : "opacity-0"}`}
      style={shouldReduceMotion
        ? undefined
        : { transitionDuration: `${READER_TUTORIAL_TIMING.fade}ms` }}
      aria-hidden="true"
      data-reader-tutorial
      data-reader-tutorial-mode={readingMode}
    >
      <div className="w-full max-w-[15rem] border border-white/25 bg-[#151515]/95 px-5 py-6 text-center text-[#f4f1e8] shadow-[0_14px_36px_rgba(0,0,0,0.36)]">
        <span className="block text-4xl font-light leading-none text-white" aria-hidden="true">
          {isHorizontal ? (readingDirection === "rtl" ? "←" : "→") : "↓"}
        </span>
        <span className="mx-auto mt-4 block h-0.5 w-8 bg-[#ffd500]" aria-hidden="true" />
        <p className="mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#aaa69d]">
          {isHorizontal ? directionLabel : "Vertical reading"}
        </p>
        <p className="mt-1 text-sm font-bold uppercase tracking-[0.14em] text-[#f4f1e8]">
          {isHorizontal ? "Horizontal" : "Scroll to read"}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[#c8c3ba]">
          {isHorizontal
            ? "Swipe right for next page"
            : `${directionLabel} page order`}
        </p>
      </div>
    </div>
  );
};

const ReaderPagination = ({
  currentPage,
  pageCount,
  isVisible,
  interfaceTransition,
}) => (
  <div
    className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.1] bg-[#151515]/95 ${interfaceTransition} ${
      isVisible
        ? "translate-y-0 opacity-100"
        : "pointer-events-none translate-y-full opacity-0"
    }`}
    aria-hidden={!isVisible}
    inert={isVisible ? undefined : ""}
    data-reader-pagination
  >
    <p
      className="flex min-h-11 items-center justify-center px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-xs font-semibold tracking-[0.14em] text-[#f4f1e8] sm:min-h-12 sm:py-2"
      aria-label={`Page ${currentPage} of ${pageCount}`}
      dir="ltr"
    >
      {currentPage} / {pageCount}
    </p>
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
  const [isTutorialMounted, setIsTutorialMounted] = useState(false);
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);
  const readerRoot = useRef(null);
  const horizontalStage = useRef(null);
  const horizontalPages = useRef(null);
  const verticalPageElements = useRef([]);
  const pointerGesture = useRef(null);
  const dragFrame = useRef(null);
  const railNavigation = useRef(null);
  const railSnapTimer = useRef(null);
  const railNeedsRecentering = useRef(false);
  const suppressZoneClickUntil = useRef(0);
  const tutorialIsActive = useRef(false);
  const tutorialTimers = useRef({ show: null, hide: null, remove: null });
  const shouldReduceMotion = useReducedMotion();
  const shouldReduceMotionRef = useRef(Boolean(shouldReduceMotion));
  const pageDisplay = readingMode === "horizontal" && isWideReader ? "double" : "single";

  const clearTutorialTimers = useCallback(() => {
    Object.values(tutorialTimers.current).forEach((timer) => {
      if (timer !== null) window.clearTimeout(timer);
    });
    tutorialTimers.current = { show: null, hide: null, remove: null };
  }, []);

  const dismissTutorial = useCallback(() => {
    if (!tutorialIsActive.current) return;

    tutorialIsActive.current = false;
    clearTutorialTimers();
    setIsTutorialVisible(false);

    if (shouldReduceMotionRef.current) {
      setIsTutorialMounted(false);
      return;
    }

    tutorialTimers.current.remove = window.setTimeout(() => {
      setIsTutorialMounted(false);
    }, READER_TUTORIAL_TIMING.fade);
  }, [clearTutorialTimers]);

  const selectLanguage = useCallback(
    (language) => {
      const nextPages = languages[language]?.pages;
      if (!nextPages) return;

      setActiveLanguage(language);
      setCurrentPage((page) => Math.min(page, nextPages.length));
      verticalPageElements.current = [];
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

  const canGoPrevious = visiblePageNumbers[0] > 1;
  const canGoNext = visiblePageNumbers.at(-1) < pageCount;
  const nextPageNumber = canGoNext
    ? pageDisplay === "double"
      ? visiblePageNumbers[0] === 1
        ? 2
        : visiblePageNumbers[0] + 2
      : currentPage + 1
    : null;
  const previousPageNumber = canGoPrevious
    ? pageDisplay === "double"
      ? visiblePageNumbers[0] === 2
        ? 1
        : visiblePageNumbers[0] - 2
      : currentPage - 1
    : null;
  const horizontalPanelStarts = {
    current: currentPage,
    next: nextPageNumber,
    previous: previousPageNumber,
  };
  const horizontalPanels = HORIZONTAL_RAIL_ROLES.map((role) => {
    const startPage = horizontalPanelStarts[role];
    const pageNumbers = startPage === null
      ? []
      : role === "current"
        ? visiblePageNumbers
        : getVisiblePageNumbers(startPage, pageDisplay, pageCount);

    return {
      role,
      pageNumbers,
      pages: pageNumbers.map((pageNumber) => ({
        src: pages[pageNumber - 1],
        number: pageNumber,
      })),
    };
  });

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
    if (nextPageNumber === null) return;
    goToPage(nextPageNumber, { scroll: readingMode === "vertical" });
  }, [
    goToPage,
    nextPageNumber,
    readingMode,
  ]);

  const goToPrevious = useCallback(() => {
    if (previousPageNumber === null) return;
    goToPage(previousPageNumber, { scroll: readingMode === "vertical" });
  }, [
    goToPage,
    previousPageNumber,
    readingMode,
  ]);

  useEffect(() => {
    writePreference(MODE_STORAGE_KEY, readingMode);
  }, [readingMode]);

  useEffect(() => {
    writePreference(languageStorageKey, resolvedLanguage);
  }, [languageStorageKey, resolvedLanguage]);

  useEffect(() => {
    shouldReduceMotionRef.current = Boolean(shouldReduceMotion);
  }, [shouldReduceMotion]);

  useEffect(() => {
    clearTutorialTimers();
    tutorialIsActive.current = true;
    setIsTutorialMounted(true);
    setIsTutorialVisible(shouldReduceMotionRef.current);

    if (!shouldReduceMotionRef.current) {
      tutorialTimers.current.show = window.setTimeout(() => {
        setIsTutorialVisible(true);
      }, READER_TUTORIAL_TIMING.delay);
    }

    tutorialTimers.current.hide = window.setTimeout(
      dismissTutorial,
      READER_TUTORIAL_TIMING.duration + (
        shouldReduceMotionRef.current ? 0 : READER_TUTORIAL_TIMING.delay
      ),
    );

    return () => {
      tutorialIsActive.current = false;
      clearTutorialTimers();
    };
  }, [clearTutorialTimers, dismissTutorial, id, slug]);

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
      dismissTutorial();

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
  }, [dismissTutorial, goToNext, goToPrevious, isInterfaceVisible, readingMode]);

  useEffect(() => {
    if (!isTutorialMounted) return undefined;

    window.addEventListener("scroll", dismissTutorial, true);
    return () => window.removeEventListener("scroll", dismissTutorial, true);
  }, [dismissTutorial, isTutorialMounted]);

  const clearRailSnapTimer = useCallback(() => {
    if (railSnapTimer.current !== null) {
      window.clearTimeout(railSnapTimer.current);
      railSnapTimer.current = null;
    }
  }, []);

  const completeHorizontalSnap = useCallback(() => {
    const action = railNavigation.current;
    if (!action) return;

    railNavigation.current = null;
    railNeedsRecentering.current = true;
    clearRailSnapTimer();

    if (action === "next") goToNext();
    else if (action === "previous") goToPrevious();
  }, [clearRailSnapTimer, goToNext, goToPrevious]);

  useLayoutEffect(() => {
    if (!railNeedsRecentering.current || !horizontalPages.current) return;

    horizontalPages.current.style.transition = "none";
    horizontalPages.current.style.transform = getReaderRailTransform(0);
    railNeedsRecentering.current = false;
  }, [currentPage, pageDisplay, resolvedLanguage]);

  useEffect(() => () => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    clearRailSnapTimer();
    const gesture = pointerGesture.current;
    if (gesture) releasePointer(gesture.captureElement, gesture.pointerId);
    pointerGesture.current = null;
    railNavigation.current = null;
    railNeedsRecentering.current = false;
  }, [clearRailSnapTimer]);

  const updateDragOffset = (offset) => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);

    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      if (horizontalPages.current) {
        horizontalPages.current.style.transform = getReaderRailTransform(offset);
      }
    });
  };

  const resetHorizontalDrag = () => {
    if (dragFrame.current !== null) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }

    if (horizontalPages.current) {
      horizontalPages.current.style.transition = shouldReduceMotion
        ? "none"
        : `transform ${DRAG_RESET_DURATION}ms ${DRAG_SNAP_EASING}`;
      horizontalPages.current.style.transform = getReaderRailTransform(0);
    }

    if (horizontalStage.current) horizontalStage.current.style.cursor = "";
  };

  const startHorizontalSnap = (action, stageWidth) => {
    if (!horizontalPages.current) return;
    if (dragFrame.current !== null) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }

    railNavigation.current = action;
    horizontalPages.current.style.transition = shouldReduceMotion
      ? "none"
      : `transform ${DRAG_SNAP_DURATION}ms ${DRAG_SNAP_EASING}`;
    horizontalPages.current.style.transform = getReaderRailTransform(
      getReaderRailSnapOffset({ action, width: stageWidth }),
    );
    if (horizontalStage.current) horizontalStage.current.style.cursor = "";

    if (shouldReduceMotion) {
      completeHorizontalSnap();
      return;
    }

    clearRailSnapTimer();
    railSnapTimer.current = window.setTimeout(
      completeHorizontalSnap,
      DRAG_SNAP_DURATION + 80,
    );
  };

  const handleRailTransitionEnd = (event) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    completeHorizontalSnap();
  };

  const handlePointerDown = (event) => {
    if (!event.isPrimary && pointerGesture.current) {
      const activeGesture = pointerGesture.current;
      pointerGesture.current = null;
      releasePointer(activeGesture.captureElement, activeGesture.pointerId);
      resetHorizontalDrag();
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;

    const interactiveTarget = target.closest(
      "button, a, input, textarea, select, [contenteditable='true'], [role='button']",
    );
    const isReadingZone = target.closest("[data-horizontal-click-zones]");
    const blockedTarget = Boolean(interactiveTarget && !isReadingZone);

    if (!canStartReaderPointerGesture({
      readingMode,
      isPrimary: event.isPrimary,
      pointerType: event.pointerType,
      button: event.button,
      blockedTarget,
      hasActiveGesture: Boolean(pointerGesture.current || railNavigation.current),
    })) {
      return;
    }

    suppressZoneClickUntil.current = 0;
    const captureElement = typeof target.setPointerCapture === "function"
      ? target
      : event.currentTarget;
    const gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontalIntent: false,
      dragged: false,
      captureElement,
      captured: capturePointer(captureElement, event.pointerId),
    };
    pointerGesture.current = gesture;

    if (horizontalPages.current) horizontalPages.current.style.transition = "none";
  };

  const handlePointerMove = (event) => {
    const gesture = pointerGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.horizontalIntent) {
      gesture.horizontalIntent = isHorizontalDragIntent(deltaX, deltaY);

      if (!gesture.horizontalIntent && isVerticalDragIntent(deltaX, deltaY)) {
        pointerGesture.current = null;
        releasePointer(gesture.captureElement, event.pointerId);
        resetHorizontalDrag();
        return;
      }
    }

    if (!gesture.horizontalIntent) return;

    if (!gesture.captured) {
      gesture.captured = capturePointer(gesture.captureElement, event.pointerId);
    }
    event.currentTarget.style.cursor = "grabbing";

    if (event.cancelable) event.preventDefault();
    gesture.dragged = true;
    const stageWidth = event.currentTarget.getBoundingClientRect().width;
    const dragAction = getReaderSwipeDirectionAction(deltaX);
    const canNavigate = dragAction === "next" ? canGoNext : canGoPrevious;
    updateDragOffset(getReaderDragOffset({ deltaX, width: stageWidth, canNavigate }));
  };

  const finishPointerGesture = (event, navigate = true) => {
    const gesture = pointerGesture.current;
    const stageWidth = event.currentTarget.getBoundingClientRect().width;
    const result = finishReaderPointerGesture({
      gesture,
      pointerId: event.pointerId,
      endX: event.clientX,
      endY: event.clientY,
      width: stageWidth,
      cancelled: !navigate,
      canGoNext,
      canGoPrevious,
    });
    if (!result.handled) return;

    pointerGesture.current = result.gesture;
    releasePointer(gesture?.captureElement, event.pointerId);
    if (result.wasDragged) {
      suppressZoneClickUntil.current = Date.now() + GHOST_CLICK_DURATION;
    }

    if (result.action) startHorizontalSnap(result.action, stageWidth);
    else resetHorizontalDrag();
  };

  const handlePointerUp = (event) => finishPointerGesture(event);
  const handlePointerCancel = (event) => finishPointerGesture(event, false);

  const handleZoneAction = (action) => {
    if (Date.now() <= suppressZoneClickUntil.current) {
      suppressZoneClickUntil.current = 0;
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
      className={`relative flex min-h-[100dvh] w-[100dvw] flex-col overflow-x-clip bg-[#0f0f0f] text-[#f4f1e8] ${
        readingMode === "horizontal" ? "h-[100dvh] overflow-y-hidden" : ""
      }`}
      dir="ltr"
      data-reading-direction={readingDirection}
      data-reader-mode={readingMode}
      data-page-display={pageDisplay}
      data-reader-interface={isInterfaceVisible ? "visible" : "hidden"}
      data-reader-fullscreen={isFullscreen ? "true" : "false"}
      data-reader-language={resolvedLanguage}
      onPointerDownCapture={dismissTutorial}
      onWheelCapture={dismissTutorial}
    >
      {isTutorialMounted && (
        <ReaderTutorial
          isVisible={isTutorialVisible}
          readingDirection={readingDirection}
          readingMode={readingMode}
          shouldReduceMotion={shouldReduceMotion}
        />
      )}

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
        <header className="border-b border-white/[0.12] bg-[#151515]/95">
          <div className="mx-auto max-w-[1600px] px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4">
              <nav className="flex min-w-0 items-center gap-1 sm:gap-2" aria-label="Reader navigation">
                <Link
                  to="/mangaka"
                  aria-label="Back to manga gallery"
                  className="inline-flex min-h-9 items-center gap-1.5 border border-white/25 bg-[#181818] px-2 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#f4f1e8] transition-colors hover:border-white/45 hover:bg-[#222222] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd500] sm:px-3"
                >
                  <span aria-hidden="true">←</span>
                  <span className="sm:hidden">Back</span>
                  <span className="hidden sm:inline">Back to manga</span>
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
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
              <div className="flex gap-1" role="group" aria-label="Reading mode">
                <ReaderToggle label="Reading mode" value="vertical" activeValue={readingMode} onChange={selectMode}>Vertical</ReaderToggle>
                <ReaderToggle label="Reading mode" value="horizontal" activeValue={readingMode} onChange={selectMode}>Horizontal</ReaderToggle>
              </div>

              {supportsFullscreen && (
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  className="ml-auto flex min-h-9 items-center justify-center gap-2 border border-white/25 bg-[#181818] px-2 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:border-white/45 hover:bg-[#222222] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd500] sm:px-3"
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
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 bg-[#0f0f0f] px-0 py-0 sm:gap-4 sm:px-4"
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
              className="cursor-n-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd500]"
            />
            <button
              type="button"
              onClick={() => handleZoneAction(toggleInterface)}
              aria-label={isInterfaceVisible ? "Hide reader interface" : "Show reader interface"}
              className="cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd500]"
            />
            <button
              type="button"
              onClick={() => handleZoneAction(goToNext)}
              aria-label="Next page"
              className="cursor-s-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd500]"
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
            ref={horizontalStage}
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden bg-[#0f0f0f] p-0"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
            data-horizontal-stage
          >
            <div className="absolute inset-0 z-10 grid grid-cols-3" data-horizontal-click-zones>
              <button
                type="button"
                onClick={() => handleZoneAction(goToNext)}
                aria-label="Next page or spread"
                className="cursor-w-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd500]"
              />
              <button
                type="button"
                onClick={() => handleZoneAction(toggleInterface)}
                aria-label={isInterfaceVisible ? "Hide reader interface" : "Show reader interface"}
                className="cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd500]"
              />
              <button
                type="button"
                onClick={() => handleZoneAction(goToPrevious)}
                aria-label="Previous page or spread"
                className="cursor-e-resize bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd500]"
              />
            </div>

            <button
              type="button"
              onClick={goToNext}
              disabled={!canGoNext}
              tabIndex={isInterfaceVisible ? 0 : -1}
              aria-label="Next page or spread"
              aria-hidden={!isInterfaceVisible}
              className={`absolute left-1 top-1/2 z-20 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center border border-white/20 bg-[#151515]/90 text-3xl text-[#f4f1e8] transition-[opacity,background-color,border-color,color] hover:border-white/45 hover:bg-[#222222] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd500] disabled:cursor-not-allowed disabled:opacity-25 sm:left-3 ${
                isInterfaceVisible ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              ←
            </button>

            <div
              ref={horizontalPages}
              className="flex h-full min-h-0 w-full flex-none will-change-transform"
              style={{ transform: getReaderRailTransform(0) }}
              onTransitionEnd={handleRailTransitionEnd}
              dir="ltr"
              data-horizontal-pages={visiblePageNumbers.join("-")}
              data-horizontal-rail
            >
              {horizontalPanels.map((panel) => (
                <HorizontalRailPanel
                  key={panel.pageNumbers.join("-") || `empty-${panel.role}`}
                  panel={panel}
                  title={title}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={goToPrevious}
              disabled={!canGoPrevious}
              tabIndex={isInterfaceVisible ? 0 : -1}
              aria-label="Previous page or spread"
              aria-hidden={!isInterfaceVisible}
              className={`absolute right-1 top-1/2 z-20 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center border border-white/20 bg-[#151515]/90 text-3xl text-[#f4f1e8] transition-[opacity,background-color,border-color,color] hover:border-white/45 hover:bg-[#222222] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd500] disabled:cursor-not-allowed disabled:opacity-25 sm:right-3 ${
                isInterfaceVisible ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              →
            </button>
          </div>

        </section>
      )}

      <ReaderPagination
        currentPage={visiblePageNumbers[0]}
        pageCount={pageCount}
        isVisible={isInterfaceVisible}
        interfaceTransition={interfaceTransition}
      />
    </main>
  );
};

export default MangaReader;
