import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ILLUSTRATION_VIEW_STORAGE_KEY, resolveIllustrationView, readIllustrationView, saveIllustrationView } from "./illustrationView.js";
import { getTranslations } from "../i18n/locale.js";

test("gallery view defaults to cards; unsupported/stale values are safe", () => {
  for (const value of [null, undefined, "", "grid", "list", "CARDS", {}, 0]) assert.equal(resolveIllustrationView(value), "cards");
  assert.equal(resolveIllustrationView("cards"), "cards");
  assert.equal(resolveIllustrationView("compact"), "compact");
});

test("one visual preference persists without catalogue/URL writes; unavailable storage is harmless", () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readIllustrationView(storage), "cards");
  saveIllustrationView("compact", storage);
  assert.equal(readIllustrationView(storage), "compact");
  assert.deepEqual([...values], [[ILLUSTRATION_VIEW_STORAGE_KEY, "compact"]]);
  saveIllustrationView("cards", storage); assert.equal(readIllustrationView(storage), "cards");
  const blocked = { getItem() { throw Error("denied"); }, setItem() { throw Error("full"); } };
  assert.equal(readIllustrationView(blocked), "cards");
  assert.doesNotThrow(() => saveIllustrationView("compact", blocked));
});

test("both view labels and back-to-top are explicit in each public locale", () => {
  const expected = { en: ["Large cards", "Compact list", "Back to top"], fr: ["Grandes cartes", "Liste compacte", "Retour en haut"], ja: ["カード表示", "コンパクト表示", "ページ上部へ戻る"] };
  for (const [locale, labels] of Object.entries(expected)) {
    const t = getTranslations(locale);
    assert.deepEqual([t.illustration.views.cards, t.illustration.views.compact, t.common.backToTop], labels);
  }
});

test("view changes preserve one grid, one slide collection and the existing progressive loader", async () => {
  const source = await readFile(new URL("../pages/Illustration.jsx", import.meta.url), "utf8");
  assert.equal((source.match(/<PortfolioGrid /g) || []).length, 1);
  assert.equal((source.match(/<Lightbox/g) || []).length, 1);
  const change = source.slice(source.indexOf("const changeView"), source.indexOf("return (", source.indexOf("const changeView")));
  assert.doesNotMatch(change, /setVisibleCount|setSearchParams|setSortOrder|fetch|location/);
  assert.match(source, /ILLUSTRATION_PAGE_SIZE = 24/);
  assert.match(source, /\[filteredArtworks, locale, t.productionTime\]/);
});

test("shared scroll tool has a single App mount outside Reader; no Footer intersection hide", async () => {
  const app = await readFile(new URL("../App.jsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../pages/Illustration.jsx", import.meta.url), "utf8");
  const button = await readFile(new URL("../components/gallery/BackToTopButton.jsx", import.meta.url), "utf8");
  assert.equal((app.match(/<BackToTopButton/g) || []).length, 1);
  assert.match(app, /!isMangaReader && <BackToTopButton/);
  assert.doesNotMatch(page, /BackToTopButton/);
  assert.doesNotMatch(button, /isFooterVisible|new IntersectionObserver|navigate\(|setTimeout/);
  for (const token of ["fullscreenchange", ".fancybox__container", "#mobile-navigation", "prefers-reduced-motion", "observer.disconnect()", "removeEventListener"]) assert.ok(button.includes(token));
  assert.match(button, /isPastThreshold && !isImmersive &&/);
});
