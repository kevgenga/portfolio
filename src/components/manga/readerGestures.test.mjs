import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canStartReaderPointerGesture,
  finishReaderPointerGesture,
  getReaderDragOffset,
  getReaderRailPanelRoles,
  getReaderRailSnapOffset,
  getReaderRailTransform,
  getReaderSwipeAction,
  getReaderSwipeThreshold,
  isHorizontalDragIntent,
  isVerticalDragIntent,
} from "./readerGestures.js";

const gesture = (overrides = {}) => ({
  pointerId: 7,
  startX: 0,
  startY: 0,
  horizontalIntent: true,
  dragged: true,
  ...overrides,
});

test("uses a responsive swipe threshold with safe minimum and maximum values", () => {
  assert.equal(getReaderSwipeThreshold(320), 44);
  assert.equal(getReaderSwipeThreshold(390), 44);
  assert.equal(getReaderSwipeThreshold(768), 69.12);
  assert.equal(getReaderSwipeThreshold(1440), 88);
});

test("maps a positive deltaX to next and a negative deltaX to previous", () => {
  assert.equal(
    getReaderSwipeAction({ deltaX: 45, deltaY: 4, width: 390 }),
    "next",
  );
  assert.equal(
    getReaderSwipeAction({ deltaX: -45, deltaY: -4, width: 390 }),
    "previous",
  );
});

test("ignores short drags and movements without clear horizontal intent", () => {
  assert.equal(
    getReaderSwipeAction({ deltaX: -40, deltaY: 2, width: 390 }),
    null,
  );
  assert.equal(
    getReaderSwipeAction({ deltaX: -90, deltaY: 80, width: 390 }),
    null,
  );
  assert.equal(isHorizontalDragIntent(12, 12), false);
  assert.equal(isHorizontalDragIntent(16, 4), true);
  assert.equal(isVerticalDragIntent(5, 13), true);
  assert.equal(isVerticalDragIntent(10, 13), true);
  assert.equal(isVerticalDragIntent(12, 12), false);
});

test("accepts primary mouse, touch and pen pointers without starting concurrent gestures", () => {
  const pointer = { readingMode: "horizontal", isPrimary: true, button: 0 };
  assert.equal(canStartReaderPointerGesture({ ...pointer, pointerType: "mouse" }), true);
  assert.equal(canStartReaderPointerGesture({ ...pointer, pointerType: "touch" }), true);
  assert.equal(canStartReaderPointerGesture({ ...pointer, pointerType: "pen" }), true);
  assert.equal(canStartReaderPointerGesture({ ...pointer, pointerType: "mouse", button: 2 }), false);
  assert.equal(canStartReaderPointerGesture({ ...pointer, pointerType: "touch", isPrimary: false }), false);
  assert.equal(canStartReaderPointerGesture({ ...pointer, pointerType: "touch", hasActiveGesture: true }), false);
  assert.equal(canStartReaderPointerGesture({ ...pointer, pointerType: "touch", readingMode: "vertical" }), false);
});

test("recognizes a deliberate mobile swipe and ignores short or mostly vertical movement", () => {
  assert.equal(finishReaderPointerGesture({
    gesture: gesture(), pointerId: 7, endX: 45, endY: 5, width: 375,
  }).action, "next");
  assert.equal(finishReaderPointerGesture({
    gesture: gesture(), pointerId: 7, endX: 35, endY: 2, width: 375,
  }).action, null);
  assert.equal(finishReaderPointerGesture({
    gesture: gesture(), pointerId: 7, endX: 48, endY: 52, width: 375,
  }).action, null);
});

test("cleans a cancelled pointer once without navigating twice", () => {
  const cancelled = finishReaderPointerGesture({
    gesture: gesture(), pointerId: 7, endX: 80, endY: 2, width: 375, cancelled: true,
  });
  assert.deepEqual(cancelled, {
    handled: true,
    action: null,
    wasDragged: true,
    gesture: null,
  });

  const repeated = finishReaderPointerGesture({
    gesture: cancelled.gesture, pointerId: 7, endX: 80, endY: 2, width: 375,
  });
  assert.equal(repeated.handled, false);
  assert.equal(repeated.action, null);
});

