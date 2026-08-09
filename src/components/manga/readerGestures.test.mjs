import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getReaderDragOffset,
  getReaderSwipeAction,
  getReaderSwipeThreshold,
  isHorizontalDragIntent,
} from "./readerGestures.js";

test("uses a responsive swipe threshold with safe minimum and maximum values", () => {
  assert.equal(getReaderSwipeThreshold(390), 56);
  assert.equal(getReaderSwipeThreshold(768), 69.12);
  assert.equal(getReaderSwipeThreshold(1440), 88);
});

test("maps a positive deltaX to next and a negative deltaX to previous", () => {
  assert.equal(
    getReaderSwipeAction({ deltaX: 70, deltaY: 4, width: 390 }),
    "next",
  );
  assert.equal(
    getReaderSwipeAction({ deltaX: -70, deltaY: -4, width: 390 }),
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
});

test("caps drag feedback and applies stronger resistance at reader boundaries", () => {
  assert.equal(
    getReaderDragOffset({ deltaX: -1000, width: 1440, canNavigate: true }),
    -144,
  );
  assert.equal(
    getReaderDragOffset({ deltaX: 100, width: 390, canNavigate: true }),
    82,
  );
  assert.equal(
    getReaderDragOffset({ deltaX: 100, width: 390, canNavigate: false }),
    24,
  );
});

test("uses one lower pagination bar without public page thumbnails", async () => {
  const readerSource = await readFile(new URL("./MangaReader.jsx", import.meta.url), "utf8");

  assert.match(readerSource, /const ReaderPagination/);
  assert.match(readerSource, /data-reader-pagination/);
  assert.match(readerSource, /currentPage=\{visiblePageNumbers\[0\]\}/);
  assert.doesNotMatch(readerSource, /ThumbnailStrip|data-thumbnail|thumbnailElements/);
  assert.doesNotMatch(readerSource, /data-reader-counter/);
});
