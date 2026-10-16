import { getValidSpreadStarts } from "../../utils/verticalSpreads.js";

// One deterministic panel list for the rail, its neighbours and the slider.
// Explicit pairs reserve their pages before automatic grouping resumes.
export const getHorizontalReadingPanels = (pageDisplay, pageCount, pages = [], horizontalSpreads = []) => {
  const forced = getValidSpreadStarts(pages, horizontalSpreads, { keepCoverSingle: true });
  const panels = [];
  for (let page = 1; page <= pageCount;) {
    const explicit = forced.has(page - 1) && page < pageCount;
    const automatic = page > 1 && pageDisplay === "double" && page < pageCount && !forced.has(page);
    const pageNumbers = explicit || automatic ? [page, page + 1] : [page];
    panels.push(pageNumbers);
    page = pageNumbers.at(-1) + 1;
  }
  return panels;
};

export const getReadingPanelIndex = (panels, page) =>
  Math.max(0, panels.findIndex(pageNumbers => pageNumbers.includes(page)));

// Compatibility entry point; grouping is never independently recalculated.
export const getVisiblePageNumbers = (currentPage, pageDisplay, pageCount, pages, horizontalSpreads) => {
  const panels = getHorizontalReadingPanels(pageDisplay, pageCount, pages, horizontalSpreads);
  return panels[getReadingPanelIndex(panels, currentPage)] || [];
};
