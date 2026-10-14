import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
import { getTranslations } from "../i18n/locale.js";
import { readProductionTime, formatProductionTime, getProductionTimePresentation, getProductionTimeBadgeAppearance, getPublicArtworkProductionGroups, createMangaProductionTimeLookup } from "./publicProductionTime.js";
import { productionTimeBadgeSettings } from "../content/productionTimeBadgeSettings.js";

const actual = minutes => ({ minutes, kind: "actual" });
test("absent/invalid durations disappear without fabricated zero or invalid text; read is immutable", () => {
  for (const value of [undefined, null, false, {}, "60", { minutes: "60", kind: "actual" }, actual(0), actual(-1), actual(1.5), actual(NaN), actual(Infinity), actual(Number.MAX_SAFE_INTEGER + 1), { minutes: 60, kind: "unknown" }, { ...actual(60), extra: 1 }]) {
    assert.equal(readProductionTime(value), null);
    for (const locale of ["en", "fr", "ja"]) {
      assert.equal(formatProductionTime(value, locale), ""); assert.equal(getProductionTimePresentation(value, locale, getTranslations(locale).productionTime), null);
    }
  }
  const value = Object.freeze(actual(150)); assert.deepEqual(readProductionTime(value), value); assert.notEqual(readProductionTime(value), value);
});
test("exact localized formatting: sub-hour, whole hour, minutes, 250h, no rounding or conversion to days", () => {
  const cases = [[45, "45 min", "45 min", "45分"], [60, "1 hr", "1 h", "1時間"], [150, "2 hr 30 min", "2 h 30", "2時間30分"], [735, "12 hr 15 min", "12 h 15", "12時間15分"], [15000, "250 hr", "250 h", "250時間"], [125, "2 hr 5 min", "2 h 05", "2時間5分"]];
  for (const [minutes, ...expected] of cases) for (const [i, locale] of ["en", "fr", "ja"].entries()) assert.equal(formatProductionTime(actual(minutes), locale), expected[i]);
  assert.match(formatProductionTime(actual(Number.MAX_SAFE_INTEGER)), /^150119987579016 hr 31 min$/);
});
test("all labels/units are explicitly translated; estimated stays textual and never becomes measured", () => {
  for (const locale of ["en", "fr", "ja"]) {
    const text = getTranslations(locale).productionTime;
    for (const context of ["individual", "manga", "page", "group"]) {
      const a = getProductionTimePresentation(actual(150), locale, text, context, { pageNumber: context === "page" ? 7 : undefined, memberCount: 5 });
      const e = getProductionTimePresentation({ minutes: 150, kind: "estimated" }, locale, text, context, { memberCount: 5 });
      assert.equal(a.label, text[context].actual); assert.equal(e.label, text[context].estimated);
      assert.ok(a.accessible.includes(text.measured)); assert.ok(e.display.startsWith(text.approximate)); assert.equal(e.measured, "");
      assert.equal(a.display, formatProductionTime(actual(150), locale));
    }
  }
});
test("Artwork groups are collective, never summed/substituted; hidden, historical, ambiguous and invalid groups are omitted", () => {
  const works = [{ id: "a" }, { id: "b" }], groups = [{ id: "g1", artworkIds: ["a", "b"], time: actual(600) }, { id: "g2", artworkIds: ["a"], time: { minutes: 300, kind: "estimated" } }, { id: "hidden", artworkIds: ["a", "private"], time: actual(100) }, { id: "bad", artworkIds: ["a"], time: actual(0) }];
  const source = JSON.stringify(groups);
  assert.deepEqual(getPublicArtworkProductionGroups(groups, "a", works).map(g=>[g.time.minutes,g.memberCount]), [[600,2],[300,1]]);
  assert.deepEqual(getPublicArtworkProductionGroups(undefined,"a",works),[]);
  assert.deepEqual(getPublicArtworkProductionGroups([{...groups[0],artworkIds:["a","a"]}],"a",works),[]);
  assert.deepEqual(getPublicArtworkProductionGroups([groups[0],groups[0]],"a",works),[]);
  assert.equal(JSON.stringify(groups),source);
});
const pathA = "assets/mangaka/project/english/01.jpg", pathB = "assets/mangaka/project/french/01.jpg", pathC = "assets/mangaka/project/french/02.jpg";
const mangaFixture = () => ({ languages: { english: { pages: ["/portfolio/"+pathA] }, french: { pages: ["/portfolio/"+pathB,"/portfolio/"+pathC] } }, productionTime: { total: actual(6000), pages: [{id:"drawing-one",time:actual(150)},{id:"history",time:actual(45)}], bindings:[{path:pathA,pageId:"drawing-one"},{path:"/portfolio/"+pathB,pageId:"drawing-one"}],groups:[{id:"group",time:actual(900),pageIds:["drawing-one","history"]}] } });
test("Manga lookup supports raw and BASE_URL binding paths and only explicit linguistic identities, never indices", () => {
  const manga=mangaFixture(), before=JSON.stringify(manga), lookup=createMangaProductionTimeLookup(manga,"/portfolio/");
  assert.deepEqual(lookup("/portfolio/"+pathA),actual(150)); assert.deepEqual(lookup(pathB),actual(150));
  assert.equal(lookup("/portfolio/"+pathC),null); assert.equal(lookup("assets/mangaka/foreign/01.jpg"),null);
  assert.equal(manga.productionTime.total.minutes,6000); assert.equal(JSON.stringify(manga),before);
});
test("Manga malformed/duplicated paths, bindings, IDs, absent times and historical records cannot leak another drawing's duration", () => {
  assert.equal(createMangaProductionTimeLookup({})(pathA),null);
  for(const mutation of [m=>m.productionTime.bindings.push({...m.productionTime.bindings[0]}),m=>m.productionTime.pages.push({...m.productionTime.pages[0]}),m=>m.languages.french.pages.push("/portfolio/"+pathA),m=>delete m.productionTime.pages[0].time,m=>m.productionTime.pages[0].time=actual(0),m=>m.productionTime.bindings[0].pageId="missing",m=>m.productionTime.pages=null]){
    const manga=mangaFixture(); mutation(manga); assert.equal(createMangaProductionTimeLookup(manga,"/portfolio/")(pathA),null);
  }
});

