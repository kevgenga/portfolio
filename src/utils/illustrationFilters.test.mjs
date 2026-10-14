import assert from "node:assert/strict";
import test from "node:test";
import { illustrationCategories, resolveIllustrationFilter } from "./illustrationFilters.js";
import { sitePresentation } from "../content/sitePresentation.js";
import { getTranslations } from "../i18n/locale.js";
import React from "react";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithEsbuild } from "vite";

test("category URLs match exact public filters, including fallback and featured visibility", () => {
  for (const category of illustrationCategories) assert.equal(resolveIllustrationFilter(category, illustrationCategories), category);
  assert.equal(resolveIllustrationFilter("all", illustrationCategories), "all");
  for (const invalid of [null, "Japanese", "Character Design", "unknown", "featured"]) assert.equal(resolveIllustrationFilter(invalid, illustrationCategories), "illustrations");
  assert.equal(resolveIllustrationFilter("featured", illustrationCategories, true), "featured");
  assert.equal(resolveIllustrationFilter("backgrounds", ["sketches"]), "all");
});

test("every new Home key and work category is translated EN/JA/FR", () => {
  for (const locale of ["en", "ja", "fr"]) {
    const t = getTranslations(locale);
    for (const key of ["viewManga", "viewWorks", "selectedMangaLabel", "selectedMangaNote", "selectedMangaTitle", "allManga"]) assert.ok(t.home[key]);
    for (const { category } of sitePresentation.heroCards) { assert.ok(t.home.workDescriptions[category]); assert.ok(t.home.workAlt(t.illustration.categories[category])); }
  }
  assert.deepEqual(sitePresentation.selectedMangaSlugs, ["legend-of-animiste", "stubborn-love", "ahes"]);
});

test("Animation visibility restores desktop/mobile Navbar and Footer links in every UI language", async () => {
  const profileSource = await readFile(new URL("../content/profile.js", import.meta.url), "utf8");
  const profile = vm.runInNewContext(profileSource.replace(/^import[^\n]+\n/m, "").replace("export const profile", "const profile") + ";profile", { assetPath: (value) => value });
  const findLinks = (element) => !element || typeof element !== "object" ? [] : Array.isArray(element) ? element.flatMap(findLinks) : [element.props?.to, ...findLinks(element.props?.children)].filter(Boolean);
  for (const name of ["Navbar", "Footer"]) {
    const source = await readFile(new URL(name === "Navbar" ? "../components/Navbar.jsx" : "../Footer.jsx", import.meta.url), "utf8");
    const transformed = await transformWithEsbuild(source.replace(/^import[\s\S]*?from [^;]+;\s*/gm, "").replace(`export default ${name};`, `globalThis.Component = ${name};`), `${name}.jsx`, { jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
    for (const locale of ["en", "ja", "fr"]) for (const visible of [false, true]) {
      let stateIndex = 0;
      const context = vm.createContext({ React, profile, sitePresentation: { ...sitePresentation, showAnimationSection: visible },
        useLanguage: () => ({ t: getTranslations(locale), locale }), useTheme: () => ({ theme: "light", toggleTheme() {} }),
        useEffect() {}, useRef: () => ({ current: null }), useState: () => [stateIndex++ === 0, () => {}], useLocation: () => ({ pathname: "/", hash: "" }),
        Link: "a", NavLink: "a", CapabilityGroup: "section", AnimatePresence: "div", motion: { div: "div" },
        FaBars: "i", FaGlobe: "i", FaMoon: "i", FaSun: "i", FaTimes: "i", locales: [{ code: locale, label: locale }],
      });
      vm.runInContext(transformed.code, context); const links = findLinks(context.Component());
      assert.equal(links.filter((link) => link === "/animation").length, visible ? (name === "Navbar" ? 2 : 1) : 0);
      assert.ok(links.includes("/mangaka")); assert.ok(links.includes("/illustration"));
    }
  }
});
