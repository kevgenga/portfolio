import assert from "node:assert/strict";
import test from "node:test";
import { getVerticalReadingGroups, moveVerticalSpreadPath, validateVerticalSpreads } from "./verticalSpreads.js";
import { findActiveVerticalPage } from "../components/manga/verticalPageTracking.js";
import { getHorizontalReadingPanels } from "../components/manga/readerPagination.js";

test("vertical grouping is opt-in, complete, language-local and independent of horizontal panels", () => {
  const pages = ["cover", "two", "three", "four", "five", "six"];
  assert.deepEqual(getVerticalReadingGroups(pages).map(group => group.map(p => p.number)), [[1],[2],[3],[4],[5],[6]]);
  assert.deepEqual(getVerticalReadingGroups(pages, [["three","four"],["five","six"]]).map(group => group.map(p => p.number)), [[1],[2],[3,4],[5,6]]);
  assert.deepEqual(getHorizontalReadingPanels("double",6),[[1],[2,3],[4,5],[6]]);
  assert.deepEqual(getVerticalReadingGroups(["only"]),[[{src:"only",number:1}]]);
  assert.deepEqual(getVerticalReadingGroups([]),[]);
});
test("invalid or stale public associations never hide, duplicate or reorder a page", () => {
  const pages=["a","b","c","d"];
  for(const pairs of [null, {}, [["missing","b"]], [["a","c"]], [["b","a"]], [["a","b"],["b","c"]]]) {
    assert.deepEqual(getVerticalReadingGroups(pages,pairs).flat().map(p=>p.src),pages);
  }
  assert.throws(()=>validateVerticalSpreads({pages,verticalSpreads:[["a","b"],["b","c"]]}),/déjà/);
  assert.throws(()=>validateVerticalSpreads({pages,verticalSpreads:[["a","c"]]}),/séparerait/);
  const language={pages,verticalSpreads:[["a","b"]]}; moveVerticalSpreadPath(language,"b","replacement");
  assert.deepEqual(language.verticalSpreads,[["a","replacement"]]);
});
test("one visual spread has one stable reading number including at document end", () => {
  const bounds=[{number:1,top:0,bottom:100},{number:2,top:110,bottom:210},{number:3,top:220,bottom:500},{number:5,top:510,bottom:610}];
  for(const y of [220,280,350,499]) assert.equal(findActiveVerticalPage(bounds,y,4),3);
  assert.equal(findActiveVerticalPage(bounds,510,3),5);
  assert.equal(findActiveVerticalPage(bounds,200,3),2);
  assert.equal(findActiveVerticalPage(bounds.slice(0,3),500,4,true),3);
});
