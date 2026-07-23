import { useEffect } from "react";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

const defaultOptions = {};

const updateHash = (hash) => {
  const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
};

const hashIndex = (galleryName, itemCount) => {
  const match = window.location.hash.match(
    new RegExp(`^#${galleryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`),
  );
  if (!match) return -1;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index < itemCount ? index : -1;
};

const Lightbox = ({
  selector,
  options = defaultOptions,
  refreshKey,
  slides,
  galleryName,
}) => {
  useEffect(() => {
    if (slides && galleryName) {
      let active = true;
      let instance = null;

      const openAt = (index, triggerEl = null) => {
        if (index < 0 || index >= slides.length) return;
        const currentHash = window.location.hash;
        const restoreHash = currentHash.startsWith(`#${galleryName}-`) ? "" : currentHash;
        updateHash(`#${galleryName}-${index + 1}`);

        instance = Fancybox.show(slides.map((slide) => ({ ...slide })), {
          ...options,
          Hash: false,
          startIndex: index,
          triggerEl,
          on: {
            ...options.on,
            "Carousel.change": (fancybox, carousel) => {
              updateHash(`#${galleryName}-${carousel.page + 1}`);
              options.on?.["Carousel.change"]?.(fancybox, carousel);
            },
            close: (fancybox, event) => {
              updateHash(restoreHash);
              options.on?.close?.(fancybox, event);
            },
          },
        });
      };

      const handleClick = (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!(event.target instanceof Element)) return;
        const trigger = event.target.closest(selector);
        if (!trigger) return;
        const index = slides.findIndex((slide) => slide.id === trigger.dataset.lightboxId);
        if (index < 0) return;
        event.preventDefault();
        openAt(index, trigger);
      };

      document.addEventListener("click", handleClick);
      const initialIndex = hashIndex(galleryName, slides.length);
      if (initialIndex >= 0) queueMicrotask(() => { if (active) openAt(initialIndex); });

      return () => {
        active = false;
        document.removeEventListener("click", handleClick);
        if (instance && !instance.isClosing()) instance.close();
      };
    }

    Fancybox.bind(selector, options);

    return () => {
      Fancybox.unbind(selector);
      Fancybox.close();
    };
  }, [galleryName, options, refreshKey, selector, slides]);

  return null;
};

export default Lightbox;
