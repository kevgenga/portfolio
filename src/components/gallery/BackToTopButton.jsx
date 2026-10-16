import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "../../i18n/languageContext";
import "./BackToTopButton.css";

const VISIBILITY_THRESHOLD = 400;

const BackToTopButton = () => {
  const { t } = useLanguage();
  const { key } = useLocation();
  const [isPastThreshold, setIsPastThreshold] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);

  useEffect(() => {
    let animationFrame = 0;

    const updateVisibility = () => {
      animationFrame = 0;
      setIsPastThreshold(window.scrollY >= VISIBILITY_THRESHOLD);
    };

    const handleScroll = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateVisibility);
    };

    const updateImmersiveState = () => {
      // Observe the actual portals, not a second copy of a lightbox's state.
      // No dependency on Fancybox's bundle on Home/Contact, and no per-card work.
      const overlays = document.querySelectorAll('.fancybox__container, [aria-modal="true"], dialog[open], #mobile-navigation');
      setIsImmersive(Boolean(document.fullscreenElement) || [...overlays].some((element) =>
        !element.closest("[hidden]") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden",
      ));
    };
    const handleResize = () => { handleScroll(); updateImmersiveState(); };
    const observer = new MutationObserver(updateImmersiveState);

    updateVisibility();
    updateImmersiveState();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden", "aria-modal"] });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });
    document.addEventListener("fullscreenchange", updateImmersiveState);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", updateImmersiveState);
      observer.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [key]);

  const scrollToTop = () => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <>
      {/* Constant clearance prevents footer links moving when the button appears. */}
      <span className="public-scroll-tools" hidden aria-hidden="true" />
      {isPastThreshold && !isImmersive && (
        <button
          type="button"
          aria-label={t.common.backToTop}
          title={t.common.backToTop}
          onClick={scrollToTop}
          className="public-back-to-top fixed z-40 grid h-11 w-11 place-items-center border border-paper/30 bg-ink text-paper transition-colors duration-150 hover:bg-[#252525] hover:border-paper/60 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>
      )}
    </>
  );
};

export default BackToTopButton;
