import { useLayoutEffect, useRef, useState } from "react";
import { getReadingPanelIndex } from "./readerPagination";
import "./ReaderNavigation.css";

export default function ReaderPageSlider({ panels, currentPage, pageCount, readingDirection, isVisible, onNavigate, renderCounter, t }) {
  const currentIndex = getReadingPanelIndex(panels, currentPage);
  const [draft, setDraft] = useState(null);
  const pointer = useRef(null);
  const selectedIndex = useRef(currentIndex);
  const maximum = Math.max(0, panels.length - 1);
  const hasCurrentDraft = isVisible && draft?.sourcePage === currentPage && draft?.panels === panels;
  const value = Math.max(0, Math.min(hasCurrentDraft ? draft.index : currentIndex, maximum));
  const pageNumbers = panels[value] || [];
  const firstPage = pageNumbers[0];
  const caption = pageNumbers.length > 1
    ? t.mangaReader.spreadCaption(firstPage, pageNumbers.at(-1))
    : t.mangaReader.pageCaption(firstPage);
  const progress = maximum > 0 ? value / maximum * 100 : 0;

  // An external navigation or changed Reader context invalidates the gesture.
  // The render guard above restores the real counter in that very same render.
  useLayoutEffect(() => {
    if (pointer.current) pointer.current.cancelled = true;
    setDraft(null);
  }, [currentPage, panels, isVisible]);

  const navigate = (index) => {
    const page = panels[index]?.[0];
    if (page !== undefined && index !== currentIndex) onNavigate(page);
  };

  const finish = (event) => {
    const gesture = pointer.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pointer.current = null;
    setDraft(null);
    if (!gesture.cancelled && gesture.sourcePage === currentPage && gesture.panels === panels && isVisible) {
      // React batches clearing the draft and the existing synchronous goToPage.
      // The counter never paints the old page between preview and destination.
      navigate(selectedIndex.current);
    }
  };
  const cancel = () => {
    if (pointer.current) pointer.current.cancelled = true;
    setDraft(null);
  };

  return (
    <>
      <div className="reader-page-slider" data-reader-page-slider>
        <input
          type="range"
          min="0"
          max={maximum}
          step="1"
          value={value}
          disabled={panels.length <= 1}
          dir={readingDirection === "rtl" ? "rtl" : "ltr"}
          aria-label={t.mangaReader.goToPage}
          aria-valuetext={pageNumbers.length > 1 ? `${caption} / ${pageCount}` : t.mangaReader.progress(firstPage, pageCount)}
          className="reader-page-slider__input"
          style={{ "--reader-slider-progress": `${progress}%` }}
          onChange={(event) => {
            if (pointer.current?.cancelled) return;
            const index = Number(event.currentTarget.value);
            selectedIndex.current = index;
            if (pointer.current !== null) setDraft({ index, sourcePage: currentPage, panels });
            else navigate(index);
          }}
          onPointerDown={(event) => {
            pointer.current = { pointerId: event.pointerId, sourcePage: currentPage, panels };
            selectedIndex.current = currentIndex;
          }}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onBlur={cancel}
          onKeyDown={() => { if (pointer.current?.cancelled) pointer.current = null; }}
          onClick={(event) => event.stopPropagation()}
        />
      </div>
      {renderCounter(hasCurrentDraft ? firstPage : currentPage)}
    </>
  );
}
