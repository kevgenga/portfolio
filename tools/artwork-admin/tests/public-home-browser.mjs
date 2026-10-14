// Isolated Chromium QA of the built portfolio, never the user's browser/profile.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import { getContentTranslations, getTranslations } from "../../../src/i18n/locale.js";
import { sitePresentation } from "../../../src/content/sitePresentation.js";
import vm from "node:vm";

const chrome = process.env.MANGA_ADMIN_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe";
await access(chrome);
const temporary = await mkdtemp(path.join(tmpdir(), "portfolio-home-browser-"));
const root = path.resolve("dist");
const categories = ["illustrations", "sketches", "paintings", "character-design", "backgrounds"];
const expectedLanguages = Object.fromEntries(["en", "ja", "fr"].map(locale => {
  const t = getTranslations(locale);
  return [locale, { titles: categories.map(category => t.illustration.categories[category]), descriptions: categories.map(category => t.home.workDescriptions[category]), actions: [t.home.viewManga, t.home.viewWorks], socialLabel:t.home.sketchbookLabel,socialTitle:t.home.sketchbookTitle,socialDescription:t.home.sketchbookDescription }];
}));
const profileSource=await readFile('src/content/profile.js','utf8');
const profile=vm.runInNewContext(profileSource.replace(/^import[^\n]+\n/m,'').replace('export const profile','const profile')+';profile',{assetPath:value=>value});
const expectedFooters=Object.fromEntries(['en','ja','fr'].map(locale=>{const content=getContentTranslations(locale);return [locale,{experience:content?.experience||profile.experience,items:[...profile.capabilities.filter(group=>sitePresentation.showAnimationSection||group.label!=='2D / Motion'),...profile.tools].flatMap(group=>group.items.map(item=>content?.capabilityItems[item]||item))}];}));
const harness = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}iframe{border:0;display:block}</style></head><body><iframe id="site" height="1300"></iframe><pre id="results">Pending</pre><script>
const results=[], errors=[], frame=document.getElementById('site'), params=new URLSearchParams(location.search);
const expectedLanguages=${JSON.stringify(expectedLanguages)};
const widths=params.has('w')?[Number(params.get('w'))]:[320,360,375,390,430,768,1024,1280,1366,1440,1920];
const languages=params.has('lang')?[params.get('lang')]:['en','ja','fr'];
const themes=params.has('theme')?[params.get('theme')]:['light','dark'];
function until(check){return new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(check()){clearInterval(timer);resolve();}else if(++attempts>300){clearInterval(timer);reject(Error('Render timeout'));}},30);});}
function navigate(url){return new Promise(resolve=>{frame.onload=resolve;frame.src=url;});}
function imageMetrics(doc,win){return [...doc.querySelectorAll('.hero-art-card img')].map(img=>{const css=win.getComputedStyle(img),media=img.closest('.hero-art-card__media'),width=img.clientWidth,height=img.clientHeight,scale=css.objectFit==='cover'?Math.max(width/img.naturalWidth,height/img.naturalHeight):Math.min(width/img.naturalWidth,height/img.naturalHeight);return {category:img.closest('a').dataset.category,source:img.getAttribute('src'),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,fit:css.objectFit,position:css.objectPosition,mediaWidth:media.clientWidth,mediaHeight:media.clientHeight,imageBoxWidth:width,imageBoxHeight:height,renderedWidth:img.naturalWidth*scale,renderedHeight:img.naturalHeight*scale,fills:img.naturalWidth*scale>=width-1&&img.naturalHeight*scale>=height-1};});}
function descriptions(doc,win){return [...doc.querySelectorAll('.hero-art-card__description')].map(d=>{const css=win.getComputedStyle(d),link=d.closest('a'),caption=d.closest('.hero-art-card__caption');return {text:d.textContent,visible:css.display!=='none'&&Number(css.opacity)===1&&d.clientHeight>0,clamp:css.webkitLineClamp,height:d.clientHeight,lineHeight:parseFloat(css.lineHeight),full:d.scrollHeight<=d.clientHeight+1,scrollable:win.getComputedStyle(d).overflowY==='auto'&&d.scrollHeight>d.clientHeight,noHorizontalOverflow:d.scrollWidth<=d.clientWidth+1,accessible:link.getAttribute('aria-describedby')===d.id,insideCaption:d.getBoundingClientRect().bottom<=caption.getBoundingClientRect().bottom+1&&caption.getBoundingClientRect().bottom<=link.getBoundingClientRect().bottom+1};});}
function footerMetrics(doc,win){const footer=doc.querySelector('.portfolio-footer'),width=doc.documentElement.clientWidth;return {height:footer.offsetHeight,background:win.getComputedStyle(footer).backgroundColor,items:[...footer.querySelectorAll('.capability-block__list li')].map(li=>li.textContent),role:footer.querySelector('#experience-title').textContent,period:footer.querySelector('.portfolio-footer__period').textContent,duplicateIds:[...footer.querySelectorAll('[id]')].filter(el=>doc.querySelectorAll('[id="'+el.id+'"]').length!==1).map(el=>el.id),overflow:[...footer.querySelectorAll('*')].filter(el=>{const b=el.getBoundingClientRect();return b.width>0&&(b.left< -1||b.right>width+1||el.scrollWidth>el.clientWidth+1);}).map(el=>el.className),images:footer.querySelectorAll('img').length,links:[...footer.querySelectorAll('nav a')].map(a=>a.getAttribute('href')),copyright:footer.querySelector('.portfolio-footer__copyright').textContent};}
(async()=>{for(const lang of languages)for(const theme of themes)for(const width of widths){
localStorage.setItem('portfolio-theme',theme);frame.style.width=width+'px';document.getElementById('results').textContent=JSON.stringify({pending:true,stage:'navigation',lang,theme,width});await navigate('/portfolio/?lang='+lang);
await until(()=>frame.contentDocument?.querySelector('.manga-home-hero')&&frame.contentDocument.documentElement.lang===lang&&frame.contentDocument.documentElement.classList.contains('dark')===(theme==='dark'));
const doc=frame.contentDocument, win=frame.contentWindow;
if(params.has('capture')){const style=doc.createElement('style');style.textContent='main > section,.about-hero__copy{opacity:1!important;transform:none!important}';doc.head.append(style);}
win.addEventListener('error',e=>errors.push(e.message));win.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
document.getElementById('results').textContent=JSON.stringify({pending:true,stage:'images',lang,theme,width});
await until(()=>[...doc.querySelectorAll('.manga-home-hero img')].every(img=>img.complete&&img.naturalWidth));
await new Promise(r=>setTimeout(r,100));
const overflow=[...doc.querySelectorAll('.manga-home-hero *,#selected-manga *,[aria-labelledby="sketchbook-title"] *,nav *')].filter(el=>{if(el.closest('.hero-art-card__image-plane'))return false;const s=win.getComputedStyle(el),b=el.getBoundingClientRect();return s.position!=='absolute'&&s.position!=='fixed'&&b.width>0&&(b.right>width+2||b.left < -2);}).map(el=>el.className?.baseVal||el.className);
results.push({lang,theme,width,viewport:win.innerWidth,scrollWidth:doc.documentElement.scrollWidth,overflow,
mangas:doc.querySelectorAll('#selected-manga .manga-card').length,categories:[...doc.querySelectorAll('.hero-art-card')].map(a=>a.getAttribute('href')),removedSection:!doc.getElementById('selected-work'),
animationLinks:doc.querySelectorAll('a[href="/portfolio/animation"]').length,heroBroken:[...doc.querySelectorAll('.manga-home-hero img')].some(img=>!img.naturalWidth),roles:doc.querySelector('.about-hero__roles').textContent,
restOpacity:[...doc.querySelectorAll('.hero-art-card img')].map(img=>Number(win.getComputedStyle(img).opacity)),restActive:doc.querySelectorAll('.hero-art-card[data-active="true"]').length,descriptions:descriptions(doc,win),titles:[...doc.querySelectorAll('.hero-art-card__title')].map(el=>el.textContent),actions:[...doc.querySelectorAll('.home-cta')].map(a=>({href:a.getAttribute('href'),text:a.textContent.replace('↓','').trim()}))});
results.at(-1).images=imageMetrics(doc,win);
results.at(-1).footer=footerMetrics(doc,win);results.at(-1).sections=[...doc.querySelectorAll('main .section-label__index')].map(el=>el.textContent);results.at(-1).mainGroups=doc.querySelectorAll('main .capability-block').length;results.at(-1).social={label:doc.querySelector('[aria-labelledby="sketchbook-title"] .section-label__text').textContent,title:doc.getElementById('sketchbook-title').textContent,description:doc.querySelector('[aria-labelledby="sketchbook-title"] h2+p').textContent,widgets:doc.querySelectorAll('[data-elfsight-app-lazy]').length};
if(width>=1280&&!params.has('capture')){
const group=doc.querySelector('.hero-art-cards'),track=doc.querySelector('.hero-art-cards__track'),cards=[...doc.querySelectorAll('.hero-art-card')],initial=cards.map(c=>c.offsetWidth),groupWidth=group.getBoundingClientRect().width;
const measurements=[];
for(const [i,card]of cards.entries()){card.focus({preventScroll:true});await until(()=>card.dataset.expanded==='true');await new Promise(r=>setTimeout(r,400));const sizes=cards.map(c=>c.offsetWidth),rects=cards.map(c=>c.getBoundingClientRect());measurements.push({active:i,gains:sizes[i]>initial[i],shrinks:sizes.filter((_,j)=>i!==j).every((v,j)=>v<initial.filter((_,k)=>k!==i)[j]),sum:sizes.reduce((a,b)=>a+b,0),initialSum:initial.reduce((a,b)=>a+b,0),groupWidth:group.getBoundingClientRect().width,contained:rects.every(r=>r.left>=group.getBoundingClientRect().left-1&&r.right<=group.getBoundingClientRect().right+1),opacity:cards.map(c=>Number(win.getComputedStyle(c.querySelector('img')).opacity)),description:descriptions(doc,win)[i],images:imageMetrics(doc,win)});}
cards.at(-1).blur();await until(()=>cards.every(c=>c.dataset.expanded==='false'));await new Promise(r=>setTimeout(r,400));
// Synthetic pointer events exercise React handlers even when headless hardware reports no mouse.
const matchMedia=win.matchMedia.bind(win);win.matchMedia=q=>q==='(hover: hover) and (pointer: fine)'?{matches:true}:matchMedia(q);
cards[2].dispatchEvent(new win.PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));await until(()=>cards[2].dataset.expanded==='true');await new Promise(r=>setTimeout(r,400));const mouseEnter=cards.map(c=>Number(win.getComputedStyle(c.querySelector('img')).opacity));
cards[2].dispatchEvent(new win.PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:doc.body}));await until(()=>cards.every(c=>c.dataset.expanded==='false'));win.matchMedia=matchMedia;await new Promise(r=>setTimeout(r,400));const mouseLeave=cards.map(c=>Number(win.getComputedStyle(c.querySelector('img')).opacity));
group.style.setProperty('--hero-expand','0px');cards[0].focus({preventScroll:true});await until(()=>cards.every(c=>c.dataset.expanded==='false'));const zeroExpansion=cards.map(c=>c.offsetWidth).every((v,i)=>Math.abs(v-initial[i])<=1);cards[0].blur();group.style.removeProperty('--hero-expand');
group.style.setProperty('--hero-angle','0deg');await until(()=>Math.abs(new win.DOMMatrix(win.getComputedStyle(cards[0]).transform).c)<0.001);const zeroAngle=true;group.style.removeProperty('--hero-angle');
const outer=new win.DOMMatrix(win.getComputedStyle(cards[0]).transform),inner=new win.DOMMatrix(win.getComputedStyle(cards[0].querySelector('.hero-art-card__image-plane')).transform);const upright=outer.multiply(inner);results.at(-1).interaction={measurements,zeroExpansion,zeroAngle,mouseEnter,mouseLeave,groupWidth,trackWidth:track.getBoundingClientRect().width,upright:Math.abs(upright.c)<0.001&&Math.abs(upright.a-1)<0.001};
// Future descriptions are DOM-only fixtures: no catalogue or translation writes.
const description=cards[0].querySelector('.hero-art-card__description'),original=description.textContent,cardHeight=cards[0].offsetHeight;
description.textContent='Art.';const short=descriptions(doc,win)[0];description.textContent=Array(80).fill(original).join(' ');const longCollapsed=descriptions(doc,win)[0];cards[0].focus({preventScroll:true});await until(()=>cards[0].dataset.active==='true');await new Promise(r=>setTimeout(r,400));const longExpanded=descriptions(doc,win)[0];description.scrollTop=description.scrollHeight;results.at(-1).futureDescription={shortFull:short.full,longCollapsed,longExpanded,scrollable:description.scrollTop>0,heightUnchanged:cardHeight===cards[0].offsetHeight};description.textContent=original;description.scrollTop=0;cards[0].blur();
}
document.getElementById('results').textContent=JSON.stringify({pending:true,results,errors});
if(width<1024&&!params.has('capture')){const trigger=doc.querySelector('nav button[aria-controls="mobile-navigation"]');trigger.click();await until(()=>doc.querySelector('#mobile-navigation'));results.at(-1).mobileAnimationLinks=doc.querySelectorAll('#mobile-navigation a[href="/portfolio/animation"]').length;doc.querySelector('#mobile-navigation button').click();}
}
if(params.has('capture')){frame.height='1600';const doc=frame.contentDocument;doc.querySelectorAll('#selected-manga img').forEach(img=>img.loading='eager');await until(()=>[...doc.querySelectorAll('#selected-manga img')].every(img=>img.complete&&img.naturalWidth));if(params.get('active')){const card=doc.querySelectorAll('.hero-art-card')[Number(params.get('active'))];card.focus({preventScroll:true});await until(()=>card.dataset.expanded==='true');}if(params.get('section')){const selected=doc.getElementById(params.get('section')).cloneNode(true);doc.querySelector('main').replaceChildren(selected);selected.style.marginTop='68px';selected.style.opacity='1';selected.style.transform='none';frame.contentWindow.scrollTo({top:0,behavior:'instant'});}await new Promise(r=>setTimeout(r,500));const section=doc.getElementById(params.get('section')||'about');const captureStyles={opacity:frame.contentWindow.getComputedStyle(section).opacity,top:section.getBoundingClientRect().top,height:section.getBoundingClientRect().height};document.getElementById('results').hidden=true;document.getElementById('results').textContent=JSON.stringify({results,errors,captureStyles});return;}
// Both hero CTAs use real React navigation, no category query or Home anchor.
for(const lang of ['en','ja','fr'])for(const width of [375,1440])for(const [index,destination]of ['/portfolio/mangaka','/portfolio/illustration'].entries()){
frame.style.width=width+'px';await navigate('/portfolio/?lang='+lang);await until(()=>frame.contentDocument.querySelector('.home-cta'));frame.contentDocument.querySelectorAll('.home-cta')[index].click();await until(()=>frame.contentWindow.location.pathname===destination&&frame.contentDocument.querySelector('main')&&!frame.contentDocument.querySelector('.manga-home-hero'));const noCategory=!frame.contentWindow.location.search.includes('category=');await navigate(frame.contentWindow.location.href);await until(()=>frame.contentDocument.querySelector('main')&&!frame.contentDocument.querySelector('.manga-home-hero'));const refreshed=frame.contentWindow.location.pathname===destination&&frame.contentDocument.documentElement.lang===lang;frame.contentWindow.history.back();await until(()=>frame.contentDocument.querySelector('.manga-home-hero'));results.push({route:'hero-cta',lang,destination,noCategory,refreshed,back:true});}
// Change languages through the existing Navbar without reloading the Home.
frame.style.width='1440px';await navigate('/portfolio/?lang=en');await until(()=>frame.contentDocument.querySelector('.hero-art-card'));const homeDocument=frame.contentDocument;
for(const lang of ['ja','fr','en']){homeDocument.querySelector('nav button[aria-haspopup="menu"]').click();await until(()=>homeDocument.querySelector('[role="menuitemradio"][lang="'+lang+'"]'));homeDocument.querySelector('[role="menuitemradio"][lang="'+lang+'"]').click();await until(()=>homeDocument.documentElement.lang===lang);results.push({route:'language-switch',lang,sameDocument:frame.contentDocument===homeDocument,titles:[...homeDocument.querySelectorAll('.hero-art-card__title')].map(d=>d.textContent),descriptions:[...homeDocument.querySelectorAll('.hero-art-card__description')].map(d=>d.textContent),footer:footerMetrics(homeDocument,frame.contentWindow)});}
// Real routing and filters, without any form submissions or catalog writes.
for(const lang of ['en','ja','fr'])for(const category of ['illustrations','sketches','paintings','character-design','backgrounds']){
frame.style.width='375px';await navigate('/portfolio/?lang='+lang);await until(()=>frame.contentDocument?.querySelector('.hero-art-card'));frame.contentDocument.querySelector('.hero-art-card[data-category="'+category+'"]').click();await until(()=>frame.contentWindow.location.search.includes('category='+category)&&frame.contentDocument.querySelector('.filter-button--active'));const clicked=frame.contentWindow.location.pathname==='/portfolio/illustration';await navigate(frame.contentWindow.location.href);await until(()=>frame.contentDocument.querySelector('.filter-button--active'));const refreshed=frame.contentWindow.location.search.includes('category='+category),active=frame.contentDocument.querySelector('.filter-button--active').textContent;frame.contentWindow.history.back();await until(()=>frame.contentDocument.querySelector('.manga-home-hero'));results.push({route:'hero-filter',lang,category,clicked,refreshed,back:true,active});
}
frame.style.width='390px';await navigate('/portfolio/illustration?category=backgrounds&lang=ja');await until(()=>frame.contentDocument?.querySelector('.filter-button--active'));
const doc=frame.contentDocument;results.push({route:'backgrounds',active:doc.querySelector('.filter-button--active').textContent,cards:doc.querySelectorAll('[data-fancybox="illustration-gallery"]').length});
doc.querySelectorAll('.filter-button')[1].click();await until(()=>frame.contentWindow.location.search.includes('category=all'));results.push({route:'all',active:doc.querySelector('.filter-button--active').textContent});
await navigate('/portfolio/animation?lang=en&adminPreview=1');await until(()=>frame.contentWindow.location.pathname==='/portfolio/'&&frame.contentDocument?.querySelector('.manga-home-hero'));results.push({route:'hidden-animation',redirect:frame.contentWindow.location.pathname});
document.getElementById('results').textContent=JSON.stringify({pending:true,stage:'shared-footer',results,errors});
// The same footer is present on ordinary public routes, but never in the Reader.
for(const lang of languages)for(const theme of themes)for(const width of (params.has('w')?[Number(params.get('w'))]:[320,375,390,430,768,1024,1366,1440,1920]))for(const route of ['mangaka','illustration','contact','missing-page']){
localStorage.setItem('portfolio-theme',theme);frame.style.width=width+'px';await navigate('/portfolio/'+route+'?lang='+lang);await until(()=>frame.contentDocument.querySelector('.portfolio-footer')&&frame.contentDocument.querySelector('main'));results.push({route:'shared-footer',page:route,lang,theme,width,footer:footerMetrics(frame.contentDocument,frame.contentWindow)});
}
await navigate('/portfolio/mangas/${sitePresentation.selectedMangaSlugs[0]}?lang=en');await until(()=>frame.contentDocument.querySelector('[data-reader-mode]'));results.push({route:'reader-footer',count:frame.contentDocument.querySelectorAll('footer').length});document.getElementById('results').textContent=JSON.stringify({results,errors});
})().catch(e=>document.getElementById('results').textContent=JSON.stringify({error:e.message,results,errors}));
</script></body></html>`;
const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
const served = [];
const server = createServer(async (request, response) => {
  served.push(request.url);
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/qa" || url.pathname === "/typography") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(url.pathname === '/qa' ? harness : await readFile('tools/artwork-admin/tests/typography-harness.html','utf8')); return; }
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname).replace(/^\/portfolio/, "")}`);
    if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403); response.end(); return; }
    if (!path.extname(file)) file = path.join(root, "index.html");
    let data = await readFile(file);
    if (path.extname(file) === ".html") data = Buffer.from(data.toString().replace(/<script src="https:[^>]+><\/script>/g, ""));
    response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream"); response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
// Real-time rendering pass: virtual-time dump-dom does not advance CSS transitions reliably.
// This protocol connection belongs only to the isolated headless test process.
async function typographyScreenshots(command, evaluate, folder) {
  const observations = [];
  const open = async (route, lang, theme, width) => {
    const response = await evaluate(`(async()=>{const frame=document.getElementById('site');localStorage.setItem('portfolio-theme',${JSON.stringify(theme)});frame.style.width='${width}px';frame.height='1300';await new Promise(resolve=>{frame.onload=resolve;frame.src='/portfolio/${route}?lang=${lang}';});for(let i=0;i<300&&!frame.contentDocument.querySelector('main');i++)await new Promise(r=>setTimeout(r,30));await new Promise(r=>setTimeout(r,700));return frame.contentDocument.documentElement.lang;})()`);
    assert.equal(response.result?.result?.value, lang);
  };
  const capture = async name => {
    const width = (await evaluate("document.getElementById('site').offsetWidth")).result.result.value;
    const shot = await command('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height: 1300, scale: 1 }, captureBeyondViewport: true });
    assert.ok(shot.result?.data); await writeFile(path.join(folder, name + '.png'), Buffer.from(shot.result.data, 'base64'));
  };
  await command('DOM.enable', {}); await command('CSS.enable', {});
  for (const [route, lang, theme, width] of [
    ['contact','en','light',1440], ['contact','en','dark',375],
    ['contact','fr','light',1024], ['contact','fr','dark',320],
    ['contact','ja','light',1920], ['contact','ja','dark',1024], ['contact','ja','light',375],
    ['','en','light',1440], ['','ja','dark',375], ['','fr','light',768],
    ['mangaka','ja','light',390], ['mangaka','fr','dark',1440],
    ['illustration','ja','light',320], ['illustration','fr','dark',1440],
  ]) {
    await open(route, lang, theme, width);
    await capture(`${route || 'home'}-${lang}-${theme}-${width}`);
    if (!route) {
      await evaluate("document.getElementById('site').contentDocument.querySelector('footer').scrollIntoView({behavior:'instant',block:'start'})");
      await new Promise(r=>setTimeout(r,700));
      await capture(`footer-${lang}-${theme}-${width}`);
    }
    if (route === 'contact') {
      await command('DOM.getDocument', { depth: -1, pierce: true });
      const object = await command('Runtime.evaluate', { expression: "document.getElementById('site').contentDocument.querySelector('.contact-display__title')" });
      const node = await command('DOM.requestNode', { objectId: object.result.result.objectId });
      const fonts = await command('CSS.getPlatformFontsForNode', { nodeId: node.result.nodeId });
      assert.ok(fonts.result?.fonts?.some(font=>font.glyphCount>0), JSON.stringify(fonts));
      observations.push({ route, lang, theme, width, fonts: fonts.result?.fonts || [], error: fonts.error });
      if (width < 500) {
        await evaluate("document.getElementById('site').contentDocument.querySelector('form').scrollIntoView({behavior:'instant',block:'start'})");
        await capture(`contact-form-${lang}-${theme}-${width}`);
      }
    }
  }
  // Overlay controls and live translations are tested without contacting external services.
  for (const lang of ['en','fr','ja']) for (const width of [320,1440]) {
    await open('illustration', lang, 'dark', width);
    const info = await evaluate(`(async()=>{const doc=document.getElementById('site').contentDocument;doc.querySelector('[data-lightbox-id]').click();for(let i=0;i<200&&!doc.querySelector('.fancybox__container .fancybox__image');i++)await new Promise(r=>setTimeout(r,30));await new Promise(r=>setTimeout(r,500));return {instances:doc.querySelectorAll('.fancybox__container').length,labels:[...doc.querySelectorAll('.fancybox__container button')].map(b=>b.getAttribute('aria-label')||b.title).filter(Boolean),caption:doc.querySelector('.fancybox__caption')?.textContent};})()`);
    assert.equal(info.result?.result?.value?.instances, 1);
    if (lang !== 'en') assert.ok(info.result.result.value.labels.every(label=>!/^Toggle zoom|^Go to slide/.test(label)),JSON.stringify(info.result.result.value));
    observations.push({ type: 'lightbox', lang, width, ...info.result.result.value });
    await capture(`lightbox-${lang}-dark-${width}`);
    if (width === 320) {
      await open('',lang,'dark',width);
      await evaluate("document.getElementById('site').contentDocument.querySelector('[aria-controls=mobile-navigation]').click()");
      await new Promise(r=>setTimeout(r,250)); await capture(`mobile-menu-${lang}-${width}`);
    }
    await open(`mangas/${sitePresentation.selectedMangaSlugs[0]}`,lang,'dark',width);
    const reader = await evaluate(`(()=>{const doc=document.getElementById('site').contentDocument;return {mode:doc.querySelector('[data-reader-mode]')?.dataset.readerMode,buttons:[...doc.querySelectorAll('[data-reader-header] button')].map(b=>({text:b.textContent.trim(),label:b.getAttribute('aria-label'),size:doc.defaultView.getComputedStyle(b).fontSize})),label:doc.querySelector('[data-vertical-reader]')?.getAttribute('aria-label')};})()`);
    observations.push({ type: 'reader', lang, width, ...reader.result.result.value });
    assert.ok(['vertical','horizontal'].includes(reader.result?.result?.value?.mode));
    const labels = getTranslations(lang).mangaReader;
    for (const mode of ['vertical','horizontal']) {
      const changed = await evaluate(`(async()=>{const doc=document.getElementById('site').contentDocument;[...doc.querySelectorAll('[data-reader-header] button')].find(b=>b.textContent.trim()===${JSON.stringify(labels[mode])}).click();await new Promise(r=>setTimeout(r,100));const section=doc.querySelector('[data-${mode}-reader]');return {mode:doc.querySelector('[data-reader-mode]').dataset.readerMode,label:section?.getAttribute('aria-label')};})()`);
      assert.equal(changed.result?.result?.value?.mode, mode);
      assert.equal(changed.result.result.value.label, labels[`${mode}Reader`](reader.result.result.value.title || 'Legend of Animiste'));
    }
    await capture(`reader-${lang}-${width}`);
  }
  await writeFile(path.join(folder,'observations.json'),JSON.stringify(observations,null,2));
  console.log(`Typography screenshots and actual platform fonts: ${folder}`);
}
async function motionReport() {
  const profile = path.join(temporary, "motion-profile");
  const child = spawn(chrome, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--window-size=1920,1600", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/qa?w=1440&lang=en&theme=light`], { windowsHide: true, stdio: "ignore" });
  let socket;
  const deadline = Date.now() + 50000;
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  try {
    let port;
    while (!port && Date.now() < deadline) { try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { await pause(); } }
    assert.ok(port, "Isolated browser debugging endpoint unavailable");
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(p => p.type === "page"); assert.ok(page);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    let nextId = 0; const pending = new Map();
    socket.addEventListener("message", event => { const result = JSON.parse(event.data); if (pending.has(result.id)) { pending.get(result.id)(result); pending.delete(result.id); } });
    const command = (method, params) => new Promise(resolve => { const id = ++nextId; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = expression => command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    while (Date.now() < deadline) {
      const response = await evaluate("document.getElementById('results')?.textContent");
      const value = response.result?.result?.value;
      if (value && value !== "Pending") {
        const report = JSON.parse(value);
        if (!report.pending) {
          if (process.env.HOME_QA_CAPTURE_DIR) {
            const folder = path.resolve(process.env.HOME_QA_CAPTURE_DIR); await mkdir(folder, { recursive: true });
            if (process.env.HOME_QA_TYPOGRAPHY_CAPTURE) {
              await typographyScreenshots(command, evaluate, folder);
              return report;
            }
            for (const [lang, theme, width, active = -1] of [["en", "light", 1440], ["en", "dark", 1440, 3], ["ja", "dark", 375], ["fr", "light", 768]]) {
              const rendered = await evaluate(`(async()=>{const frame=document.getElementById('site');localStorage.setItem('portfolio-theme',${JSON.stringify(theme)});frame.style.width='${width}px';frame.height='1300';await new Promise(resolve=>{frame.onload=resolve;frame.src='/portfolio/?lang=${lang}';});const win=frame.contentWindow,doc=frame.contentDocument;await new Promise(resolve=>{const timer=setInterval(()=>{if(doc.querySelectorAll('.hero-art-card img').length===5){clearInterval(timer);resolve();}},30);});await Promise.all([...doc.querySelectorAll('.hero-art-card img')].map(img=>img.decode()));await new Promise(resolve=>setTimeout(resolve,600));if(${active}>=0){doc.querySelectorAll('.hero-art-card')[${active}].focus({preventScroll:true});await new Promise(resolve=>setTimeout(resolve,400));}win.scrollTo({top:0,behavior:'instant'});return [...doc.querySelectorAll('.hero-art-card img')].every(img=>img.complete&&img.naturalWidth);})()`);
              assert.equal(rendered.result?.result?.value, true, JSON.stringify(rendered));
              const shot = await command("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: 1300, scale: 1 }, captureBeyondViewport: true });
              assert.ok(shot.result?.data); const file = path.join(folder, `realtime-${lang}-${theme}-${width}${active >= 0 ? `-active-${active}` : ""}.png`);
              await writeFile(file, Buffer.from(shot.result.data, "base64")); console.log(`Real-time screenshot: ${file}`);
              await evaluate(`(()=>{const frame=document.getElementById('site'),doc=frame.contentDocument,section=doc.querySelector('[aria-labelledby="sketchbook-title"]').cloneNode(true);doc.querySelector('main').replaceChildren(section);section.style.opacity='1';section.style.transform='none';section.style.marginTop='68px';frame.contentWindow.scrollTo({top:0,behavior:'instant'});return true;})()`);
              const socialShot=await command("Page.captureScreenshot",{format:"png",clip:{x:0,y:0,width,height:1300,scale:1},captureBeyondViewport:true});assert.ok(socialShot.result?.data);const socialFile=path.join(folder,`social-${lang}-${theme}-${width}.png`);await writeFile(socialFile,Buffer.from(socialShot.result.data,"base64"));console.log(`Social section screenshot: ${socialFile}`);
              // Isolate the existing rendered Footer for visual QA, never alter application files.
              await evaluate(`(()=>{const frame=document.getElementById('site'),doc=frame.contentDocument;doc.querySelector('main').remove();doc.querySelector('footer').style.marginTop='68px';frame.contentWindow.scrollTo({top:0,behavior:'instant'});return true;})()`);
              const footerShot=await command("Page.captureScreenshot",{format:"png",clip:{x:0,y:0,width,height:1300,scale:1},captureBeyondViewport:true});assert.ok(footerShot.result?.data);
              const footerFile=path.join(folder,`footer-${lang}-${theme}-${width}.png`);await writeFile(footerFile,Buffer.from(footerShot.result.data,"base64"));console.log(`Footer screenshot: ${footerFile}`);
            }
          }
          return report;
        }
      }
      await pause();
    }
    throw new Error("Real-time animation QA timed out");
  } finally { socket?.close(); const stopped = new Promise(resolve => child.once("exit", resolve)); child.kill(); await stopped; }
}
try {
  let report;
  if (process.env.HOME_QA_FULL_MOTION) { report = await motionReport(); }
  else {
  const child = spawn(chrome, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", ...(process.env.HOME_QA_FULL_MOTION ? [] : ["--force-prefers-reduced-motion"]), "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", `--user-data-dir=${path.join(temporary, "profile")}`, "--dump-dom", "--virtual-time-budget=240000", `http://127.0.0.1:${server.address().port}/${process.env.HOME_QA_TYPOGRAPHY?'typography':'qa'}`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", stderr = ""; child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => stderr += chunk);
  const timeout = setTimeout(() => child.kill(), 120000);
  const code = await new Promise((resolve, reject) => { child.on("exit", resolve); child.on("error", reject); }); clearTimeout(timeout);
  assert.equal(code, 0, stderr);
  const match = output.match(/<pre id="results">([^<]+)<\/pre>/); assert.ok(match, output);
  assert.notEqual(match[1], "Pending", JSON.stringify({ served, stderr, html: output.slice(-1600) }));
  report = JSON.parse(match[1].replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&"));
  }
  assert.equal(report.pending, undefined); assert.equal(report.error, undefined,JSON.stringify({error:report.error,last:report.results?.slice(-3)})); assert.deepEqual(report.errors, []);
  if(process.env.HOME_QA_TYPOGRAPHY){
    const file=path.join(tmpdir(),`kevgenga-typography-${process.env.HOME_QA_TYPOGRAPHY}.json`);await writeFile(file,JSON.stringify(report,null,2));
    console.log(`Typography report: ${file}; ${report.results.length} cases.`);
    for(const field of ['clipped','overlaps','small','badContrast','splitWords']){const issues=report.results.flatMap(r=>r[field].map(issue=>({...issue,locale:r.locale,theme:r.theme,viewport:r.width,route:r.route})));console.log(JSON.stringify({field,count:issues.length,examples:issues.slice(0,8)},null,2));if(process.env.HOME_QA_TYPOGRAPHY!=='before')assert.deepEqual(issues,[],`${field}: typography regression`);}
    assert.equal(report.results.length,216);
    for(const r of report.results){assert.ok(r.scrollWidth<=r.clientWidth,JSON.stringify({locale:r.locale,width:r.width,route:r.route}));if(r.route==='contact'){const title=r.samples.find(s=>s.selector==='contact-display__title');assert.ok(title);assert.ok(title.lines<=3,JSON.stringify(title));}}
  } else {
  if(process.env.HOME_QA_DIAGNOSTIC){const desktop=report.results.find(r=>r.width===1440);console.log(JSON.stringify({images:desktop.images,expanded:desktop.interaction.measurements.map(m=>({active:m.active,image:m.images[m.active]}))},null,2));}
  for (const result of report.results.filter((item) => item.width&&!item.route)) {
    assert.equal(result.viewport, result.width); assert.ok(result.scrollWidth <= result.width, JSON.stringify(result));
    assert.deepEqual(result.overflow, [], JSON.stringify(result)); assert.equal(result.mangas, 3); assert.equal(result.categories.length, 5); assert.equal(result.removedSection, true);
    assert.deepEqual(result.categories, ['illustrations','sketches','paintings','character-design','backgrounds'].map(c=>`/portfolio/illustration?category=${c}`));
    assert.deepEqual(result.restOpacity, [1,1,1,1,1]); assert.equal(result.restActive,0);
    for(const img of [...result.images,...(result.interaction?.measurements.flatMap(m=>m.images)||[])]){const card=sitePresentation.heroCards.find(c=>c.category===img.category);const expected=card.objectFit==='contain'?'contain':'cover';assert.equal(img.fit,expected);assert.ok(img.naturalWidth>0&&img.naturalHeight>0,JSON.stringify(img));if(expected==='cover')assert.ok(img.fills,JSON.stringify(img));}
    assert.deepEqual(result.titles,expectedLanguages[result.lang].titles);assert.deepEqual(result.descriptions.map(d=>d.text),expectedLanguages[result.lang].descriptions);
    for(const d of result.descriptions){assert.ok(d.visible&&d.accessible&&d.noHorizontalOverflow&&d.insideCaption,JSON.stringify(result));assert.equal(d.clamp,'2');assert.ok(d.height<=2*d.lineHeight+1,JSON.stringify(result));}
    assert.deepEqual(result.actions.map(a=>a.href),['/portfolio/mangaka','/portfolio/illustration']);assert.deepEqual(result.actions.map(a=>a.text),expectedLanguages[result.lang].actions);
    if (result.interaction) { const i=result.interaction; assert.ok(i.zeroExpansion&&i.zeroAngle&&i.upright, JSON.stringify(result));assert.deepEqual(i.mouseEnter,[0.58,0.58,1,0.58,0.58]);assert.deepEqual(i.mouseLeave,[1,1,1,1,1]); for(const m of i.measurements){assert.ok(m.gains&&m.shrinks&&m.contained,JSON.stringify(result));assert.ok(Math.abs(m.sum-m.initialSum)<=3);assert.equal(m.groupWidth,i.groupWidth);assert.deepEqual(m.opacity,Array.from({length:5},(_,j)=>j===m.active?1:0.58));assert.ok(m.description.visible&&(m.description.full||m.description.scrollable)&&m.description.accessible&&m.description.noHorizontalOverflow&&m.description.insideCaption&&m.description.clamp==='none',JSON.stringify(result));}const future=result.futureDescription;assert.ok(future.shortFull&&future.scrollable&&future.heightUnchanged&&!future.longCollapsed.full&&future.longCollapsed.clamp==='2'&&future.longExpanded.clamp==='none'&&future.longExpanded.insideCaption&&future.longExpanded.noHorizontalOverflow,JSON.stringify(result)); }
    assert.equal(result.animationLinks, 0); assert.equal(result.heroBroken, false);
    assert.deepEqual(result.sections,['01','02','03']);assert.equal(result.mainGroups,0);
    assert.deepEqual(result.social,{label:expectedLanguages[result.lang].socialLabel,title:expectedLanguages[result.lang].socialTitle,description:expectedLanguages[result.lang].socialDescription,widgets:1});
    if (result.mobileAnimationLinks !== undefined) assert.equal(result.mobileAnimationLinks, 0);
  }
  assert.equal(report.results.filter(r=>r.route==='hero-filter'&&r.clicked&&r.refreshed&&r.back).length,15);
  assert.equal(report.results.filter(r=>r.route==='hero-cta'&&r.noCategory&&r.refreshed&&r.back).length,12);
  for(const r of report.results.filter(r=>r.route==='language-switch')){assert.ok(r.sameDocument);assert.deepEqual(r.titles,expectedLanguages[r.lang].titles);assert.deepEqual(r.descriptions,expectedLanguages[r.lang].descriptions);}
  assert.ok(report.results.some((r) => r.route === "backgrounds" && r.active.startsWith("\u80cc\u666f")));
  assert.ok(report.results.some((r) => r.route === "all" && r.active.startsWith("\u3059\u3079\u3066")));
  assert.ok(report.results.some((r) => r.route === "hidden-animation" && r.redirect === "/portfolio/"));
  const footerCases=report.results.filter(r=>r.footer);
  for(const r of footerCases){const f=r.footer;assert.deepEqual(f.items,expectedFooters[r.lang].items);assert.equal(f.role,expectedFooters[r.lang].experience.role);assert.equal(f.period,expectedFooters[r.lang].experience.period);assert.deepEqual(f.duplicateIds,[]);assert.deepEqual(f.overflow,[],JSON.stringify(r));assert.equal(f.background,'rgb(17, 17, 17)');assert.equal(f.images,0);assert.ok(f.links.includes('/portfolio/mangaka')&&f.links.includes('/portfolio/illustration')&&f.links.includes('/portfolio/contact'));assert.equal(f.copyright,getTranslations(r.lang).footer.copyright(new Date().getFullYear()));}
  assert.equal(report.results.filter(r=>r.route==='shared-footer').length,process.env.HOME_QA_FULL_MOTION?4:216);assert.ok(report.results.some(r=>r.route==='reader-footer'&&r.count===0));
  console.log(`Shared Footer QA: ${footerCases.length} cases, all skills/tools preserved, no duplicate IDs/overflow; height range ${Math.min(...footerCases.map(r=>r.footer.height))}–${Math.max(...footerCases.map(r=>r.footer.height))}px. Reader Footer remains absent.`);
  console.log(`Chromium QA passed (${process.env.HOME_QA_FULL_MOTION ? "real-time transitions" : "reduced motion"}): ${report.results.filter(r=>r.width&&!r.route).length} Home viewport/language/theme cases, ${report.results.filter(r=>r.interaction).length*5} focused expansions, rest/hover/exit opacity, five visible descriptions + short/long fixtures, live EN/JA/FR switching, 12 CTA and 15 filter click/reload/back cases. No overflow or browser errors.`);
  if (process.env.HOME_QA_CAPTURE_DIR && !process.env.HOME_QA_TYPOGRAPHY_CAPTURE) {
    const folder = path.resolve(process.env.HOME_QA_CAPTURE_DIR); await mkdir(folder, { recursive: true });
    for (const [lang, theme, width, section = "", active = ""] of [["en", "light", 1440], ["ja", "dark", 375], ["fr", "light", 768], ["ja", "light", 1920], ["en", "dark", 1440, "", "3"], ["fr", "light", 390, "selected-manga"]]) {
      const file = path.join(folder, `${lang}-${theme}-${width}${section ? `-${section}` : ""}${active ? `-active-${active}` : ""}.png`);
      const capture = spawn(chrome, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--force-prefers-reduced-motion", "--run-all-compositor-stages-before-draw", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", `--user-data-dir=${path.join(temporary, `capture-${lang}-${width}-${section}`)}`, `--window-size=${width},1600`, `--screenshot=${file}`, "--dump-dom", "--virtual-time-budget=60000", `http://127.0.0.1:${server.address().port}/qa?capture=1&lang=${lang}&theme=${theme}&w=${width}&section=${section}&active=${active}`], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      let captureOutput = ""; capture.stdout.on("data", (chunk) => captureOutput += chunk);
      assert.equal(await new Promise((resolve, reject) => { capture.on("exit", resolve); capture.on("error", reject); }), 0);
      const captureMatch = captureOutput.match(/<pre id="results"[^>]*>([^<]+)<\/pre>/);
      console.log(`Screenshot: ${file} ${captureMatch ? JSON.stringify(JSON.parse(captureMatch[1]).captureStyles) : ""}`);
    }
  }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
