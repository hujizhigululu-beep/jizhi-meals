import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { freshState, putDiary } from '../model.js';
import { STORAGE_KEY } from '../storage.js';

// Real application UI, temporary synthetic book, and local assets only.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('C:/Users/witty hu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = resolve('.'), engine = process.env.UI_ENGINE || 'chromium';
const fixture = freshState();
putDiary(fixture, { date: '2026-10-14', mood: '安心', text: '取消恢复测试：原始合成记录应保持不变。', joy: '' });
const fixtureRaw = JSON.stringify(fixture);
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json' };
const server = createServer(async (req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser=await playwright[engine].launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[],remote=[],downloads=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>downloads.push(download));
  await page.route('**/*',route=>{if(!route.request().url().startsWith(origin)){remote.push(route.request().url());return route.abort();}return route.continue();});
  await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),{key:STORAGE_KEY,raw:fixtureRaw});
  await page.goto(origin+'/#settings');await page.locator('#import-file').waitFor({state:'attached'});
  const backup=await page.evaluate(async()=>{
    const a=await import('./ai-avatar.js');const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d').fillRect(8,8,16,16);
    const {postOfficeHost}=await import('./app.js'),book=structuredClone(postOfficeHost.getState());
    book.postOffice.user.name='不应替换的合成用户';book.postOffice.user.avatarId='restore-cancel-fixture';book.diaries[0].text='不应保存的恢复内容';
    return JSON.stringify({...book,aiAvatarAssets:[{id:'restore-cancel-fixture',dataURL:c.toDataURL('image/png')}]});
  });
  await page.locator('#import-file').setInputFiles({name:'synthetic-restore.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await page.locator('#restore-confirm').waitFor();
  await page.evaluate(()=>{
    const original=Image.prototype.decode;
    Image.prototype.decode=function(){window.avatarDecodeWaiting=true;return new Promise((resolve,reject)=>{window.releaseAvatarDecode=()=>original.call(this).then(resolve,reject);});};
    window.restoreOriginalDecode=()=>{Image.prototype.decode=original;};
  });
  await page.locator('#restore-confirm').click();await page.waitForFunction(()=>window.avatarDecodeWaiting===true);
  await page.locator('#sheet .secondary[data-close]').click();assert.equal(await page.locator('#sheet').evaluate(el=>el.open),false);
  await page.evaluate(()=>{window.restoreOriginalDecode();window.releaseAvatarDecode();});
  await page.waitForFunction(()=>document.querySelector('#restore-confirm')?.disabled===false);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY),fixtureRaw);
  assert.equal(await page.evaluate(async()=>(await import('./app.js')).postOfficeHost.getState().diaries[0].text),'取消恢复测试：原始合成记录应保持不变。');
  console.log('PASS cancelling actual restore during avatar decode preserves original saved book');

  // Exercise the actual final serialized-size guard without allocating a 50 MiB fixture.
  await page.evaluate(()=>{
    const OriginalBlob=window.Blob;
    window.Blob=class extends OriginalBlob{constructor(parts,options){super(parts,options);if(parts?.[0]?.includes('"aiAvatarAssets"'))Object.defineProperty(this,'size',{value:50*1024*1024+1});}};
    window.restoreOriginalBlob=()=>{window.Blob=OriginalBlob;};
  });
  await page.locator('[data-action="export"]').first().click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('超过 50 MiB'));
  await page.evaluate(()=>window.restoreOriginalBlob());
  assert.equal(downloads.length,0);assert.equal(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY),fixtureRaw);
  assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
  console.log('PASS oversized final JSON guard stops download without modifying saved book');
  console.log(`${engine}: 2 real-application backup checks passed`);
} finally {await browser?.close();await new Promise(done=>server.close(done));}
