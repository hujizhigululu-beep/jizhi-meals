import { SHARE_TEMPLATES, SHARE_TYPES, prepareJournalShare, generateJournalShareCard } from './share-journal.js';
import { STICKERS } from './stickers.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Date/type/layout choices never change the records supplied to this editor. */
export function mountShareEditor(container, book, date, {onImage,onPending}) {
  const listeners=[];
  const listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push([target,type,handler]);};
  let options={kind:'life',template:'life-collage',scope:'day',date,start:date.slice(0,7)+'-01',end:date,month:date.slice(0,7),format:'portrait',notes:false,mood:false,diary:false,joy:false,breakfast:true,lunch:true,dinner:true,snacks:true,stickerIds:null};
  let revision=0,timer;
  container.innerHTML=`<form id="share-form" class="journal-share-form"><div class="journal-share-kinds" role="group" aria-label="分享类型">${Object.entries(SHARE_TYPES).map(([kind,label])=>`<button type="button" data-share-kind="${kind}" aria-pressed="false">${escape(label)}</button>`).join('')}</div><div class="journal-share-fields"><label>记录范围<select name="scope"><option value="day">这一天</option><option value="range">日期范围</option><option value="month">一整月</option></select></label><label>图片规格<select name="format"><option value="portrait">竖版卡片</option><option value="long">分享长图</option><option value="square">1:1 方图</option></select></label></div><div class="journal-share-dates"><label data-scope="day">分享日期<input name="date" type="date" min="0001-01-01" max="9999-12-31"></label><label data-scope="range">从哪一天<input name="start" type="date" min="0001-01-01" max="9999-12-31"></label><label data-scope="range">到哪一天<input name="end" type="date" min="0001-01-01" max="9999-12-31"></label><label data-scope="month">分享月份<input name="month" type="month" min="0001-01" max="9999-12"></label></div><div class="journal-share-templates" role="group" aria-label="分享模板"></div><details class="journal-share-extras"><summary>贴纸与可选内容</summary><div class="journal-share-stickers">${STICKERS.map(s=>`<button type="button" data-share-sticker="${escape(s.id)}" aria-pressed="false" aria-label="${escape(s.name)}贴纸"><img src="${escape(s.src)}" width="28" height="28" alt=""><span>${escape(s.name)}</span></button>`).join('')}</div><p class="share-note">日期贴纸可带入，也可单独调整，最多 3 枚。</p><fieldset class="share-meal-choices"><legend>餐食</legend>${[['breakfast','早餐'],['lunch','午餐'],['dinner','晚餐'],['snacks','零食 / 加餐']].map(([key,label])=>`<label><input name="${key}" type="checkbox" checked>${label}</label>`).join('')}</fieldset><fieldset><legend>自愿包含的内容</legend>${[['notes','学习 / 运动详细备注'],['mood','今日心情'],['joy','今日小确幸'],['diary','日记正文']].map(([key,label])=>`<label><input name="${key}" type="checkbox">${label}</label>`).join('')}</fieldset></details><p class="share-note">图片只在本设备生成。默认隐藏私人内容，请在导出前查看预览。</p><p class="form-error" role="alert" hidden></p><p class="journal-share-status" role="status"></p><div class="share-actions"><button class="pill pink" id="native-share-card" data-action="native-share-card" type="button" disabled>分享 / 保存图片</button><button class="pill" id="download-card" data-action="download-card" type="button" disabled>下载 PNG</button></div><p class="share-note" id="share-result" role="status"></p><div class="share-preview"><img alt="分享卡片实时预览" hidden></div><button type="submit" class="text-button">重新生成预览</button></form>`;
  const form=container.querySelector('form');
  function activeStickers(){try{return prepareJournalShare(book,options).stickerIds;}catch{return options.stickerIds||[];}}
  function controls(){
    container.querySelectorAll('[data-share-kind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.shareKind===options.kind));
    container.querySelector('.journal-share-templates').innerHTML=SHARE_TEMPLATES.filter(t=>t.kind===options.kind).map(t=>`<button type="button" data-share-template="${escape(t.id)}" aria-pressed="${options.template===t.id}">${escape(t.name)}</button>`).join('');
    for(const input of form.elements){if(!input.name)continue; if(input.type==='checkbox')input.checked=options[input.name]===true;else input.value=options[input.name]??'';}
    container.querySelectorAll('[data-scope]').forEach(el=>el.hidden=el.dataset.scope!==options.scope);
    container.querySelector('.share-meal-choices').hidden=!['meal','life'].includes(options.kind);
    const selected=activeStickers();container.querySelectorAll('[data-share-sticker]').forEach(b=>b.setAttribute('aria-pressed',selected.includes(b.dataset.shareSticker)));
  }
  async function update(){
    clearTimeout(timer);const token=++revision;onPending();
    container.querySelectorAll('.share-actions button').forEach(b=>b.disabled=true);
    const status=container.querySelector('.journal-share-status'),error=container.querySelector('.form-error'),img=container.querySelector('.share-preview img');
    error.hidden=true;img.hidden=true;container.querySelector('#share-result').textContent='';
    try{
      const data=prepareJournalShare(book,options);
      if(!data.hasRecords){status.textContent=`这个日期范围还没有${SHARE_TYPES[options.kind]}记录。`;return;}
      status.textContent='正在整理这段记录…';
      const card=await generateJournalShareCard(book,{...options,stickerIds:options.stickerIds===null?null:[...options.stickerIds]});
      if(token!==revision||!container.isConnected)return;
      const url=onImage(card);img.src=url;img.hidden=false;
      status.textContent=`${SHARE_TEMPLATES.find(t=>t.id===options.template).name} · ${card.width} × ${card.height}`;
      container.querySelectorAll('.share-actions button').forEach(b=>b.disabled=false);
    }catch(cause){if(token!==revision||!container.isConnected)return;status.textContent='';error.textContent=cause.message||'图片没能生成，请重试。';error.hidden=false;}
  }
  function schedule(){clearTimeout(timer);revision++;onPending();container.querySelectorAll('.share-actions button').forEach(b=>b.disabled=true);timer=setTimeout(update,160);}
  listen(container,'click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.shareKind){options.kind=b.dataset.shareKind;options.template=SHARE_TEMPLATES.find(t=>t.kind===options.kind).id;controls();update();}
    else if(b.dataset.shareTemplate){options.template=b.dataset.shareTemplate;controls();update();}
    else if(b.dataset.shareSticker){const id=b.dataset.shareSticker;if(options.stickerIds===null)options.stickerIds=[...activeStickers()];if(options.stickerIds.includes(id))options.stickerIds=options.stickerIds.filter(s=>s!==id);else if(options.stickerIds.length<3)options.stickerIds.push(id);else{container.querySelector('.journal-share-status').textContent='这张卡片最多加 3 枚贴纸。';return;}controls();update();}
  });
  listen(form,'change',event=>{const input=event.target;if(!input.name)return;options[input.name]=input.type==='checkbox'?input.checked:input.value;controls();schedule();});
  listen(form,'submit',event=>{event.preventDefault();update();});
  controls();update();
  return {destroy(){clearTimeout(timer);revision++;for(const [target,type,handler]of listeners)target.removeEventListener(type,handler);listeners.length=0;},getOptions(){return {...options,stickerIds:options.stickerIds===null?null:[...options.stickerIds]};}};
}
