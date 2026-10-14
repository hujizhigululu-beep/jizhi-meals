import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { freshState } from '../model.js';
import { STORAGE_KEY } from '../storage.js';

// Fresh synthetic profiles and mocked responses only; no personal browser or real key.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('C:/Users/witty hu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = resolve('.'), engine = process.env.UI_ENGINE || 'chromium', date = '2026-10-14';
const output = resolve(root, 'tests/ui-previews/ai-roles'); await mkdir(output, { recursive: true });
const fixture = freshState();
fixture.inventory = [{ id:'synthetic-rice',name:'人工库存标记',quantity:12,perMeal:1,unit:'份',category:'碳水',note:'人工库存备注',expires:'' }];
fixture.meals = [date,'2026-10-13'].map((d,index)=>({id:`synthetic-meal-${index}`,date:d,slot:'breakfast',name:`人工餐食-${d}`,type:'自制便当',protein:'',note:`人工餐食备注-${d}`,resources:[],completed:true,completedAt:'2026-10-14T00:00:00.000Z'}));
fixture.diaries = [date,'2026-10-13'].map(d=>({date:d,mood:'人工心情',text:`人工日记-${d}`,joy:'人工小确幸',updatedAt:'2026-10-14T01:00:00.000Z'}));
fixture.dayRecords = [date,'2026-10-13'].map((d,index)=>({date:d,study:{checked:true,manualChecked:true,categoryIds:[],items:[{id:`synthetic-study-${index}`,content:`人工学习-${d}`,minutes:30,note:'人工学习备注'}]},exercise:{checked:true,manualChecked:true,categoryIds:[],items:[{id:`synthetic-exercise-${index}`,content:`人工运动-${d}`,minutes:20,note:'人工运动备注',distanceKm:2}]},stickerIds:[]}));
fixture.postOffice.userPersona = '人工用户人设原文标记';
fixture.postOffice.writingPreset = '人工通用文学原文标记';
fixture.postOffice.characters[0].persona = '人工最原人设原文标记'; fixture.postOffice.characters[0].writingPreset = '人工最原专属文学原文标记';
fixture.postOffice.characters[1].persona = '人工小tt人设原文标记'; fixture.postOffice.characters[1].writingPreset = '';
const server = createServer(async(req,res)=>{
  const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path==='/__setup.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>人工测试数据准备</title>');return;}
  const file=resolve(root,'.'+path.replace(/\/$/,'/index.html'));if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`, fakeKey='clearly-invalid-role-browser-credential';
const checks=[],failures=[],requests=[],errors=[],originalRecords=structuredClone({inventory:fixture.inventory,meals:fixture.meals,diaries:fixture.diaries,dayRecords:fixture.dayRecords});
let browser,page,mode='success';
async function check(name,run){try{await run();checks.push(name);console.log(`PASS ${name}`);}catch(error){failures.push({name,message:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
const slot=type=>page.locator(`[data-ai-daily-slot][data-ai-kind="${type}"]`);
const compose=()=>page.locator('.ai-compose-dialog[open]');
const status=state=>page.waitForFunction(value=>document.querySelector('.ai-compose-dialog[open] [data-ai-compose-status]')?.dataset.aiComposeStatus===value,state);
const book=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORAGE_KEY);
const open=async type=>{if(['exercise','study'].includes(type)){const details=page.locator(`.activity-details[data-kind="${type}"]`);if(!await details.evaluate(node=>node.open))await details.locator('summary').click();}await slot(type).locator('[data-ai-open]').click();await compose().locator('[data-ai-compose-generate]').waitFor();};
const generate=async()=>{await compose().locator('[data-ai-compose-generate]').click();await status('success');};
const close=async()=>{if(await compose().count())await compose().locator('[data-ai-compose-close]').click();};
const nav=async name=>{await close();await page.locator(`.bottom-nav [data-page="${name}"]`).click();};
const recordsOf=state=>({inventory:state.inventory,meals:state.meals,diaries:state.diaries,dayRecords:state.dayRecords});

try{
  browser=await playwright[engine].launch({headless:true});page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://www.jiemomo.com/v1/chat/completions',async route=>{
    const payload=route.request().postDataJSON();requests.push(payload);
    const currentMode=mode;if(currentMode==='hold')await new Promise(done=>setTimeout(done,650));
    try{await route.fulfill({status:currentMode==='error'?503:200,contentType:'application/json',body:JSON.stringify(currentMode==='error'?{error:{message:'synthetic server unavailable'}}:{choices:[{message:{content:`人工模型回复 ${requests.length}：${payload.messages[0].content.includes('人工小tt人设')?'小tt':'最原终一'}把这张生活纸条收好。\n【回复完整末尾】`},finish_reason:'stop'}]})});}catch{}
  });
  await page.goto(origin+'/__setup.html');await page.evaluate(({fixture,key})=>{localStorage.setItem(key,JSON.stringify(fixture));localStorage.setItem('jizhi-meals-v1','人工正式版保护标记');},{fixture,key:STORAGE_KEY});
  await page.goto(origin+'/#calendar');
  await page.evaluate(async({date,fakeKey})=>{window.host=(await import('./app.js')).postOfficeHost;host.openDay(date);(await import('./ai-session.js')).setAIConfig({baseURL:'https://www.jiemomo.com/v1',apiKey:fakeKey,model:'synthetic-role-model'});},{date,fakeKey});
  await slot('meals').locator('[data-ai-open]').waitFor();
  await check('daily entrances appear without saved bubbles or background requests',async()=>{
    assert.equal(await slot('meals').locator('.ai-comment-paper').count(),0);assert.equal(await slot('letter').locator('.ai-reply-area').count(),0);assert.equal(requests.length,0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('jizhi-meals-v1')),'人工正式版保护标记');
  });
  for(const type of ['meals','exercise','study','inventory'])await check(`${type} explicit preview, correct data and save only on click`,async()=>{
    if(type==='inventory')await nav('inventory');
    await open(type);const records=await compose().locator('[data-ai-compose-records]').inputValue();
    const allowed={meals:'人工餐食-',exercise:'人工运动-',study:'人工学习-',inventory:'人工库存标记'}[type];assert.ok(records.includes(allowed));assert.doesNotMatch(records,/2026-10-13/);
    for(const marker of ['人工日记-','人工餐食-','人工运动-','人工学习-','人工库存标记'])if(marker!==allowed)assert.ok(!records.includes(marker),`excluded ${marker}`);
    const before=(await book()).postOffice.comments.length;await generate();const sent=requests.at(-1);
    assert.equal(sent.model,'synthetic-role-model');assert.match(sent.messages[0].content,/人工用户人设原文标记/);assert.match(sent.messages[0].content,/人工最原人设原文标记/);assert.match(sent.messages[0].content,/人工最原专属文学原文标记/);assert.doesNotMatch(sent.messages[0].content,/人工通用文学原文标记/);
    assert.equal((await book()).postOffice.comments.length,before);await compose().locator('[data-ai-compose-save]').click();await page.waitForFunction(({key,count})=>JSON.parse(localStorage.getItem(key)).postOffice.comments.length===count,{key:STORAGE_KEY,count:before+1});
    assert.equal(await slot(type).locator('.ai-comment-paper').count(),1);
    if(type==='meals'){await slot(type).scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`${engine}-meal-bubble-390.png`)});}
  });
  await nav('calendar');await page.evaluate(date=>host.openDay(date),date);
  await check('temporary role changes real persona and resets for next generation',async()=>{
    await page.setViewportSize({width:320,height:760});await open('meals');await page.screenshot({path:resolve(output,`${engine}-compose-320.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);await close();await page.setViewportSize({width:390,height:844});
    await slot('meals').locator('[data-ai-choose]').click();await slot('meals').locator('[data-ai-role-choice]').selectOption('little-tt');await open('meals');await generate();
    assert.match(requests.at(-1).messages[0].content,/人工小tt人设原文标记/);assert.match(requests.at(-1).messages[0].content,/人工通用文学原文标记/);assert.doesNotMatch(requests.at(-1).messages[0].content,/人工最原人设原文标记/);
    assert.equal(await compose().locator('[data-ai-compose-role]').inputValue(),'saihara');await generate();assert.match(requests.at(-1).messages[0].content,/人工最原人设原文标记/);assert.equal((await book()).postOffice.defaultCharacterId,'saihara');await close();
  });
  await check('failure and cancelled temporary role preserve preview; retry restores default persona and avatar',async()=>{
    await open('meals');await generate();const prior=await compose().locator('[data-ai-preview-body]').textContent(),saved=JSON.stringify((await book()).postOffice.comments);
    mode='error';await compose().locator('[data-ai-compose-generate]').click();await status('error');assert.equal(await compose().locator('[data-ai-preview-body]').textContent(),prior);assert.match(await compose().locator('[data-ai-compose-status]').textContent(),/503/);
    await compose().locator('[data-ai-compose-role]').selectOption('little-tt');assert.equal(await compose().locator('.ai-compose-identity .ai-avatar-placeholder').textContent(),'🐈');
    mode='hold';await compose().locator('[data-ai-compose-generate]').click();await status('loading');assert.match(requests.at(-1).messages[0].content,/人工小tt人设原文标记/);await compose().locator('[data-ai-compose-cancel]').click();await status('cancelled');await page.waitForTimeout(800);
    assert.equal(await compose().locator('[data-ai-compose-role]').inputValue(),'saihara');assert.equal(await compose().locator('.ai-compose-identity .ai-avatar-placeholder').textContent(),'🔎');
    assert.equal(await compose().locator('[data-ai-preview-body]').textContent(),prior);assert.equal(JSON.stringify((await book()).postOffice.comments),saved);
    mode='success';await generate();assert.match(requests.at(-1).messages[0].content,/人工最原人设原文标记/);assert.doesNotMatch(requests.at(-1).messages[0].content,/人工小tt人设原文标记/);assert.equal(JSON.stringify((await book()).postOffice.comments),saved);await close();
  });
  await check('diary letter sends only explicitly selected date/category and appears below diary after save',async()=>{
    await open('letter');assert.equal(await compose().locator('[data-ai-compose-records]').inputValue(),'');assert.equal(await compose().locator('[data-ai-record-category]:checked').count(),0);
    await compose().locator('[data-ai-record-category="diary"]').check();const records=await compose().locator('[data-ai-compose-records]').inputValue();assert.match(records,/人工日记-2026-10-14/);assert.doesNotMatch(records,/人工餐食-|人工学习-|人工运动-|人工库存标记|2026-10-13/);
    await compose().locator('[data-ai-compose-records]').fill(records+'\n人工手动补充');await generate();assert.match(requests.at(-1).messages[1].content,/人工手动补充/);assert.equal((await book()).postOffice.letters.length,0);
    await compose().locator('[data-ai-compose-save]').click();await slot('letter').locator('.ai-saved-letter').waitFor();assert.equal((await book()).postOffice.letters.length,1);assert.equal(await slot('letter').locator('.ai-saved-letter').count(),1);
    await slot('letter').locator('.ai-saved-letter summary').click();assert.match(await slot('letter').locator('.ai-content-body').textContent(),/回复完整末尾/);
    await slot('letter').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`${engine}-diary-letter-390.png`)});
  });
  await check('immutable inventory and character snapshots survive later edits',async()=>{
    const before=(await book()).postOffice.comments.find(row=>row.type==='inventory');
    await page.evaluate(()=>host.commit(state=>{state.inventory[0].quantity=99;state.postOffice.characters[0].name='后来改名的最原';state.postOffice.characters[0].persona='后来修改的人设';state.postOffice.defaultCharacterId='little-tt';}));
    const after=(await book()).postOffice.comments.find(row=>row.type==='inventory');assert.deepEqual(after,before);assert.match(before.recordsText,/12/);assert.doesNotMatch(before.recordsText,/99/);
    assert.equal((await book()).postOffice.letters[0].characterName,'最原终一');await open('meals');assert.equal(await compose().locator('[data-ai-compose-role]').inputValue(),'little-tt');await close();
  });
  await check('unavailable default role warns and blocks generation without erasing history',async()=>{
    const prior=JSON.stringify((await book()).postOffice.letters),count=requests.length;
    await page.evaluate(()=>host.commit(state=>{state.postOffice.characters.find(row=>row.id==='little-tt').enabled=false;}));
    await slot('meals').locator('.ai-default-warning').waitFor();await slot('meals').locator('[data-ai-open]').click();assert.equal(await compose().count(),0);assert.equal(requests.length,count);assert.equal(JSON.stringify((await book()).postOffice.letters),prior);
    await page.evaluate(()=>host.commit(state=>{state.postOffice.characters.find(row=>row.id==='little-tt').enabled=true;}));
  });
  await check('deleting one saved item confirms and preserves original records',async()=>{
    const before=(await book()).postOffice.comments.length;await slot('meals').locator('[data-ai-delete]').first().click();await page.locator('#confirm-no').click();assert.equal((await book()).postOffice.comments.length,before);
    await slot('meals').locator('[data-ai-delete]').first().click();await page.locator('#confirm-yes').click();await page.waitForFunction(({key,count})=>JSON.parse(localStorage.getItem(key)).postOffice.comments.length===count,{key:STORAGE_KEY,count:before-1});
    const state=await book();assert.equal(state.meals.length,fixture.meals.length);assert.deepEqual(state.diaries,fixture.diaries);assert.deepEqual(state.dayRecords,fixture.dayRecords);
  });
  await check('JSON export and restore include immutable avatars and AI but exclude session key',async()=>{
    await page.evaluate(async()=>{const avatar=await import('./ai-avatar.js'),canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;canvas.getContext('2d').fillStyle='#008000';canvas.getContext('2d').fillRect(16,16,32,80);await avatar.importAvatarAssets([{id:'synthetic-history-avatar',dataURL:canvas.toDataURL('image/png')}]);host.commit(state=>{state.postOffice.user.avatarId='synthetic-history-avatar';state.postOffice.characters[0].avatarId='synthetic-history-avatar';state.postOffice.letters[0].avatarId='synthetic-history-avatar';});});
    await nav('settings');const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').first().click();const download=await downloadPromise;const exported=await readFile(await download.path(),'utf8'),parsed=JSON.parse(exported);
    assert.equal(parsed.aiAvatarAssets.length,1);assert.equal(parsed.aiAvatarAssets[0].id,'synthetic-history-avatar');assert.equal(parsed.postOffice.letters.length,1);assert.equal(parsed.postOffice.comments.length,3);assert.ok(!exported.includes(fakeKey));assert.ok(!Object.hasOwn(parsed.postOffice,'apiKey'));
    await page.evaluate(()=>host.commit(state=>{state.postOffice.user.name='替换前人工名称';}));
    await page.locator('#import-file').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(exported)});await page.locator('#restore-confirm').click();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).postOffice.user.name==='机智',STORAGE_KEY);
    assert.equal((await book()).postOffice.letters[0].avatarId,'synthetic-history-avatar');assert.equal((await book()).postOffice.letters[0].characterName,'最原终一');
    await page.reload();assert.equal(await page.evaluate(async()=>(await import('./ai-session.js')).getAIConfig().apiKey),'');assert.match(await page.evaluate(async()=>(await import('./ai-avatar.js')).getAvatarDataURL('synthetic-history-avatar')),/^data:image\/png/);
  });
  await check('old phase-2 JSON restores without deleting its records or saved legacy letter',async()=>{
    const old=structuredClone(fixture);old.postOffice={version:1,userPersona:'原本人设不覆盖',writingPreset:'原本文学不覆盖',letterTask:'原本任务不覆盖',characters:[{id:'saihara',name:'最原终一',persona:'原本最原不覆盖'},{id:'little-tt',name:'小tt',persona:'原本小tt不覆盖'}],letters:[{id:'legacy-saved-letter',date,characterName:'最原终一',body:'过去收藏的完整信件',generatedAt:'2026-10-13T02:00:00.000Z'}]};
    await page.locator('#import-file').setInputFiles({name:'synthetic-old-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await page.locator('#restore-confirm').click();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).postOffice.letters[0]?.id==='legacy-saved-letter',STORAGE_KEY);
    const state=await book();assert.equal(state.postOffice.version,2);assert.equal(state.postOffice.userPersona,'原本人设不覆盖');assert.equal(state.postOffice.characters[0].persona,'原本最原不覆盖');assert.equal(state.postOffice.letters[0].body,'过去收藏的完整信件');assert.deepEqual(recordsOf(state),originalRecords);
  });
  await check('formal namespace remains untouched and every request came from a generate click',async()=>{
    assert.equal(await page.evaluate(()=>localStorage.getItem('jizhi-meals-v1')),'人工正式版保护标记');assert.equal(requests.length,11);assert.deepEqual(errors,[]);
  });
  await writeFile(resolve(output,`${engine}-results.json`),JSON.stringify({engine,checks,failures,requestCount:requests.length,pageErrors:errors,realAPI:'Not tested: mocked synthetic responses only.'},null,2));
  if(failures.length)throw new Error(`${failures.length} daily AI regression checks failed.`);
  console.log(`${engine}: ${checks.length} daily AI role checks passed.`);
}finally{await browser?.close();server.close();}
