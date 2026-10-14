import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { transformWithEsbuild } from "vite";
import { getTranslations } from "../i18n/locale.js";
import { fr } from "../i18n/translations/fr.js";
import { ja } from "../i18n/translations/ja.js";

const sourceOf = (file) => readFile(new URL(file, import.meta.url), "utf8");
const find = (node, predicate) => !node || typeof node !== "object" ? [] : Array.isArray(node)
  ? node.flatMap(child => find(child, predicate))
  : [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
const textOf = node => typeof node === "string" ? node : Array.isArray(node)
  ? node.map(textOf).join("") : textOf(node?.props?.children || "");

test("Contact retains its complete translated headline and wraps Latin words, never individual letters", async () => {
  const source = await sourceOf("../pages/ContactPage.jsx");
  const code = await transformWithEsbuild(source.replace(/^import[\s\S]*?from [^\n]+;\r?\n/gm, "").replace("export default ContactPage;", "globalThis.Component = ContactPage;"), "ContactPage.jsx", { jsx: "transform", jsxFactory: "React.createElement" });
  for (const locale of ["en", "fr", "ja"]) {
    const t = getTranslations(locale);
    const context = vm.createContext({ React, useLanguage: () => ({ t, locale }), useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }),
      motion: { main: "main", header: "header", div: "div" }, profile: { about: { availability: { details: [] } }, contact: { email: "fixture@example.org" } },
      sitePresentation: { showAnimationSection: false }, createSubmissionGuard: () => ({}),
    });
    vm.runInContext(code.code, context);
    const tree = context.Component(), title = find(tree, node => node.type === "h1")[0];
    assert.equal(textOf(title).trim().replace(/\s+/g, " "), t.contact.ctaTitle.replace(/\s+/g, " "));
    const words = find(title, node => node.type === "span");
    assert.equal(words.length, locale === "ja" ? 0 : t.contact.ctaTitle.split(/\s+/).length);
    assert.equal(find(tree, node => node.type === "form").length, 1);
  }
});

test("Contact sizing follows its column; clipping is limited to decoration; Japanese copy stays readable", async () => {
  const css = await sourceOf("../index.css");
  const rule = selector => css.slice(css.indexOf(selector + " {"), css.indexOf("}", css.indexOf(selector + " {")) + 1);
  assert.match(rule(".contact-display"), /container-type: inline-size/);
  assert.doesNotMatch(rule(".contact-display"), /overflow:\s*hidden/);
  assert.match(rule(".contact-display__title"), /18cqi/);
  assert.match(rule(".contact-display__title"), /line-height: 1\.25/);
  assert.match(css, /html\[lang="fr"\] \.contact-display__title \{ font-size: clamp\(2rem, 14cqi/);
  assert.match(css, /font-size: clamp\(1\.75rem, 10cqi, 3\.4rem\)/);
  assert.match(css, /\.manga-card__description \{ font-size: 1rem; line-height: 1\.8/);
  assert.match(css, /\.filter-count \{ font-size: 0\.8125rem/);
  const filters = await sourceOf("../components/gallery/FilterBar.jsx");
  assert.match(filters, /className="filter-count"/);
  assert.doesNotMatch(filters, /opacity-60/);
});

test("Reader accessible regions and lightbox zoom/thumbnail labels are localized in all interface languages", async () => {
  const reader = await sourceOf("../components/manga/MangaReader.jsx");
  assert.match(reader, /aria-label=\{t\.mangaReader\.verticalReader\(title\)\}/);
  assert.match(reader, /aria-label=\{t\.mangaReader\.horizontalReader\(title\)\}/);
  for (const locale of ["en", "fr", "ja"]) for (const mode of ["vertical", "horizontal"]) {
    assert.ok(getTranslations(locale).mangaReader[`${mode}Reader`]("Official title").includes("Official title"));
  }
  for (const translation of [fr, ja]) {
    for (const key of ["GOTO", "TOGGLEZOOM", "TOGGLE1TO1", "ITERATEZOOM"]) assert.ok(translation.lightbox[key]);
    assert.match(translation.lightbox.GOTO, /%d/);
    assert.doesNotMatch(translation.lightbox.ITERATEZOOM, /Toggle/);
  }
});

test("lightbox localization preserves carousel, image, zoom and thumbnail behavior options", async () => {
  const source = await sourceOf("../components/gallery/Lightbox.jsx");
  const code = await transformWithEsbuild(source.replace(/^import[^\n]+\r?\n/gm, "").replace("export default Lightbox;", "globalThis.Component = Lightbox;"), "Lightbox.jsx", { jsx: "transform" });
  for (const locale of ["fr", "ja"]) {
    let options;
    const context = vm.createContext({ fr, ja, useLanguage: () => ({ locale }), useEffect: callback => callback(), Fancybox: { bind: (_, value) => { options = value; } } });
    vm.runInContext(code.code, context);
    context.Component({ selector: ".fixture", options: { Carousel: { direction: "ltr", Thumbs: false }, Images: { zoom: false, Panzoom: { maxScale: 5 } }, Toolbar: { display: { right: ["close"] } } } });
    assert.equal(options.Carousel.direction, "ltr"); assert.equal(options.Carousel.Thumbs, false);
    assert.equal(options.Images.zoom, false); assert.equal(options.Images.Panzoom.maxScale, 5);
    assert.deepEqual(options.Toolbar.display.right, ["close"]);
    const dictionary = locale === "fr" ? fr.lightbox : ja.lightbox;
    assert.equal(options.Images.Panzoom.l10n.ITERATEZOOM, dictionary.ITERATEZOOM);
    assert.equal(options.Carousel.l10n.GOTO, dictionary.GOTO);
  }
});
