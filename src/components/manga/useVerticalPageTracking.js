import { useLayoutEffect, useRef } from "react";
import { findActiveVerticalPage, findReaderScrollContainer } from "./verticalPageTracking";

export default function useVerticalPageTracking({ enabled, readerRef, pages, currentPage, onPageChange, isFullscreen, isInterfaceVisible }) {
  const latest = useRef({ currentPage, onPageChange });
  useLayoutEffect(() => { latest.current = { currentPage, onPageChange }; }, [currentPage, onPageChange]);

  useLayoutEffect(() => {
    const reader = readerRef.current;
    const section = reader?.querySelector("[data-vertical-reader]");
    if (!enabled || !section) return undefined;
    const view = reader.ownerDocument.defaultView;
    const scroller = findReaderScrollContainer(section);
    const documentScroll = scroller === view;
    let active = true, frame = 0, needsMeasure = true, bounds = [], referenceOffset = 0;
    const scrollTop = () => documentScroll ? view.scrollY : scroller.scrollTop;

    const update = () => {
      frame = 0;
      if (!active) return;
      const position = scrollTop();
      if (needsMeasure) {
        needsMeasure = false;
        const viewport = documentScroll ? { top: 0, bottom: view.innerHeight } : scroller.getBoundingClientRect();
        const header = reader.querySelector("[data-reader-header]")?.getBoundingClientRect();
        const footer = reader.querySelector("[data-reader-pagination]")?.getBoundingClientRect();
        const top = isInterfaceVisible && header ? Math.max(viewport.top, header.bottom) : viewport.top;
        const bottom = isInterfaceVisible && footer ? Math.min(viewport.bottom, footer.top) : viewport.bottom;
        // Keep the reference stable when a page's duration changes footer height.
        // Only clamp the viewport midpoint if a control actually covers it.
        const center = (viewport.top + viewport.bottom) / 2;
        referenceOffset = Math.min(Math.max(center, top), Math.max(top, bottom)) - viewport.top;
        bounds = [...section.querySelectorAll("[data-page-group]")].map(element => {
          const rect = element.getBoundingClientRect();
          return { number: Number(element.dataset.pageGroup.split("-")[0]), top: rect.top - viewport.top + position, bottom: rect.bottom - viewport.top + position };
        }).filter(page => page.bottom > page.top);
      }
      const height = documentScroll ? view.innerHeight : scroller.clientHeight;
      const extent = documentScroll ? reader.ownerDocument.scrollingElement.scrollHeight : scroller.scrollHeight;
      const atEnd = position > 0 && position + height >= extent - 2;
      const next = findActiveVerticalPage(bounds, position + referenceOffset, latest.current.currentPage, atEnd);
      if (next !== null && next !== latest.current.currentPage) {
        latest.current.currentPage = next;
        latest.current.onPageChange(next); // Passive state update only. Never scroll/navigate here.
      }
    };
    const schedule = () => { if (active && !frame) frame = view.requestAnimationFrame(update); };
    const refresh = () => { needsMeasure = true; schedule(); };
    const afterTransition = event => {
      if (event.target.matches("[data-reader-header], [data-reader-pagination]")) refresh();
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    view.addEventListener("resize", refresh, { passive: true });
    view.visualViewport?.addEventListener("resize", refresh);
    section.addEventListener("load", refresh, true);
    reader.addEventListener("transitionend", afterTransition);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);
    for (const element of [reader, section, reader.querySelector("[data-reader-header]"), reader.querySelector("[data-reader-pagination]")]) if (element) observer?.observe(element);
    refresh();
    return () => {
      active = false;
      if (frame) view.cancelAnimationFrame(frame);
      observer?.disconnect();
      scroller.removeEventListener("scroll", schedule);
      view.removeEventListener("resize", refresh);
      view.visualViewport?.removeEventListener("resize", refresh);
      section.removeEventListener("load", refresh, true);
      reader.removeEventListener("transitionend", afterTransition);
    };
  }, [enabled, readerRef, pages, isFullscreen, isInterfaceVisible]);
}
