import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('C:/Users/witty hu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = resolve('.'), engine = process.env.UI_ENGINE || 'chromium';
const fixtureHTML = `<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./style.css"><link rel="stylesheet" href="./ai-settings.css"><div id="slot"></div><script type="module">
import { freshState } from './model.js';
import { mountAISettings } from './ai-settings.js';
window.book = JSON.parse(localStorage.getItem('jizhi-ai-test-avatar-qa-book') || 'null') || freshState();
window.epoch = 0; window.notices = []; window.confirmations = []; window.answer = false;
const slot = document.querySelector('#slot'); let cleanup;
window.host = { getState:()=>window.book,getBookEpoch:()=>window.epoch,toast:message=>window.notices.push(message),ask:async(...args)=>{window.confirmations.push(args);return window.answer;},commit:change=>{try{const next=structuredClone(window.book);change(next);window.book=next;localStorage.setItem('jizhi-ai-test-avatar-qa-book',JSON.stringify(next));cleanup?.();cleanup=mountAISettings(slot,window.host);return true;}catch(error){window.notices.push(error.message);return false;}}};
window.remount = ()=>{cleanup?.();cleanup=mountAISettings(slot,window.host);}; window.remount();
window.ready=true;
</script>`;
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8' };
const server = createServer(async (req,res)=>{
  const path = new URL(req.url,'http://localhost').pathname;
  if (path === '/') {res.setHeader('Content-Type',mime['.html']);res.end(fixtureHTML);return;}
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;let passed=0;
async function check(name,run){await run();passed++;console.log(`PASS ${name}`);}
try {
  browser=await playwright[engine].launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[],remote=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{if(!route.request().url().startsWith(origin)){remote.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(origin);await page.waitForFunction(()=>window.ready);
  await check('settings edits stay local and preserve separate long drafts across role switching and unrelated save',async()=>{
    await page.locator('[data-ai-settings-section="user"] summary').click();await page.locator('[data-ai-draft="user:persona"]').fill('独立用户设定\n原样保留');
    await page.locator('[data-ai-settings-section="roles"] summary').click();await page.locator('[data-ai-draft="role:saihara:persona"]').fill('最原长预设\n'+ '角色原文'.repeat(1000));
    await page.locator('[data-ai-edit-role]').selectOption('little-tt');await page.locator('[data-ai-draft="role:little-tt:persona"]').fill('小tt独立设定');
    await page.locator('[data-ai-default-role]').selectOption('little-tt');
    assert.equal(await page.locator('[data-ai-draft="user:persona"]').inputValue(),'独立用户设定\n原样保留');
    await page.locator('[data-ai-edit-role]').selectOption('saihara');assert.ok((await page.locator('[data-ai-draft="role:saihara:persona"]').inputValue()).endsWith('角色原文'.repeat(1000)));
    await page.locator('[data-ai-setting-action="save-field"][data-key="user:persona"]').click();assert.equal(await page.evaluate(()=>window.book.postOffice.userPersona),'独立用户设定\n原样保留');
    assert.ok((await page.locator('[data-ai-draft="role:saihara:persona"]').inputValue()).includes('最原长预设'));
  });
  await check('restoring defaults and deleting roles require confirmation; historical content stays separate',async()=>{
    const original=await page.evaluate(()=>window.book.postOffice.characters[0].persona);
    await page.locator('[data-ai-setting-action="reset-role"]').click();assert.equal(await page.evaluate(()=>window.book.postOffice.characters[0].persona),original);assert.ok((await page.locator('[data-ai-draft="role:saihara:persona"]').inputValue()).startsWith('最原长预设'));
    await page.locator('[data-ai-setting-action="add-role"]').click();const custom=await page.locator('[data-ai-edit-role]').inputValue();assert.ok(custom && !['saihara','little-tt'].includes(custom));
    await page.locator('[data-ai-setting-action="delete-role"]').click();assert.equal(await page.evaluate(id=>window.book.postOffice.characters.some(r=>r.id===id),custom),true);
    await page.evaluate(()=>window.answer=true);await page.locator('[data-ai-setting-action="delete-role"]').click();assert.equal(await page.evaluate(id=>window.book.postOffice.characters.some(r=>r.id===id),custom),false);
  });
  let originalAssetID;
  await check('transparent avatar upload is resized, persisted, and survives refresh',async()=>{
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1024;c.height=768;const x=c.getContext('2d');x.fillStyle='#dc3979';x.fillRect(256,192,512,384);return c.toDataURL('image/png').split(',')[1];});
    await page.locator('[data-ai-avatar-owner="user"]').setInputFiles({name:'transparent-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>window.book.postOffice.user.avatarId);
    originalAssetID=await page.evaluate(()=>window.book.postOffice.user.avatarId);
    const result=await page.evaluate(async id=>{const a=await import('./ai-avatar.js');const url=await a.getAvatarDataURL(id);const m=a.inspectAvatarDataURL(url);const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return {w:m.width,h:m.height,bytes:m.bytes.length,alpha:x.getImageData(0,0,1,1).data[3],center:x.getImageData(c.width/2,c.height/2,1,1).data[3]};},originalAssetID);
    assert.deepEqual([result.w,result.h,result.alpha,result.center],[512,384,0,255]);assert.ok(result.bytes<=204800);
    await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('[data-ai-settings-section="user"] summary').click();await page.locator(`[data-ai-avatar-owner="user"]`).waitFor();await page.waitForFunction(id=>document.querySelector(`img[data-avatar-id="${id}"]`)?.hidden===false,originalAssetID);
    await mkdir(resolve(root,'tests/ui-previews/phase3'),{recursive:true});await page.screenshot({path:resolve(root,`tests/ui-previews/phase3/settings-avatar-${engine}.png`),fullPage:true});
  });
  await check('backup includes referenced avatars and immutable collisions or missing images fail safely',async()=>{
    const result=await page.evaluate(async originalID=>{const a=await import('./ai-avatar.js');const assets=await a.exportAvatarAssets(window.book);const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const ctx=canvas.getContext('2d');ctx.fillStyle='blue';ctx.fillRect(0,0,16,16);let collision='',missing='',malformed='';try{await a.importAvatarAssets([{id:originalID,dataURL:canvas.toDataURL('image/png')}]);}catch(e){collision=e.message;}try{await a.importAvatarAssets([], {user:{avatarId:'missing-fixture-avatar'}});}catch(e){missing=e.message;}try{await a.importAvatarAssets([{id:'svg-fixture',dataURL:'data:image/svg+xml;base64,PHN2Zy8+'}]);}catch(e){malformed=e.message;}return {count:assets.length,collision,missing,malformed,same:assets[0].dataURL===await a.getAvatarDataURL(originalID)};},originalAssetID);
    assert.equal(result.count,1);assert.ok(result.collision.includes('冲突'));assert.ok(result.missing.includes('缺少'));assert.ok(result.malformed);assert.equal(result.same,true);
    await page.locator('[data-ai-setting-action="remove-avatar"][data-owner="user"]').click();assert.equal(await page.evaluate(()=>window.book.postOffice.user.avatarId),'');
    assert.ok(await page.evaluate(async id=>(await (await import('./ai-avatar.js')).getAvatarDataURL(id)).startsWith('data:image/'),originalAssetID));
  });
  await check('JPG and WebP uploads decode correctly; unsupported and excessive source files are rejected',async()=>{
    const result=await page.evaluate(async()=>{const a=await import('./ai-avatar.js'),canvas=document.createElement('canvas');canvas.width=80;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='purple';ctx.fillRect(0,0,80,40);const images=[];
      for(const mime of ['image/jpeg','image/webp']){const url=canvas.toDataURL(mime),blob=await (await fetch(url)).blob(),id=await a.storeAvatar(new File([blob],'synthetic-upload',{type:blob.type}));const decoded=a.inspectAvatarDataURL(await a.getAvatarDataURL(id));images.push([decoded.width,decoded.height]);}
      let tooLarge='',unsupported='';try{await a.storeAvatar(new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'}));}catch(e){tooLarge=e.message;}try{await a.storeAvatar(new File(['<svg/>'],'bad.svg',{type:'image/svg+xml'}));}catch(e){unsupported=e.message;}return{images,tooLarge,unsupported};});
    assert.deepEqual(result.images,[[80,40],[80,40]]);assert.ok(result.tooLarge.includes('5 MiB'));assert.ok(result.unsupported.includes('PNG'));
  });
  await check('invalid default role stays visibly invalid; mobile layout fits without any API request',async()=>{
    await page.evaluate(()=>window.answer=true);await page.locator('[data-ai-settings-section="roles"] summary').click();await page.locator('[data-ai-edit-role]').selectOption('little-tt');await page.locator('[data-ai-draft="role:little-tt:enabled"]').uncheck();await page.locator('[data-ai-setting-action="save-role"]').click();assert.ok((await page.locator('.ai-setting-warning').textContent()).includes('停用或删除'));
    assert.equal(await page.evaluate(()=>window.book.postOffice.defaultCharacterId),'little-tt');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
  });
  await check('invalid mixed backup writes no partial asset; full clear touches only test avatar storage',async()=>{
    const result=await page.evaluate(async originalID=>{const a=await import('./ai-avatar.js'),dataURL=await a.getAvatarDataURL(originalID);let missing=false;
      try{await a.importAvatarAssets([{id:'must-not-be-partially-written',dataURL},{id:'bad-fixture',dataURL:'data:image/svg+xml;base64,PHN2Zy8+'}]);}catch{}
      try{await a.getAvatarDataURL('must-not-be-partially-written');}catch{missing=true;}
      const unrelated=await new Promise((resolve,reject)=>{const r=indexedDB.open('unrelated-synthetic-qa-database',1);r.onupgradeneeded=()=>r.result.createObjectStore('fixture');r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
      await new Promise((resolve,reject)=>{const tx=unrelated.transaction('fixture','readwrite');tx.objectStore('fixture').put('keep this fixture','sentinel');tx.oncomplete=resolve;tx.onerror=reject;});
      await a.clearAvatarAssets();let cleared=false;try{await a.getAvatarDataURL(originalID);}catch{cleared=true;}
      const kept=await new Promise((resolve,reject)=>{const r=unrelated.transaction('fixture','readonly').objectStore('fixture').get('sentinel');r.onsuccess=()=>resolve(r.result);r.onerror=reject;});unrelated.close();return{missing,cleared,kept};},originalAssetID);
    assert.equal(result.missing,true);assert.equal(result.cleared,true);assert.equal(result.kept,'keep this fixture');
  });
  console.log(`${engine}: ${passed} avatar/settings checks passed`);
} finally {await browser?.close();await new Promise(done=>server.close(done));}
