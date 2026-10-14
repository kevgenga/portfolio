import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { createServer } from "vite";
import { sitePresentation } from "../src/content/sitePresentation.js";
import { getTranslations } from "../src/i18n/locale.js";

// Vite transform fixtures exist only in this isolated test server's memory.
// No catalog, image, Admin, Reader preference or deployment file is rewritten.
const root = path.resolve(import.meta.dirname, "..");
const artworkSource = await readFile(path.join(root,"src/content/artworks.js"),"utf8");
const mangaSource = await readFile(path.join(root,"src/content/mangas.js"),"utf8");
const evaluateCatalog = (source,result) => vm.runInNewContext(source.replace(/^import[^\n]+\n/m,"").replace(/export const /g,"const ")+`;${result}`,{assetPath:value=>value},{timeout:2000});
const realArtworks = evaluateCatalog(artworkSource,"artworks");
const day = value => {const [d,m,y]=value.split("-").map(Number);return Date.UTC(y,m-1,d)};
const selectedArtworks = realArtworks.filter(a=>!a.hidden&&a.category.includes("illustrations")).sort((a,b)=>day(b.date)-day(a.date)).slice(0,5);
assert.equal(selectedArtworks.length,5);
const realMangas = evaluateCatalog(mangaSource,"mangas");
const selectedManga = realMangas.find(m=>m.slug===sitePresentation.selectedMangaSlugs[0]);
assert.ok(selectedManga.languages.en?.pages.length>=3 && selectedManga.languages.fr?.pages.length>=2);
const ids = selectedArtworks.map(a=>a.id), slug=selectedManga.slug;
const durations=[{minutes:60,kind:"actual"},{minutes:150,kind:"estimated"},undefined,{minutes:0,kind:"actual"},{minutes:300,kind:"actual"}];
const groups=[{id:"fixture-group-one",artworkIds:ids.slice(0,2),time:{minutes:480,kind:"actual"}},{id:"fixture-group-two",artworkIds:ids.slice(0,3),time:{minutes:720,kind:"estimated"}},{id:"fixture-private",artworkIds:[ids[0],"private-missing"],time:{minutes:9999,kind:"actual"}}];
const production={total:{minutes:15000,kind:"estimated"},pages:[{id:"drawing-1",time:{minutes:45,kind:"actual"}},{id:"drawing-2",time:{minutes:180,kind:"actual"}},{id:"drawing-3",time:{minutes:300,kind:"estimated"}}],bindings:[{path:selectedManga.languages.en.pages[0],pageId:"drawing-1"},{path:selectedManga.languages.en.pages[1],pageId:"drawing-2"},{path:selectedManga.languages.en.pages[2],pageId:"drawing-3"},{path:"/portfolio/"+selectedManga.languages.fr.pages[0],pageId:"drawing-1"}],groups:[{id:"fixture-manga-group",pageIds:["drawing-1","drawing-2"],time:{minutes:1080,kind:"actual"}}]};
const temporary=await mkdtemp(path.join(tmpdir(),"kevgenga-public-production-"));
let server,browser,socket;
const errors=[],requests=[],results=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  server=await createServer({root,cacheDir:path.join(temporary,"vite-cache"),server:{host:"127.0.0.1",port:0,open:false},plugins:[{
    name:"read-only-production-fixtures",enforce:"pre",transform(source,id){
      if(id.replaceAll("\\","/").endsWith("/src/content/productionTimeBadgeSettings.js"))return `const query=new URLSearchParams(window.location.search);export const productionTimeBadgeSettings={colorMode:query.get('fixtureBadgeMode')||'tiered',placement:query.get('fixtureBadgePlacement')||'top-right',thresholds:query.has('fixtureBadgeThresholds')?{medium:180,long:360}:{medium:120,long:240}};`;
      if(id.replaceAll("\\","/").endsWith("/src/content/artworks.js"))return source+`\nfor(const artwork of artworks)delete artwork.productionTime;\n${/export\s+const\s+artworkProductionGroups\b/.test(source)?"artworkProductionGroups.splice(0);":"export const artworkProductionGroups=[];"}\nif(!new URLSearchParams(window.location.search).has('fixtureWithoutDurations')){const fixtureIds=${JSON.stringify(ids)},times=${JSON.stringify(durations)};fixtureIds.forEach((id,i)=>{if(times[i])artworks.find(a=>a.id===id).productionTime=times[i]});const longKind=new URLSearchParams(window.location.search).get('fixtureLongDuration');if(longKind)artworks.find(a=>a.id===fixtureIds[0]).productionTime={minutes:15030,kind:longKind};artworkProductionGroups.push(...${JSON.stringify(groups)});}\n`;
      if(id.replaceAll("\\","/").endsWith("/src/content/mangas.js"))return source+`\nfor(const manga of mangas)delete manga.productionTime;\nif(!new URLSearchParams(window.location.search).has('fixtureWithoutDurations'))mangas.find(m=>m.slug===${JSON.stringify(slug)}).productionTime=${JSON.stringify(production)};\n`;
    }
  }]});await server.listen();
  const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  const profile=path.join(temporary,"chrome");
  browser=spawn(process.env.PRODUCTION_TIME_TEST_CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless","--disable-gpu","--no-first-run","--no-default-browser-check","--force-prefers-reduced-motion","--remote-debugging-port=0","--remote-debugging-address=127.0.0.1","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",`--user-data-dir=${profile}`,base+"/portfolio/"],{windowsHide:true,stdio:"ignore"});
  browser.on("error",error=>errors.push(error.message));let port;
  for(let i=0;i<200&&!port;i++){try{port=Number((await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0])}catch{await pause(50)}}assert.ok(port,errors.join(";"));
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(tabs.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})});
  let sequence=0;const pending=new Map();
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+" timed out"))},30000);pending.set(id,data=>{clearTimeout(timer);data.error?reject(new Error(JSON.stringify(data.error))):resolve(data.result)});socket.send(JSON.stringify({id,method,params}))});
  socket.addEventListener("message",event=>{const data=JSON.parse(event.data);if(pending.has(data.id)){pending.get(data.id)(data);pending.delete(data.id)}if(data.method==="Runtime.exceptionThrown")errors.push(JSON.stringify(data.params.exceptionDetails));if(data.method==="Network.requestWillBeSent")requests.push(data.params.request.url)});
  await command("Page.enable");await command("Runtime.enable");await command("Network.enable");await command("Network.setBlockedURLs",{urls:["https://*"]});
  const evaluate=async expression=>{const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value};
  const until=async expression=>{for(let i=0;i<300;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(50)}assert.fail(expression+"; "+errors.join(";"))};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const navigate=async(route,locale="en",theme="light",none=false,extra="")=>{await evaluate(`localStorage.setItem('portfolio-theme',${JSON.stringify(theme)});localStorage.setItem('manga-reader-mode','horizontal');localStorage.setItem(${JSON.stringify("manga-language:"+slug)},'en')`);await command("Page.navigate",{url:base+"/portfolio/"+route+"?lang="+locale+(none?"&fixtureWithoutDurations=1":"")+extra});await until(`document.documentElement?.lang===${JSON.stringify(locale)}&&Boolean(document.querySelector('main'))&&document.documentElement.classList.contains('dark')===${theme==="dark"}`)};
  const resize=async width=>{await command("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:width<768});await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")};
  const measure=()=>evaluate(`(()=>{
    const badges=[...document.querySelectorAll('.production-time')].filter(el=>el.getBoundingClientRect().width&&(!el.closest('.fancybox__slide')||el.closest('.fancybox__slide').classList.contains('is-selected')));
    const rgb=c=>c.match(/\\d+(?:\\.\\d+)?/g).slice(0,3).map(v=>Number(v)*(c.startsWith('color(srgb')?255:1));
    const lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    return badges.map(el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect();let p=el;
      while(p&&getComputedStyle(p).backgroundColor==='rgba(0, 0, 0, 0)')p=p.parentElement;
      // Fancybox's painted backdrop is a sibling, not an ancestor of captions.
      if(el.closest('.fancybox__container'))p=document.querySelector('.fancybox__backdrop');
      const bg=p?getComputedStyle(p).backgroundColor:getComputedStyle(document.documentElement).backgroundColor;
      const f=lum(s.color),b=lum(bg);
      const link=el.closest('.artwork-card__link'),lr=link?.getBoundingClientRect();
      const label=el.querySelector('.work-badge__label');
      const duration=el.querySelector('.work-badge__duration'),value=duration?.lastElementChild;
      return {text:el.textContent,size:parseFloat(s.fontSize),labelSize:label?parseFloat(getComputedStyle(label).fontSize):null,alignment:label?{label:getComputedStyle(label).textAlign,duration:getComputedStyle(duration).justifyContent,rightDifference:Math.abs(label.getBoundingClientRect().right-value.getBoundingClientRect().right)}:null,contrast:(Math.max(f,b)+.05)/(Math.min(f,b)+.05),left:r.left,right:r.right,client:el.clientWidth,scroll:el.scrollWidth,images:el.querySelectorAll('img').length,inImage:lr?{left:lr.left,right:lr.right,top:lr.top,bottom:lr.bottom,badgeTop:r.top,badgeBottom:r.bottom}:null,pointer:s.pointerEvents};
    });
  })()`);
  const check=async(label,locale,theme,width)=>{const measures=await measure();for(const m of measures){assert.ok(m.size>=(locale==="ja"?14:13),JSON.stringify({label,locale,width,m}));if(m.labelSize!==null){assert.ok(m.labelSize>=(locale==="ja"?14:12.5),JSON.stringify({label,locale,width,m}));assert.equal(m.alignment.label,'right');assert.equal(m.alignment.duration,'flex-end');assert.ok(m.alignment.rightDifference<1,JSON.stringify(m))}assert.ok(m.contrast>=4.5,JSON.stringify({label,locale,theme,width,m}));assert.ok(m.left>=-1&&m.right<=width+1&&m.scroll<=m.client+1,JSON.stringify({label,locale,width,m}));assert.equal(m.images,0);if(m.inImage){assert.ok(m.left>=m.inImage.left&&m.right<=m.inImage.right&&m.inImage.badgeTop>=m.inImage.top&&m.inImage.badgeBottom<=m.inImage.bottom,JSON.stringify({label,locale,width,m}));assert.equal(m.pointer,'none')}}
    const dates=await evaluate("[...document.querySelectorAll('.artwork-card--illustration .artwork-card__metadata > p')].map(p=>{const parent=p.parentElement.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(p);return {align:getComputedStyle(p).textAlign,lines:[...range.getClientRects()].map(r=>Math.abs((r.left+r.right)/2-(parent.left+parent.right)/2))}})");
    for(const date of dates){assert.equal(date.align,'center');assert.ok(date.lines.every(offset=>offset<2),JSON.stringify({locale,width,date}))}
    results.push({label,locale,theme,width,indicators:measures.length})};
  const capture=async name=>{if(!process.env.PUBLIC_PRODUCTION_CAPTURE_DIR)return;await mkdir(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR,{recursive:true});await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");const r=await command("Page.captureScreenshot",{format:"png"});await writeFile(path.join(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR,name+".png"),Buffer.from(r.data,"base64"))};
  const widths=[320,360,375,390,430,768,1024,1280,1440,1920];
  // Fancybox places compact captions in its common footer, desktop captions
  // inside each slide. Ignore preloaded/inactive slides in either layout.
  const activeCaption="[...document.querySelectorAll('.fancybox__container .portfolio-lightbox-metadata')].find(el=>el.getBoundingClientRect().width&&(!el.closest('.fancybox__slide')||el.closest('.fancybox__slide').classList.contains('is-selected')))";
  for(const locale of ["en","fr","ja"])for(const theme of ["light","dark"]){
    const text=getTranslations(locale).productionTime;
    await navigate("",locale,theme);await until("document.querySelectorAll('#selected-manga .manga-card').length===3");
    assert.equal(await evaluate("document.querySelectorAll('.hero-art-card .production-time').length"),0);
    assert.equal(await evaluate("document.querySelectorAll('#selected-manga .production-time').length"),1);
    assert.equal(await evaluate("document.querySelectorAll('#selected-manga .work-badge').length"),0);
    assert.ok((await evaluate("document.querySelector('#selected-manga .production-time [aria-hidden=true]:not(svg)').textContent")).includes(text.compact.manga.estimated));
    assert.ok((await evaluate("document.querySelector('#selected-manga .production-time').textContent")).includes(locale==="ja"?"約250時間":locale==="fr"?"≈ 250 h":"approx. 250 hr"));
    for(const width of widths){await resize(width);await check("home",locale,theme,width)}
    await evaluate("document.querySelector('#selected-manga').scrollIntoView({block:'center'})");if(locale==="fr"&&theme==="light")await capture("home-fr-light");
    await navigate("mangaka",locale,theme);await until("document.querySelectorAll('.manga-card').length>0");assert.equal(await evaluate("document.querySelectorAll('.manga-card .production-time').length"),1);
    for(const width of widths){await resize(width);await check("manga",locale,theme,width)}
    await navigate("illustration",locale,theme);await until(`document.querySelector('[data-lightbox-id=${JSON.stringify(ids[0])}]')`);
    assert.equal(await evaluate("document.querySelectorAll('.artwork-card .production-time').length"),3,"Short/medium/long fixtures; absent and invalid remain badge-free");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.artwork-card .work-badge')].map(el=>['short','medium','long'].find(t=>el.classList.contains('work-badge--'+t)))"),["short","medium","long"]);
    assert.equal(await evaluate("document.querySelectorAll('.artwork-card__metadata .production-time').length"),0);
    assert.ok((await evaluate("document.querySelector('.work-badge__label').textContent")).includes(text.compact.individual.actual));
    for(const width of widths){await resize(width);await check("illustration",locale,theme,width)}
    if(theme==="dark"){await resize(390);await capture(`illustration-${locale}-dark-mobile`)}
    if(locale==="en"&&theme==="dark"){await resize(320);await capture("illustration-en-dark-320")}
    if(locale==="fr"&&theme==="light"){await resize(1440);await capture("illustration-fr-light-desktop");await evaluate("document.querySelector('.artwork-card').scrollIntoView();scrollBy(0,-100)");await capture("illustration-all-tiers-fr-light")}
    if(locale==="ja"&&theme==="dark"){await evaluate(`document.querySelector('[data-lightbox-id="${ids[4]}"]').scrollIntoView({block:'center'})`);await capture("illustration-long-ja-dark-mobile")}
    if(locale==="en"&&theme==="light"){
      const point=await evaluate("(()=>{const badge=document.querySelector('.work-badge');badge.scrollIntoView({block:'center'});const r=badge.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,id:document.elementFromPoint(x,y)?.closest('[data-lightbox-id]')?.dataset.lightboxId}})()");
      assert.equal(point.id,ids[0],"Badge cannot intercept the image link");
      await command("Input.dispatchMouseEvent",{type:"mousePressed",x:point.x,y:point.y,button:"left",clickCount:1});await command("Input.dispatchMouseEvent",{type:"mouseReleased",x:point.x,y:point.y,button:"left",clickCount:1});
    }else await click(`[data-lightbox-id="${ids[0]}"]`);
    await until(activeCaption);
    assert.equal(await evaluate(`(${activeCaption}).querySelectorAll('[data-production-context=group]').length`),2);
    assert.ok((await evaluate(`(${activeCaption}).textContent`)).includes(text.group.actual));
    assert.ok(!(await evaluate(`(${activeCaption}).textContent`)).includes("9999"));
    assert.equal(await evaluate(`(${activeCaption}).querySelector('details').open`),false,"Collective totals are secondary, initially collapsed");
    await evaluate(`(${activeCaption}).querySelector('summary').click()`);
    for(const width of widths){await resize(width);await check("lightbox",locale,theme,width)}
    if(locale==="ja"&&theme==="dark"){await resize(390);await capture("lightbox-ja-dark-mobile")}
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
    await until(`(${activeCaption})?.querySelector('[data-production-kind=estimated][data-production-context=individual]')`);
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});await until("!document.querySelector('.fancybox__container')");
    await navigate("mangas/"+slug,locale,theme);await until("document.querySelector('[data-reader-production-times]')");
    for(const width of widths){await resize(width);await check("reader",locale,theme,width)}
    await resize(1440);await command("Page.bringToFront");
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowLeft",code:"ArrowLeft",windowsVirtualKeyCode:37});await command("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowLeft",code:"ArrowLeft",windowsVirtualKeyCode:37});
    await until("document.querySelector('[data-horizontal-pages]').dataset.horizontalPages==='2-3'");
    assert.equal(await evaluate("document.querySelectorAll('[data-reader-production-times] [data-production-page]').length"),2);
    assert.ok((await evaluate("document.querySelector('[data-reader-production-times]').textContent")).includes(text.pageNumber(3)));
    await until("[...document.querySelectorAll('[data-rail-panel=current] img')].every(img=>img.naturalWidth>0)");
    await check("reader-double",locale,theme,1440);if(locale==="en"&&theme==="dark")await capture("reader-double-en-dark");
    await click("[data-reader-language-trigger]");await until("document.querySelectorAll('[data-reader-language-menu] [role=menuitemradio]').length>1");
    await evaluate("[...document.querySelectorAll('[data-reader-language-menu] [role=menuitemradio]')].find(el=>el.textContent.includes('Français')).click()");
    await until("document.querySelector('main').dataset.readerLanguage==='fr'");
    assert.equal(await evaluate("document.querySelectorAll('[data-reader-production-times]').length"),0,"No index-based language guess for French pages 2/3");
    await click("[data-reader-header] [role=group] button:first-child");await until("document.querySelector('main').dataset.readerMode==='vertical'");
    await evaluate("scrollTo({top:0,behavior:'instant'})");await until("document.querySelector('[data-reader-production-times] [data-production-page=\"1\"]')");
    assert.ok((await evaluate("document.querySelector('[data-reader-production-times]').textContent")).includes(text.page.actual),"Interface locale, not page language, chooses the label");
    await check("reader-vertical-linked",locale,theme,1440);
  }
  // Reuse the real filters. The visual variant is independent of category.
  await resize(390);
  for(const category of ["illustrations","sketches","paintings","character-design","backgrounds"]){
    await navigate("illustration","ja","dark",false,"&category="+category);await until("document.querySelectorAll('.artwork-card').length>0");
    assert.ok((await evaluate("document.querySelector('[aria-pressed=true]').textContent")).includes(getTranslations("ja").illustration.categories[category]));
    await check("category-"+category,"ja","dark",390);
  }
  // Placement/mode/threshold settings are transformed in memory only, never
  // written to source. Also compare full card/image geometry with absent times.
  await resize(1440);await navigate("illustration","en","light");await until("document.querySelectorAll('.work-badge').length===3");
  const galleryGeometry=()=>evaluate("[...document.querySelectorAll('.artwork-card')].slice(0,5).map(card=>{const r=card.getBoundingClientRect(),img=card.querySelector('img'),i=img.getBoundingClientRect();return {height:r.height,width:r.width,imageHeight:i.height,imageWidth:i.width,src:img.getAttribute('src'),objectFit:getComputedStyle(img).objectFit}})");
  const withBadges=await galleryGeometry();
  await until("[...document.querySelectorAll('.artwork-card')].slice(0,5).every(el=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).f)<.01)");
  const frameForAlignment=()=>evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const badgeBoxes=()=>evaluate("[...document.querySelectorAll('.work-badge')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})");
  const rightAlignedBoxes=await badgeBoxes();
  await evaluate("(()=>{const style=document.createElement('style');style.id='fixture-old-badge-alignment';style.textContent='.work-badge__copy{width:auto;text-align:left}.work-badge__duration{justify-content:flex-start}';document.head.append(style)})()");await frameForAlignment();
  assert.deepEqual(await badgeBoxes(),rightAlignedBoxes,"Alignment alone cannot change badge exterior sizes or positions");
  await evaluate("document.getElementById('fixture-old-badge-alignment').remove()");await frameForAlignment();
  await navigate("illustration","en","light",true);await until("document.querySelectorAll('.artwork-card').length>=5");assert.deepEqual(await galleryGeometry(),withBadges,"Overlay cannot change image/card sizes or cropping");
  for(const theme of ["light","dark"]){
    await navigate("illustration","fr",theme,false,"&fixtureBadgeMode=neutral");await until("document.querySelectorAll('.work-badge--neutral').length===3");
    assert.equal(await evaluate("new Set([...document.querySelectorAll('.work-badge')].map(el=>getComputedStyle(el).backgroundColor)).size"),1);
    for(const width of [320,390,1440]){await resize(width);await check("neutral","fr",theme,width)}
  }
  for(const placement of ["top-right","bottom-right","metadata"]){
    await navigate("illustration","ja","dark",false,"&fixtureBadgePlacement="+placement);await until(`document.querySelectorAll('[data-badge-placement=${JSON.stringify(placement)}]').length===3`);
    assert.equal(await evaluate("document.querySelectorAll('.artwork-card__metadata .work-badge').length"),placement==="metadata"?3:0);
    for(const width of [320,390,1440]){await resize(width);await check("placement-"+placement,"ja","dark",width)}
  }
  await navigate("illustration","en","light",false,"&fixtureBadgeThresholds=custom");await until("document.querySelectorAll('.work-badge').length===3");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.work-badge')].map(el=>['short','medium','long'].find(t=>el.classList.contains('work-badge--'+t)))"),["short","short","medium"]);
  await evaluate("document.documentElement.style.setProperty('--work-badge-border-width','2px')");
  await until("getComputedStyle(document.querySelector('.work-badge')).getPropertyValue('--work-badge-border-width').trim()==='2px'");
  await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.work-badge')).borderTopWidth"),"2px",JSON.stringify(await evaluate("({root:document.documentElement.style.cssText,badge:getComputedStyle(document.querySelector('.work-badge')).getPropertyValue('--work-badge-border-width'),style:getComputedStyle(document.querySelector('.work-badge')).borderTopStyle,dpr:devicePixelRatio,scale:visualViewport.scale,css:[...document.querySelectorAll('style')].map(el=>el.textContent).filter(s=>s.includes('.work-badge')).map(s=>s.slice(s.indexOf('.work-badge {')))} )")));
  await evaluate("document.documentElement.style.removeProperty('--work-badge-border-width')");
  for(const locale of ["en","fr","ja"])for(const theme of ["light","dark"])for(const kind of ["actual","estimated"]){
    await navigate("illustration",locale,theme,false,"&fixtureLongDuration="+kind);await until("document.querySelector('.work-badge--long')");
    for(const width of [320,375,390,768,1440,1920]){await resize(width);await check("long-duration-"+kind,locale,theme,width)}
  }
  // Real UI language change without replacing the page's document.
  await navigate("illustration","en","light");await until("document.querySelector('.artwork-card .production-time')");
  await click('nav button[aria-haspopup="menu"]');await until("document.querySelector('[role=menuitemradio][lang=ja]')");await click('[role=menuitemradio][lang=ja]');await until("document.documentElement.lang==='ja'");
  assert.ok((await evaluate("document.querySelector('.artwork-card .production-time').textContent")).includes("制作時間"));
  // Trusted user input for fullscreen and swipe, plus image-geometry parity
  // with the no-duration fixture at the exact same Reader viewport/state.
  await resize(1440);await navigate("mangas/"+slug,"ja","dark");await until("document.querySelector('[data-reader-production-times]')");
  const imageGeometry=()=>evaluate("[...document.querySelectorAll('[data-rail-panel=current] img')].map(el=>{const r=el.getBoundingClientRect();return {src:el.getAttribute('src'),width:r.width,height:r.height}})");
  await until("[...document.querySelectorAll('[data-rail-panel=current] img')].every(img=>img.naturalWidth>0)");const geometryWith=await imageGeometry();
  const nativeClick=async selector=>{await until(`document.querySelector(${JSON.stringify(selector)})`);const point=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,buttons:1,...point});await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,buttons:0,...point})};
  let fullscreenTested=false;
  if(await evaluate("document.fullscreenEnabled")){
    await nativeClick(`[aria-label="${getTranslations("ja").mangaReader.enterFullscreen}"]`);await until("document.fullscreenElement");fullscreenTested=true;
    assert.equal(await evaluate("Boolean(document.fullscreenElement.querySelector('[data-reader-production-times]'))"),true);
    await nativeClick(`[aria-label="${getTranslations("ja").mangaReader.exitFullscreen}"]`);await until("!document.fullscreenElement");
  }
  await navigate("mangas/"+slug,"ja","dark",true);await until("document.querySelector('[data-horizontal-pages]')");await until("[...document.querySelectorAll('[data-rail-panel=current] img')].every(img=>img.naturalWidth>0)");
  assert.deepEqual(await imageGeometry(),geometryWith,"Production metadata must not resize/crop the manga image");
  await resize(390);await navigate("mangas/"+slug,"ja","dark");await until("document.querySelector('[data-reader-production-times]')");
  await command("Emulation.setTouchEmulationEnabled",{enabled:true});
  await command("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:100,y:450}]});
  await command("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:180,y:450}]});
  await command("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:260,y:450}]});
  await command("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await until("document.querySelector('[data-horizontal-pages]').dataset.horizontalPages==='2'");
  assert.equal(await evaluate("document.querySelector('[data-reader-production-times] [data-production-page]').dataset.productionPage"),"2");
  await command("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:260,y:450}]});
  await command("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:180,y:450}]});
  await command("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:100,y:450}]});
  await command("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await until("document.querySelector('[data-horizontal-pages]').dataset.horizontalPages==='1'");
  await evaluate("history.replaceState(history.state,'',location.pathname+'?lang=fr');dispatchEvent(new PopStateEvent('popstate'))");
  await until("document.documentElement.lang==='fr'");assert.ok((await evaluate("document.querySelector('[data-reader-production-times]').textContent")).includes("Temps de réalisation"));
  assert.equal(await evaluate("document.querySelector('main').dataset.readerLanguage"),"en");
  // Interface hide/show also hides/shows its metadata, without adding a panel.
  await nativeClick("[data-horizontal-click-zones] button:nth-child(2)");await until("document.querySelector('main').dataset.readerInterface==='hidden'");
  assert.equal(await evaluate("document.querySelector('[data-reader-pagination]').getAttribute('aria-hidden')"),"true");
  await click("[data-horizontal-click-zones] button:nth-child(2)");await until("document.querySelector('main').dataset.readerInterface==='visible'");
  // No-duration flavor strips only fixture metadata, not the real catalog.
  for(const route of ["","illustration","mangaka","mangas/"+slug]){
    await navigate(route,"en","light",true);await until(route.startsWith("mangas/")?"document.querySelector('[data-reader-mode]')":route==="illustration"?"document.querySelector('[data-fancybox=illustration-gallery]')":route==="mangaka"?"document.querySelector('.manga-card')":"document.querySelector('#selected-manga .manga-card')");
    assert.equal(await evaluate("document.querySelectorAll('.production-time,[data-reader-production-times]').length"),0);
    if(route==="illustration"){await click(`[data-lightbox-id="${ids[0]}"]`);await until("document.querySelector('.fancybox__container')");assert.equal(await evaluate("document.querySelectorAll('.portfolio-lightbox-metadata').length"),0)}
  }
  assert.ok(!requests.some(url=>url.includes("/api/")),"Public render cannot depend on Admin APIs");
  assert.deepEqual(errors,[]);
  console.log(`Public production Chrome QA: ${results.length} viewport/locale/theme checks; short/medium/long and custom thresholds, neutral mode, three placements, five categories, badge click-through, unchanged card/image geometry; fixtures A/estimated/invalid/absent, group overlap/privacy/no sums, Home/Manga/Illustration/Lightbox/Reader, keyboard/double pages/explicit French association/live interface switch, touch RTL/hide-show/fullscreen=${fullscreenTested}, no local APIs or extra badge media, AA contrasts and computed type sizes OK.`);
} finally {
  socket?.close();if(browser&&browser.exitCode===null){const exited=new Promise(resolve=>browser.once("exit",resolve));browser.kill();await exited}await server?.close();
  assert.equal(path.dirname(temporary),path.resolve(tmpdir()));assert.ok(path.basename(temporary).startsWith("kevgenga-public-production-"));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
