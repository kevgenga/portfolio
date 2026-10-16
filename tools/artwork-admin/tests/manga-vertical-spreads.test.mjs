import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createMangaService } from "../manga/service.mjs";
import { parseMangaCatalog, serializeMangaCatalog, validateMangaCatalog } from "../manga/catalog.mjs";
import { handleMangaRoute } from "../manga/routes.mjs";

async function fixture(t, options={}) {
  const dir=await mkdtemp(path.join(tmpdir(),"manga-vertical-spreads-"));
  assert.ok(dir.startsWith(path.join(tmpdir(),"manga-vertical-spreads-")));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,"project"),runtime=path.join(dir,"runtime"),prefix="assets/mangaka/completed-manga/story";
  const languages=Object.fromEntries(["en","fr","ja"].map(code=>[code,{label:code,storageFolder:code,pages:Array.from({length:6},(_,i)=>`${prefix}/${code}/${i+1}.jpg`)}]));
  const manga={id:"story",slug:"story",route:"/mangas/story",title:"Story",presentationSection:"completed",defaultLanguage:"en",readingDirection:"rtl",languages};
  const other={id:"other",slug:"other",route:"/mangas/other",title:"Other",presentationSection:"completed",defaultLanguage:"en",languages:{en:{pages:["assets/mangaka/completed-manga/other/en/1.jpg"]}}};
  const upload=async(name="new.jpg",color="#abcd23")=>({fileName:name,dataBase64:(await sharp({create:{width:31,height:47,channels:3,background:color}}).jpeg().toBuffer()).toString("base64")});
  const media=new Map();
  for(const [i,relative] of [...Object.values(languages).flatMap(l=>l.pages),other.languages.en.pages[0]].entries()) {
    const bytes=await sharp({create:{width:40+i,height:60+i,channels:3,background:{r:i*10,g:40,b:80}}}).jpeg().toBuffer();
    const file=path.join(root,"public",relative); await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,bytes); media.set(relative,bytes);
  }
  manga.productionTime={pages:[{id:"drawing-three",time:{minutes:60,kind:"actual"}},{id:"drawing-four",time:{minutes:90,kind:"estimated"}}],bindings:[{path:languages.en.pages[2],pageId:"drawing-three"},{path:languages.en.pages[3],pageId:"drawing-four"}]};
  const catalogPath=path.join(root,"src/content/mangas.js"); await mkdir(path.dirname(catalogPath),{recursive:true}); await writeFile(catalogPath,serializeMangaCatalog([manga,other]));
  const service=createMangaService({projectRoot:root,runtimeRoot:runtime,...options}); await service.initialize();
  const pair=languages.en.pages.slice(2,4),revision=async()=>(await service.report()).catalogRevision;
  const edit=async(pages=pair,remove=false,code="en")=>service.editVerticalSpread("story",code,{pages,catalogRevision:await revision()},remove);
  const source=()=>readFile(catalogPath,"utf8");
  const files=async()=>{const base=path.join(root,"public/assets/mangaka");return (await readdir(base,{recursive:true})).sort();};
  return {root,runtime,service,manga,other,media,upload,pair,revision,edit,source,files,catalogPath};
}

