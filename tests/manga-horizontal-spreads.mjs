import assert from "node:assert/strict";
import { getTranslations } from "../src/i18n/locale.js";
import { getHorizontalReadingPanels, getReadingPanelIndex } from "../src/components/manga/readerPagination.js";

export async function verifyHorizontalSpreads({evaluate,command,until,click,navigate,capture,slug,requests}) {
  const slider='[data-reader-page-slider] input';
  const current="Number(document.querySelector('[data-reader-pagination] > p > span').textContent.split('/')[0])";
  const actual="document.querySelector('[data-horizontal-pages]')?.dataset.horizontalPages";
  const frame=()=>evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const resize=async(width,height=900)=>{await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});await frame();await until("document.querySelector('main').dataset.pageDisplay===(innerWidth>=900?'double':'single')");};
  const key=async(key,code)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});};
  const mouse=(type,p,buttons=0)=>command('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'&&!buttons?'none':'left',buttons,clickCount:1});
  const panels=async()=>{const display=await evaluate("document.querySelector('main').dataset.pageDisplay");const pages=Array.from({length:24},(_,i)=>String(i+1));return getHorizontalReadingPanels(display,24,pages,[['3','4']]);};
  const point=async page=>{
    const index=getReadingPanelIndex(await panels(),page);
    return evaluate(`(()=>{const el=document.querySelector('${slider}'),r=el.getBoundingClientRect(),thumb=parseFloat(getComputedStyle(el.parentElement).getPropertyValue('--reader-slider-thumb-size')),ratio=${index}/Number(el.max);return {x:el.dir==='rtl'?r.right-thumb/2-ratio*(r.width-thumb):r.left+thumb/2+ratio*(r.width-thumb),y:r.y+r.height/2}})()`);
  };
  const expect=async page=>{
    const list=await panels(),index=getReadingPanelIndex(list,page),numbers=list[index];
    await until(`${actual}===${JSON.stringify(numbers.join('-'))}&&${current}===${numbers[0]}&&document.querySelector('${slider}').value==='${index}'`);
    assert.equal(await evaluate(`document.querySelector('${slider}').max`),String(list.length-1));
  };
  const jump=async page=>{const p=await point(page);await mouse('mousePressed',p,1);await mouse('mouseReleased',p);await expect(page);};
  const mode=async(value,locale)=>{await click(`[data-reader-header] [role=group] button[aria-label=${JSON.stringify(getTranslations(locale).mangaReader.mode+': '+getTranslations(locale).mangaReader[value])}]`);await until(`document.querySelector('main').dataset.readerMode==='${value}'`);};
  let checks=0;
  for(const locale of ['en','fr','ja'])for(const direction of ['rtl','ltr']) {
    await navigate('mangas/'+slug,locale,'dark',false,'&readerNavHorizontalSpreads=1'+(direction==='ltr'?'&readerNavLtr=1':''));
    await until(`document.querySelector('${slider}')`);
    if(locale==='ja'){
      await click('[data-reader-language-trigger]');await until("document.querySelector('[data-reader-language-menu]')");
      await evaluate("[...document.querySelectorAll('[data-reader-language-menu] button')].find(el=>el.textContent.includes('日本語')).click()");
      await until("document.querySelector('main').dataset.readerLanguage==='ja'");
    }
    for(const [width,height] of [...[320,360,375,390,430,768,1024,1440,1920].map(w=>[w,900]),[844,390],[2560,1080]]){
      await resize(width,height);await jump(1);await jump(2);await jump(3);
      await until("[...document.querySelectorAll('[data-rail-panel=current] img')].every(img=>img.naturalWidth>0)");
      const g=await evaluate("(()=>{const images=[...document.querySelectorAll('[data-rail-panel=current] img')];return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,images:images.map(img=>{const r=img.getBoundingClientRect(),scale=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight);return {left:r.left,right:r.right,width:r.width,height:r.height,native:img.naturalWidth/img.naturalHeight,fit:getComputedStyle(img).objectFit,paintWidth:img.naturalWidth*scale,paintHeight:img.naturalHeight*scale}})}})()");
      assert.equal(g.overflow,false);assert.equal(g.images.length,2);const [a,b]=g.images;
      assert.ok(Math.abs(direction==='rtl'?a.left-b.right:b.left-a.right)<1,'No gutter between forced pages');
      assert.ok(Math.abs((Math.min(a.left,b.left)+Math.max(a.right,b.right))/2-width/2)<1);
      for(const img of g.images){assert.equal(img.fit,'contain');assert.ok(Math.abs(img.height-height)<1);assert.ok(Math.abs(img.paintWidth/img.paintHeight-img.native)<.001);}
      if(locale!=='ja')assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-production-page]')].map(el=>el.dataset.productionPage)"),['3','4']);
      await click('[data-horizontal-stage] > button:first-of-type');await expect(5); // next actual panel: 5 or 5–6
      await evaluate('document.activeElement?.blur()');await key('ArrowRight',39);await expect(3);
      if(direction==='rtl'&&[390,1440].includes(width))await capture(`reader-forced-horizontal-${locale}-${width}`);
      checks++;
    }
    // Every native slider stop is exactly one real panel, including the last.
    await resize(1440);await jump(1);await evaluate(`document.querySelector('${slider}').focus()`);
    for(const numbers of (await panels()).slice(1)){await key(direction==='rtl'?'ArrowLeft':'ArrowRight',direction==='rtl'?37:39);await expect(numbers[0]);}
    await key('Home',36);await expect(1);await key('End',35);await expect(24);
    // Draft changes only the one counter. No intermediate image/preload.
    await jump(3);await until("[...document.querySelectorAll('[data-horizontal-rail] img')].every(img=>img.naturalWidth>0)");
    const sources=await evaluate("[...document.querySelectorAll('[data-rail-panel=current] img')].map(img=>img.src)");
    const before=requests.length;
    await mouse('mousePressed',await point(3),1);await mouse('mouseMoved',await point(13),1);await until(`${current}===13`);
    assert.equal(await evaluate(actual),'3-4');assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-rail-panel=current] img')].map(img=>img.src)"),sources);
    assert.equal(requests.slice(before).filter(url=>url.includes('/assets/mangaka/')).length,0);
    await evaluate(`window.__forcedCounterTrace=[];window.__forcedCounterObserver=new MutationObserver(()=>window.__forcedCounterTrace.push(${current}));window.__forcedCounterObserver.observe(document.querySelector('[data-reader-pagination] > p > span'),{childList:true,characterData:true,subtree:true})`);
    await mouse('mouseReleased',await point(13));await expect(13);
    await frame();assert.ok((await evaluate('window.__forcedCounterTrace')).every(page=>page===13),'No old counter flash at forced-panel commit');await evaluate('window.__forcedCounterObserver.disconnect()');
    await mouse('mousePressed',await point(13),1);await mouse('mouseMoved',await point(3),1);await until(`${current}===3`);
    await evaluate('document.activeElement.blur()');await mouse('mouseReleased',await point(3));await expect(13);
    await jump(3);await mode('vertical',locale);
    assert.equal(await evaluate("document.querySelectorAll('[data-page-group=\"3-4\"]').length"),0,'Horizontal-only pair never groups vertically');
    await mode('horizontal',locale);await expect(3);
    await click('[data-horizontal-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='hidden'");
    assert.equal(await evaluate(actual),'3-4');await click('[data-horizontal-click-zones] button:nth-child(2)');
    await until("getComputedStyle(document.querySelector('[data-reader-pagination]')).opacity==='1'");
    // Native touch slider still previews once, commits once; swipe crosses panels.
    await resize(390);await jump(1);await command('Emulation.setTouchEmulationEnabled',{enabled:true});
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(1)]});
    await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[await point(3)]});await until(`${current}===3`);assert.equal(await evaluate(actual),'1');
    await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(3);
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(3)]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[await point(8)]});await command('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(3);
    await evaluate('document.activeElement?.blur()');
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:400}]});await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:400}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(5);
    await command('Emulation.setTouchEmulationEnabled',{enabled:false});
    if(await evaluate('document.fullscreenEnabled')){
      await jump(3);const p=await evaluate(`(()=>{const r=document.querySelector('[aria-label=${JSON.stringify(getTranslations(locale).mangaReader.enterFullscreen)}]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await mouse('mousePressed',p,1);await mouse('mouseReleased',p);await until('document.fullscreenElement');await jump(5);await jump(3);
      assert.equal(await evaluate("document.querySelectorAll('[data-rail-panel=current] img').length"),2);
      await evaluate('document.exitFullscreen()');await until('!document.fullscreenElement');
    }
  }
  // The same pair can coexist in both modes; unconfigured FR keeps its automatic panels.
  await navigate('mangas/'+slug,'en','light',false,'&readerNavHorizontalSpreads=1&readerNavVerticalSpreads=1');await until(`document.querySelector('${slider}')`);await resize(1440);await jump(3);
  await mode('vertical','en');assert.equal(await evaluate("document.querySelectorAll('[data-page-group=\"3-4\"]').length"),1);await mode('horizontal','en');await expect(3);
  await click('[data-reader-language-trigger]');await until("document.querySelector('[data-reader-language-menu]')");await evaluate("[...document.querySelectorAll('[data-reader-language-menu] button')].find(el=>el.textContent.includes('Français')).click()");await until("document.querySelector('main').dataset.readerLanguage==='fr'");
  assert.equal(await evaluate(actual),'2-3');assert.equal(await evaluate(`document.querySelector('${slider}').max`),'12');
  console.log(`Forced horizontal Chromium QA: ${checks} viewport/locale/direction checks; real stops, mouse/touch preview/commit/cancel, no intermediate preload, original swipe/keys/arrows, fullscreen, hidden UI, both/independent modes and language replacement OK.`);
}
