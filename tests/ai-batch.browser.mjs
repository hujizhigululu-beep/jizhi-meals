import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { freshState } from '../model.js';
import { STORAGE_KEY } from '../storage.js';

// Fresh synthetic profiles and mocked completions only; no personal browser or real key.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('C:/Users/witty hu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root=resolve('.'),engine=process.env.UI_ENGINE||'chromium',date='2026-10-14',types=['meals','exercise','study','inventory','letter'];
const output=resolve(root,'tests/ui-previews/ai-batch');await mkdir(output,{recursive:true});
const fixture=freshState();
fixture.inventory=[{id:'synthetic-rice',name:'人工库存标记',quantity:12,perMeal:1,unit:'份',category:'碳水',note:'人工库存备注',expires:''}];
fixture.meals=[date,'2026-10-13'].map((d,index)=>({id:`synthetic-meal-${index}`,date:d,slot:'breakfast',name:`人工餐食-${d}`,type:'自制便当',protein:'',note:`人工餐食备注-${d}`,resources:[],completed:true,completedAt:'2026-10-14T00:00:00.000Z'}));
fixture.diaries=[date,'2026-10-13'].map(d=>({date:d,mood:'人工心情',text:`人工日记-${d}`,joy:'人工小确幸',updatedAt:'2026-10-14T01:00:00.000Z'}));
fixture.dayRecords=[date,'2026-10-13'].map((d,index)=>({date:d,study:{checked:true,manualChecked:true,categoryIds:[],items:[{id:`synthetic-study-${index}`,content:`人工学习-${d}`,minutes:30,note:'人工学习备注'}]},exercise:{checked:true,manualChecked:true,categoryIds:[],items:[{id:`synthetic-exercise-${index}`,content:`人工运动-${d}`,minutes:20,note:'人工运动备注',distanceKm:2}]},stickerIds:[]}));
fixture.postOffice.userPersona='人工用户人设原文标记';fixture.postOffice.writingPreset='人工通用文学原文标记';
fixture.postOffice.characters[0].persona='人工最原人设原文标记';fixture.postOffice.characters[0].writingPreset='人工最原专属文学原文标记';
fixture.postOffice.characters[1].persona='人工小tt人设原文标记';fixture.postOffice.characters[1].writingPreset='';
for(const type of types){if(type==='letter')fixture.postOffice.letterTask='人工letter任务预设标记';else fixture.postOffice.tasks[type]=`人工${type}任务预设标记`;}
const recordsOf=state=>({inventory:state.inventory,meals:state.meals,diaries:state.diaries,dayRecords:state.dayRecords});
const originalRecords=structuredClone(recordsOf(fixture));
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path==='/__setup.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>人工测试数据准备</title>');return;}
  const file=resolve(root,'.'+path.replace(/\/$/,'/index.html'));if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`,fakeKey='clearly-invalid-batch-browser-credential';
const checks=[],failures=[],requests=[],errors=[];let browser,page,mode='success',expectedRequests=0;
const reply=type=>type==='letter'?'人工letter完整长回信：'+'把这一天的生活细节郑重放进信封。'.repeat(70)+'【长回信完整末尾】':`人工${type}独立短评【${type}完整末尾】`;
const compose=()=>page.locator('.ai-compose-dialog[open]'),result=type=>compose().locator(`[data-ai-result-body="${type}"]`);
const outputBox=type=>compose().locator(`[data-ai-output-type="${type}"]`),recordBox=category=>compose().locator(`[data-ai-record-category="${category}"]`);
const slot=type=>page.locator(`[data-ai-daily-slot][data-ai-kind="${type}"]`);
const book=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORAGE_KEY);
const status=state=>page.waitForFunction(value=>document.querySelector('.ai-compose-dialog[open] [data-ai-compose-status]')?.dataset.aiComposeStatus===value,state);
const close=async()=>{if(await compose().count())await compose().locator('[data-ai-compose-close]').click();};
const open=async()=>{await page.locator('[data-ai-batch-open]').click();await compose().locator('[data-ai-compose-generate]').waitFor();};
const nav=async name=>{await close();await page.locator(`.bottom-nav [data-page="${name}"]`).click();if(['calendar','inventory'].includes(name))await page.locator('[data-ai-batch-open]').waitFor();};
const chooseOutputs=async selected=>{for(const type of types)await outputBox(type).setChecked(selected.includes(type));};
const trigger=async()=>{const confirm=await compose().locator('[data-ai-result-body]').evaluateAll(nodes=>nodes.some(node=>!node.disabled&&node.value.trim()));expectedRequests++;await compose().locator('[data-ai-compose-generate]').click();if(confirm)await page.locator('#confirm-yes').click();};
const generate=async(state='success')=>{await trigger();await status(state);};
const requestText=payload=>payload.messages.map(row=>row.content).join('\n');
const once=(text,marker)=>assert.equal(text.split(marker).length-1,1,`exactly one copy of ${marker}`);
const counts=async()=>{const state=await book();return{comments:state.postOffice.comments.length,letters:state.postOffice.letters.length};};
const waitCounts=async({comments,letters})=>page.waitForFunction(({key,comments,letters})=>{const state=JSON.parse(localStorage.getItem(key));return state.postOffice.comments.length===comments&&state.postOffice.letters.length===letters;},{key:STORAGE_KEY,comments,letters});
const externalState=async state=>{const other=await page.context().newPage();try{await other.goto(origin+'/__setup.html');await other.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:STORAGE_KEY,state});}finally{await other.close();}};
async function check(name,run){try{await run();checks.push(name);console.log(`PASS ${name}`);}catch(error){failures.push({name,message:error.message});console.error(`FAIL ${name}: ${error.message}`);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close())).catch(()=>{});}}

try{
  browser=await playwright[engine].launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'});page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://www.jiemomo.com/v1/chat/completions',async route=>{
    const payload=route.request().postDataJSON();requests.push(payload);const currentMode=mode;
    if(currentMode==='hold')await new Promise(done=>setTimeout(done,650));
    const requested=types.filter(type=>requestText(payload).includes(`人工${type}任务预设标记`)),data=Object.fromEntries(requested.map(type=>[type,reply(type)]));
    const raw=currentMode==='malformed'?'人工模型无结构全文\n【原始返回完整末尾】':JSON.stringify(currentMode==='partial'?{meals:reply('meals')}:data);
    try{await route.fulfill({status:currentMode==='error'?503:200,contentType:'application/json',body:JSON.stringify(currentMode==='error'?{error:{message:'synthetic server unavailable'}}:{choices:[{message:{content:raw},finish_reason:currentMode==='incomplete'?'length':'stop'}]})});}catch{}
  });
  await page.goto(origin+'/__setup.html');
  await page.evaluate(({fixture,key})=>{localStorage.setItem(key,JSON.stringify(fixture));localStorage.setItem('jizhi-meals-v1','人工正式版保护标记');},{fixture,key:STORAGE_KEY});
  await page.goto(origin+'/#calendar');
  await page.evaluate(async({date,fakeKey})=>{window.host=(await import('./app.js')).postOfficeHost;host.openDay(date);(await import('./ai-session.js')).setAIConfig({baseURL:'https://www.jiemomo.com/v1',apiKey:fakeKey,model:'synthetic-batch-model'});},{date,fakeKey});
  await page.locator('[data-ai-batch-open]').waitFor();

  await check('one calendar entrance and all five tasks open without a request',async()=>{
    assert.equal(await page.locator('[data-ai-batch-open]').count(),1);assert.equal(await page.locator('[data-ai-open]').count(),0);
    assert.equal(await slot('meals').locator('.ai-comment-paper').count(),0);assert.equal(await slot('letter').locator('.ai-reply-area').count(),0);
    await open();assert.equal(await compose().locator('[data-ai-output-type]:checked').count(),5);assert.equal(await compose().locator('[data-ai-record-category]:checked').count(),5);
    const records=await compose().locator('[data-ai-compose-records]').inputValue();
    for(const marker of ['人工日记-2026-10-14','人工餐食-2026-10-14','人工运动-2026-10-14','人工学习-2026-10-14','人工库存标记'])assert.ok(records.includes(marker),marker);
    assert.doesNotMatch(records,/2026-10-13/);assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    await page.screenshot({path:resolve(output,`${engine}-compose-390.png`)});await close();
  });
  await check('one request returns four editable comments and a long letter; save each then all is idempotent',async()=>{
    await open();await compose().locator('[data-ai-short-length]').fill('人工短篇幅要求');await compose().locator('[data-ai-letter-length]').fill('人工长篇幅要求');
    const before=await counts(),count=requests.length;await generate();assert.equal(requests.length,count+1);
    const sent=requests.at(-1),text=requestText(sent);assert.equal(sent.model,'synthetic-batch-model');assert.equal(sent.messages.length,2);
    for(const marker of ['人工用户人设原文标记','人工最原人设原文标记','人工最原专属文学原文标记','人工短篇幅要求','人工长篇幅要求',...types.map(type=>`人工${type}任务预设标记`)])once(text,marker);
    assert.doesNotMatch(text,/人工通用文学原文标记|2026-10-13/);for(const type of types)assert.equal(await result(type).inputValue(),reply(type));assert.deepEqual(await counts(),before);
    await result('meals').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`${engine}-editable-results-390.png`)});
    await result('meals').fill('人工手动修订餐食短评');await compose().locator('[data-ai-save-result="meals"]').click();await waitCounts({comments:before.comments+1,letters:before.letters});assert.equal(await compose().count(),1);
    await compose().locator('[data-ai-compose-save]').click();await waitCounts({comments:before.comments+4,letters:before.letters+1});assert.equal(requests.length,count+1);
    const state=await book();assert.deepEqual(recordsOf(state),originalRecords);
    for(const type of types){const saved=[...state.postOffice.comments,...state.postOffice.letters].find(row=>row.type===type);assert.equal(saved.characterId,'saihara');assert.equal(saved.characterName,'最原终一');assert.match(saved.recordsText,/人工库存标记/);assert.match(saved.recordsText,/12/);assert.equal(saved.body,type==='meals'?'人工手动修订餐食短评':reply(type));}
    assert.ok(state.postOffice.comments.find(row=>row.type==='inventory').snapshotId);assert.equal(new Set([...state.postOffice.comments,...state.postOffice.letters].map(row=>row.id)).size,5);
    assert.ok(await compose().locator('[data-ai-compose-save]').isDisabled());await close();
    assert.match(await slot('meals').locator('.ai-content-body').textContent(),/人工手动修订餐食短评/);assert.match(await slot('exercise').locator('.ai-content-body').textContent(),/人工exercise独立短评/);assert.match(await slot('study').locator('.ai-content-body').textContent(),/人工study独立短评/);
    await slot('letter').locator('.ai-saved-letter summary').click();assert.match(await slot('letter').locator('.ai-content-body').textContent(),/长回信完整末尾/);
    await slot('letter').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`${engine}-saved-letter-390.png`)});
  });
  await check('inventory uses the same single entrance and never generates on navigation',async()=>{
    const count=requests.length;await nav('inventory');assert.equal(await page.locator('[data-ai-batch-open]').count(),1);assert.equal(await page.locator('[data-ai-open]').count(),0);
    assert.match(await slot('inventory').locator('.ai-content-body').textContent(),/人工inventory独立短评/);await open();assert.equal(await compose().locator('[data-ai-output-type]:checked').count(),5);assert.equal(requests.length,count);
    await close();await nav('calendar');await page.evaluate(date=>host.openDay(date),date);
  });
  await check('deselection removes tasks and matching records; optional context and temporary role stay explicit',async()=>{
    const before=await counts(),count=requests.length;await open();await chooseOutputs(['meals']);assert.equal(await compose().locator('[data-ai-record-category]:checked').count(),1);
    let records=await compose().locator('[data-ai-compose-records]').inputValue();assert.match(records,/人工餐食-2026-10-14/);assert.doesNotMatch(records,/人工日记-|人工运动-|人工学习-|人工库存标记/);
    await recordBox('diary').check();records=await compose().locator('[data-ai-compose-records]').inputValue();assert.match(records,/人工日记-2026-10-14/);
    await compose().locator('[data-ai-compose-date]').fill('2026-10-13');await compose().locator('[data-ai-compose-date]').dispatchEvent('change');
    assert.match(await compose().locator('[data-ai-compose-records]').inputValue(),/人工日记-2026-10-13/);assert.doesNotMatch(await compose().locator('[data-ai-compose-records]').inputValue(),/2026-10-14/);
    await compose().locator('[data-ai-compose-role]').selectOption('little-tt');await compose().locator('[data-ai-compose-records]').fill((await compose().locator('[data-ai-compose-records]').inputValue())+'\n人工手动补充');assert.equal(requests.length,count);await generate();
    const text=requestText(requests.at(-1));once(text,'人工小tt人设原文标记');once(text,'人工通用文学原文标记');once(text,'人工meals任务预设标记');assert.match(text,/人工手动补充|人工日记-2026-10-13/);
    assert.doesNotMatch(text,/人工最原人设原文标记|人工exercise任务预设标记|人工study任务预设标记|人工inventory任务预设标记|人工letter任务预设标记|人工库存标记|人工运动-|人工学习-/);
    assert.equal(await compose().locator('[data-ai-result-body]').count(),1);assert.equal(await compose().locator('[data-ai-compose-role]').inputValue(),'saihara');
    await generate();assert.match(requestText(requests.at(-1)),/人工最原人设原文标记/);assert.deepEqual(await counts(),before);assert.equal((await book()).postOffice.defaultCharacterId,'saihara');
    const generatedCount=requests.length;assert.match(await compose().locator('[data-ai-preview-date]').textContent(),/2026-10-13/);
    await compose().locator('[data-ai-compose-date]').evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));},date);await page.locator('#confirm-yes').click();
    assert.equal(await compose().locator('[data-ai-compose-date]').inputValue(),date);
    assert.match(await compose().locator('[data-ai-preview-date]').textContent(),/2026-10-13/);assert.doesNotMatch(await compose().locator('[data-ai-preview-date]').textContent(),/2026-10-14/);
    await compose().locator('[data-ai-save-result="meals"]').click();await waitCounts({comments:before.comments+1,letters:before.letters});
    const saved=(await book()).postOffice.comments.at(-1);assert.equal(saved.date,'2026-10-13');assert.match(saved.recordsText,/人工日记-2026-10-13|人工手动补充/);assert.doesNotMatch(saved.recordsText,/2026-10-14/);assert.equal(requests.length,generatedCount);await close();
  });
  await check('server failure preserves prior previews and never retries',async()=>{
    await open();await chooseOutputs(['meals']);await generate();const prior=await result('meals').inputValue(),raw=await compose().locator('[data-ai-raw-response]').textContent(),before=await counts(),count=requests.length;
    await compose().locator('[data-ai-compose-generate]').click();await page.locator('#confirm-no').click();assert.equal(requests.length,count);assert.equal(await result('meals').inputValue(),prior);
    mode='error';await generate('error');assert.match(await compose().locator('[data-ai-compose-status]').textContent(),/503/);assert.equal(await result('meals').inputValue(),prior);assert.equal(await compose().locator('[data-ai-raw-response]').textContent(),raw);
    await page.waitForTimeout(800);assert.equal(requests.length,count+1);assert.deepEqual(await counts(),before);mode='success';await close();
  });
  await check('partial JSON keeps raw text and permits manual assignment without another request',async()=>{
    await open();await chooseOutputs(['meals','letter']);const before=await counts(),count=requests.length;mode='partial';await generate('partial');
    assert.equal(await result('meals').inputValue(),reply('meals'));assert.equal(await result('letter').inputValue(),'');assert.equal(await compose().locator('[data-ai-raw-response]').textContent(),JSON.stringify({meals:reply('meals')}));
    await result('letter').fill('人工手动分配完整回信');await compose().locator('[data-ai-compose-save]').click();await waitCounts({comments:before.comments+1,letters:before.letters+1});
    await page.waitForTimeout(800);assert.equal(requests.length,count+1);assert.equal((await book()).postOffice.letters.at(-1).body,'人工手动分配完整回信');mode='success';await close();
  });
  await check('malformed JSON preserves complete raw text for manual save without auto repair',async()=>{
    await open();await chooseOutputs(['meals']);const before=await counts(),count=requests.length;mode='malformed';await generate('partial');
    const raw='人工模型无结构全文\n【原始返回完整末尾】';assert.equal(await compose().locator('[data-ai-raw-response]').textContent(),raw);await result('meals').fill(raw);
    await compose().locator('[data-ai-save-result="meals"]').click();await waitCounts({comments:before.comments+1,letters:before.letters});await page.waitForTimeout(800);assert.equal(requests.length,count+1);
    assert.equal((await book()).postOffice.comments.at(-1).body,raw);mode='success';await close();
  });
  await check('length-limited result stays visible and requires explicit save confirmation',async()=>{
    await open();await chooseOutputs(['letter']);const before=await counts(),count=requests.length;mode='incomplete';await generate('incomplete');
    assert.equal(await result('letter').inputValue(),reply('letter'));assert.match(await compose().locator('[data-ai-raw-response]').textContent(),/长回信完整末尾/);
    await compose().locator('[data-ai-save-result="letter"]').click();await page.locator('#confirm-no').click();assert.deepEqual(await counts(),before);
    await compose().locator('[data-ai-save-result="letter"]').click();await page.locator('#confirm-yes').click();await waitCounts({comments:before.comments,letters:before.letters+1});
    await page.waitForTimeout(800);assert.equal(requests.length,count+1);mode='success';await close();
  });
  await check('cancel and API configuration changes ignore stale replies and reset temporary role',async()=>{
    await open();await chooseOutputs(['meals']);await generate();const prior=await result('meals').inputValue(),raw=await compose().locator('[data-ai-raw-response]').textContent(),before=await counts();
    await compose().locator('[data-ai-compose-role]').selectOption('little-tt');mode='hold';await trigger();await status('loading');
    await page.waitForTimeout(50);await compose().locator('[data-ai-compose-cancel]').click();await status('cancelled');await page.waitForTimeout(800);
    assert.equal(await result('meals').inputValue(),prior);assert.equal(await compose().locator('[data-ai-raw-response]').textContent(),raw);assert.equal(await compose().locator('[data-ai-compose-role]').inputValue(),'saihara');assert.deepEqual(await counts(),before);
    await trigger();await status('loading');await page.waitForTimeout(50);
    await page.evaluate(async()=>{(await import('./ai-session.js')).setAIConfig({model:'synthetic-updated-batch-model'});});await status('cancelled');await page.waitForTimeout(800);
    assert.equal(await result('meals').inputValue(),prior);assert.equal(await compose().locator('[data-ai-raw-response]').textContent(),raw);assert.deepEqual(await counts(),before);
    await page.evaluate(async()=>{(await import('./ai-session.js')).setAIConfig({model:'synthetic-batch-model'});});mode='success';
    const current=await book(),changed=structuredClone(current),count=requests.length;changed.postOffice.user.name='人工另一标签页改名';await externalState(changed);
    await page.waitForFunction(()=>!document.querySelector('.ai-compose-dialog[open]'));assert.equal(await page.locator('[data-ai-result-body]').count(),0);assert.equal(requests.length,count);
    await externalState(current);await page.locator('[data-ai-batch-open]').waitFor();
  });
  await check('rapid double activation sends one request and closing ignores the reply',async()=>{
    await open();await chooseOutputs(['meals']);const count=requests.length,before=await counts();mode='hold';expectedRequests++;
    await compose().locator('[data-ai-compose-generate]').evaluate(button=>{button.click();button.click();});await status('loading');await page.waitForTimeout(50);await close();await page.waitForTimeout(800);
    assert.equal(requests.length,count+1);assert.equal(await compose().count(),0);assert.deepEqual(await counts(),before);mode='success';
    await open();assert.equal(await compose().locator('[data-ai-result-body]').count(),0);await close();
  });
  await check('another same-origin tab replacing the book cancels the request and blocks stale writes',async()=>{
    const current=await book(),empty=freshState(),count=requests.length;await open();await chooseOutputs(['meals']);mode='hold';await trigger();await status('loading');await page.waitForTimeout(50);
    await externalState(empty);await page.waitForFunction(()=>!document.querySelector('.ai-compose-dialog[open]'));await page.waitForTimeout(800);
    assert.equal(requests.length,count+1);const state=await book();assert.deepEqual(recordsOf(state),recordsOf(empty));assert.deepEqual(state.postOffice.comments,[]);assert.deepEqual(state.postOffice.letters,[]);assert.deepEqual(state.diaries,[]);
    assert.deepEqual(await page.evaluate(()=>({comments:host.getState().postOffice.comments,letters:host.getState().postOffice.letters,diaries:host.getState().diaries})),{comments:[],letters:[],diaries:[]});
    assert.equal(await page.evaluate(async()=>(await import('./ai-session.js')).getAIConfig().apiKey),fakeKey);await externalState(current);await page.locator('[data-ai-batch-open]').waitFor();assert.deepEqual(await book(),current);mode='success';
  });
  await check('unavailable save capacity rejects locally before a paid request and leaves the book unchanged',async()=>{
    const current=await book(),count=requests.length;await open();assert.equal(await compose().locator('[data-ai-output-type]:checked').count(),5);
    await compose().locator('[data-ai-compose-records]').fill('人'.repeat(300000));await compose().locator('[data-ai-compose-generate]').click();await page.locator('#confirm-yes').click();await status('error');
    assert.match(await compose().locator('[data-ai-compose-status]').textContent(),/本次未发送请求/);assert.equal(requests.length,count);assert.deepEqual(await book(),current);assert.equal(await compose().locator('[data-ai-result-body]').count(),0);
    await close();await open();assert.match(await compose().locator('[data-ai-compose-records]').inputValue(),/人工日记-2026-10-14/);assert.equal(requests.length,count);await close();
  });
  await check('saved record and role snapshots survive later edits and default role changes',async()=>{
    const saved=structuredClone((await book()).postOffice);await page.evaluate(()=>host.commit(state=>{state.inventory[0].quantity=99;state.postOffice.characters[0].name='后来改名的最原';state.postOffice.characters[0].persona='后来修改的人设';state.postOffice.defaultCharacterId='little-tt';}));
    const state=await book();assert.deepEqual(state.postOffice.comments,saved.comments);assert.deepEqual(state.postOffice.letters,saved.letters);const inventory=state.postOffice.comments.find(row=>row.type==='inventory');assert.match(inventory.recordsText,/12/);assert.doesNotMatch(inventory.recordsText,/99/);
    assert.equal(state.postOffice.letters[0].characterName,'最原终一');await open();assert.equal(await compose().locator('[data-ai-compose-role]').inputValue(),'little-tt');await close();
  });
  await check('unavailable default role blocks generation while preserving history',async()=>{
    const prior=structuredClone((await book()).postOffice),count=requests.length;await page.evaluate(()=>host.commit(state=>{state.postOffice.characters.find(row=>row.id==='little-tt').enabled=false;}));
    await page.locator('[data-ai-batch-open]').click();assert.equal(await compose().count(),0);assert.equal(requests.length,count);const state=await book();assert.deepEqual(state.postOffice.comments,prior.comments);assert.deepEqual(state.postOffice.letters,prior.letters);
    await page.evaluate(()=>host.commit(state=>{state.postOffice.characters.find(row=>row.id==='little-tt').enabled=true;}));
  });
  await check('deleting one saved item confirms without changing life records',async()=>{
    const before=await counts(),records=recordsOf(await book());await slot('meals').locator('[data-ai-delete]').first().click();await page.locator('#confirm-no').click();assert.deepEqual(await counts(),before);
    await slot('meals').locator('[data-ai-delete]').first().click();await page.locator('#confirm-yes').click();await waitCounts({comments:before.comments-1,letters:before.letters});assert.deepEqual(recordsOf(await book()),records);
  });
  await check('desktop preview remains usable with all long outputs and no horizontal overflow',async()=>{
    await page.setViewportSize({width:1280,height:900});await open();await generate();assert.equal(await compose().locator('[data-ai-result-body]').count(),5);assert.equal(await result('letter').inputValue(),reply('letter'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);await result('letter').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`${engine}-compose-desktop.png`)});await close();await page.setViewportSize({width:390,height:844});
  });
  await check('JSON export and restore include immutable avatars and batch results but exclude session key',async()=>{
    await page.evaluate(async()=>{const avatar=await import('./ai-avatar.js'),canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;canvas.getContext('2d').fillStyle='#008000';canvas.getContext('2d').fillRect(16,16,32,80);await avatar.importAvatarAssets([{id:'synthetic-history-avatar',dataURL:canvas.toDataURL('image/png')}]);host.commit(state=>{state.postOffice.user.avatarId='synthetic-history-avatar';state.postOffice.characters[0].avatarId='synthetic-history-avatar';state.postOffice.letters[0].avatarId='synthetic-history-avatar';});});
    await nav('settings');const expected=(await book()).postOffice,downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').first().click();const download=await downloadPromise,exported=await readFile(await download.path(),'utf8'),parsed=JSON.parse(exported);
    assert.equal(parsed.aiAvatarAssets.length,1);assert.equal(parsed.aiAvatarAssets[0].id,'synthetic-history-avatar');assert.deepEqual(parsed.postOffice.comments,expected.comments);assert.deepEqual(parsed.postOffice.letters,expected.letters);assert.ok(!exported.includes(fakeKey));assert.ok(!Object.hasOwn(parsed.postOffice,'apiKey'));
    await page.evaluate(()=>host.commit(state=>{state.postOffice.user.name='替换前人工名称';}));await page.locator('#import-file').setInputFiles({name:'synthetic-batch-backup.json',mimeType:'application/json',buffer:Buffer.from(exported)});await page.locator('#restore-confirm').click();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).postOffice.user.name==='机智',STORAGE_KEY);
    assert.deepEqual((await book()).postOffice,expected);await page.reload();assert.equal(await page.evaluate(async()=>(await import('./ai-session.js')).getAIConfig().apiKey),'');assert.match(await page.evaluate(async()=>(await import('./ai-avatar.js')).getAvatarDataURL('synthetic-history-avatar')),/^data:image\/png/);
  });
  await check('phase-2 JSON restores original presets, life records and legacy letter',async()=>{
    const old=structuredClone(fixture);old.postOffice={version:1,userPersona:'原本人设不覆盖',writingPreset:'原本文学不覆盖',letterTask:'原本任务不覆盖',characters:[{id:'saihara',name:'最原终一',persona:'原本最原不覆盖'},{id:'little-tt',name:'小tt',persona:'原本小tt不覆盖'}],letters:[{id:'legacy-saved-letter',date,characterName:'最原终一',body:'过去收藏的完整信件',generatedAt:'2026-10-13T02:00:00.000Z'}]};
    await page.locator('#import-file').setInputFiles({name:'synthetic-old-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await page.locator('#restore-confirm').click();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).postOffice.letters[0]?.id==='legacy-saved-letter',STORAGE_KEY);
    const state=await book();assert.equal(state.postOffice.version,2);assert.equal(state.postOffice.userPersona,'原本人设不覆盖');assert.equal(state.postOffice.characters[0].persona,'原本最原不覆盖');assert.equal(state.postOffice.letters[0].body,'过去收藏的完整信件');assert.deepEqual(recordsOf(state),originalRecords);
  });
  await check('formal namespace untouched, no background requests or runtime errors',async()=>{
    assert.equal(await page.evaluate(()=>localStorage.getItem('jizhi-meals-v1')),'人工正式版保护标记');assert.equal(requests.length,expectedRequests);assert.deepEqual(errors,[]);
  });
  await writeFile(resolve(output,`${engine}-results.json`),JSON.stringify({engine,checks,failures,requestCount:requests.length,expectedRequests,pageErrors:errors,realAPI:'Not tested: mocked synthetic responses only.'},null,2));
  if(failures.length)throw new Error(`${failures.length} AI batch browser checks failed.`);console.log(`${engine}: ${checks.length} AI batch browser checks passed.`);
}finally{await browser?.close();server.close();}
