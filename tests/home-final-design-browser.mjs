// Built-site visual QA. Temporary browser profile; no real catalog/media writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { preview } from "vite";

const temporary=await mkdtemp(path.join(tmpdir(),"kevgenga-home-finish-"));
let server,browser,socket;const errors=[],results=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  server=await preview({preview:{host:"127.0.0.1",port:0,open:false}});
  const base=`http://127.0.0.1:${server.httpServer.address().port}/portfolio/`,profile=path.join(temporary,"chrome");
  browser=spawn(process.env.PRODUCTION_TIME_TEST_CHROME||"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless","--disable-gpu","--no-first-run","--no-default-browser-check","--force-prefers-reduced-motion","--remote-debugging-port=0","--remote-debugging-address=127.0.0.1","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",`--user-data-dir=${profile}`,base],{windowsHide:true,stdio:"ignore"});
  let port;for(let i=0;i<200&&!port;i++){try{port=Number((await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0])}catch{await pause(50)}}assert.ok(port);
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(tabs.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})});
  let sequence=0;const pending=new Map();
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+" timed out"))},30000);pending.set(id,data=>{clearTimeout(timer);data.error?reject(new Error(JSON.stringify(data.error))):resolve(data.result)});socket.send(JSON.stringify({id,method,params}))});
  socket.addEventListener("message",event=>{const data=JSON.parse(event.data);if(pending.has(data.id)){pending.get(data.id)(data);pending.delete(data.id)}if(data.method==="Runtime.exceptionThrown")errors.push(JSON.stringify(data.params.exceptionDetails))});
  await command("Page.enable");await command("Runtime.enable");await command("Network.enable");await command("Network.setBlockedURLs",{urls:["https://*"]});
  const evaluate=async expression=>{const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value};
  const until=async expression=>{for(let i=0;i<300;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(50)}assert.fail(expression+";"+errors.join(";"))};
  const frame=()=>evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  const capture=async(name,target=".manga-home-hero")=>{if(!process.env.HOME_FINISH_CAPTURE_DIR)return;await mkdir(process.env.HOME_FINISH_CAPTURE_DIR,{recursive:true});await until(`Number(getComputedStyle(document.querySelector(${JSON.stringify(target)}).closest('main > section')).opacity)>.999`);await frame();const r=await command("Page.captureScreenshot",{format:"png"});await writeFile(path.join(process.env.HOME_FINISH_CAPTURE_DIR,name+".png"),Buffer.from(r.data,"base64"))};
  // CSS viewport equivalents of browser zoom (not pinch/PageScaleFactor).
  // Layout breakpoints change exactly as available CSS width/height decrease.
  const sizes=[[2560,1600],[1920,1080],[1600,900],[1440,900],[1366,768],[1366,600],[1024,900],[768,1024],[430,932],[390,844],[375,812],[320,740]];
  for(const locale of ["en","fr","ja"])for(const theme of ["light","dark"]){
    await evaluate(`localStorage.setItem('portfolio-theme',${JSON.stringify(theme)})`);await command("Page.navigate",{url:base+"?lang="+locale});
    await until(`document.documentElement?.lang===${JSON.stringify(locale)}&&document.documentElement.classList.contains('dark')===${theme==="dark"}&&document.querySelector('.hero-art-cards')`);
    for(const [physicalWidth,physicalHeight] of sizes)for(const zoom of physicalWidth>=1366?[1,1.25,1.4,2]:[1]){
      const width=Math.floor(physicalWidth/zoom),height=Math.floor(physicalHeight/zoom);
      await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:zoom,mobile:width<768});await frame();await evaluate("scrollTo({top:0,behavior:'instant'})");await frame();
      if(width>=1280)await until("parseFloat(getComputedStyle(document.querySelector('.hero-art-cards')).paddingLeft)>0");
      await until("parseFloat(document.querySelector('.manga-home-hero').style.getPropertyValue('--home-header-height'))>0");
      const m=await evaluate(`(()=>{
        const hero=document.querySelector('.manga-home-hero'),header=document.querySelector('.brand-link').closest('nav'),cards=[...document.querySelectorAll('.hero-art-card')],group=document.querySelector('.hero-art-cards'),track=document.querySelector('.hero-art-cards__track');
        const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
        const social=document.querySelector('#sketchbook-title'),socialLabel=social.previousElementSibling,mangaTitle=document.querySelector('#selected-manga-title'),mangaLabel=document.querySelector('#selected-manga .section-label');
        const hs=rect(hero),gs=rect(group),ss=rect(social),sl=rect(socialLabel),ml=rect(mangaLabel),seal=document.querySelector('.recognition-seal--blue');
        return {header:rect(header),hero:hs,track:rect(track),selection:rect(document.querySelector('#selected-manga')),measuredHeader:parseFloat(hero.style.getPropertyValue('--home-header-height')),scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
          group:gs,angle:Math.atan(-new DOMMatrixReadOnly(getComputedStyle(cards[0]).transform).c)*180/Math.PI,
          cards:cards.map(c=>({rect:rect(c),caption:rect(c.querySelector('.hero-art-card__caption')),description:rect(c.querySelector('.hero-art-card__description')),image:c.querySelector('img').getAttribute('src'),fit:getComputedStyle(c.querySelector('img')).objectFit,position:getComputedStyle(c.querySelector('img')).objectPosition})),
          actions:[...document.querySelectorAll('.manga-home-hero__actions a')].map(a=>({rect:rect(a),href:a.getAttribute('href')})),
          social:{text:social.textContent,gap:ss.y-sl.bottom,lineHeight:getComputedStyle(social).lineHeight,overflow:getComputedStyle(social).overflow,referenceGap:rect(mangaTitle.parentElement).y-ml.bottom},
          seal:{before:getComputedStyle(seal,'::before').content,background:getComputedStyle(seal).backgroundColor,transform:getComputedStyle(seal).transform},blueLinkShadow:getComputedStyle(document.querySelector('.recognition-manga-link--blue')).boxShadow};
      })()`);
      assert.equal(m.measuredHeader,m.header.height);assert.ok(m.scrollWidth<=m.clientWidth,JSON.stringify({locale,theme,width,m}));assert.equal(m.cards.length,5);
      if(width>=1280){const target=Math.min(height,84*16);assert.ok(m.hero.height>=target&&m.selection.y>=target-1,JSON.stringify({locale,width,height,m}));assert.ok(Math.abs(m.angle-8)<.001);if(height>1344)assert.ok(m.hero.height<height);}
      else assert.ok(Math.abs(m.angle)<.001);
      for(const card of m.cards){assert.ok(card.rect.x>=m.group.x-1&&card.rect.right<=m.group.right+1,JSON.stringify({locale,width,card,group:m.group}));assert.ok(card.caption.bottom<=card.rect.bottom+1&&card.description.bottom<=card.caption.bottom+1);assert.equal(card.fit,"cover");}
      for(const action of m.actions)assert.ok(action.rect.bottom<=m.hero.bottom&&action.rect.x>=0&&action.rect.right<=width);
      assert.ok(m.social.gap>=31&&Math.abs(m.social.gap-m.social.referenceGap)<1,JSON.stringify({locale,width,social:m.social}));assert.equal(m.social.overflow,"visible");
      assert.equal(m.seal.before,"none");assert.equal(m.seal.background,"rgb(17, 17, 17)");assert.notEqual(m.seal.transform,"none");assert.ok(m.blueLinkShadow.includes("47, 89, 255"),m.blueLinkShadow);
      results.push({locale,theme,physicalWidth,physicalHeight,zoom,width,height,hero:m.hero.height,header:m.header.height,cards:m.track.height});
      if(zoom===1&&((locale==="fr"&&physicalWidth===1440)||(locale==="en"&&physicalWidth===1366&&physicalHeight===768)||(locale==="ja"&&physicalWidth===390))){await until("[...document.querySelectorAll('.hero-art-card img')].every(img=>img.naturalWidth>0)");await capture(`hero-${locale}-${theme}-${physicalWidth}`);}
      if(locale==="fr"&&theme==="light"&&physicalWidth===1440&&zoom===1.4)await capture("hero-fr-light-1440-zoom140");
    }
    // Scroll to the real social section for accent and seal visual inspection.
    await command("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});await frame();
    await evaluate("document.querySelector('[aria-labelledby=sketchbook-title]').scrollIntoView();scrollBy(0,-90)");await capture(`social-${locale}-${theme}`,"[aria-labelledby=sketchbook-title]");
    await evaluate("document.querySelector('.recognition-seal--blue').scrollIntoView({block:'center'})");await capture(`seal-${locale}-${theme}`,".recognition-seal--blue");
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({cases:results.length,desktop:results.filter(r=>r.zoom===1&&r.theme==='light'&&[1440,1366].includes(r.physicalWidth)&&r.physicalHeight>=768),zoom:[100,125,140,200],method:"CSS viewport equivalents + DPR, not native browser UI zoom"},null,2));
  console.log("Home finish QA: real header measurement, immersive desktop height, intact angled card containment/captions, EN/FR/JA social spacing, both themes and scoped seal accent removal OK.");
} finally {
  socket?.close();if(browser&&browser.exitCode===null){const stopped=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await stopped}if(server)await new Promise(resolve=>server.httpServer.close(resolve));
  assert.equal(path.dirname(temporary),path.resolve(tmpdir()));assert.ok(path.basename(temporary).startsWith('kevgenga-home-finish-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
