import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('C:/Users/witty hu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = resolve('.'), engine = process.env.UI_ENGINE || 'chromium';
const output = resolve(root, 'tests/ui-previews/ai-share'); await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/__test.html') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="share-editor.css"><div id="editor"></div>'); return; }
  const file = resolve(root, '.' + pathname); if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', { '.js':'text/javascript', '.svg':'image/svg+xml', '.css':'text/css' }[extname(file)] || 'text/plain'); res.end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const checks = [], errors = []; let external = 0;
try {
  browser = await playwright[engine].launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**', route => { external++; route.abort(); });
  await page.goto(`http://127.0.0.1:${server.address().port}/__test.html`);
  await page.evaluate(async () => {
    window.share = await import('./share-journal.js'); window.shareAI = await import('./share-ai.js'); window.editorModule = await import('./share-editor.js');
    const avatar = await import('./ai-avatar.js'), canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
    canvas.getContext('2d').fillStyle = '#008000'; canvas.getContext('2d').fillRect(16, 16, 32, 80);
    await avatar.importAvatarAssets([{ id: 'synthetic-transparent', dataURL: canvas.toDataURL('image/png') }]);
    const entry = (id, type, body = `${id}：这是一句角色短评。`) => ({ id, type, date: type === 'inventory' ? '' : '2026-10-14', characterId: 'saihara', characterName: '生成时的角色', avatarId: 'synthetic-transparent', avatarMode: 'sticker', avatarFallback: 'saihara', body, generatedAt: '2026-10-14T05:00:00.000Z', snapshotId: type === 'inventory' ? 'inventory-snapshot' : '', recordsText: '不可分享的记录快照' });
    window.book = { meals: [{ id: 'meal', date: '2026-10-14', slot: 'breakfast', name: '人工草莓牛奶', completed: true }], dayRecords: [{ date:'2026-10-14', exercise:{ checked:true,items:[{content:'人工散步',minutes:10}] }, study:{ checked:true,items:[{content:'人工读书',minutes:20}] }, stickerIds:[] }], diaries:[{date:'2026-10-14',text:'原始私人日记不可默认分享'}], postOffice:{comments:['meals','exercise','study','inventory'].map(type=>entry(type,type)),letters:[entry('letter','letter','人工来信第一段。\n'+ '完整自然语言正文👩‍🎨。'.repeat(70)+'\n【来信末尾必须保留】')]} };
    window.original = JSON.stringify(book);
    window.dataURL = blob => new Promise(done => { const reader = new FileReader(); reader.onload = () => done(reader.result); reader.readAsDataURL(blob); });
    window.drawn = [];
    const actual = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text,x,y,...args) {
      const matrix = this.getTransform(), metrics = this.measureText(text), left=x-metrics.actualBoundingBoxLeft,right=x+metrics.actualBoundingBoxRight,top=y-metrics.actualBoundingBoxAscent,bottom=y+metrics.actualBoundingBoxDescent;
      const points=[[left,top],[right,top],[right,bottom],[left,bottom]].map(([a,b])=>({x:matrix.a*a+matrix.c*b+matrix.e,y:matrix.b*a+matrix.d*b+matrix.f}));
      drawn.push({text,left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y)),width:this.canvas.width,height:this.canvas.height});
      return actual.call(this,text,x,y,...args);
    };
  });
  const defaultCards = await page.evaluate(async () => {
    const options = { date:'2026-10-14',kind:'meal',template:'meal-strawberry',format:'portrait',stickerIds:[] };
    const plain = structuredClone(book); delete plain.postOffice;
    const baseline = await share.generateJournalShareCard(plain, options), excluded = await share.generateJournalShareCard(book, options);
    window.baseline = baseline;
    return { baseline:await dataURL(baseline.blob), excluded:await dataURL(excluded.blob), text:excluded.text, unchanged:JSON.stringify(book)===original };
  });
  const hash = data => createHash('sha256').update(Buffer.from(data.split(',')[1],'base64')).digest('hex');
  assert.equal(hash(defaultCards.baseline), hash(defaultCards.excluded)); assert.doesNotMatch(defaultCards.text.join(''), /角色短评|私人日记|来信|记录快照/); assert.equal(defaultCards.unchanged,true);
  checks.push('saved AI excluded by default and original PNG bytes unchanged');

  for (const [type,kind] of [['meals','meal'],['exercise','exercise'],['study','study'],['letter','life'],['inventory','life']]) {
    const result = await page.evaluate(async ({type,kind}) => {
      drawn.length=0;
      const source = type==='inventory'?{...book,meals:[],dayRecords:[],diaries:[]}:book;
      const card=await share.generateJournalShareCard(source,{date:'2026-10-14',kind,format:'long',aiIds:[type],inventoryAI:type==='inventory',stickerIds:[]});
      const url=await dataURL(card.blob),image=new Image();image.src=url;await image.decode();
      const escaped=drawn.filter(row=>row.left<-.1||row.right>row.width+.1||row.top<0||row.bottom>row.height+.1);
      return {url,width:card.width,height:card.height,imageWidth:image.naturalWidth,imageHeight:image.naturalHeight,aiCount:card.aiCount,text:card.text,escaped,drawn:drawn.map(row=>row.text),unchanged:JSON.stringify(book)===original};
    },{type,kind});
    assert.equal(result.aiCount,1);assert.equal(result.width,result.imageWidth);assert.equal(result.height,result.imageHeight);assert.deepEqual(result.escaped,[],`${type}: clipped glyph`);assert.equal(result.unchanged,true);assert.doesNotMatch(result.text.join(''),/不可分享的记录快照/);
    if(type==='letter'){assert.ok(result.drawn.includes('【来信末尾必须保留】'));await writeFile(resolve(output,`${engine}-long-letter.png`),Buffer.from(result.url.split(',')[1],'base64'));}
    if(type==='inventory')assert.match(result.drawn.join(''),/库存快照/);
    checks.push(`${type} produces full PNG with immutable avatar and body`);
  }
  const transparent = await page.evaluate(async () => {
    const entry={...book.postOffice.comments[0],body:'头像透明度验证'};
    const card=await shareAI.appendAIShareCard(baseline,[entry],{format:'long'}),image=new Image();image.src=await dataURL(card.blob);await image.decode();
    const canvas=document.createElement('canvas');canvas.width=card.width;canvas.height=card.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);
    const offset=baseline.height/2;
    return {inside:[...c.getImageData(59*2,(offset+145)*2,1,1).data],outside:[...c.getImageData(30*2,(offset+145)*2,1,1).data]};
  });
  assert.deepEqual(transparent.inside,[0,128,0,255]);assert.deepEqual(transparent.outside,[255,247,249,255]);checks.push('transparent avatar retains full aspect ratio and clear background in PNG');

  const limits = await page.evaluate(async () => {
    let square='',huge='';
    try{await share.generateJournalShareCard(book,{date:'2026-10-14',format:'square',aiIds:['letter']});}catch(error){square=error.message;}
    const source=structuredClone(book);source.postOffice.letters[0].body='完整正文\n'.repeat(1000);
    try{await share.generateJournalShareCard(source,{date:'2026-10-14',format:'long',aiIds:['letter']});}catch(error){huge=error.message;}
    return{square,huge};
  });
  assert.match(limits.square,/完整保留正文/);assert.match(limits.huge,/没有被截掉/);checks.push('square and oversized AI export are rejected with actionable full-text guidance');

  await page.evaluate(() => {window.pending=0;window.produced=[];window.editor=editorModule.mountShareEditor(document.querySelector('#editor'),book,'2026-10-14',{onPending(){pending++;},onImage(card){produced.push(card);return URL.createObjectURL(card.blob);}});});
  await page.waitForFunction(()=>produced.length>0);
  assert.equal(await page.locator('[data-share-ai-id]:checked').count(),0);
  assert.equal(await page.locator('[data-share-ai-id="inventory"]').count(),0);
  await page.locator('.journal-share-extras summary').click();
  await page.locator('[data-share-ai-id="letter"]').check();await page.waitForFunction(()=>produced.at(-1)?.aiCount===1);
  await page.locator('[data-share-kind="study"]').click();await page.waitForFunction(()=>editor.getOptions().aiIds.length===0);
  assert.equal(await page.locator('[data-share-ai-id="letter"]').count(),0);
  await page.locator('[data-share-kind="life"]').click();assert.equal(await page.locator('[data-share-ai-id="letter"]').isChecked(),false);
  checks.push('editor explicit selections drop when share kind excludes content and never reselect automatically');
  await page.evaluate(()=>editor.destroy());
  assert.equal(external,0);assert.deepEqual(errors,[]);
  checks.push('all sharing is local with no AI API or external network request');
  await writeFile(resolve(output,`${engine}-results.json`),JSON.stringify({engine,checks,external,errors},null,2));
  console.log(`${engine}: ${checks.length} AI share checks passed.`);
} finally {await browser?.close();server.close();}
