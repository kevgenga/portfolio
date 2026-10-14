import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { calculateHeroCardSizes } from "./heroArtworkCards.js";
import { sitePresentation } from "../content/sitePresentation.js";
import { getTranslations } from "../i18n/locale.js";
import React from "react";
import { transformWithEsbuild } from "vite";

test("five configured images are distinct, exist, match their real category and have translations", async () => {
  const source = await readFile(new URL("../content/artworks.js", import.meta.url), "utf8");
  const artworks = vm.runInNewContext(source.replace(/^import[^\n]+\n/m, "").replace("export const artworks", "const artworks") + ";artworks", { assetPath: (value) => value });
  assert.deepEqual(sitePresentation.heroCards.map((card) => card.category), ["illustrations", "sketches", "paintings", "character-design", "backgrounds"]);
  assert.equal(new Set(sitePresentation.heroCards.map((card) => card.artworkId)).size, 5);
  for (const [index, card] of sitePresentation.heroCards.entries()) {
    const artwork = artworks.find((item) => item.id === card.artworkId);
    assert.ok(artwork.category.includes(card.category)); assert.equal(artwork.hidden, undefined); assert.equal(card.order, index + 1);
    assert.ok((await stat(new URL(`../../public/${artwork.image}`, import.meta.url))).isFile());
    for (const locale of ["en", "ja", "fr"]) {
      const t = getTranslations(locale); assert.ok(t.illustration.categories[card.titleKey]); assert.ok(t.home.workDescriptions[card.category]); assert.ok(t.home.openCategory(t.illustration.categories[card.titleKey])); assert.ok(t.home.heroSummary);
    }
  }
});

test("expanding each card redistributes exactly the same width and respects the minimum", () => {
  for (const width of [760, 880, 1100, 1500]) for (const activeIndex of [0, 1, 2, 3, 4]) for (const expansion of [0, 84, 3000]) {
    const result = calculateHeroCardSizes({ trackWidth: width, count: 5, gap: 6, minimumWidth: 112, expansion, activeIndex });
    assert.ok(Math.abs(result.widths.reduce((sum, item) => sum + item, 0) + 24 - width) < 1e-8);
    assert.ok(result.widths.every((item) => item >= 112 - 1e-8));
    for (const [index, extra] of result.extras.entries()) assert.ok(index === activeIndex ? extra >= 0 : extra <= 0);
  }
});

test("neutral, disabled and zero-pixel expansion are identical; unsupported values cannot produce NaN", () => {
  const options = { trackWidth: 900, count: 5, gap: 6, minimumWidth: 112, expansion: 84 };
  const initial = calculateHeroCardSizes(options);
  for (const input of [{ activeIndex: null }, { activeIndex: -1 }, { activeIndex: 5 }, { activeIndex: 0, expansion: 0 }, { activeIndex: 0, enabled: false }]) assert.deepEqual(calculateHeroCardSizes({ ...options, ...input }), initial);
  for (const input of [{ count: 0 }, { count: 1 }, { trackWidth: 50 }, { expansion: NaN }, { trackWidth: NaN }]) assert.ok(calculateHeroCardSizes({ ...options, activeIndex: 0, ...input }).widths.every(Number.isFinite));
});

test("render starts with no active card and exposes every complete translated description", async () => {
  const source = await readFile(new URL("../components/about/HeroArtworkCards.jsx", import.meta.url), "utf8");
  const transformed = await transformWithEsbuild(source.replace(/^import[^\n]+\n/gm, "").replace("export default HeroArtworkCards;", "globalThis.Component = HeroArtworkCards;"), "HeroArtworkCards.jsx", { jsx: "transform", jsxFactory: "React.createElement" });
  const find = (node, predicate) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(child => find(child, predicate)) : [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
  for (const locale of ["en", "ja", "fr"]) for (const active of [null, 2]) {
    let stateIndex = 0;
    const t = getTranslations(locale), context = vm.createContext({ React, Link: "a", useLanguage: () => ({ t }),
      useId: () => "test-hero", useRef: () => ({ current: null }), useLayoutEffect() {}, useCallback: callback => callback,
      useState: initial => [stateIndex++ === 0 ? active : initial, () => {}], calculateHeroCardSizes, assetPath: value => `/portfolio/${value.replace(/^\/+/, "")}`,
    });
    vm.runInContext(transformed.code, context);
    const tree = context.Component({ cards: sitePresentation.heroCards.map(card => ({ ...card, artwork: { image: "test.jpg" } })) });
    assert.equal(tree.props["data-interacting"], active !== null);
    const links = find(tree, node => node.type === "a");
    assert.equal(links.filter(link => link.props["data-active"]).length, active === null ? 0 : 1);
    links.forEach((link, index) => {
      const description = find(link, node => node.props?.className === "hero-art-card__description")[0];
      assert.equal(link.props["aria-describedby"], description.props.id);
      assert.equal(description.props.children, t.home.workDescriptions[sitePresentation.heroCards[index].category]);
    });
  }
});

test("custom Hero images respect the Vite base and never change category links or gallery fallbacks", async () => {
  const source = await readFile(new URL("../components/about/HeroArtworkCards.jsx", import.meta.url), "utf8");
  const transformed = await transformWithEsbuild(source.replace(/^import[^\n]+\n/gm, "").replace("export default HeroArtworkCards;", "globalThis.Component = HeroArtworkCards;"), "HeroArtworkCards.jsx", { jsx: "transform", jsxFactory: "React.createElement" });
  const find = (node, type) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(child => find(child, type)) : [...(node.type === type ? [node] : []), ...find(node.props?.children, type)];
  const original = sitePresentation.heroCards[3];
  for (const base of ["/", "/portfolio/"]) for (const heroImage of [undefined, null, "", "assets/hero-cards/character-design-hero.jpg"]) for (const thumbnail of ["", `${base}assets/thumbnail.jpg`]) {
    const context = vm.createContext({ React, Link: "a", useLanguage: () => ({ t: getTranslations("en") }), useId: () => "test-hero", useRef: () => ({ current: null }),
      useLayoutEffect() {}, useCallback: callback => callback, useState: initial => [initial, () => {}], calculateHeroCardSizes, assetPath: value => `${base}${value.replace(/^\/+/, "")}`,
    });
    vm.runInContext(transformed.code, context);
    const image = `${base}assets/original.jpg`, card = { ...original, heroImage, artwork: { image, thumbnail } };
    const tree = context.Component({ cards: [card] });
    assert.equal(find(tree, "img")[0].props.src, heroImage ? `${base}${heroImage}` : thumbnail || image);
    assert.equal(find(tree, "a")[0].props.to, "/illustration?category=character-design");
    assert.equal(card.artwork.image, image); assert.equal(card.artwork.thumbnail, thumbnail);
  }
});
