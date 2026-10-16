import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTranslations } from "../src/i18n/locale.js";
const readerCSS=readFileSync(new URL('../src/components/manga/ReaderNavigation.css',import.meta.url),'utf8');
const verticalMax=Number(readerCSS.match(/--reader-vertical-page-max-width:\s*(\d+)px/)[1]);

// Read-only in-memory Vite fixtures, never a write to a real manga or image.
export async function verifyVerticalSpreads({evaluate,command,until,click,navigate,capture,slug}) {
  const frame=()=>evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const current="Number(document.querySelector('[data-reader-pagination] > p > span').textContent.split('/')[0])";
  const resize=async(width,height=900)=>{await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});await frame();};
  const mode=async(value,locale)=>{await click(`[data-reader-header] [role=group] button[aria-label=${JSON.stringify(getTranslations(locale).mangaReader.mode+': '+getTranslations(locale).mangaReader[value])}]`);await until(`document.querySelector('main').dataset.readerMode==='${value}'`);await frame();};
  const scrollToGroup=async(page,fraction=.5)=>{
    await evaluate(`(()=>{const reader=document.querySelector('main'),root=document.fullscreenElement||document.scrollingElement,block=reader.querySelector('[data-page-group="${page}"]'),r=block.getBoundingClientRect();root.scrollTop+=r.top+r.height*${fraction}-innerHeight/2})()`);
    await until(`${current}===${Number(String(page).split('-')[0])}`);await frame();
    const before=await evaluate('document.fullscreenElement?.scrollTop??scrollY');await frame();await frame();
    assert.equal(await evaluate('document.fullscreenElement?.scrollTop??scrollY'),before,'Passive tracking never repositions scroll');
  };
  const geometry=()=>evaluate(`(()=>{const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,height:r.height}};const el=document.querySelector('[data-page-group="3-4"]');return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,group:rect(el),dir:el.dir,images:[...el.querySelectorAll('img')].map(img=>({rect:rect(img),ratio:img.naturalWidth/img.naturalHeight,maxHeight:getComputedStyle(img).maxHeight}))}})()`);
  let checks=0;
  for(const locale of ['en','fr','ja'])for(const direction of ['rtl','ltr']) {
    await navigate('mangas/'+slug,locale,'dark',false,'&readerNavVerticalSpreads=1'+(direction==='ltr'?'&readerNavLtr=1':''));
    await until("document.querySelector('[data-reader-language-trigger]')");
    if(locale==='ja') {
      await click('[data-reader-language-trigger]');await until("document.querySelector('[data-reader-language-menu]')");
      await evaluate("[...document.querySelectorAll('[data-reader-language-menu] button')].find(el=>el.textContent.includes('日本語')).click()");
      await until("document.querySelector('main').dataset.readerLanguage==='ja'");
    }
    await mode('vertical',locale);
    // With a larger user-configured page width, this pair may start below the
    // native lazy-load margin. Visit it before checking its decoded dimensions.
    await evaluate("document.querySelector('[data-page-group=\"3-4\"]').scrollIntoView({block:'center',behavior:'instant'})");
    await until("[...document.querySelectorAll('[data-page-group="+JSON.stringify('3-4')+"] img')].every(img=>img.naturalWidth>0)");
    assert.equal(await evaluate("document.querySelectorAll('[data-vertical-reader] figure').length"),24);
    assert.equal(await evaluate("document.querySelectorAll('[data-vertical-reader] [data-page-group]').length"),23);
    await evaluate("window.__verticalScrollCalls=0;window.__originalScrollIntoView=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(...args){window.__verticalScrollCalls++;return window.__originalScrollIntoView.apply(this,args)}");
    for(const width of [320,360,375,390,430,768,1024,1440,1920]) {
      await resize(width);
      const single=await evaluate("(()=>{const el=document.querySelector('[data-page-group=\"1\"] img'),r=el.getBoundingClientRect();return {width:r.width,height:r.height,ratio:el.naturalWidth/el.naturalHeight}})()");
      assert.ok(Math.abs(single.width-Math.min(width,verticalMax))<1);
      assert.ok(Math.abs(single.width/single.height-single.ratio)<.001);
      await scrollToGroup('3-4');
      const g=await geometry();assert.equal(g.overflow,false);assert.equal(g.dir,direction);
      assert.ok(Math.abs(g.group.width-Math.min(width,1440))<1);assert.ok(Math.abs((g.group.left+g.group.right)/2-width/2)<1);
      const [a,b]=g.images; assert.equal(a.maxHeight,'none');assert.equal(b.maxHeight,'none');
      for(const img of g.images)assert.ok(Math.abs(img.rect.width/img.rect.height-img.ratio)<.001,'Native ratio, no crop');
      assert.ok(Math.abs(direction==='rtl'?a.rect.left-b.rect.right:b.rect.left-a.rect.right)<1,'No spread gutter');
      assert.equal(direction==='rtl'?a.rect.left>b.rect.left:a.rect.left<b.rect.left,true);
      for(const fraction of [.2,.5,.8])await scrollToGroup('3-4',fraction);
      assert.equal(await evaluate("document.querySelector('[data-reader-pagination] > p > span').textContent"),'3 / 24');
      if(locale!=='ja')assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-reader-production-times] [data-production-page]')].map(el=>el.dataset.productionPage)"),['3','4']);
      await scrollToGroup('5');await scrollToGroup('2');await scrollToGroup('3-4');
      assert.equal(await evaluate('window.__verticalScrollCalls'),0);
      if(direction==='rtl'&&[390,1440,1920].includes(width))await capture(`reader-vertical-spread-${locale}-${width}`);
      checks++;
    }
    // Navigation skips the visual pair without ever changing horizontal panels.
    await click('[data-vertical-click-zones] button:last-child');await until(`${current}===5`);
    await click('[data-vertical-click-zones] button:first-child');await until(`${current}===3`);
    await scrollToGroup('3-4');const visible=await geometry();
    await click('[data-vertical-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='hidden'");
    assert.deepEqual((await geometry()).images,visible.images);
    await click('[data-vertical-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='visible'");
    await mode('horizontal',locale);
    await until("document.querySelector('[data-horizontal-pages]').dataset.horizontalPages==='2-3'");
    await mode('vertical',locale);await scrollToGroup('3-4');
    if(await evaluate('document.fullscreenEnabled')) {
      const p=await evaluate(`(()=>{const r=document.querySelector('[aria-label=${JSON.stringify(getTranslations(locale).mangaReader.enterFullscreen)}]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
      await until('document.fullscreenElement');await scrollToGroup('3-4');await scrollToGroup('5');
      await evaluate('document.exitFullscreen()');await until('!document.fullscreenElement');
    }
  }
  // French work language is not associated merely because EN/JA has a pair.
  await navigate('mangas/'+slug,'en','light',false,'&readerNavVerticalSpreads=1');await until("document.querySelector('[data-reader-language-trigger]')");
  await click('[data-reader-language-trigger]');await until("document.querySelector('[data-reader-language-menu]')");
  await evaluate("[...document.querySelectorAll('[data-reader-language-menu] button')].find(el=>el.textContent.includes('Français')).click()");
  await until("document.querySelector('main').dataset.readerLanguage==='fr'");await mode('vertical','en');
  assert.equal(await evaluate("document.querySelectorAll('[data-page-group=\"3-4\"]').length"),0);
  assert.equal(await evaluate("document.querySelectorAll('[data-page-group]').length"),24);
  // CSS customization changes only the vertical sizing, not source pixels.
  await resize(1440);await evaluate("document.querySelector('main').style.setProperty('--reader-vertical-page-max-width','800px')");await frame();
  assert.equal(await evaluate("document.querySelector('[data-page-group=\"1\"]').getBoundingClientRect().width"),800);
  console.log(`Vertical spread Chromium QA: ${checks} viewport/locale/direction checks, ratios, no gaps/overflow, individual times, stable passive pagination, navigation, language independence, hidden UI and native fullscreen OK.`);
}
