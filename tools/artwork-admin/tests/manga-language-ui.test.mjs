import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { transformWithEsbuild } from "vite";
import { uiText } from "../../../src/content/ui.js";
import * as languageRegistry from "../../../src/utils/languageLabels.js";

const readerSource = await readFile(new URL("../../../src/components/manga/MangaReader.jsx", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../public/modules/mangas/manga-admin.js", import.meta.url), "utf8");
// Exercise the actual selector and its handlers with hooks/DOM adapters. These
// tests do not navigate a browser, send requests, or touch the real catalog.
const selectorSource = readerSource.slice(readerSource.indexOf("const LanguageSelector ="), readerSource.indexOf("const MangaPageImage ="));
const { code: selectorCode } = await transformWithEsbuild(selectorSource, "selector.jsx", {
  jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment",
});
const text = (element) => Array.isArray(element) ? element.map(text).join("") : typeof element === "string" ? element : element?.props ? text(element.props.children) : "";
const find = (element, predicate) => !element || typeof element !== "object" ? [] : Array.isArray(element) ? element.flatMap((child) => find(child, predicate)) : [...(predicate(element) ? [element] : []), ...find(element.props?.children, predicate)];

test("Reader trigger, menu and selection use native labels but retain exact codes", () => {
  const options = languageRegistry.supportedMangaLanguages.filter((language) => language.code !== "orig");
  const languages = options.map((language) => [language.code, { label: language.code === "ja" ? "Japanese" : language.code === "fr" ? "French" : language.label, shortLabel: language.shortLabel }]);
  for (const language of options) {
    const chosen = [];
    let stateIndex = 0;
    const context = vm.createContext({
      React, ...languageRegistry, useLanguage: () => ({ t: uiText.en }),
      useState: (initial) => [stateIndex++ === 0 ? true : typeof initial === "function" ? initial() : initial, () => {}],
      useRef: (current) => ({ current }), useCallback: (callback) => callback, useEffect: () => {}, useLayoutEffect: () => {},
      document: { fullscreenElement: null, body: {} }, createPortal: (element) => element,
      LANGUAGE_MENU_MARGIN: 8, LANGUAGE_MENU_WIDTH: 176, LANGUAGE_MENU_GAP: 8,
    });
    vm.runInContext(`${selectorCode}\nglobalThis.Selector = LanguageSelector;`, context);
    const tree = context.Selector({ languages, activeLanguage: language.code, onChange: (code) => chosen.push(code) });
    const trigger = find(tree, (element) => element.props?.["data-reader-language-trigger"] !== undefined)[0];
    assert.equal(text(trigger), language.label);
    assert.equal(trigger.props["aria-label"], `Language: ${language.label}`);
    assert.equal(trigger.props.children.props.dir, language.dir);
    const items = find(tree, (element) => element.props?.role === "menuitemradio");
    assert.deepEqual(items.map((item) => text(item).slice(1)), options.map((item) => item.label));
    const active = items.find((item) => item.props["aria-checked"]);
    active.props.onClick();
    assert.deepEqual(chosen, [language.code]);
    stateIndex = 0;
    const single = context.Selector({ languages: languages.filter(([code]) => code === language.code), activeLanguage: language.code, onChange: () => {} });
    assert.equal(text(single), language.label);
    assert.equal(single.props.children.props.dir, language.dir);
  }
});

test("Admin picker excludes existing languages and submits canonical codes only", async () => {
  const nodes = new Map();
  const element = () => ({
    children: [], attributes: {}, hidden: true, disabled: false,
    replaceChildren(...children) { this.children = children; this.value = children[0]?.value || ""; },
    setAttribute(name, value) { this.attributes[name] = value; }, focus() { this.focused = true; },
  });
  const $ = (id) => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const requests = [], messages = [];
  const manga = { languages: { english: { pages: [] }, fr: { pages: [] }, ja: { pages: Array(23).fill("existing-page") } } };
  const state = { currentId: "test-only", language: "ja" };
  const context = vm.createContext({
    ...languageRegistry, $, state, currentManga: () => manga, document: { createElement: element },
    message: (text) => messages.push(text), requireSavedEditor: () => true,
    immediateMutation: async (action, success, code) => { await action(); state.language = code; },
    api: async (url, options) => requests.push({ url, code: JSON.parse(options.body).code }),
  });
  vm.runInContext(adminSource.slice(adminSource.indexOf("function languageOption("), adminSource.indexOf("function setDirty(")), context);
  vm.runInContext(adminSource.slice(adminSource.indexOf('$("#add-language").onclick'), adminSource.indexOf('$("#delete-manga").onclick')), context);
  $("#add-language").onclick();
  assert.equal($("#language-picker").hidden, false);
  assert.equal($("#add-language").attributes["aria-expanded"], "true");
  const select = $("#new-language-code");
  assert.ok(select.children.every((option) => !["en", "fr", "ja"].includes(option.value)));
  assert.equal(select.children.find((option) => option.value === "ar").textContent, "العربية — Arabe");
  assert.equal(select.children.find((option) => option.value === "ar").dir, "rtl");
  for (const language of languageRegistry.supportedMangaLanguages) {
    // Shared options used elsewhere (including initial language) stay native.
    assert.equal(context.languageOption(language).textContent, language.label);
    const option = select.children.find((item) => item.value === language.code);
    if (option) assert.equal(option.textContent, `${language.label} — ${language.adminLabelFr}`);
  }
  // With no existing versions, all requested bilingual labels are available.
  const existingLanguages = manga.languages;
  manga.languages = {};
  context.closeLanguagePicker(); context.openLanguagePicker();
  assert.deepEqual(select.children.map((option) => option.textContent), [
    "English — Anglais", "Français — Français", "日本語 — Japonais", "Español — Espagnol",
    "Italiano — Italien", "Deutsch — Allemand", "Português — Portugais", "Tiếng Việt — Vietnamien",
    "العربية — Arabe", "한국어 — Coréen", "简体中文 — Chinois simplifié", "繁體中文 — Chinois traditionnel",
    "Bahasa Indonesia — Indonésien", "ไทย — Thaï", "Русский — Russe", "Original — Original",
  ]);
  manga.languages = existingLanguages;
  context.closeLanguagePicker(); context.openLanguagePicker();
  assert.ok(select.children.every((option) => !["en", "fr", "ja"].includes(option.value)));
  for (const code of ["es", "it", "vi", "ar", "zh-Hans", "zh-Hant"]) {
    select.value = code;
    select.onchange({ currentTarget: select });
    assert.equal(select.dir, languageRegistry.getLanguageDirection(code));
    await $("#confirm-add-language").onclick();
    assert.equal(requests.at(-1).code, code);
    assert.equal(state.language, code);
    assert.equal($("#confirm-add-language").disabled, false);
  }
  const count = requests.length;
  select.value = "ESPAGNOL";
  await $("#confirm-add-language").onclick();
  assert.equal(requests.length, count);
  assert.match(messages.at(-1), /sélecteur/);
  $("#cancel-add-language").onclick();
  assert.equal($("#language-picker").hidden, true);
  assert.equal($("#add-language").attributes["aria-expanded"], "false");
  assert.equal(manga.languages.ja.pages.length, 23);
});
