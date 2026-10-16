import assert from "node:assert/strict";
import { getTranslations } from "../src/i18n/locale.js";

// Called by the existing read-only Vite/Chrome harness: no second catalogue,
// real data writes, server, browser profile or network service.
export async function verifyIllustrationViewsAndScroll({ evaluate, command, until, click, navigate, resize, capture, slug, widths }) {
  const key = async (key, code) => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: code, ...(key === "Enter" ? {text:"\r",unmodifiedText:"\r"} : {}) });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code });
  };
  const frame = () => evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const viewButton = (value, locale = "fr") => `.illustration-view-controls button[aria-label=${JSON.stringify(getTranslations(locale).illustration.views[value])}]`;
  const setView = async value => {
    await click(viewButton(value));
    await until(`Boolean(document.querySelector('.illustration-grid--compact'))===${value === "compact"}`);
    await frame();
  };
  const links = () => evaluate("[...document.querySelectorAll('[data-lightbox-id]')].map(el=>({id:el.dataset.lightboxId,src:el.href}))");
  const scrollDown = async top => {
    await evaluate(`scrollTo({top:${top},behavior:'instant'})`); await frame();
  };
  const closeLightbox = async () => { await key("Escape", 27); await until("!document.querySelector('.fancybox__container')"); };

  // A long catalogue, real progressive batches, repeated view changes, search
  // parameters, chronological sorting and the exact same full slide sequence.
  await resize(390); await navigate("illustration", "fr", "light", false, "&category=all&keep=gallery-qa");
  await until("document.querySelector('.illustration-grid')");
  await scrollDown(0);
  await setView("cards");
  const initial = await links(), initialUrl = await evaluate("location.href");
  assert.equal(initial.length, 24, "Default view retains the initial progressive batch");
  for (const value of ["compact", "cards", "compact", "cards", "compact"]) {
    await setView(value);
    assert.deepEqual(await links(), initial);
    assert.equal(await evaluate("location.href"), initialUrl);
  }
  const sortBefore = await links();
  await click(".filter-button--sort"); await frame();
  assert.notDeepEqual(await links(), sortBefore, "Existing chronological sort works in compact view");
  const oldest = await links();
  await setView("cards"); assert.deepEqual(await links(), oldest);
  await setView("compact");
  await click(".filter-bar > button:nth-child(4)"); // Sketches, after sort/All/Illustrations.
  await until("new URLSearchParams(location.search).get('category')==='sketches'");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('keep')"), "gallery-qa");
  assert.equal(await evaluate("Boolean(document.querySelector('.illustration-grid--compact'))"), true);
  await evaluate("window.__galleryDocument=123");
  await command("Page.reload", { ignoreCache: true });
  await until("window.__galleryDocument===undefined&&document.querySelector('.illustration-grid--compact')&&document.documentElement.lang==='fr'");
  assert.equal(await evaluate("window.__galleryDocument===undefined"), true);
  assert.equal(await evaluate("localStorage.getItem('portfolio-illustration-view')"), "compact");
  const restoredFilter = await evaluate("({url:location.href,active:document.querySelector('.filter-bar > [aria-pressed=true]')?.textContent})");
  assert.ok(restoredFilter.active?.includes('Croquis'), JSON.stringify(restoredFilter));
  await click(".filter-bar > button:nth-child(2)"); await until("new URLSearchParams(location.search).get('category')==='all'");
  await until("document.querySelector('.filter-bar > button:nth-child(2) .filter-count')");
  await frame();
  const total = await evaluate("Number(document.querySelector('.filter-bar > button:nth-child(2) .filter-count').textContent.match(/\\d+/)[0])");
  assert.ok(total > 300);
  for (let i = 0; i < 40 && (await links()).length < total; i++) {
    const before = (await links()).length;
    await evaluate("document.querySelector('.illustration-grid + div[aria-hidden=true]')?.scrollIntoView({block:'center'})");
    await until(`document.querySelectorAll('[data-lightbox-id]').length>${before}`);
  }
  const all = await links(); assert.equal(all.length, total);
  assert.equal(new Set(all.map(a => a.id)).size, total, "Progressive loading never duplicates an artwork");
  const loaded = all.length;
  await setView("cards"); assert.equal((await links()).length, loaded);
  await setView("compact"); assert.deepEqual(await links(), all);
  await resize(1440);
  await click(`[data-lightbox-id=${JSON.stringify(all[49].id)}]`);
  const selected = index => `location.hash==='#illustration-gallery-${index + 1}'&&document.querySelector('.fancybox__slide.is-selected img')?.src===${JSON.stringify(all[index].src)}&&document.querySelector('.fancybox__slide.is-selected img')?.naturalWidth>0`;
  await until(selected(49));
  const checkCounter = async index => {
    assert.equal(await evaluate("Number(document.querySelector('[data-fancybox-current-index]').textContent)"), index + 1);
    assert.equal(await evaluate("Number(document.querySelector('[data-fancybox-count]').textContent)"), total);
    assert.equal(await evaluate("document.querySelectorAll('.fancybox__container').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('.public-back-to-top').length"), 0);
  };
  await checkCounter(49);
  // A view rerender while immersive must not rebind/recreate its instance.
  await evaluate("window.__sameLightbox=document.querySelector('.fancybox__container')");
  await setView("cards");
  assert.equal(await evaluate("document.querySelector('.fancybox__container')===window.__sameLightbox"), true);
  await key("ArrowRight", 39); await until(selected(50)); await checkCounter(50);
  await key("ArrowLeft", 37); await until(selected(49));
  // Thumbs virtualizes distant items: exercise several real nearby buttons.
  for (const index of [48, 50, 49]) {
    const thumb = `.fancybox__thumbs [data-carousel-index="${index}"]`;
    await until(`document.querySelector(${JSON.stringify(thumb)})`);
    await click(thumb); await until(selected(index)); await checkCounter(index);
  }
  const zoom = '.fancybox__toolbar button[data-panzoom-action="iterateZoom"]';
  await until(`document.querySelector(${JSON.stringify(zoom)})&&!document.querySelector(${JSON.stringify(zoom)}).disabled`);
  const beforeZoom = await evaluate("document.querySelector('.fancybox__slide.is-selected .fancybox__content').style.transform");
  await click(zoom);
  await until(`document.querySelector('.fancybox__slide.is-selected .fancybox__content').style.transform!==${JSON.stringify(beforeZoom)}`);
  if (await evaluate("document.fullscreenEnabled")) {
    const point = await evaluate("(()=>{const r=document.querySelector('[data-fancybox-toggle-fullscreen]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await command("Input.dispatchMouseEvent", {type:"mousePressed",button:"left",clickCount:1,...point});
    await command("Input.dispatchMouseEvent", {type:"mouseReleased",button:"left",clickCount:1,...point});
    await until("document.fullscreenElement&&!document.querySelector('.public-back-to-top')");
    await evaluate("document.exitFullscreen()"); await until("!document.fullscreenElement");
  }
  await closeLightbox();
  assert.equal(await evaluate("location.hash"), "");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('category')"), "all");
  assert.equal((await links()).length, total);
  await until("document.querySelector('.public-back-to-top')");

  // Deep links beyond the first mounted batch use the full existing catalogue.
  await navigate("illustration", "fr", "dark", false, "&category=all#illustration-gallery-50");
  await until(selected(49)); await checkCounter(49);
  await closeLightbox();
  await setView("compact");
  // Navigation back restores the originating route/filter; no URL for view mode.
  const beforeNavigation = await evaluate("location.href");
  await click('nav a[href*="/contact"]'); await until("location.pathname.endsWith('/contact')");
  await evaluate("history.back()"); await until("document.querySelector('.illustration-grid--compact')");
  assert.equal(await evaluate("location.href"), beforeNavigation);

  let scrollChecks = 0;
  for (const locale of ["en", "fr", "ja"]) for (const theme of ["light", "dark"]) {
    for (const route of ["", "mangaka", "illustration", "contact"]) {
      await navigate(route, locale, theme, false, route === "illustration" ? "&category=backgrounds" : "");
      await until("document.querySelector('footer .portfolio-footer__copyright')");
      if (route === "illustration") await until("document.querySelector('.illustration-grid')");
      for (const width of widths.filter(w => w !== 1280)) {
        await resize(width); await scrollDown(0);
        await until("!document.querySelector('.public-back-to-top')");
        const maximum = await evaluate("document.documentElement.scrollHeight-innerHeight");
        assert.ok(maximum >= 400, `Expected useful scroll distance for ${route || 'Home'} at ${width}px`);
        await scrollDown(Math.min(450, maximum)); await until("document.querySelector('.public-back-to-top')");
        await scrollDown("document.documentElement.scrollHeight");
        await until("document.querySelector('.public-back-to-top')");
        const footerState = await evaluate(`(()=>{
          const el=document.querySelector('.public-back-to-top'),r=el.getBoundingClientRect();
          const intersects=s=>s.width>0&&s.height>0&&s.right>r.left-2&&s.left<r.right+2&&s.bottom>r.top-2&&s.top<r.bottom+2;
          const collisions=[...document.querySelectorAll('footer a,footer p,footer h2,footer h3,footer li')].filter(el=>{const range=document.createRange();range.selectNodeContents(el);return [...range.getClientRects()].some(intersects)}).map(el=>el.textContent);
          return {count:document.querySelectorAll('.public-back-to-top').length,label:el.getAttribute('aria-label'),overflow:document.documentElement.scrollWidth>innerWidth,collisions,visible:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el};
        })()`);
        assert.equal(footerState.count, 1);
        assert.equal(footerState.label, getTranslations(locale).common.backToTop);
        assert.equal(footerState.overflow, false, JSON.stringify({locale,theme,route,width,footerState}));
        assert.deepEqual(footerState.collisions, [], JSON.stringify({locale,theme,route,width,footerState}));
        assert.equal(footerState.visible, true); assert.equal(footerState.hit, true);
        const url = await evaluate("location.href");
        await click(".public-back-to-top"); await until("scrollY<1");
        assert.equal(await evaluate("location.href"), url);
        scrollChecks++;
      }
    }
  }

  // Current route/params/hash, keyboard, real touch, reduced-motion and smooth
  // intent, live translation, mobile menu, generic modal and native fullscreen.
  await resize(390); await navigate("illustration", "en", "dark", false, "&category=illustrations#preserved-anchor");
  await until("document.querySelector('.illustration-grid')"); await scrollDown(800);
  await until("document.querySelector('.public-back-to-top')");
  await evaluate("window.__originalScroll=window.scrollTo;window.__scrollCalls=[];window.scrollTo=function(options,...rest){window.__scrollCalls.push(options);return window.__originalScroll.call(window,options,...rest)}");
  await command("Emulation.setEmulatedMedia", { features: [{name:"prefers-reduced-motion",value:"reduce"}] });
  await command("Page.bringToFront");
  await evaluate("document.querySelector('.public-back-to-top').focus()");
  assert.equal(await evaluate("document.activeElement===document.querySelector('.public-back-to-top')"), true);
  await key("Enter", 13); await frame();
  await until("scrollY<1");
  assert.equal(await evaluate("window.__scrollCalls.at(-1).behavior"), "auto");
  assert.equal(await evaluate("location.hash"), "#preserved-anchor");
  await scrollDown(800); await until("document.querySelector('.public-back-to-top')");
  await command("Emulation.setEmulatedMedia", { features: [{name:"prefers-reduced-motion",value:"no-preference"}] });
  await click(".public-back-to-top"); await until("scrollY<1");
  assert.equal(await evaluate("window.__scrollCalls.at(-1).behavior"), "smooth");
  await command("Emulation.setEmulatedMedia", { features: [{name:"prefers-reduced-motion",value:"reduce"}] });
  await scrollDown(800); await until("document.querySelector('.public-back-to-top')");
  await command("Emulation.setTouchEmulationEnabled", {enabled:true});
  const tap = await evaluate("(()=>{const r=document.querySelector('.public-back-to-top').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await command("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[tap]});
  await command("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]}); await until("scrollY<1");
  await command("Emulation.setTouchEmulationEnabled", {enabled:false});
  await scrollDown(800); await until("document.querySelector('.public-back-to-top')");
  await click('nav button[aria-controls="mobile-navigation"]'); await until("document.querySelector('#mobile-navigation')&&!document.querySelector('.public-back-to-top')");
  await click("#mobile-navigation button"); await until("!document.querySelector('#mobile-navigation')&&document.querySelector('.public-back-to-top')");
  await click('nav button[aria-haspopup="menu"]'); await until("document.querySelector('[role=menuitemradio][lang=ja]')"); await click('[role=menuitemradio][lang=ja]');
  await until("document.querySelector('.public-back-to-top')?.getAttribute('aria-label')==='ページ上部へ戻る'");
  await evaluate("window.__dialog=document.createElement('dialog');document.body.append(window.__dialog);window.__dialog.showModal()");
  await until("!document.querySelector('.public-back-to-top')");
  await evaluate("window.__dialog.close();window.__dialog.remove()"); await until("document.querySelector('.public-back-to-top')");
  if (await evaluate("document.fullscreenEnabled")) {
    await evaluate("window.__fs=document.createElement('button');window.__fs.textContent='fixture fullscreen';window.__fs.style='position:fixed;top:120px;left:20px;z-index:60';window.__fs.onclick=()=>document.documentElement.requestFullscreen();document.body.append(window.__fs)");
    await command("Input.dispatchMouseEvent", {type:"mousePressed",button:"left",clickCount:1,x:100,y:130});
    await command("Input.dispatchMouseEvent", {type:"mouseReleased",button:"left",clickCount:1,x:100,y:130});
    await until("document.fullscreenElement&&!document.querySelector('.public-back-to-top')");
    await evaluate("document.exitFullscreen()"); await until("!document.fullscreenElement&&document.querySelector('.public-back-to-top')");
    await evaluate("window.__fs.remove()");
  }
  await scrollDown("document.documentElement.scrollHeight");
  await capture("footer-ja-dark-mobile-scroll-button");
  await navigate("mangas/" + slug, "ja", "dark"); await until("document.querySelector('[data-reader-mode]')");
  assert.equal(await evaluate("document.querySelectorAll('.public-back-to-top,.public-scroll-tools').length"), 0, "Public scroll tool is not mounted in Reader at all");
  // Leave the shared harness in its default visual preference for later checks.
  await evaluate("localStorage.removeItem('portfolio-illustration-view')");
  console.log(`Illustration views + public scroll Chrome QA: ${scrollChecks} route/locale/theme/viewport footer+middle checks; ${total} catalogue items progressively mounted without duplicates; views/batch/sort/filter/URL/back/reload persistence, slide 50 with exact image/counter, keyboard/thumbnail/deep link/single instance, footer text collision checks, keyboard/touch, reduced motion/smooth, live locale, mobile menu/dialog/fullscreen and strict Reader exclusion OK.`);
}