test("protects the first and last page boundaries", () => {
  assert.equal(finishReaderPointerGesture({
    gesture: gesture(), pointerId: 7, endX: 60, endY: 0, width: 375, canGoNext: false,
  }).action, null);
  assert.equal(finishReaderPointerGesture({
    gesture: gesture(), pointerId: 7, endX: -60, endY: 0, width: 375, canGoPrevious: false,
  }).action, null);
});

test("excludes reader controls from pointer gesture starts", () => {
  assert.equal(canStartReaderPointerGesture({
    readingMode: "horizontal",
    isPrimary: true,
    pointerType: "touch",
    button: 0,
    blockedTarget: true,
  }), false);
});

test("caps drag feedback and applies stronger resistance at reader boundaries", () => {
  assert.equal(
    getReaderDragOffset({ deltaX: -1000, width: 1440, canNavigate: true }),
    -1000,
  );
  assert.equal(
    getReaderDragOffset({ deltaX: 100, width: 390, canNavigate: true }),
    100,
  );
  assert.equal(
    getReaderDragOffset({ deltaX: 100, width: 390, canNavigate: false }),
    30,
  );
});

test("moves the current rail one-to-one with the pointer and centers it at rest", () => {
  assert.equal(
    getReaderDragOffset({ deltaX: 30, width: 375, canNavigate: true }),
    30,
  );
  assert.equal(
    getReaderRailTransform(30),
    "translate3d(calc(-100% + 30px), 0, 0)",
  );
  assert.equal(
    getReaderRailTransform(0),
    "translate3d(calc(-100% + 0px), 0, 0)",
  );
});

test("prepares the existing next and previous actions on either side of current", () => {
  assert.deepEqual(getReaderRailPanelRoles(), ["next", "current", "previous"]);
  assert.equal(getReaderRailSnapOffset({ action: "next", width: 390 }), 390);
  assert.equal(getReaderRailSnapOffset({ action: "previous", width: 390 }), -390);
});

test("consumes a validated rail swipe exactly once", () => {
  const completed = finishReaderPointerGesture({
    gesture: gesture(), pointerId: 7, endX: 60, endY: 0, width: 375,
  });
  assert.equal(completed.action, "next");
  assert.equal(completed.gesture, null);

  const repeated = finishReaderPointerGesture({
    gesture: completed.gesture, pointerId: 7, endX: 60, endY: 0, width: 375,
  });
  assert.equal(repeated.handled, false);
  assert.equal(repeated.action, null);
});

test("uses one lower pagination bar without public page thumbnails", async () => {
  const readerSource = await readFile(new URL("./MangaReader.jsx", import.meta.url), "utf8");

  assert.match(readerSource, /const ReaderPagination/);
  assert.match(readerSource, /data-reader-pagination/);
  assert.match(readerSource, /currentPage=\{visiblePageNumbers\[0\]\}/);
  assert.doesNotMatch(readerSource, /ThumbnailStrip|data-thumbnail|thumbnailElements/);
  assert.doesNotMatch(readerSource, /data-reader-counter/);
  assert.match(readerSource, /data-horizontal-stage/);
  assert.match(readerSource, /data-horizontal-rail/);
  assert.match(readerSource, /data-rail-panel/);
  assert.match(readerSource, /horizontalPanels\.map/);
  assert.match(readerSource, /panel\.pages\.map/);
  assert.match(readerSource, /will-change-transform/);
  assert.match(readerSource, /useLayoutEffect\(\(\) => \{[\s\S]*?getReaderRailTransform\(0\)/);
  assert.match(readerSource, /DRAG_SNAP_DURATION = 210/);
  assert.match(readerSource, /touch-pan-y/);
  assert.match(readerSource, /capturePointer\(captureElement, event\.pointerId\)/);
  assert.match(readerSource, /onPointerCancel=\{handlePointerCancel\}/);
  assert.match(readerSource, /draggable="false"/);
  assert.match(readerSource, /button, a, input, textarea, select/);
  assert.match(readerSource, /data-vertical-reader/);
  assert.match(readerSource, /IntersectionObserver/);
});