async function component(relative, name, context) {
  const source=await readFile(new URL(relative,import.meta.url),"utf8");
  const stripped=source.replace(/^import[\s\S]*?;\r?\n/gm,"").replace("export default function ","function ").replace(new RegExp(`export default ${name};`),"");
  const code=await transformWithEsbuild(stripped+`;globalThis.Component=${name}`,relative,{jsx:"transform",jsxFactory:"React.createElement",jsxFragment:"React.Fragment"});
  const sandbox=vm.createContext({React,...context});vm.runInContext(code.code,sandbox);return sandbox.Component;
}
test("shared Badge renders nothing for absent/invalid metadata and accessible compact/detailed labels in all locales", async()=>{
  for(const locale of ["en","fr","ja"]){
    const t=getTranslations(locale), Badge=await component("../components/ProductionTimeBadge.jsx","ProductionTimeBadge",{useLanguage:()=>({locale,t}),getProductionTimePresentation,getProductionTimeBadgeAppearance});
    assert.equal(Badge({}),null);assert.equal(Badge({time:actual(0)}),null);
    for(const kind of ["actual","estimated"]){const html=renderToStaticMarkup(React.createElement(Badge,{time:{minutes:150,kind}}));assert.ok(html.includes(t.productionTime.individual[kind]));assert.ok(html.includes('aria-hidden="true"'));assert.ok(!html.includes("<button"));}
    assert.ok(renderToStaticMarkup(React.createElement(Badge,{time:actual(150),variant:"detailed"})).includes(t.productionTime.measured));
  }
});
test("Artwork opt-in preserves Animation/Hero; Manga Card only uses manual total and retains route/cover/page count", async()=>{
  const t=getTranslations("en"), fakeBadge=props=>props.time?React.createElement("span",{"data-time":props.time.minutes},String(props.time.minutes)):null;
  const Artwork=await component("../components/gallery/ArtworkCard.jsx","ArtworkCard",{motion:{article:"article"},ProductionTimeBadge:fakeBadge,getProductionTimeBadgeAppearance});
  const item={id:"a",title:"",alt:"Unchanged",image:"/portfolio/sample.jpg",productionTime:actual(150)};
  assert.ok(!renderToStaticMarkup(React.createElement(Artwork,{item,metadata:""})).includes("data-time"));
  assert.ok(renderToStaticMarkup(React.createElement(Artwork,{item,metadata:"",showProductionTime:true})).includes('data-time="150"'));
  assert.ok(!renderToStaticMarkup(React.createElement(Artwork,{item:{...item,productionTime:actual(0)},metadata:"",showProductionTime:true})).includes("artwork-card__metadata"));
  const Card=await component("../components/manga/MangaCard.jsx","MangaCard",{motion:{article:"article"},Link:({to,children,...props})=>React.createElement("a",{href:to,...props},children),getMangaCardImage:m=>m.cover,ProductionTimeBadge:fakeBadge});
  const manga={id:"m",slug:"m",title:"Title",route:"/mangas/m",cover:"/portfolio/cover.jpg",pageCount:19,summary:"Summary",productionTime:mangaFixture().productionTime};
  const html=renderToStaticMarkup(React.createElement(Card,{manga,index:1,categoryLabel:"Manga",t}));assert.ok(html.includes('data-time="6000"'));assert.ok(!html.includes('data-time="900"'));assert.ok(html.includes('/mangas/m'));assert.ok(html.includes('/portfolio/cover.jpg'));assert.ok(html.includes('19'));
});
test("Reader metadata is interface-localized, double pages stay distinct and no duration means no extra element",async()=>{
  for(const locale of ["en","fr","ja"]){const t=getTranslations(locale), manga=mangaFixture();manga.languages.english.pages.push("/portfolio/"+pathC);manga.productionTime.pages.push({id:"second",time:{minutes:300,kind:"estimated"}});manga.productionTime.bindings.push({path:pathC,pageId:"second"});delete manga.languages.french;
    const Badge=await component("../components/ProductionTimeBadge.jsx","ProductionTimeBadge",{useLanguage:()=>({locale,t}),getProductionTimePresentation,getProductionTimeBadgeAppearance});
    const Reader=await component("../components/manga/ReaderPageProductionTimes.jsx","ReaderPageProductionTimes",{useMemo:callback=>callback(),useLanguage:()=>({locale,t}),createMangaProductionTimeLookup:m=>createMangaProductionTimeLookup(m,"/portfolio/"),ProductionTimeBadge:Badge});
    const html=renderToStaticMarkup(React.createElement(Reader,{manga,pages:manga.languages.english.pages,pageNumbers:[1,2]}));assert.ok(html.includes('data-production-page="1"'));assert.ok(html.includes('data-production-page="2"'));assert.ok(html.includes(t.productionTime.pageNumber(2)));assert.ok(!html.includes(formatProductionTime(actual(450),locale)));
    assert.equal(Reader({manga,pages:["missing"],pageNumbers:[1]}),null);
  }
});
test("Illustration tiers use exact stored minutes for both kinds, including every threshold boundary", () => {
  const cases = [[1,"short"],[59,"short"],[60,"short"],[119,"short"],[120,"medium"],[180,"medium"],[239,"medium"],[240,"long"],[300,"long"],[1000,"long"]];
  for (const [minutes,tier] of cases) for (const kind of ["actual","estimated"]) {
    const time=Object.freeze({minutes,kind});
    assert.deepEqual(getProductionTimeBadgeAppearance(time),{tier,placement:"top-right"});
    assert.equal(time.minutes,minutes); assert.equal(time.kind,kind);
  }
  assert.equal(getProductionTimeBadgeAppearance(actual(0)),null);
  assert.equal(getProductionTimeBadgeAppearance(undefined),null);
});
test("one configurable minute-based threshold pair, neutral mode and all placements are safe", () => {
  const settings={colorMode:"tiered",placement:"bottom-right",thresholds:{medium:180,long:360}};
  for(const [minutes,tier] of [[120,"short"],[179,"short"],[180,"medium"],[359,"medium"],[360,"long"]]) assert.deepEqual(getProductionTimeBadgeAppearance(actual(minutes),settings),{tier,placement:"bottom-right"});
  assert.equal(getProductionTimeBadgeAppearance(actual(1000),{...settings,colorMode:"neutral",placement:"metadata"}).tier,"neutral");
  for(const thresholds of [{medium:0,long:240},{medium:240,long:120},{medium:120,long:120},{medium:1.5,long:240},{medium:"120",long:240},{medium:120,long:Infinity},null]) assert.equal(getProductionTimeBadgeAppearance(actual(60),{...settings,thresholds}).tier,"neutral");
  assert.deepEqual(getProductionTimeBadgeAppearance(actual(60),null),{tier:"neutral",placement:"top-right"});
  assert.equal(getProductionTimeBadgeAppearance(actual(60),{...settings,placement:"invalid"}).placement,"top-right");
  assert.ok(Object.isFrozen(productionTimeBadgeSettings));assert.ok(Object.isFrozen(productionTimeBadgeSettings.thresholds));
});
test("Artwork badges have visible localized copy and one full accessible description; totals/pages remain neutral",async()=>{
  for(const locale of ["en","fr","ja"]){
    const t=getTranslations(locale),Badge=await component("../components/ProductionTimeBadge.jsx","ProductionTimeBadge",{useLanguage:()=>({locale,t}),getProductionTimePresentation,getProductionTimeBadgeAppearance});
    for(const minutes of [45,60,150,240,15000]) for(const kind of ["actual","estimated"]){
      const time={minutes,kind},html=renderToStaticMarkup(React.createElement(Badge,{time,variant:"artwork"}));
      assert.ok(html.includes(t.productionTime.compact.individual[kind]));assert.ok(html.includes(formatProductionTime(time,locale)));
      assert.equal((html.match(/class="sr-only"/g)||[]).length,1);assert.ok(html.includes('class="work-badge__copy" aria-hidden="true"'));
      assert.ok(html.includes(`work-badge--${getProductionTimeBadgeAppearance(time).tier}`));assert.ok(html.includes('data-badge-placement="top-right"'));
      assert.ok(!html.includes("<button"));
      for(const context of ["manga","page"]){const neutral=renderToStaticMarkup(React.createElement(Badge,{time,context}));assert.ok(neutral.includes(t.productionTime.compact[context][kind]));assert.ok(!neutral.includes("work-badge"));}
    }
    assert.equal(Badge({variant:"artwork",time:actual(0)}),null);
    assert.equal(Badge({variant:"artwork"}),null);
  }
});
test("Artwork overlay leaves date/image intact, while metadata placement reuses the same Badge",async()=>{
  const item={id:"a",title:"",alt:"Original alt",image:"/portfolio/image.jpg",width:800,height:1000,productionTime:actual(60)};
  for(const placement of ["top-right","bottom-right","metadata"]){
    const fakeBadge=props=>React.createElement("span",{"data-variant":props.variant,"data-placement":props.appearance.placement},"time");
    const Artwork=await component("../components/gallery/ArtworkCard.jsx","ArtworkCard",{motion:{article:"article"},ProductionTimeBadge:fakeBadge,getProductionTimeBadgeAppearance:value=>getProductionTimeBadgeAppearance(value,{...productionTimeBadgeSettings,placement})});
    const html=renderToStaticMarkup(React.createElement(Artwork,{item,metadata:"19 May 2026",showProductionTime:true}));
    assert.equal((html.match(/data-variant="artwork"/g)||[]).length,1);assert.ok(html.includes(`data-placement="${placement}"`));
    assert.equal(html.includes('data-variant="artwork"')&&html.indexOf('data-variant="artwork"')<html.indexOf("</a>"),placement!=="metadata");
    assert.ok(html.includes("19 May 2026"));assert.ok(html.includes('alt="Original alt"'));assert.ok(html.includes('width="800" height="1000"'));assert.ok(html.includes('loading="lazy"'));
  }
});
test("Reader navigation/rail/gestures/preloading stay unchanged; public code never calls an Admin API or writes durations",async()=>{
  const source=await readFile(new URL("../components/manga/MangaReader.jsx",import.meta.url),"utf8");
  assert.match(source,/pageNumbers=\{visiblePageNumbers\}/);assert.match(source,/onPointerUp=\{handlePointerUp\}/);assert.match(source,/getReaderRailTransform\(0\)/);
  for(const file of ["publicProductionTime.js","productionTimeCaption.js"]){const code=await readFile(new URL(file,import.meta.url),"utf8");assert.doesNotMatch(code,/\bfetch\(|\/api\/|localStorage|writeFile|setCurrentPage/);}
});
