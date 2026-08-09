const MIN_SWIPE_DISTANCE = 44;
const MAX_SWIPE_DISTANCE = 88;
const SWIPE_VIEWPORT_RATIO = 0.09;
const HORIZONTAL_INTENT_RATIO = 1.2;
const VERTICAL_INTENT_RATIO = 1.2;
const MIN_INTENT_DISTANCE = 8;
const MIN_VERTICAL_INTENT_DISTANCE = 12;
const MIN_DRAG_LIMIT = 88;
const MAX_DRAG_LIMIT = 144;
const DRAG_VIEWPORT_RATIO = 0.14;

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

export const getReaderSwipeThreshold = (width) =>
  clamp(width * SWIPE_VIEWPORT_RATIO, MIN_SWIPE_DISTANCE, MAX_SWIPE_DISTANCE);

export const getReaderSwipeDirectionAction = (deltaX) =>
  deltaX > 0 ? "next" : "previous";

export const isHorizontalDragIntent = (deltaX, deltaY) => {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  return (
    horizontalDistance >= MIN_INTENT_DISTANCE &&
    horizontalDistance > verticalDistance * HORIZONTAL_INTENT_RATIO
  );
};

export const isVerticalDragIntent = (deltaX, deltaY) => {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  return (
    verticalDistance >= MIN_VERTICAL_INTENT_DISTANCE &&
    verticalDistance > horizontalDistance * VERTICAL_INTENT_RATIO
  );
};

export const canStartReaderPointerGesture = ({
  readingMode,
  isPrimary,
  pointerType,
  button,
  blockedTarget = false,
  hasActiveGesture = false,
}) => (
  readingMode === "horizontal" &&
  isPrimary &&
  !blockedTarget &&
  !hasActiveGesture &&
  (pointerType !== "mouse" || button === 0)
);

export const getReaderSwipeAction = ({ deltaX, deltaY, width }) => {
  if (!isHorizontalDragIntent(deltaX, deltaY)) return null;
  if (Math.abs(deltaX) < getReaderSwipeThreshold(width)) return null;

  return getReaderSwipeDirectionAction(deltaX);
};

export const getReaderDragOffset = ({ deltaX, width, canNavigate }) => {
  if (canNavigate) return deltaX;

  const dragLimit = clamp(
    width * DRAG_VIEWPORT_RATIO,
    MIN_DRAG_LIMIT,
    MAX_DRAG_LIMIT,
  );

  return clamp(deltaX * 0.3, -dragLimit, dragLimit);
};

export const getReaderRailPanelRoles = () => [
  getReaderSwipeDirectionAction(1),
  "current",
  getReaderSwipeDirectionAction(-1),
];

export const getReaderRailSnapOffset = ({ action, width }) => {
  const roles = getReaderRailPanelRoles();
  const currentIndex = roles.indexOf("current");
  const targetIndex = roles.indexOf(action);
  return targetIndex < 0 ? 0 : (currentIndex - targetIndex) * width;
};

export const getReaderRailTransform = (offset) =>
  `translate3d(calc(-100% + ${offset}px), 0, 0)`;

export const finishReaderPointerGesture = ({
  gesture,
  pointerId,
  endX,
  endY,
  width,
  cancelled = false,
  canGoNext = true,
  canGoPrevious = true,
}) => {
  if (!gesture || gesture.pointerId !== pointerId) {
    return { handled: false, action: null, wasDragged: false, gesture };
  }

  const action = gesture.horizontalIntent && !cancelled
    ? getReaderSwipeAction({
        deltaX: endX - gesture.startX,
        deltaY: endY - gesture.startY,
        width,
      })
    : null;
  const canNavigate = (
    (action === "next" && canGoNext) ||
    (action === "previous" && canGoPrevious)
  );

  return {
    handled: true,
    action: canNavigate ? action : null,
    wasDragged: Boolean(gesture.dragged),
    gesture: null,
  };
};