test("opt-in association 3–4, several pairs, independent EN/FR/JA, persistence, backup, removal, source bytes and times",async t=>{
  const f=await fixture(t),before=await f.source();
  assert.equal((await f.service.readCatalog())[0].languages.en.verticalSpreads,undefined);
  const added=await f.edit(); assert.ok(added.backup); assert.notEqual(await f.source(),before);
  await f.edit(f.manga.languages.en.pages.slice(4,6));
  await f.edit(f.manga.languages.ja.pages.slice(2,4),false,"ja");
  const catalog=parseMangaCatalog(await f.source()); validateMangaCatalog(catalog);
  assert.deepEqual(catalog[0].languages.en.verticalSpreads,[f.pair,f.manga.languages.en.pages.slice(4,6)]);
  assert.deepEqual(catalog[0].languages.ja.verticalSpreads,[f.manga.languages.ja.pages.slice(2,4)]);
  assert.equal(catalog[0].languages.fr.verticalSpreads,undefined);
  assert.deepEqual(catalog[0].productionTime,f.manga.productionTime); assert.deepEqual(catalog[1],f.other);
  await f.edit(f.pair,true); await f.edit(f.manga.languages.en.pages.slice(4,6),true);
  assert.equal((await f.service.readCatalog())[0].languages.en.verticalSpreads,undefined);
  for(const [relative,bytes] of f.media) assert.deepEqual(await readFile(path.join(f.root,"public",relative)),bytes);
});
test("selection validation rejects missing, nonadjacent, overlapping, cross-language, duplicate and stale requests",async t=>{
  const f=await fixture(t); const p=f.manga.languages.en.pages;
  for(const selected of [[],[p[0]],[p[0],p[2]],[p[0],p[0]],[p[0],f.manga.languages.ja.pages[1]],[p[0],p[1],p[2]]]) await assert.rejects(f.edit(selected),e=>e.status===400);
  const old=await f.revision(); await f.edit();
  await assert.rejects(f.edit(p.slice(1,3)),e=>e.status===400);
  await assert.rejects(f.service.editVerticalSpread("story","en",{pages:p.slice(0,2),catalogRevision:old}),e=>e.status===409);
  await assert.rejects(f.service.editVerticalSpread("story","en",{pages:p.slice(0,2)}),e=>e.status===409);
  await assert.rejects(f.edit(p.slice(0,2),true),e=>e.status===409);
});
test("reorder whole pair and insert before it preserve identities; split/reverse/delete/insertion inside is blocked and rolled back",async t=>{
  const f=await fixture(t); await f.edit(); const p=f.manga.languages.en.pages;
  await f.service.reorderPages("story","en",[p[0],p[2],p[3],p[1],p[4],p[5]]);
  assert.deepEqual((await f.service.readCatalog())[0].languages.en.verticalSpreads,[f.pair]);
  await f.service.reorderPages("story","en",p);
  const stable=await f.source(),files=await f.files();
  for(const order of [[p[0],p[2],p[1],p[3],p[4],p[5]],[p[0],p[1],p[3],p[2],p[4],p[5]]]) await assert.rejects(f.service.reorderPages("story","en",order),/Dissociez/);
  await assert.rejects(f.service.update("story",{pageOrder:{language:"en",pages:[p[0],p[2],p[1],p[3],p[4],p[5]],expectedPages:p}}),/Dissociez/);
  await assert.rejects(f.service.deletePage("story","en",2),/Dissociez/);
  await assert.rejects(f.service.addPages("story","en",{position:4,files:[await f.upload()]}),/Dissociez/);
  await assert.rejects(f.service.duplicatePage("story","en",2,{position:4}),/Dissociez/);
  assert.equal(await f.source(),stable); assert.deepEqual(await f.files(),files);
  await f.service.addPages("story","en",{position:1,files:[await f.upload()]});
  assert.deepEqual((await f.service.readCatalog())[0].languages.en.verticalSpreads,[f.pair]);
  await f.service.duplicatePage("story","en",3); // Source still paired; copy is not.
  assert.deepEqual((await f.service.readCatalog())[0].languages.en.verticalSpreads,[f.pair]);
});
test("replacement and section relocation explicitly carry references; language deletion removes only its own associations",async t=>{
  const f=await fixture(t); await f.edit(); await f.edit(f.manga.languages.ja.pages.slice(2,4),false,"ja");
  await f.service.replacePage("story","en",2,{source:f.pair[0],file:await f.upload(),productionIdentity:"keep"});
  let manga=(await f.service.readCatalog())[0];
  assert.deepEqual(manga.languages.en.verticalSpreads,[[manga.languages.en.pages[2],f.pair[1]]]);
  assert.equal(manga.productionTime.pages[0].time.minutes,60);
  await f.service.update("story",{presentationSection:"storyboard"});
  manga=(await f.service.readCatalog())[0];
  assert.ok(manga.languages.en.verticalSpreads.flat().every(p=>p.startsWith("assets/mangaka/complete-storyboards/")));
  await f.service.deleteLanguage("story","ja"); manga=(await f.service.readCatalog())[0];
  assert.equal(manga.languages.ja,undefined); assert.equal(manga.languages.en.verticalSpreads.length,1);
  await f.service.validateFiles(await f.service.readCatalog());
});
test("atomic rollback and backup restore retain pair metadata without touching real catalogs",async t=>{
  for(const failurePoint of ["before-catalog","after-catalog","invalid-catalog"]) {
    const f=await fixture(t,{failurePoint}),before=await f.source();
    await assert.rejects(f.edit()); assert.equal(await f.source(),before);
  }
  const f=await fixture(t);const result=await f.edit(); const backup=path.resolve(f.root,result.backup);
  const restored=parseMangaCatalog(await readFile(backup,"utf8"));validateMangaCatalog(restored);
  assert.equal(restored[0].languages.en.verticalSpreads,undefined);
});
test("routes forward the correct language, revision and method",async()=>{
  for(const method of ["POST","DELETE"]) {
    let called,reply;const payload={pages:["a","b"],catalogRevision:"version"};
    assert.equal(await handleMangaRoute({method},{},new URL("http://localhost/api/mangas/story/languages/ja/vertical-spreads"),{
      service:{editVerticalSpread:async(...args)=>{called=args;return {result:{},catalogRevision:"next"};}},
      readJson:async()=>payload,sendJson:(_,status,body)=>{reply={status,body};},
    }),true);
    assert.deepEqual(called,["story","ja",payload,method==="DELETE"]); assert.equal(reply.status,200);
  }
});

