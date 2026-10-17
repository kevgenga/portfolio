import assert from "node:assert/strict";
import { getTranslations } from "../src/i18n/locale.js";
import { formatPortfolioDate, formatPortfolioDateLines } from "../src/utils/formatPortfolioDate.js";

// Reuses the existing read-only Vite fixtures and real browser; no catalog writes.
export async function verifyIllustrationFooterV2({evaluate,command,until,click,navigate,resize,capture,ids}) {
  let checks = 0;
  const widths = [320,360,375,390,430,768,1024,1440,1920];
  const metrics = () => evaluate(`(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1;
    const lum=color=>{const rgb=color.match(/\\d+(?:\\.\\d+)?/g).slice(0,3).map(Number),scale=color.startsWith('color(srgb')?1:255;return rgb.map(v=>{v/=scale;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)};
    return {overflow:document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('.artwork-card')].map(card=>{
      const c=rect(card),footer=card.querySelector('.artwork-card__footer'),date=card.querySelector('.artwork-card__date-ribbon'),badge=card.querySelector('.work-badge'),image=card.querySelector('img');
      const d=date&&rect(date),b=badge&&rect(badge),f=footer&&rect(footer),style=date&&getComputedStyle(date);
      const dateOnly=footer?.classList.contains('artwork-card__footer--date-only'),badgeStyle=badge&&getComputedStyle(badge),copy=badge?.querySelector('.work-badge__copy'),label=badge?.querySelector('.work-badge__label'),duration=badge?.querySelector('.work-badge__duration');
      const foreground=badgeStyle&&lum(badgeStyle.color),background=badgeStyle&&lum(badgeStyle.backgroundColor);
      const metadata=card.querySelector('.artwork-card__metadata'),metadataStyle=metadata&&getComputedStyle(metadata),inlineStyle=date&&getComputedStyle(date.querySelector('.artwork-card__date-inline'));
      const lineNodes=[...card.querySelectorAll('.artwork-card__date-line')];
      const lines=lineNodes.map(line=>{const s=getComputedStyle(line),r=rect(line),range=document.createRange();range.selectNodeContents(line);const texts=[...range.getClientRects()];return {text:line.textContent,clip:s.clipPath,align:s.textAlign,bg:s.backgroundColor,color:s.color,readable:parseFloat(s.fontSize)>=12.5,contained:line.scrollWidth<=line.clientWidth+1&&texts.every(text=>text.left>=r.left-1&&text.right<=r.right-parseFloat(s.paddingRight)+1)}});
      return {id:card.querySelector('[data-lightbox-id]').dataset.lightboxId,box:c,image:{...rect(image),src:image.getAttribute('src'),fit:getComputedStyle(image).objectFit},footer:f,date:d,badge:b,lines,hasTime:Boolean(badge),dateOnly,obsoleteLabel:/Temps non renseigné|Time not recorded|制作時間未登録/.test(card.textContent),label:label?.textContent,labelSize:label&&parseFloat(getComputedStyle(label).fontSize),contrast:badge&&(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05),dateText:date?.querySelector('.sr-only')?.textContent,inline:date&&getComputedStyle(date.querySelector('.artwork-card__date-inline')).display,
        footerBackground:metadataStyle?.backgroundColor,dateColor:style?.color,inlineBackground:inlineStyle?.backgroundColor,inlineColor:inlineStyle?.color,footerGap:footer&&parseFloat(getComputedStyle(footer).rowGap),datePadding:lineNodes[0]&&[getComputedStyle(lineNodes[0]).paddingLeft,getComputedStyle(lineNodes[0]).paddingRight],
        contained:(!f||inside(f,c))&&(!d||inside(d,c))&&(!b||inside(b,c)),
        overlap:Boolean(d&&b&&d.right>b.left+1&&d.left<b.right-1&&d.bottom>b.top+1&&d.top<b.bottom-1),
        horizontal:Boolean(d&&b&&b.left>=d.right-1),dateCentered:!style||style.textAlign==='center',badgeCentered:!badge||(getComputedStyle(copy).textAlign==='center'&&(!duration||getComputedStyle(duration).justifyContent==='center')),
        overflow:badge&&badge.scrollWidth>badge.clientWidth+1,kind:badge?.dataset.productionKind,tier:badge?.className,clock:card.querySelectorAll('.production-time__clock').length,belowImage:!f||f.top>=rect(image).bottom-1};
    })};
  })()`);
  const assertTheme = (card, theme) => {
    if(theme==='dark') {
      assert.equal(card.footerBackground,'rgb(0, 0, 0)','Only the footer becomes pure black');
      assert.equal(card.dateColor,'rgb(0, 0, 0)');
      if(card.inline!=='none') {
        assert.equal(card.inlineBackground,'rgb(255, 255, 255)','Compact V2 keeps black date text readable on white');
        assert.equal(card.inlineColor,'rgb(0, 0, 0)');
      }
    } else assert.equal(card.footerBackground,'rgb(237, 234, 226)','Validated light surface stays unchanged');
  };
  const assertRibbon = (line,theme) => {
    assert.notEqual(line.clip,'none');
    assert.equal(line.bg,theme==='dark'?'rgb(255, 255, 255)':'rgb(17, 17, 17)');
    assert.equal(line.color,theme==='dark'?'rgb(0, 0, 0)':'rgb(255, 255, 255)');
    assert.ok(line.readable&&line.contained,JSON.stringify({theme,line}));
  };
  const assertDateOnly = (card, context) => {
    assert.equal(card.dateOnly,true); assert.ok(card.footer&&card.date);
    assert.equal(card.badge,null); assert.equal(card.hasTime,false); assert.equal(card.clock,0);
    assert.equal(card.obsoleteLabel,false); assert.equal(card.kind,undefined);
    assert.ok(Math.abs(card.date.width-card.footer.width)<1,'V3 date fills the footer, with no reserved badge column');
    assert.equal(card.inline,'none'); assert.equal(card.lines.length,2);
    assert.equal(card.contained,true,JSON.stringify({context,card})); assert.equal(card.dateCentered,true);
    for(const line of card.lines) {
      assertRibbon(line,context.theme);
      assert.equal(line.align,'center'); assert.ok(line.readable&&line.contained,JSON.stringify({context,line}));
    }
  };
  for(const locale of ['en','fr','ja']) for(const theme of ['light','dark']) for(const kind of ['actual','estimated']) {
    await navigate('illustration',locale,theme,false,'&category=illustrations&fixtureLongDuration='+kind);
    await until("document.querySelector('.artwork-card__footer')");
    for(const view of ['cards','compact']) {
      await click(`.illustration-view-controls button[aria-label=${JSON.stringify(getTranslations(locale).illustration.views[view])}]`);
      for(const width of widths) {
        await resize(width);
        await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
        const state = await metrics(); assert.equal(state.overflow,false,JSON.stringify({locale,theme,kind,view,width}));
        for(const card of state.cards) {
          assert.equal(card.contained,true,JSON.stringify({locale,theme,kind,view,width,card})); assert.equal(card.overlap,false);
          assert.equal(card.badgeCentered,true); assert.equal(card.dateCentered,true); assert.ok(!card.overflow);
          assert.ok(card.footer&&card.date,'Dated Illustrations use V2 with a duration, V3 otherwise');
          assertTheme(card,theme);
          assert.equal(card.belowImage,view==='cards');
          if(card.dateOnly) { assertDateOnly(card,{locale,theme,kind,view,width}); continue; }
          assert.ok(card.contrast>=4.5,JSON.stringify(card)); assert.ok(card.labelSize>=(locale==='ja'?14:13)); assert.equal(card.clock,1);
          if(view==='cards') {
            if(card.footer.width<=239) {
              assert.deepEqual(card.datePadding,[card.datePadding[0],card.datePadding[0]],'Stacked ribbons use symmetric inner padding');
              assert.ok(Math.abs(card.badge.width-card.footer.width)<1,'Stacked badge fills its column');
              assert.ok(Math.abs((card.badge.left+card.badge.right-card.date.left-card.date.right)/2)<1,'Stacked date and badge are centered together');
              assert.ok(card.footerGap>=6&&card.footerGap<=8,'Regular stacked gap, without fixed footer height');
            }
            assert.equal(card.lines.length,2); for(const line of card.lines) assertRibbon(line,theme);
            if(width>=1440) assert.equal(card.horizontal,true,'V2 date left / badge right on roomy cards');
          } else assert.notEqual(card.inline,'none','Compact dates keep their dense single-block presentation');
        }
        if(view==='cards') {
          const rows=new Map(); for(const card of state.cards) {const top=Math.round(card.box.top);if(!rows.has(top))rows.set(top,[]);rows.get(top).push(card.box.height);}
          for(const heights of rows.values()) assert.ok(Math.max(...heights)-Math.min(...heights)<1,'Same-row large cards have matching heights');
        }
        if(kind==='estimated'&&[375,1440].includes(width)) {
          await evaluate("document.querySelector('.artwork-card').scrollIntoView({block:'center'})");
          await capture(`illustration-footer-v2-${locale}-${theme}-${view}-${width}`);
        }
        checks++;
      }
    }
  }
  // Categories with no fixture durations (especially Sketches), plus all/mixed
  // filters. Entirely empty fixtures leave real catalogs and Lightbox data absent.
  let emptyChecks=0;
  for(const locale of ['en','fr','ja']) for(const theme of ['light','dark']) {
    for(const category of ['all','illustrations','sketches','paintings','character-design','backgrounds']) {
      await navigate('illustration',locale,theme,true,'&category='+category); await until("document.querySelector('.artwork-card__footer--date-only')");
      for(const view of ['cards','compact']) {
        await click(`.illustration-view-controls button[aria-label=${JSON.stringify(getTranslations(locale).illustration.views[view])}]`);
        for(const width of widths) {
          await resize(width); const state=await metrics(); assert.equal(state.overflow,false);
          assert.ok(state.cards.length>0);
          for(const card of state.cards) {
            assertTheme(card,theme);
            assertDateOnly(card,{locale,theme,category,view,width}); assert.equal(card.overlap,false); assert.ok(!card.overflow);
          }
          if(category==='sketches'&&[375,1440].includes(width)) {await evaluate("document.querySelector('.artwork-card').scrollIntoView({block:'center'})");await until("getComputedStyle(document.querySelector('.artwork-card')).opacity==='1'");await capture(`illustration-v3-${locale}-${theme}-${view}-${width}`);}
          emptyChecks++;
        }
      }
    }
    if(locale==='fr'&&theme==='light') {
      await click('.artwork-card__link');await until("document.querySelector('.fancybox__container')");
      assert.equal(await evaluate("document.querySelectorAll('.fancybox__container .production-time,.fancybox__container .artwork-card__footer--date-only').length"),0);
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until("!document.querySelector('.fancybox__container')");
    }
  }
  // DOM-only date stress fixtures use the real formatter, without resorting,
  // modifying the catalogue, or introducing another date parser in the test.
  for(const dateOnly of [false,true]) for(const locale of ['en','fr','ja']) for(const theme of ['light','dark']) {
    await navigate('illustration',locale,theme,dateOnly); await until("document.querySelector('.artwork-card__date-ribbon')");
    if(!dateOnly&&locale==='fr'&&theme==='light') {
      await click(`.illustration-view-controls button[aria-label=${JSON.stringify(getTranslations(locale).illustration.views.cards)}]`);
      await resize(1440); await evaluate("document.querySelector('.artwork-card').scrollIntoView({block:'center'})");
      await until("getComputedStyle(document.querySelector('.artwork-card')).opacity==='1'");
      await capture('illustration-footer-v2-reference-fr-1h');
    }
    for(const view of ['cards','compact']) {
      await click(`.illustration-view-controls button[aria-label=${JSON.stringify(getTranslations(locale).illustration.views[view])}]`);
      for(const width of [320,375,1440]) {
        await resize(width);
        for(const date of ['01-09-2035','23-11-2025','02-05-2001']) {
          const lines=formatPortfolioDateLines(date,locale),label=formatPortfolioDate(date,locale);
          await evaluate(`(()=>{const date=document.querySelector('.artwork-card__date-ribbon');date.querySelector('.sr-only').textContent=${JSON.stringify(label)};date.querySelector('.artwork-card__date-inline').textContent=${JSON.stringify(label)};[...date.querySelectorAll('.artwork-card__date-line')].forEach((span,i)=>span.textContent=${JSON.stringify(lines)}[i]);})()`);
          const state=await metrics(),card=state.cards[0];
          assert.equal(state.overflow,false); assert.equal(card.contained,true); assert.equal(card.overlap,false);
          assert.equal(card.dateText,label); assert.equal(card.badgeCentered,true);
          if(dateOnly) assertDateOnly(card,{locale,theme,view,width,date});
          if(view==='cards'||dateOnly) { assert.deepEqual(card.lines.map(line=>line.text),lines); assert.ok(card.lines.every(line=>line.contained&&line.readable),JSON.stringify({locale,theme,width,date,card})); }
          checks++;
        }
      }
    }
  }
  // Short phone viewports, including the supplied 375 × 667 example. Real
  // image links/fixtures remain intact; only browser emulation changes here.
  let phoneChecks=0;
  for(const locale of ['en','fr','ja']) for(const theme of ['light','dark']) {
    await navigate('illustration',locale,theme); await until("document.querySelector('.artwork-card__footer')");
    for(const view of ['cards','compact']) {
      await click(`.illustration-view-controls button[aria-label=${JSON.stringify(getTranslations(locale).illustration.views[view])}]`);
      for(const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
        await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
        const state=await metrics(); assert.equal(state.overflow,false);
        assert.ok(state.cards.some(card=>card.hasTime)&&state.cards.some(card=>card.dateOnly),'Mixed V2/V3 fixture');
        for(const card of state.cards) {
          assertTheme(card,theme); assert.equal(card.contained,true); assert.equal(card.overlap,false);
          if(card.dateOnly) assertDateOnly(card,{locale,theme,view,width,height});
          else { assert.ok(card.contrast>=4.5); assert.equal(card.badgeCentered,true); assert.ok(!card.overflow); }
        }
        if(locale==='fr'&&theme==='dark'&&width===375) {
          await evaluate("document.querySelector('.artwork-card').scrollIntoView({block:'center'})");
          await until("getComputedStyle(document.querySelector('.artwork-card')).opacity==='1'");
          await capture(`illustration-mobile-${locale}-${theme}-${view}-${width}x${height}`);
        }
        phoneChecks++;
      }
    }
  }
  // Real lightbox binding still owns the image link, not the new footer.
  await navigate('illustration','fr','light'); await until(`document.querySelector('[data-lightbox-id="${ids[0]}"]')`); await resize(1440);
  await click(`[data-lightbox-id="${ids[0]}"]`); await until("document.querySelector('.fancybox__container')");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await until("!document.querySelector('.fancybox__container')");
  console.log(`Illustration V2/V3 footers: ${checks} checks (216 EN/FR/JA × light/dark × actual/estimated × cards/compact × 9 widths + 216 short/long localized date fixtures); contained ribbons, readable centered labels, no overlaps/fake durations, aligned rows, long durations and real Lightbox open/Escape OK.`);
  console.log(`Illustration V3 date-only footer: ${emptyChecks} category/locale/theme/view/width checks; all categories including Sketches, full-width localized theme-aware ribbons in both views, no badges/clocks/obsolete labels, unchanged Lightbox absence.`);
  console.log(`Illustration palette QA: pure black dark footer, white ribbons/black dates (including compact V2), unchanged light palette, centered full-width stacked badges, symmetric mobile ribbon padding; ${phoneChecks} additional short-phone viewport checks (320×568 / 375×667 / 390×844 / 430×932).`);
}
