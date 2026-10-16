import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { getTranslations } from "../src/i18n/locale.js";

// Firefox BiDi, isolated profile and in-memory catalog fixture. No real data writes.
const root=path.resolve(import.meta.dirname,'..');
const temporary=await mkdtemp(path.join(tmpdir(),'kevgenga-vertical-firefox-'));
const css=await readFile(path.join(root,'src/components/manga/ReaderNavigation.css'),'utf8');
const alpha=Number(css.match(/--reader-header-bg-opacity:\s*([\d.]+)/)[1]);
const verticalMax=Number(css.match(/--reader-vertical-page-max-width:\s*(\d+)px/)[1]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let server,browser,socket,log='';
try {
  server=await createServer({root,cacheDir:path.join(temporary,'vite-cache'),server:{host:'127.0.0.1',port:0,open:false},plugins:[{
    name:'firefox-read-only-vertical-spreads',enforce:'pre',transform(source,id){
      if(id.replaceAll('\\','/').endsWith('/src/content/mangas.js'))return source+`\nconst fixture=mangas.find(m=>m.slug==='legend-of-animiste');for(const language of Object.values(fixture.languages)){delete language.verticalSpreads;delete language.horizontalSpreads;}fixture.languages.en.verticalSpreads=[fixture.languages.en.pages.slice(2,4)];if(new URLSearchParams(location.search).has('ltr'))fixture.readingDirection='ltr';if(new URLSearchParams(location.search).has('forcedHorizontal'))fixture.languages.en.horizontalSpreads=[fixture.languages.en.pages.slice(2,4)];`;
    },
  }]});await server.listen();
  const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  const listener=createNetServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  browser=spawn(process.env.READER_TEST_FIREFOX||'C:/Program Files/Mozilla Firefox/firefox.exe',['--headless','--no-remote','--profile',path.join(temporary,'profile'),'--remote-debugging-port',String(port),'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  browser.on('error',error=>{log+=error.message;});browser.stdout.on('data',data=>{log+=data;});browser.stderr.on('data',data=>{log+=data;});
  for(let i=0;i<150&&!log.includes('WebDriver BiDi listening');i++)await sleep(50);
  assert.ok(log.includes('WebDriver BiDi listening'),log);
  socket=new WebSocket(`ws://127.0.0.1:${port}/session`);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  const pending=new Map();let id=0;
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data),callback=pending.get(data.id);if(callback){pending.delete(data.id);callback(data);}});
  const command=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(new Error(method+' timed out'));},15000);pending.set(key,data=>{clearTimeout(timer);data.type==='error'?reject(new Error(JSON.stringify(data))):resolve(data.result);});socket.send(JSON.stringify({id:key,method,params}));});
  await command('session.new',{capabilities:{alwaysMatch:{acceptInsecureCerts:true}}});
  const context=(await command('browsingContext.getTree')).contexts[0].context;
  const evaluate=async expression=>{const r=await command('script.evaluate',{expression,target:{context},awaitPromise:true});assert.notEqual(r.type,'exception',JSON.stringify(r));return r.result.value;};
  const until=async expression=>{for(let i=0;i<150;i++){if(await evaluate(`Boolean(${expression})`))return;await sleep(50);}assert.fail(expression);};
  let checks=0;
  for(const direction of ['rtl','ltr'])for(const [i,width] of [320,360,375,390,430,768,1024,1440,1920].entries()) {
    const locale=['en','fr','ja'][i%3],theme=i%2?'dark':'light';
    await command('browsingContext.setViewport',{context,viewport:{width,height:900},devicePixelRatio:1});
    await command('browsingContext.navigate',{context,url:`${base}/portfolio/mangas/legend-of-animiste?lang=${locale}${direction==='ltr'?'&ltr=1':''}`,wait:'complete'});
    await until("document.querySelector('[data-reader-mode]')");
    await evaluate(`localStorage.setItem('portfolio-theme','${theme}');localStorage.setItem('manga-language:legend-of-animiste','en');localStorage.setItem('manga-reader-mode','vertical');true`);
    await command('browsingContext.reload',{context,wait:'complete'});
    await until("document.querySelector('[data-page-group=\"3-4\"]')&&[...document.querySelectorAll('[data-page-group=\"3-4\"] img')].every(img=>img.naturalWidth>0)");
    await evaluate("window.__jumps=0;window.__scroll=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(...args){window.__jumps++;return window.__scroll.apply(this,args)};true");
    for(const fraction of [.2,.5,.8]) {
      await evaluate(`(()=>{const r=document.querySelector('[data-page-group="3-4"]').getBoundingClientRect();scrollBy(0,r.top+r.height*${fraction}-innerHeight/2);return true})()`);
      await until("document.querySelector('[data-reader-pagination] > p > span').textContent==='3 / 24'");
    }
    const g=JSON.parse(await evaluate("JSON.stringify((()=>{const block=document.querySelector('[data-page-group=\"3-4\"]'),r=block.getBoundingClientRect(),single=document.querySelector('[data-page-group=\"1\"]'),header=document.querySelector('[data-reader-header] > header');return {width:innerWidth,single:single.getBoundingClientRect().width,group:r.width,left:r.left,right:r.right,dir:block.dir,overflow:document.documentElement.scrollWidth>innerWidth,header:getComputedStyle(header).backgroundColor,images:[...block.querySelectorAll('img')].map(img=>{const b=img.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,height:b.height,ratio:img.naturalWidth/img.naturalHeight}}),jumps:window.__jumps}})())"));
    assert.equal(g.overflow,false);assert.equal(g.dir,direction);assert.equal(g.jumps,0);
    assert.ok(Math.abs(g.single-Math.min(width,verticalMax))<1);assert.ok(Math.abs(g.group-Math.min(width,1440))<1);
    assert.ok(Math.abs((g.left+g.right)/2-width/2)<1);assert.equal(g.header,`rgba(0, 0, 0, ${alpha})`);
    for(const img of g.images)assert.ok(Math.abs(img.width/img.height-img.ratio)<.001);
    assert.ok(Math.abs(direction==='rtl'?g.images[0].left-g.images[1].right:g.images[1].left-g.images[0].right)<1);
    await evaluate("document.querySelector('[data-vertical-click-zones] button:nth-child(2)').click();true");await until("document.querySelector('main').dataset.readerInterface==='hidden'");
    assert.equal(await evaluate("document.querySelector('[data-page-group=\"3-4\"]').getBoundingClientRect().width"),g.group);
    if(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR&&direction==='rtl'&&[390,1440].includes(width)) {
      const shot=await command('browsingContext.captureScreenshot',{context,origin:'viewport'});
      await writeFile(path.join(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR,`reader-vertical-firefox-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await evaluate(`document.querySelector('[data-reader-header] [role=group] button[aria-label=${JSON.stringify(getTranslations(locale).mangaReader.mode+': '+getTranslations(locale).mangaReader.horizontal)}]').click();true`);
    await until("document.querySelector('[data-horizontal-pages]')");
    assert.equal(await evaluate("document.querySelector('[data-horizontal-pages]').dataset.horizontalPages"),width>=900?'2-3':'3');
    await evaluate("localStorage.setItem('manga-reader-mode','horizontal');true");
    await command('browsingContext.navigate',{context,url:`${base}/portfolio/mangas/legend-of-animiste?lang=${locale}&forcedHorizontal=1${direction==='ltr'?'&ltr=1':''}`,wait:'complete'});
    await until("document.querySelector('[data-horizontal-pages]')");
    await evaluate("document.querySelector('[data-horizontal-stage] > button:first-of-type').click();true");
    await until("document.querySelector('[data-horizontal-pages]').dataset.horizontalPages==='2'");
    await evaluate("document.querySelector('[data-horizontal-stage] > button:first-of-type').click();true");
    await until("document.querySelector('[data-horizontal-pages]').dataset.horizontalPages==='3-4'&&[...document.querySelectorAll('[data-rail-panel=current] img')].every(img=>img.naturalWidth>0)");
    const horizontal=JSON.parse(await evaluate("JSON.stringify((()=>{const imgs=[...document.querySelectorAll('[data-rail-panel=current] img')],r=imgs.map(img=>img.getBoundingClientRect());return {counter:document.querySelector('[data-reader-pagination] > p > span').textContent,index:document.querySelector('[data-reader-page-slider] input').value,max:document.querySelector('[data-reader-page-slider] input').max,overflow:document.documentElement.scrollWidth>innerWidth,left:r[0].left-r[1].left,gap:Math.min(Math.abs(r[0].left-r[1].right),Math.abs(r[1].left-r[0].right)),fits:imgs.map(img=>getComputedStyle(img).objectFit)}})())"));
    assert.equal(horizontal.counter,'3 / 24');assert.equal(horizontal.index,'2');assert.equal(horizontal.max,width>=900?'12':'22');assert.equal(horizontal.overflow,false);assert.ok(horizontal.gap<1);assert.ok(horizontal.fits.every(fit=>fit==='contain'));assert.equal(horizontal.left>0,direction==='rtl');
    if(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR&&direction==='rtl'&&[390,1440].includes(width)) {
      const shot=await command('browsingContext.captureScreenshot',{context,origin:'viewport'});await writeFile(path.join(process.env.PUBLIC_PRODUCTION_CAPTURE_DIR,`reader-forced-horizontal-firefox-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    checks++;
  }
  console.log(`Spread Firefox QA: ${checks} viewport/direction checks each for vertical and forced horizontal, EN/FR/JA UI, both themes, width/ratio/RTL/LTR, no overflow/gap, stable passive counter, hidden UI and automatic/forced horizontal composition OK.`);
  await command('browser.close');
} finally {
  socket?.close();
  if(browser&&browser.exitCode===null){const exited=new Promise(resolve=>browser.once('exit',resolve));browser.kill();await exited;}
  await server?.close();
  assert.equal(path.dirname(path.resolve(temporary)),path.resolve(tmpdir()));assert.ok(path.basename(temporary).startsWith('kevgenga-vertical-firefox-'));
  await rm(temporary,{recursive:true,force:true});
}
