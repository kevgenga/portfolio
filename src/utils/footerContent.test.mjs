import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
import { getContentTranslations, getTranslations } from "../i18n/locale.js";
import { sitePresentation } from "../content/sitePresentation.js";

const profileSource = await readFile(new URL("../content/profile.js", import.meta.url), "utf8");
const profile = vm.runInNewContext(profileSource.replace(/^import[^\n]+\n/m, "").replace("export const profile", "const profile") + ";profile", { assetPath: value => value });
const original = JSON.stringify(profile);
const encode = value => renderToStaticMarkup(React.createElement("span", null, value)).replace(/^<span>|<\/span>$/g, "");
async function component(file, name, context) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const result = await transformWithEsbuild(source.replace(/^import[^\n]+\n/gm, "").replace(`export default ${name};`, `globalThis.Component = ${name};`), `${name}.jsx`, { jsx: "transform", jsxFactory: "React.createElement" });
  vm.runInContext(result.code, context);
  return context.Component;
}

test("shared Footer retains every localized skill, tool, role, date and navigation for both Animation states", async () => {
  for (const locale of ["en", "ja", "fr"]) for (const visible of [false, true]) {
    const t = getTranslations(locale), content = getContentTranslations(locale);
    const context = vm.createContext({ React, profile, sitePresentation: { ...sitePresentation, showAnimationSection: visible }, useLanguage: () => ({ t, content }),
      Link: ({ to, children, ...props }) => React.createElement("a", { ...props, href: to }, children),
    });
    context.CapabilityGroup = await component("../components/about/CapabilityGroup.jsx", "CapabilityGroup", context);
    const Footer = await component("../Footer.jsx", "Footer", context);
    const html = renderToStaticMarkup(React.createElement(Footer));
    const groups = [...profile.capabilities.filter(group => visible || group.label !== "2D / Motion"), ...profile.tools];
    const expected = groups.flatMap(group => group.items.map(item => encode(content?.capabilityItems[item] || item)));
    assert.deepEqual([...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(match => match[1]), expected);
    const experience = content?.experience || profile.experience;
    for (const text of [experience.role, experience.period, t.footer.copyright(new Date().getFullYear()), ...(content?.about.roles || profile.about.roles)]) assert.ok(html.includes(encode(text)));
    assert.ok(html.includes('id="experience-title"')); assert.ok(html.includes('id="tools-title"'));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]); assert.equal(new Set(ids).size, ids.length);
    for (const [, id] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(id));
    for (const route of ["/", "/mangaka", "/illustration", "/contact"]) assert.ok(html.includes(`href="${route}"`));
    assert.equal(html.includes('href="/animation"'), visible);
    assert.ok(!html.includes("<img")); assert.ok(!html.includes("<script"));
  }
  assert.equal(JSON.stringify(profile), original);
});

test("Home has three numbered sections, keeps stable anchors/widget and no longer renders skills/tools", async () => {
  const home = await readFile(new URL("../pages/HomePage.jsx", import.meta.url), "utf8");
  assert.deepEqual([...home.matchAll(/\bindex="(\d+)"/g)].map(match => match[1]), ["01", "02", "03"]);
  assert.ok(!home.includes("CapabilityGroup")); assert.ok(!home.includes('id="experience-title"')); assert.ok(!home.includes('id="tools-title"'));
  for (const id of ["about", "selected-manga", "recognition-title", "sketchbook-title"]) assert.ok(home.includes(`id="${id}"`));
  assert.equal((home.match(/<InstagramSketchbook\s/g) || []).length, 1);
  for (const locale of ["en", "ja", "fr"]) { const t = getTranslations(locale); assert.ok(t.home.sketchbookLabel); assert.ok(t.home.sketchbookTitle); assert.ok(t.home.sketchbookDescription.includes("Instagram")); }
});
