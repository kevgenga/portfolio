// Geometry is cached after layout changes, not measured for every scroll pixel.
export function findReaderScrollContainer(section) {
  const view = section.ownerDocument.defaultView;
  for (let element = section.parentElement; element && element !== section.ownerDocument.body && element !== section.ownerDocument.documentElement; element = element.parentElement) {
    if (/^(auto|scroll)$/.test(view.getComputedStyle(element).overflowY)) return element;
  }
  return view;
}

export function findActiveVerticalPage(bounds, reference, previousPage, atEnd = false) {
  if (!bounds.length) return null;
  if (atEnd) return bounds.at(-1).number;
  let low = 0, high = bounds.length - 1, index = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (bounds[middle].top <= reference) { index = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (index < 0) return bounds[0].number;
  const page = bounds[index], next = bounds[index + 1];
  if (reference <= page.bottom || !next) return page.number;
  // In the gutter, hold the adjacent current page in either scroll direction.
  if (previousPage === page.number || previousPage === next.number) return previousPage;
  return reference - page.bottom <= next.top - reference ? page.number : next.number;
}
