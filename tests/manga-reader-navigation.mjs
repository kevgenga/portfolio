import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTranslations } from "../src/i18n/locale.js";
import { getHorizontalReadingPanels, getReadingPanelIndex } from "../src/components/manga/readerPagination.js";

const readerCSS = readFileSync(new URL('../src/components/manga/ReaderNavigation.css', import.meta.url), 'utf8');
const backgroundFor = part => `rgba(0, 0, 0, ${Number(readerCSS.match(new RegExp(`--reader-${part}-bg-opacity:\\s*([\\d.]+)`))[1])})`;

// Uses the existing isolated Vite/Chrome harness and read-only in-memory fixtures.
export async function verifyMangaReaderNavigation({evaluate,command,until,click,navigate,capture,slug,requests}) {
  const slider='[data-reader-page-slider] input';
  const current="Number(document.querySelector('[data-reader-pagination] > p > span').textContent.split('/')[0])";
  const displayed="Number(document.querySelector('[data-horizontal-pages]').dataset.horizontalPages.split('-')[0])";
  const noBubble=async()=>assert.equal(await evaluate("document.querySelectorAll('[data-reader-page-slider] output,[data-reader-page-slider] [role=tooltip],[data-reader-page-slider] [title],.reader-page-slider__preview').length"),0);
  const frame=()=>evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const immersiveGeometry=()=>evaluate(`(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const header=document.querySelector('[data-reader-header]'),footer=document.querySelector('[data-reader-pagination]');
    return {width:innerWidth,height:innerHeight,stage:rect(document.querySelector('[data-horizontal-stage]')),
      pageBackgrounds:[document.querySelector('main'),document.querySelector('[data-horizontal-stage]'),...document.querySelectorAll('[data-rail-panel=current] img')].map(el=>getComputedStyle(el).backgroundColor),
      scrollOverflow:document.scrollingElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth,
      headerBackground:getComputedStyle(header.firstElementChild).backgroundColor,footerBackground:getComputedStyle(footer).backgroundColor,
      opacities:[header,header.firstElementChild,header.querySelector('h1'),...header.querySelectorAll('button'),footer,footer.querySelector('input'),footer.querySelector('p'),footer.querySelector('p > span')].map(el=>getComputedStyle(el).opacity),
      images:[...document.querySelectorAll('[data-rail-panel=current] img')].map(img=>{const r=rect(img),scale=Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;return {src:img.src,rect:r,fit:getComputedStyle(img).objectFit,position:getComputedStyle(img).objectPosition,paint:{left:r.left+(r.width-w)/2,top:r.top+(r.height-h)/2,width:w,height:h},ratio:img.naturalWidth/img.naturalHeight}})};
  })()`);
  const assertImmersive=async()=>{
    await until("[...document.querySelectorAll('[data-rail-panel=current] img')].every(img=>img.naturalWidth>0)");
    await until("getComputedStyle(document.querySelector('[data-reader-header]')).opacity==='1'&&getComputedStyle(document.querySelector('[data-reader-pagination]')).opacity==='1'");
    const g=await immersiveGeometry();
    assert.ok(g.pageBackgrounds.every(color=>color==='rgb(15, 15, 15)'),`Horizontal letterboxes match the desktop background: ${JSON.stringify(g.pageBackgrounds)}`);
    assert.equal(g.scrollOverflow,false,JSON.stringify(g));assert.ok(Math.abs(g.stage.top)<1&&Math.abs(g.stage.height-g.height)<1);
    assert.equal(g.headerBackground,backgroundFor('header'));assert.equal(g.footerBackground,backgroundFor('footer'));
    assert.ok(g.opacities.every(opacity=>opacity==='1'),`Only backgrounds are translucent, not visible controls: ${JSON.stringify(g.opacities)}`);
    for(const img of g.images){
      assert.equal(img.fit,'contain');assert.equal(img.position,'50% 50%');
      assert.ok(Math.abs(img.rect.height-g.height)<1,'Image uses full immersive height');
      assert.ok(img.paint.left>=-1&&img.paint.left+img.paint.width<=g.width+1&&img.paint.top>=-1&&img.paint.top+img.paint.height<=g.height+1);
      assert.ok(Math.abs(img.paint.width/img.paint.height-img.ratio)<.001,'Complete painted image preserves its native ratio');
      assert.ok(Math.abs(img.paint.top+img.paint.height/2-g.height/2)<1,'Art is vertically centered, even when width-limited');
    }
    const ordered=g.images.toSorted((a,b)=>a.rect.left-b.rect.left);
    assert.ok(Math.abs((ordered[0].rect.left+ordered.at(-1).rect.right)/2-g.width/2)<1,'Panel is horizontally centered');
    if(ordered.length===2)assert.ok(Math.abs(ordered[0].rect.right-ordered[1].rect.left)<1,'Existing spread has no added gutter');
    return g;
  };
  const resize=async(width,height=844)=>{
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});await frame();
    // ResizeObserver -> React can settle after the compositor's resize frame.
    // Never take a single-page index from the previous responsive layout.
    await until("!document.querySelector('main[data-reader-mode=horizontal]')||document.querySelector('main').dataset.pageDisplay===(document.querySelector('main').getBoundingClientRect().width>=900?'double':'single')");
  };
  const key=async(key,code)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code})};
  const mode=async(value,locale='en')=>{await click(`[data-reader-header] [role=group] button[aria-label=${JSON.stringify(getTranslations(locale).mangaReader.mode+': '+getTranslations(locale).mangaReader[value])}]`);await until(`document.querySelector('main').dataset.readerMode===${JSON.stringify(value)}`);await frame()};
  const panelIndex=async page=>{
    const {display,count}=await evaluate("({display:document.querySelector('main').dataset.pageDisplay,count:Number(document.querySelector('[data-reader-pagination] > p > span').textContent.split('/')[1])})");
    return getReadingPanelIndex(getHorizontalReadingPanels(display,count),page);
  };
  const point=async page=>{
    const index=await panelIndex(page);
    return evaluate(`(()=>{const el=document.querySelector('${slider}'),r=el.getBoundingClientRect(),thumb=parseFloat(getComputedStyle(el.parentElement).getPropertyValue('--reader-slider-thumb-size')),ratio=Number(el.max)>0?${index}/Number(el.max):0;return {x:el.dir==='rtl'?r.right-thumb/2-ratio*(r.width-thumb):r.left+thumb/2+ratio*(r.width-thumb),y:r.y+r.height/2}})()`);
  };
  const mouse=async(type,p,buttons=0)=>command('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'&&!buttons?'none':'left',buttons,clickCount:1});
  const trackClick=async page=>{const p=await point(page);await mouse('mousePressed',p,1);await mouse('mouseReleased',p)};
  const expect=async(page,panels=String(page))=>{
    await until(`${current}===${page}&&document.querySelector('[data-horizontal-pages]')?.dataset.horizontalPages===${JSON.stringify(panels)}`);
    const index=await panelIndex(page);
    await until(`document.querySelector('${slider}')?.value===${JSON.stringify(String(index))}`);
    assert.equal(await evaluate("document.querySelectorAll('[data-rail-panel=current]').length"),1);
  };
  await resize(768,900);await navigate('mangas/'+slug);await until(`document.querySelector('${slider}')`);await expect(1);
  await until("[...document.querySelectorAll('[data-horizontal-rail] img')].every(img=>img.naturalWidth>0)");
  assert.equal(await evaluate(`document.querySelector('${slider}').max`),'23');
  await command('Page.bringToFront');
  // Real mouse drag: no page/image request for any intermediate value before
  // release, then exactly the existing target/adjacent panels are prepared.
  await command('Network.setCacheDisabled',{cacheDisabled:true});
  const beforeRequests=requests.length,start=await point(1),target=await point(20);
  await mouse('mouseMoved',start);
  await mouse('mousePressed',start,1);
  for(const fraction of [.25,.5,.75,1])await mouse('mouseMoved',{x:start.x+(target.x-start.x)*fraction,y:start.y},1);
  await until(`document.querySelector('${slider}').value==='19'`);
  assert.equal(await evaluate(current),20);assert.equal(await evaluate(displayed),1);await noBubble();
  assert.equal(await evaluate("document.querySelector('[data-horizontal-pages]').dataset.horizontalPages"),'1');
  assert.equal(requests.slice(beforeRequests).filter(url=>/\/assets\/mangaka\//.test(url)).length,0,'Dragging previews only, never preloads intermediate pages');
  await mouse('mouseReleased',target);await expect(20);
  const targetSources=await evaluate("[...document.querySelectorAll('[data-horizontal-rail] img')].map(img=>img.src)");
  for(const url of requests.slice(beforeRequests).filter(url=>/\/assets\/mangaka\//.test(url)))assert.ok(targetSources.includes(url),url);
  await trackClick(6);await expect(6);
  await evaluate(`document.querySelector('${slider}').focus()`);await key('ArrowLeft',37);await expect(7);
  await key('ArrowRight',39);await expect(6);await key('Home',36);await expect(1);await key('End',35);await expect(24);
  await key('Home',36);await expect(1);
  await resize(390);
  await command('Emulation.setTouchEmulationEnabled',{enabled:true});
  const a=await point(1),b=await point(15);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
  for(const fraction of [.3,.6,1])await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*fraction,y:a.y}]});
  await until(`document.querySelector('${slider}').value==='14'`);
  assert.equal(await evaluate(current),15);assert.equal(await evaluate(displayed),1);await noBubble();
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(15);
  await evaluate(`document.querySelector('${slider}').focus()`);await key('Home',36);await expect(1);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(1)]});
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[await point(12)]});
  await until(`document.querySelector('${slider}').value==='11'`);
  assert.equal(await evaluate(current),12);assert.equal(await evaluate(displayed),1);
  await command('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(1);
  await evaluate(`document.querySelector('${slider}').focus()`);await key('ArrowLeft',37);await expect(2);
  await trackClick(15);await expect(15);
  // A normal RTL rail swipe still moves 1:1 and then updates the new slider.
  await evaluate('document.activeElement?.blur()');
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:400}]});
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:140,y:400}]});
  await frame();
  const railOffset=await evaluate("new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-horizontal-rail]')).transform).m41+document.querySelector('[data-horizontal-stage]').clientWidth");
  assert.ok(Math.abs(railOffset-60)<2,`Original rail follows the finger 1:1: ${railOffset}`);
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:400}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(16);
  await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  await resize(1440,900);await expect(16,'16-17');await trackClick(15);await expect(14,'14-15');
  await trackClick(24);await expect(24,'24');
  // Native desktop range now has exactly 13 real stops, not 24 image stops.
  await trackClick(1);await expect(1);assert.equal(await evaluate(`document.querySelector('${slider}').max`),'12');
  const panelStarts=[1,2,4,6,8,10,12,14,16,18,20,22,24];
  await evaluate(`document.querySelector('${slider}').focus()`);
  for(const page of panelStarts.slice(1)){
    await key('ArrowLeft',37);await expect(page,page===24?'24':`${page}-${page+1}`);
  }
  await key('Home',36);await expect(1);
  const beforeSpreadRequests=requests.length,spreadStart=await point(1),spreadEnd=await point(20);
  await mouse('mousePressed',spreadStart,1);
  for(const fraction of [.15,.3,.45,.6,.75,.9,1]){
    await mouse('mouseMoved',{x:spreadStart.x+(spreadEnd.x-spreadStart.x)*fraction,y:spreadStart.y},1);
    await frame();
    const preview=await evaluate(`({index:Number(document.querySelector('${slider}').value),counter:${current},aria:document.querySelector('${slider}').getAttribute('aria-valuetext')})`);
    const page=panelStarts[preview.index];
    assert.equal(preview.counter,page);
    assert.equal(preview.aria,page===1||page===24?`Page ${page} of 24`:`Pages ${page}–${page+1} / 24`);
    assert.equal(await evaluate(displayed),1);await noBubble();
  }
  assert.equal(requests.slice(beforeSpreadRequests).filter(url=>/\/assets\/mangaka\//.test(url)).length,0);
  assert.equal(await evaluate(current),20);
  await capture('reader-panels-desktop-drag-20-21');
  await mouse('mouseReleased',spreadEnd);await expect(20,'20-21');await frame();
  await until("[...document.querySelectorAll('[data-rail-panel=current] img')].every(img=>img.naturalWidth>0)");
  await capture('reader-panels-desktop-committed-20-21');
  await noBubble();
  // Requested UX: the same bottom counter previews 10 -> 12 -> 24 while
  // the actual spread, media and production metadata remain on page 10.
  const visibleSources=()=>evaluate("[...document.querySelectorAll('[data-rail-panel=current] img')].map(img=>img.src)");
  const movePreview=async(targetPage,sourcePage)=>{
    await mouse('mouseMoved',await point(targetPage),1);await until(`${current}===${targetPage}`);
    assert.equal(await evaluate(displayed),sourcePage);await noBubble();
  };
  await trackClick(10);await expect(10,'10-11');
  await until("[...document.querySelectorAll('[data-horizontal-rail] img')].every(img=>img.naturalWidth>0)");
  const source10=await visibleSources(),beforeDragRequests=requests.length;
  const originalMetadata=await evaluate("document.querySelector('[data-reader-production-times]')?.textContent||''");
  await evaluate("window.__counterElement=document.querySelector('[data-reader-pagination] > p > span');void 0");
  await mouse('mousePressed',await point(10),1);
  await movePreview(12,10);await movePreview(24,10);
  assert.deepEqual(await visibleSources(),source10);
  assert.equal(await evaluate("document.querySelector('[data-reader-production-times]')?.textContent||''"),originalMetadata);
  assert.equal(await evaluate("document.querySelector('[data-reader-pagination] > p > span')===window.__counterElement"),true);
  assert.equal(requests.slice(beforeDragRequests).filter(url=>/\/assets\/mangaka\//.test(url)).length,0);
  await capture('reader-counter-drag-24-image-10');
  await evaluate(`window.__counterTrace=[];window.__counterObserver=new MutationObserver(()=>window.__counterTrace.push(${current}));window.__counterObserver.observe(window.__counterElement,{childList:true,characterData:true,subtree:true})`);
  const releaseOutside=await point(24);
  await mouse('mouseReleased',{x:releaseOutside.x,y:releaseOutside.y-100});await expect(24);await frame();
  assert.ok((await evaluate('window.__counterTrace')).every(page=>page===24),'No transient return to the old counter on release');
  await evaluate('window.__counterObserver.disconnect()');
  await until("[...document.querySelectorAll('[data-rail-panel=current] img')].every(img=>img.naturalWidth>0)");
  await capture('reader-counter-committed-24');
  await mouse('mousePressed',await point(24),1);await movePreview(6,24);
  await mouse('mouseReleased',await point(6));await expect(6,'6-7');
  await trackClick(10);await expect(10,'10-11');
  await mouse('mousePressed',await point(10),1);await movePreview(24,10);await movePreview(4,10);
  await mouse('mouseReleased',await point(4));await expect(4,'4-5');
  // Blurring cancels the draft, including late events from the abandoned drag.
  await trackClick(10);await expect(10,'10-11');
  await mouse('mousePressed',await point(10),1);await movePreview(20,10);
  await evaluate('document.activeElement.blur()');await expect(10,'10-11');
  await mouse('mouseMoved',await point(24),1);await expect(10,'10-11');
  await mouse('mouseReleased',await point(24));await expect(10,'10-11');
  // A newer arrow navigation wins over the old uncommitted destination.
  await mouse('mousePressed',await point(10),1);await movePreview(20,10);
  await click('[data-horizontal-stage] > button:first-of-type');await expect(12,'12-13');
  await mouse('mouseMoved',await point(24),1);await mouse('mouseReleased',await point(24));await expect(12,'12-13');
  await trackClick(10);await expect(10,'10-11');
  await mouse('mousePressed',await point(10),1);await movePreview(20,10);
  await click('[data-horizontal-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='hidden'");
  assert.equal(await evaluate(current),10);
  await click('[data-horizontal-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='visible'");
  await mouse('mouseReleased',await point(24));await expect(10,'10-11');
  // A mode switch unmounts the draft, leaving vertical observation untouched.
  await trackClick(10);await expect(10,'10-11');
  await mouse('mousePressed',await point(10),1);await movePreview(20,10);
  await mode('vertical');await until(`!document.querySelector('${slider}')`);
  assert.notEqual(await evaluate(current),20);
  await mouse('mouseReleased',{x:30,y:750});await mode('horizontal');
  await trackClick(10);await expect(10,'10-11');
  // Tablet touch uses double panels too, with no rail gesture leaked by the slider.
  await resize(1024);await trackClick(1);await expect(1);
  await command('Emulation.setTouchEmulationEnabled',{enabled:true});
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(1)]});
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[await point(6)]});
  await until(`${current}===6`);
  assert.equal(await evaluate(displayed),1);await noBubble();
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(6,'6-7');
  await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  await resize(1440,900);
  // Odd last page opens the containing spread, never an invented slide.
  await navigate('mangas/3');await until(`document.querySelector('${slider}')?.max==='15'`);await trackClick(31);await expect(30,'30-31');
  await navigate('mangas/2');await until(`document.querySelector('${slider}')?.max==='7'`);await trackClick(14);await expect(14,'14');
  await trackClick(1);await expect(1);await evaluate(`document.querySelector('${slider}').focus()`);await key('ArrowLeft',37);await expect(2,'2-3');
  await key('End',35);await expect(14);
  await navigate('mangas/'+slug,'en','light',false,'&readerNavSinglePage=1');await until(`document.querySelector('${slider}')?.disabled`);await expect(1);
  assert.equal(await evaluate(`document.querySelector('${slider}').min`),'0');assert.equal(await evaluate(`document.querySelector('${slider}').max`),'0');
  assert.equal(await evaluate("document.querySelectorAll('[data-rail-panel=current] img').length"),1);
  await trackClick(1);await expect(1);
  await resize(390);await expect(1);assert.equal(await evaluate(`document.querySelector('${slider}').disabled`),true);
  // LTR metadata affects the native range direction only, not the established rail.
  await resize(390);await navigate('mangas/'+slug,'en','light',false,'&readerNavLtr=1');await until(`document.querySelector('${slider}')?.dir==='ltr'`);
  await trackClick(6);await expect(6);await evaluate(`document.querySelector('${slider}').focus()`);await key('ArrowRight',39);await expect(7);await key('ArrowLeft',37);await expect(6);
  await navigate('mangas/'+slug,'en','light',false,'&readerNavShortFrench=1');await until(`document.querySelector('${slider}')?.dir==='rtl'`);await trackClick(20);await expect(20);
  await click('[data-reader-language-trigger]');await until("document.querySelector('[data-reader-language-menu]')");
  await evaluate("[...document.querySelectorAll('[data-reader-language-menu] button')].find(el=>el.textContent.includes('Français')).click()");
  await until(`document.querySelector('${slider}').max==='13'`);await expect(14);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify('manga-language:'+slug)})`),'fr');
  // Live interface i18n is separate from the language of the manga images.
  await evaluate("history.replaceState(history.state,'',location.pathname+'?lang=ja&readerNavShortFrench=1');dispatchEvent(new PopStateEvent('popstate'))");
  await until(`document.querySelector('${slider}').getAttribute('aria-label')==='ページへ移動'`);
  assert.equal(await evaluate("document.querySelector('main').dataset.readerLanguage"),'fr');
  await click('[data-horizontal-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='hidden'");
  assert.equal(await evaluate("document.querySelector('[data-reader-pagination]').inert"),true);
  await evaluate(`document.querySelector('${slider}').focus()`);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('${slider}')`),false);
  await click('[data-horizontal-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='visible'");

  // Language replacement during a desktop drag cancels the previous panel draft.
  await resize(1440,900);await navigate('mangas/'+slug,'en','light',false,'&readerNavShortFrench=1');
  await until(`document.querySelector('${slider}')?.max==='12'`);await trackClick(20);await expect(20,'20-21');
  await mouse('mousePressed',await point(20),1);await mouse('mouseMoved',await point(8),1);await until(`${current}===8`);assert.equal(await evaluate(displayed),20);
  await click('[data-reader-language-trigger]');await until("document.querySelector('[data-reader-language-menu]')");
  await evaluate("[...document.querySelectorAll('[data-reader-language-menu] button')].find(el=>el.textContent.includes('Français')).click()");
  await until(`document.querySelector('${slider}')?.max==='7'`);await expect(14);
  await mouse('mouseReleased',await point(14));await expect(14);await noBubble();

  await navigate('mangas/'+slug,'en','light',false,'&readerNavLtr=1');await until(`document.querySelector('${slider}')?.dir==='ltr'`);
  await trackClick(4);await expect(4,'4-5');await evaluate(`document.querySelector('${slider}').focus()`);await key('ArrowRight',39);await expect(6,'6-7');
  await key('ArrowLeft',37);await expect(4,'4-5');await key('End',35);await expect(24);

  let layouts=0;
  for(const locale of ['en','fr','ja']){
    await resize(390);await navigate('mangas/'+slug,locale);await until(`document.querySelector('${slider}')?.getAttribute('aria-label')===${JSON.stringify(getTranslations(locale).mangaReader.goToPage)}`);
    await key('Shift',16);await until("!document.querySelector('[data-reader-tutorial]')");
    for(const width of [320,360,375,390,430,768,1024,1440,1920]){
      await resize(width,width===1440?900:844);await frame();
      const m=await evaluate(`(()=>{const range=document.querySelector('${slider}'),r=range.getBoundingClientRect(),counter=document.querySelector('[data-reader-pagination] > p').getBoundingClientRect(),footer=document.querySelector('[data-reader-pagination]').getBoundingClientRect();return {width:innerWidth,height:innerHeight,rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height},counterTop:counter.top,footerTop:footer.top,images:[...document.querySelectorAll('[data-rail-panel=current] img')].map(img=>{const b=img.getBoundingClientRect();return {top:b.top,bottom:b.bottom,fit:getComputedStyle(img).objectFit}}),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
      assert.equal(m.overflow,false,JSON.stringify({locale,width,m}));assert.ok(m.rect.left>=0&&m.rect.right<=width&&m.rect.height>=44);assert.ok(m.rect.bottom<=m.counterTop+1);
      assert.ok(Math.abs((m.rect.left+m.rect.right)/2-width/2)<1,'Slider stays centered');
      assert.ok(Math.abs(m.rect.right-m.rect.left-Math.min(width,1120)+32)<1,'Responsive track caps at 1088px, retaining mobile gutters');
      const counterStyle=await evaluate("(()=>{const p=document.querySelector('[data-reader-pagination] > p'),s=getComputedStyle(p.firstElementChild);return {fontSize:parseFloat(s.fontSize),weight:s.fontWeight,paddingTop:getComputedStyle(p).paddingTop}})()");
      assert.ok(counterStyle.fontSize>=14&&counterStyle.fontSize<=16);assert.equal(counterStyle.weight,'700');assert.equal(counterStyle.paddingTop,'2px');
      // Controls now overlay the full-height stage instead of reserving space.
      await assertImmersive();
      // The existing counter alone previews the destination, without moving it.
      await evaluate(`document.querySelector('${slider}').focus()`);await key('Home',36);await expect(1);
      await mouse('mousePressed',await point(1),1);await mouse('mouseMoved',await point(4),1);
      await until(`${current}===4`);await noBubble();
      const preview=await evaluate("(()=>{const p=document.querySelector('[data-reader-pagination] > p').getBoundingClientRect();return {left:p.left,right:p.right,top:p.top}})()");
      assert.ok(preview.left>=0&&preview.right<=width);assert.equal(preview.top,m.counterTop);
      assert.equal(await evaluate(displayed),1);
      if(width===390||width===1440)await capture(`reader-panel-preview-${locale}-${width}`);
      await mouse('mouseReleased',await point(4));await expect(4,width>=900?'4-5':'4');
      // Without production metadata, the numeral itself is exactly centered.
      const counterGeometry=await evaluate("(()=>{const r=document.querySelector('[data-reader-pagination] > p > span').getBoundingClientRect(),input=document.querySelector('[data-reader-page-slider] input').getBoundingClientRect();return {center:(r.left+r.right)/2,gap:r.top+r.height/2-input.top-input.height/2,bottom:r.bottom,height:innerHeight}})()");
      assert.ok(Math.abs(counterGeometry.center-width/2)<1);assert.ok(counterGeometry.gap<43,'Counter is closer to the track');assert.ok(counterGeometry.height-counterGeometry.bottom>=18,'Counter keeps bottom breathing room');
      if(width===390||width===1440||width===1920)await capture(`reader-slider-finish-${locale}-${width}`);
      const visibleGeometry=await assertImmersive();
      if(width===390||width===1440||width===1920){
        await capture(`reader-immersive-${locale}-${width}-visible`);
        await click('[data-horizontal-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='hidden'");
        await until("getComputedStyle(document.querySelector('[data-reader-header]')).opacity==='0'&&getComputedStyle(document.querySelector('[data-reader-pagination]')).opacity==='0'");
        const hiddenGeometry=await immersiveGeometry();
        assert.deepEqual(hiddenGeometry.images,visibleGeometry.images,'Hiding controls reveals the art without resizing or cropping it');
        assert.equal(await evaluate("document.querySelector('[data-reader-pagination]').inert"),true);
        await capture(`reader-immersive-${locale}-${width}-hidden`);
        await click('[data-horizontal-click-zones] button:nth-child(2)');await until("document.querySelector('main').dataset.readerInterface==='visible'");
        assert.deepEqual((await assertImmersive()).images,visibleGeometry.images);
      }
      await trackClick(1);await expect(1);
      if(width===390||width===1440)await capture(`reader-slider-${locale}-${width}`);
      layouts++;
    }
    // The requested ~1650px desktop composition is identical in both themes.
    for(const theme of ['light','dark']){
      await resize(1650,900);await navigate('mangas/'+slug,locale,theme);await until(`document.querySelector('${slider}')`);
      await trackClick(4);await expect(4,'4-5');
      const finish=await evaluate("(()=>{const r=document.querySelector('[data-reader-page-slider] input').getBoundingClientRect(),s=getComputedStyle(document.querySelector('[data-reader-pagination] > p > span'));return {width:r.width,center:(r.left+r.right)/2,font:parseFloat(s.fontSize),color:s.color}})()");
      assert.equal(finish.width,1088);assert.equal(finish.center,825);assert.equal(finish.font,16);assert.equal(finish.color,'rgb(244, 241, 232)');
      await capture(`reader-slider-finish-${locale}-${theme}-1650`);layouts++;
    }
    await mode('vertical',locale);assert.equal(await evaluate(`document.querySelectorAll('${slider}').length`),0);
    for(const width of [320,390,768,1440,1920]){
      await resize(width,width===1440?900:844);await until("document.querySelector('[data-vertical-reader] img')?.naturalWidth>0");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-vertical-reader] img')).backgroundColor"),'rgb(255, 255, 255)','Vertical image background remains unchanged');
      for(const page of [1,2,3,2,1]){
        await evaluate(`(()=>{const el=document.querySelector('[data-vertical-reader] [data-page="${page}"]'),r=el.getBoundingClientRect(),header=document.querySelector('[data-reader-header]').getBoundingClientRect(),footer=document.querySelector('[data-reader-pagination]').getBoundingClientRect(),line=(header.bottom+footer.top)/2;document.scrollingElement.scrollTop=scrollY+r.top+r.height/2-line})()`);
        await until(`${current}===${page}`);
      }
      layouts++;
    }
  }

  // Reproduce the reported cover at 375 x 667: contain leaves ~68px above
  // and below the artwork, now painted by CSS rather than changing its pixels.
  await resize(375,667);await navigate('mangas/'+slug);await until(`document.querySelector('${slider}')`);await expect(1);
  const cover=await assertImmersive();
  assert.ok(cover.images[0].paint.top>60&&cover.images[0].paint.top<75);
  await click('[data-horizontal-click-zones] button:nth-child(2)');
  await until("getComputedStyle(document.querySelector('[data-reader-header]')).opacity==='0'&&getComputedStyle(document.querySelector('[data-reader-pagination]')).opacity==='0'");
  await capture('reader-cover-background-375x667');

  // Wide desktop and landscape phone/tablet use the same height-first fit.
  for(const [width,height] of [[2560,1080],[844,390],[1024,768],[768,1024]]){
    await resize(width,height);await navigate('mangas/'+slug);await until(`document.querySelector('${slider}')`);
    await trackClick(4);await expect(4,width>=900?'4-5':'4');await assertImmersive();
    await capture(`reader-immersive-${width}x${height}`);layouts++;
  }
  await evaluate("document.querySelector('main').style.setProperty('--reader-header-bg-opacity','0.80');document.querySelector('main').style.setProperty('--reader-footer-bg-opacity','1')");
  await until("getComputedStyle(document.querySelector('[data-reader-header] > header')).backgroundColor==='rgba(0, 0, 0, 0.8)'&&getComputedStyle(document.querySelector('[data-reader-pagination]')).backgroundColor==='rgb(0, 0, 0)'");
  const customized=await immersiveGeometry();assert.equal(customized.headerBackground,'rgba(0, 0, 0, 0.8)');assert.equal(customized.footerBackground,'rgb(0, 0, 0)');assert.ok(customized.opacities.every(opacity=>opacity==='1'));
  await evaluate("document.querySelector('main').style.removeProperty('--reader-header-bg-opacity');document.querySelector('main').style.removeProperty('--reader-footer-bg-opacity')");
  await resize(1440,900);await navigate('mangas/'+slug,'ja');await until(`document.querySelector('${slider}')`);
  await click('[data-reader-language-trigger]');await until("document.querySelector('[data-reader-language-menu]')");
  await evaluate("[...document.querySelectorAll('[data-reader-language-menu] button')].find(el=>el.textContent.includes('日本語')).click()");
  await until("document.querySelector('main').dataset.readerLanguage==='ja'");await trackClick(14);await expect(14,'14-15');
  assert.ok((await assertImmersive()).images.every(img=>img.src.includes('/ja/')));
  await capture('reader-immersive-japanese-14-15-visible');
  await click('[data-horizontal-click-zones] button:nth-child(2)');await until("getComputedStyle(document.querySelector('[data-reader-header]')).opacity==='0'");
  await capture('reader-immersive-japanese-14-15-hidden');

  // Real wheel input in the actual normal document scroller, no feedback calls.
  await resize(390);await navigate('mangas/'+slug);await until(`document.querySelector('${slider}')`);await mode('vertical');
  await until("document.querySelector('[data-vertical-reader] img')?.naturalWidth>0");
  await evaluate("window.__scrollIntoView=Element.prototype.scrollIntoView;window.__passiveJumps=0;Element.prototype.scrollIntoView=function(...args){window.__passiveJumps++;return window.__scrollIntoView.apply(this,args)};document.scrollingElement.scrollTop=0");
  for(const page of [2,3,2,1]){
    const deltaY=await evaluate(`(()=>{const r=document.querySelector('[data-vertical-reader] [data-page="${page}"]').getBoundingClientRect(),header=document.querySelector('[data-reader-header]').getBoundingClientRect(),footer=document.querySelector('[data-reader-pagination]').getBoundingClientRect();return r.top+r.height/2-(header.bottom+footer.top)/2})()`);
    await command('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:450,deltaX:0,deltaY});await until(`${current}===${page}`);
  }
  assert.equal(await evaluate('window.__passiveJumps'),0);
  // Native touch scroll crosses pages without triggering the click zones.
  await evaluate('document.scrollingElement.scrollTop=0');await until(`${current}===1`);
  await command('Emulation.setTouchEmulationEnabled',{enabled:true});
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:700}]});
  for(const y of [610,520,430,340,250,160]){await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y}]});await frame()}
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until('scrollY>200');
  await until("(()=>{const before=window.__touchScrollY;window.__touchScrollY=scrollY;return before!==undefined&&Math.abs(before-scrollY)<.5})()");
  assert.ok(await evaluate(`${current}>1`));assert.equal(await evaluate('window.__passiveJumps'),0);
  await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  // Scrollbar-position changes use this exact document property. Native window
  // chrome/scrollbar dragging is not routed reliably by headless CDP.
  await resize(1440,900);await evaluate('document.scrollingElement.scrollTop=0');await frame();
  await evaluate('document.scrollingElement.scrollTop=document.documentElement.scrollHeight*.4');
  await until('scrollY>200');await until(`${current}>1`);assert.equal(await evaluate('window.__passiveJumps'),0);
  await capture('reader-vertical-en-1440');
  await resize(390);await evaluate('document.scrollingElement.scrollTop=0');await until(`${current}===1`);
  await capture('reader-vertical-en-390');
  // Very tall page and late load/layout change: same image/page DOM, no real media writes.
  await evaluate("(()=>{const img=document.querySelector('[data-vertical-reader] img');img.style.maxHeight='none';img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"5000\"><rect width=\"800\" height=\"5000\" fill=\"white\"/></svg>')})()");
  await until("document.querySelector('[data-vertical-reader] [data-page=\"1\"]').getBoundingClientRect().height>2000");
  await evaluate('document.scrollingElement.scrollTop=1000');await until(`${current}===1`);
  await evaluate("document.scrollingElement.scrollTop=document.querySelector('[data-vertical-reader] [data-page=\"2\"]').offsetTop");await until(`${current}===2`);
  const afterPassive=await evaluate('scrollY');await frame();await frame();assert.equal(await evaluate('scrollY'),afterPassive);assert.equal(await evaluate('window.__passiveJumps'),0);
  await click('[data-vertical-click-zones] button:last-child');await until(`window.__passiveJumps>0&&${current}===3`);
  const observedBeforeMode=await evaluate(current);
  await mode('horizontal');await expect(observedBeforeMode);
  await trackClick(10);await expect(10);await evaluate("dispatchEvent(new Event('scroll'));dispatchEvent(new Event('resize'))");await frame();await expect(10);
  await mode('vertical');await until(`!document.querySelector('${slider}')`);
  await evaluate("document.scrollingElement.scrollTop=document.documentElement.scrollHeight");await until(`${current}===24`);
  await resize(844,390);await frame();assert.equal(await evaluate(`document.querySelectorAll('${slider}').length`),0);

  await navigate('mangas/'+slug,'en','light',false,'&readerNavShortFrench=1');await until(`document.querySelector('${slider}')`);await mode('vertical');
  await evaluate('document.scrollingElement.scrollTop=0');await until(`${current}===1`);
  await click('[data-reader-language-trigger]');await until("document.querySelector('[data-reader-language-menu]')");
  await evaluate("[...document.querySelectorAll('[data-reader-language-menu] button')].find(el=>el.textContent.includes('Français')).click()");
  await until("document.querySelector('main').dataset.readerLanguage==='fr'&&document.querySelectorAll('[data-vertical-reader] figure').length===14");
  await evaluate('document.scrollingElement.scrollTop=0');await until(`${current}===1`);
  assert.ok(await evaluate("document.querySelector('[data-vertical-reader] img').src.includes('/french/')"));
  assert.equal(await evaluate(`document.querySelectorAll('${slider}').length`),0);

  // Native fullscreen has its own scroll root in vertical mode.
  const enterFullscreen=async(locale='en')=>{
    const selector=`[aria-label=${JSON.stringify(getTranslations(locale).mangaReader.enterFullscreen)}]`;
    const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await mouse('mousePressed',p,1);await mouse('mouseReleased',p);await until("document.fullscreenElement===document.querySelector('main')");await frame();
  };
  if(await evaluate('document.fullscreenEnabled')){
    await resize(390);await enterFullscreen();
    assert.equal(await evaluate("getComputedStyle(document.fullscreenElement).overflowY"),'auto');
    await until('document.fullscreenElement.scrollHeight>document.fullscreenElement.clientHeight');
    for(const page of [2,3,2,1]){
      await evaluate(`(()=>{const root=document.fullscreenElement,r=root.querySelector('[data-vertical-reader] [data-page="${page}"]').getBoundingClientRect(),header=root.querySelector('[data-reader-header]').getBoundingClientRect(),footer=root.querySelector('[data-reader-pagination]').getBoundingClientRect();root.scrollTop+=r.top+r.height/2-(header.bottom+footer.top)/2})()`);await until(`${current}===${page}`);
    }
    await capture('reader-vertical-fullscreen-390');await evaluate('document.exitFullscreen()');await until('!document.fullscreenElement');
    await mode('horizontal');await enterFullscreen();await trackClick(10);await expect(10);await assertImmersive();await capture('reader-slider-fullscreen-390');
    await evaluate(`document.querySelector('${slider}').focus()`);await key('Escape',27);await until('!document.fullscreenElement');
    await resize(1920,1080);await navigate('mangas/'+slug);await until(`document.querySelector('${slider}')`);
    await enterFullscreen();await trackClick(14);await expect(14,'14-15');await assertImmersive();
    await capture('reader-immersive-fullscreen-1920');
    await evaluate('document.exitFullscreen()');await until('!document.fullscreenElement');
  }
  // Real-motion snap racing a slider jump: no delayed old action can override
  // the explicit destination. The existing rail maths/transition are unchanged.
  await resize(390);await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await until("!matchMedia('(prefers-reduced-motion: reduce)').matches");
  // Framer Motion reads this preference once at mount. Start a fresh Reader
  // under the selected media setting rather than changing its existing engine.
  await navigate('mangas/'+slug);await until(`document.querySelector('${slider}')`);await expect(1);
  await trackClick(1);await expect(1);await evaluate('document.activeElement?.blur()');
  await command('Emulation.setTouchEmulationEnabled',{enabled:true});
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:400}]});
  await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:400}]});await frame();
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const transition=await evaluate("document.querySelector('[data-horizontal-rail]').style.transition");
  assert.ok(transition.includes('210ms'),transition);
  await trackClick(10);await expect(10);await evaluate('new Promise(resolve=>setTimeout(resolve,400))');await expect(10);
  await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  await evaluate('document.activeElement?.blur()');await key('ArrowLeft',37);await expect(11);
  await click('[data-horizontal-stage] > button:first-of-type');await expect(12);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate('window.__readerBeforeReload=true');
  await command('Page.reload');await until(`!window.__readerBeforeReload&&document.querySelector('${slider}')`);await expect(1);
  assert.equal(await evaluate("document.querySelector('main').dataset.readerMode"),'horizontal');
  await mouse('mousePressed',await point(1),1);await movePreview(20,1);
  await click('[data-reader-header] nav a');
  await until("location.pathname==='/portfolio/mangaka'&&Boolean(document.querySelector('.manga-card'))");
  await mouse('mouseReleased',{x:1,y:1});
  assert.equal(await evaluate(`document.querySelectorAll('${slider}').length`),0);
  console.log(`Reader navigation Chrome QA: ${layouts} layout/locale checks; real panel stops, single dynamic bottom counter/no bubble, unchanged image during draft, no counter flicker on commit, mouse/touch/keyboard/outside release, cancellation/blur/newer navigation/mode/language/unmount, RTL+LTR, 1/14/24/31 pages, direct jumps/no intermediate preload, original swipe, vertical/fullscreen and production metadata OK.`);
}
