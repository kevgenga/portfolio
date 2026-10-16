import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getHorizontalReadingPanels, getReadingPanelIndex, getVisiblePageNumbers } from "./readerPagination.js";
import { getTranslations } from "../../i18n/locale.js";

test("slider uses the rail's real panels: isolated cover, complete spreads and isolated even last page", () => {
  for (const [count, starts, last] of [
    [14,[1,2,4,6,8,10,12,14],[14]],
    [24,[1,2,4,6,8,10,12,14,16,18,20,22,24],[24]],
    [31,[1,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30],[30,31]],
  ]) {
    const panels = getHorizontalReadingPanels("double", count);
    assert.deepEqual(panels.map(pages => pages[0]), starts);
    assert.deepEqual(panels[0], [1]);
    assert.deepEqual(panels.at(-1), last);
    assert.deepEqual(panels.flat(), Array.from({length:count},(_,i)=>i+1));
    panels.forEach((pages,index) => {
      assert.deepEqual(pages, getVisiblePageNumbers(pages[0],"double",count));
      pages.forEach(page=>assert.equal(getReadingPanelIndex(panels,page),index));
    });
  }
});
test("single-page layout retains every page; one-page manga has one disabled-slider position",()=>{
  assert.deepEqual(getHorizontalReadingPanels("double",1),[[1]]);
  assert.deepEqual(getHorizontalReadingPanels("single",1),[[1]]);
  assert.deepEqual(getHorizontalReadingPanels("single",5),[[1],[2],[3],[4],[5]]);
  assert.deepEqual(getHorizontalReadingPanels("double",0),[]);
});
test("responsive and language changes map page numbers to the current panels without losing a page",()=>{
  assert.equal(getReadingPanelIndex(getHorizontalReadingPanels("single",24),15),14);
  assert.equal(getReadingPanelIndex(getHorizontalReadingPanels("double",24),15),7);
  assert.equal(getReadingPanelIndex(getHorizontalReadingPanels("double",14),14),7);
});
test("spread previews are short and localized, with native Japanese notation",()=>{
  for(const [locale,caption] of [["en","Pages 4–5"],["fr","Pages 4–5"],["ja","4～5ページ"]]) {
    assert.equal(getTranslations(locale).mangaReader.spreadCaption(4,5),caption);
  }
});
test("one local slider draft renders the existing counter, with no visual bubble or duplicate pagination state",async()=>{
  const slider=await readFile(new URL('./ReaderPageSlider.jsx',import.meta.url),'utf8');
  const reader=await readFile(new URL('./MangaReader.jsx',import.meta.url),'utf8');
  const css=await readFile(new URL('./ReaderNavigation.css',import.meta.url),'utf8');
  assert.doesNotMatch(slider,/<output|title=|role="tooltip"|reader-page-slider__preview/);
  assert.doesNotMatch(css,/reader-page-slider__preview/);
  assert.equal((slider.match(/useState\(/g)||[]).length,1);
  for(const token of ['draft?.sourcePage === currentPage','draft?.panels === panels','renderCounter(hasCurrentDraft ? firstPage : currentPage)','onLostPointerCapture={cancel}','pointer.current?.cancelled']) assert.ok(slider.includes(token));
  assert.match(reader,/readingMode !== "horizontal" && renderCounter\(currentPage\)/);
  assert.match(reader,/progress\(displayPage, pageCount\)/);
  assert.match(reader,/ReaderPageProductionTimes manga=\{manga\} pages=\{pages\} pageNumbers=\{pageNumbers\}/);
});

test("explicit horizontal 3–4 reserves both pages and resumes automatic grouping, even on mobile",()=>{
  const pages=Array.from({length:24},(_,i)=>`page-${i+1}`),pairs=[pages.slice(2,4)];
  assert.deepEqual(getHorizontalReadingPanels('double',24,pages,pairs),[[1],[2],[3,4],[5,6],[7,8],[9,10],[11,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,24]]);
  assert.deepEqual(getHorizontalReadingPanels('single',24,pages,pairs),[[1],[2],[3,4],...Array.from({length:20},(_,i)=>[i+5])]);
  assert.deepEqual(getVisiblePageNumbers(4,'double',24,pages,pairs),[3,4]);
});
test("all counts and forced-pair positions preserve every page exactly once and the isolated cover",()=>{
  for(const count of [1,2,3,14,24,31])for(const display of ['single','double']) {
    const pages=Array.from({length:count},(_,i)=>`file-${i+1}`);
    const scenarios=[[],pages.slice(2,4),pages.slice(-2),pages.slice(1,3)].filter(pair=>pair.length===0||pair.length===2).map(pair=>pair.length?[pair]:[]);
    for(let first=1;first<count-1;first++)scenarios.push([pages.slice(first,first+2)]);
    scenarios.push(Array.from({length:Math.floor((count-1)/3)},(_,i)=>pages.slice(1+i*3,3+i*3)));
    for(const pairs of scenarios) {
      const valid=pairs.filter(pair=>pair[0]!==pages[0]);
      const panels=getHorizontalReadingPanels(display,count,pages,pairs);
      assert.deepEqual(panels[0],[1]);assert.deepEqual(panels.flat(),Array.from({length:count},(_,i)=>i+1));
      assert.equal(new Set(panels.flat()).size,count);
      for(const pair of valid)assert.ok(panels.some(panel=>panel.length===2&&panel[0]===pages.indexOf(pair[0])+1&&panel[1]===pages.indexOf(pair[1])+1));
      panels.forEach((panel,index)=>panel.forEach(page=>{
        assert.equal(getReadingPanelIndex(panels,page),index);
        assert.deepEqual(getVisiblePageNumbers(page,display,count,pages,pairs),panel);
      }));
    }
    assert.deepEqual(getHorizontalReadingPanels(display,count,pages,[]),getHorizontalReadingPanels(display,count));
  }
});
test("damaged explicit horizontal metadata never loses pages or attaches the cover",()=>{
  const pages=['a','b','c','d','e','f'];
  for(const pairs of [null,{},[['a','b']],[['b','d']],[['missing','c']],[['c','d'],['d','e']],[['d','c']]]) {
    const panels=getHorizontalReadingPanels('double',6,pages,pairs);
    assert.deepEqual(panels.flat(),[1,2,3,4,5,6]);assert.deepEqual(panels[0],[1]);
  }
});