test("failed replacement/dissociation restores an existing pair and its original files",async t=>{
  const f=await fixture(t);await f.edit();const before=await f.source(),files=await f.files();
  const failing=createMangaService({projectRoot:f.root,runtimeRoot:f.runtime,failurePoint:"after-catalog"});
  await assert.rejects(failing.editVerticalSpread("story","en",{pages:f.pair,catalogRevision:await f.revision()},true));
  assert.equal(await f.source(),before);
  await assert.rejects(failing.replacePage("story","en",2,{source:f.pair[0],file:await f.upload(),productionIdentity:"keep"}));
  assert.equal(await f.source(),before);assert.deepEqual(await f.files(),files);
  for(const [relative,bytes] of f.media)assert.deepEqual(await readFile(path.join(f.root,"public",relative)),bytes);
});

test("one configuration atomically handles every mode transition, removal confirmation, no-op and language independence",async t=>{
  const f=await fixture(t);
  const configure=async(vertical,horizontal,extra={})=>f.service.configureSpread('story','en',{pages:f.pair,vertical,horizontal,catalogRevision:await f.revision(),...extra});
  await f.edit(); // A legacy vertical-only association is never upgraded silently.
  assert.equal((await f.service.readCatalog())[0].languages.en.horizontalSpreads,undefined);
  for(const [vertical,horizontal] of [[true,false],[true,true],[false,true],[true,true],[true,false],[false,true]]) {
    await configure(vertical,horizontal);
    const catalog=await f.service.readCatalog(),m=catalog[0];
    assert.deepEqual(m.languages.en.verticalSpreads,vertical?[f.pair]:undefined);
    assert.deepEqual(m.languages.en.horizontalSpreads,horizontal?[f.pair]:undefined);
    assert.deepEqual(m.productionTime,f.manga.productionTime);assert.deepEqual(m.languages.fr,f.manga.languages.fr);assert.deepEqual(catalog[1],f.other);
  }
  const noOp=await configure(false,true);assert.equal(noOp.unchanged,true);assert.equal(noOp.backup,undefined);
  await assert.rejects(configure(false,false),/Confirmez/);
  const removed=await configure(false,false,{confirmRemoval:true});assert.ok(removed.backup);
  assert.equal((await f.service.readCatalog())[0].languages.en.horizontalSpreads,undefined);
  const backup=parseMangaCatalog(await readFile(path.resolve(f.root,removed.backup),'utf8'));
  assert.deepEqual(backup[0].languages.en.horizontalSpreads,[f.pair]);validateMangaCatalog(backup);
  await f.service.configureSpread('story','ja',{pages:f.manga.languages.ja.pages.slice(2,4),vertical:false,horizontal:true,catalogRevision:await f.revision()});
  await f.service.configureSpread('story','fr',{pages:f.manga.languages.fr.pages.slice(1,3),vertical:true,horizontal:false,catalogRevision:await f.revision()});
  const persisted=parseMangaCatalog(await f.source());assert.equal(persisted[0].languages.en.verticalSpreads,undefined);assert.equal(persisted[0].languages.en.horizontalSpreads,undefined);
  assert.deepEqual(persisted[0].languages.ja.horizontalSpreads,[f.manga.languages.ja.pages.slice(2,4)]);
  for(const [relative,bytes] of f.media)assert.deepEqual(await readFile(path.join(f.root,'public',relative)),bytes);
});
test("configuration refuses malformed selections, cover, same-mode conflicts and corrupt metadata; cross-mode overlap is independent",async t=>{
  const f=await fixture(t),p=f.manga.languages.en.pages;
  const configure=async(pages,vertical=true,horizontal=true)=>f.service.configureSpread('story','en',{pages,vertical,horizontal,catalogRevision:await f.revision()});
  for(const pages of [[],[p[1]],[p[1],p[1]],[p[1],p[3]],[p[1],p[2],p[3]],[p[1],f.manga.languages.fr.pages[2]],['missing',p[2]],p.slice(0,2)])await assert.rejects(configure(pages));
  await configure(f.pair,true,false);
  await configure(p.slice(3,5),false,true); // Page 4 may participate in different modes.
  const stable=await f.source();
  await assert.rejects(configure(p.slice(1,3),true,false),/déjà/);
  await assert.rejects(configure(f.pair,false,true),/déjà/);
  assert.equal(await f.source(),stable);
  for(const horizontalSpreads of [null,{},[p.slice(1,4)],[p.slice(1,3),p.slice(2,4)],[p.slice(0,2)],[['missing',p[2]]]]) {
    const catalog=await f.service.readCatalog();catalog[0].languages.en.horizontalSpreads=horizontalSpreads;
    assert.throws(()=>validateMangaCatalog(catalog));
  }
  await assert.rejects(f.service.configureSpread('story','en',{pages:f.pair,vertical:'yes',horizontal:false,catalogRevision:await f.revision()}),/explicitement/);
  const old=await f.revision();await configure(p.slice(4,6),true,false);
  await assert.rejects(f.service.configureSpread('story','en',{pages:f.pair,vertical:true,horizontal:false,catalogRevision:old}),e=>e.status===409);
});
test("both modes preserve path identities through moves/replacement/duplication and block split/delete/insertion with rollback",async t=>{
  const f=await fixture(t),p=f.manga.languages.en.pages;
  await f.service.configureSpread('story','en',{pages:f.pair,vertical:false,horizontal:true,catalogRevision:await f.revision()});
  const stable=await f.source(),files=await f.files();
  await assert.rejects(f.service.reorderPages('story','en',[p[0],p[2],p[1],p[3],p[4],p[5]]),/Dissociez/);
  await assert.rejects(f.service.deletePage('story','en',2),/Dissociez/);
  await assert.rejects(f.service.addPages('story','en',{files:[await f.upload()],position:4}),/Dissociez/);
  await assert.rejects(f.service.duplicatePage('story','en',2,{position:4}),/Dissociez/);
  await assert.rejects(f.service.reorderPages('story','en',[p[2],p[3],p[0],p[1],p[4],p[5]]),/couverture/);
  assert.equal(await f.source(),stable);assert.deepEqual(await f.files(),files);
  await f.service.configureSpread('story','en',{pages:f.pair,vertical:true,horizontal:true,catalogRevision:await f.revision()});
  await f.service.reorderPages('story','en',[p[0],p[2],p[3],p[1],p[4],p[5]]);
  await f.service.replacePage('story','en',1,{file:await f.upload(),source:p[2],productionIdentity:'keep'});
  let m=(await f.service.readCatalog())[0];
  assert.deepEqual(m.languages.en.horizontalSpreads,m.languages.en.verticalSpreads);
  assert.deepEqual(m.languages.en.horizontalSpreads,[[m.languages.en.pages[1],p[3]]]);
  await f.service.duplicatePage('story','en',1);m=(await f.service.readCatalog())[0];
  assert.equal(m.languages.en.horizontalSpreads.length,1);
  // Simulate a legacy language folder in this temporary catalog, then exercise
  // the existing repair operation, including both independent reference sets.
  const old=m.languages.en.pages[1],legacy=old.replace('/en/','/legacy/');
  await mkdir(path.dirname(path.join(f.root,'public',legacy)),{recursive:true});
  await rename(path.join(f.root,'public',old),path.join(f.root,'public',legacy));
  m.languages.en.pages[1]=legacy;
  for(const field of ['verticalSpreads','horizontalSpreads'])m.languages.en[field]=m.languages.en[field].map(pair=>pair.map(page=>page===old?legacy:page));
  for(const binding of m.productionTime.bindings)if(binding.path===old)binding.path=legacy;
  await writeFile(f.catalogPath,serializeMangaCatalog([m,f.other]));
  await f.service.repairLanguageStorage('story','en');m=(await f.service.readCatalog())[0];
  assert.deepEqual(m.languages.en.horizontalSpreads,m.languages.en.verticalSpreads);
  assert.ok(m.languages.en.horizontalSpreads.flat().every(page=>page.includes('/en/')));
  await f.service.update('story',{presentationSection:'storyboard'});m=(await f.service.readCatalog())[0];
  assert.deepEqual(m.languages.en.horizontalSpreads,m.languages.en.verticalSpreads);
  assert.ok(m.languages.en.horizontalSpreads.flat().every(page=>page.startsWith('assets/mangaka/complete-storyboards/')));
  assert.equal(m.productionTime.pages[0].time.minutes,60);
  await f.service.validateFiles(await f.service.readCatalog());
});
test("failed dual-mode save or replacement rolls back both modes and media; new route forwards the revision",async t=>{
  const f=await fixture(t);await f.edit();const before=await f.source();
  for(const failurePoint of ['before-catalog','after-catalog','invalid-catalog']) {
    const service=createMangaService({projectRoot:f.root,runtimeRoot:f.runtime,failurePoint});
    await assert.rejects(service.configureSpread('story','en',{pages:f.pair,vertical:true,horizontal:true,catalogRevision:await f.revision()}));
    assert.equal(await f.source(),before);
  }
  let called,reply;const payload={pages:f.pair,vertical:true,horizontal:true,catalogRevision:'revision'};
  assert.equal(await handleMangaRoute({method:'PUT'},{},new URL('http://localhost/api/mangas/story/languages/ja/spreads'),{
    service:{configureSpread:async(...args)=>{called=args;return {result:{}};}},readJson:async()=>payload,sendJson:(_,status,body)=>{reply={status,body};},
  }),true);
  assert.deepEqual(called,['story','ja',payload]);assert.equal(reply.status,200);
});
