// Logical widths are independent of the diagonal frame and original image ratio.
export function calculateHeroCardSizes({ trackWidth, count, gap = 0, minimumWidth = 0, expansion = 0, activeIndex = null, enabled = true }) {
  const positive = (value) => Number.isFinite(value) ? Math.max(0, value) : 0;
  const length = Math.floor(positive(count));
  if (!length) return { widths: [], extras: [], expansion: 0 };
  const available = Math.max(0, positive(trackWidth) - positive(gap) * (length - 1));
  const base = available / length;
  const active = enabled && Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < length && length > 1;
  const delta = active ? Math.min(positive(expansion), Math.max(0, (base - positive(minimumWidth)) * (length - 1))) : 0;
  const extras = Array.from({ length }, (_, index) => delta === 0 ? 0 : index === activeIndex ? delta : -delta / (length - 1));
  return { widths: extras.map((extra) => base + extra), extras, expansion: delta };
}
