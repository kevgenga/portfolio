const MIN_SWIPE_DISTANCE = 56;
const MAX_SWIPE_DISTANCE = 88;
const SWIPE_VIEWPORT_RATIO = 0.09;
const HORIZONTAL_INTENT_RATIO = 1.2;
const MIN_INTENT_DISTANCE = 8;
const MIN_DRAG_LIMIT = 88;
const MAX_DRAG_LIMIT = 144;
const DRAG_VIEWPORT_RATIO = 0.14;

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

export const getReaderSwipeThreshold = (width) =>
  clamp(width * SWIPE_VIEWPORT_RATIO, MIN_SWIPE_DISTANCE, MAX_SWIPE_DISTANCE);

export const isHorizontalDragIntent = (deltaX, deltaY) => {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  return (
    horizontalDistance >= MIN_INTENT_DISTANCE &&
    horizontalDistance > verticalDistance * HORIZONTAL_INTENT_RATIO
  );
};

export const getReaderSwipeAction = ({ deltaX, deltaY, width }) => {
  if (!isHorizontalDragIntent(deltaX, deltaY)) return null;
  if (Math.abs(deltaX) < getReaderSwipeThreshold(width)) return null;

  return deltaX > 0 ? "next" : "previous";
};

export const getReaderDragOffset = ({ deltaX, width, canNavigate }) => {
  const dragLimit = clamp(
    width * DRAG_VIEWPORT_RATIO,
    MIN_DRAG_LIMIT,
    MAX_DRAG_LIMIT,
  );
  const resistance = canNavigate ? 0.82 : 0.24;

  return clamp(deltaX * resistance, -dragLimit, dragLimit);
};
