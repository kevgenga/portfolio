import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { findActiveVerticalPage, findReaderScrollContainer } from "./verticalPageTracking.js";
import { getTranslations } from "../../i18n/locale.js";

const pages = [{number:1,top:0,bottom:1000},{number:2,top:1012,bottom:4012},{number:3,top:4024,bottom:4200}];
test("central reading line selects pages down and up, including very tall pages", () => {
  for (const [reference,expected] of [[300,1],[1400,2],[3200,2],[4100,3],[2500,2],[500,1]]) assert.equal(findActiveVerticalPage(pages,reference,1),expected);
  assert.equal(findActiveVerticalPage([],0,1),null);
  assert.equal(findActiveVerticalPage(pages,-50,1),1);
  assert.equal(findActiveVerticalPage(pages,5000,1),3);
});
test("gutter hysteresis is symmetric; a fast jump cannot retain an unrelated page", () => {
  assert.equal(findActiveVerticalPage(pages,1006,1),1);
  assert.equal(findActiveVerticalPage(pages,1006,2),2);
  assert.equal(findActiveVerticalPage(pages,4014,1),2);
  assert.equal(findActiveVerticalPage(pages,4022,1),3);
  assert.equal(findActiveVerticalPage(pages,1000,1),1);
  assert.equal(findActiveVerticalPage(pages,1012,1),2);
});
test("short last page is active at the actual end of the scroll; language lists are independent", () => {
  assert.equal(findActiveVerticalPage(pages,3900,2,true),3);
  assert.equal(findActiveVerticalPage([{number:1,top:0,bottom:200}],100,1,true),1);
  assert.equal(findActiveVerticalPage(pages.slice(0,2),3900,3,true),2);
});
test("detects the nearest actual scroll container, including fullscreen, otherwise window", () => {
  const view={getComputedStyle:el=>({overflowY:el.overflowY})};
  const document={defaultView:view,body:{},documentElement:{}};
  const reader={overflowY:"visible",parentElement:document.body}, wrapper={overflowY:"visible",parentElement:reader};
  const section={ownerDocument:document,parentElement:wrapper};
  assert.equal(findReaderScrollContainer(section),view);
  reader.overflowY="auto";assert.equal(findReaderScrollContainer(section),reader);
  wrapper.overflowY="scroll";assert.equal(findReaderScrollContainer(section),wrapper);
});
test("passive tracking never navigates or scrolls; all listeners/observers are cleaned", async () => {
  const hook=await readFile(new URL('./useVerticalPageTracking.js',import.meta.url),'utf8');
  assert.doesNotMatch(hook,/scrollIntoView|scrollTo\(|goToPage|\.src\s*=/);
  for (const token of ['passive: true','requestAnimationFrame','cancelAnimationFrame','observer?.disconnect()','removeEventListener("scroll"','removeEventListener("load"','removeEventListener("transitionend"','next !== latest.current.currentPage']) assert.ok(hook.includes(token));
  const reader=await readFile(new URL('./MangaReader.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(reader.slice(reader.indexOf('setIsInterfaceVisible(true);'),reader.indexOf('useVerticalPageTracking({')),/verticalPageElements.current = \[\]/);
});
test("slider labels are explicit and native range keeps internal focus/keyboard separate from the rail",async()=>{
  for(const [locale,label] of [['en','Go to page'],['fr','Aller à la page'],['ja','ページへ移動']]) assert.equal(getTranslations(locale).mangaReader.goToPage,label);
  const slider=await readFile(new URL('./ReaderPageSlider.jsx',import.meta.url),'utf8');
  for(const token of ['type="range"','max={maximum}','aria-valuetext','readingDirection === "rtl"','onPointerCancel','onBlur','event.stopPropagation()']) assert.ok(slider.includes(token));
  assert.doesNotMatch(slider,/preventDefault\(|ArrowLeft|ArrowRight/);
  const reader=await readFile(new URL('./MangaReader.jsx',import.meta.url),'utf8');
  assert.match(reader,/isInteractiveElementFocused\(\)/);
  assert.doesNotMatch(slider,/\b24\b|fetch\(|new Image/);
});
