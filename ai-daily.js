import { defaultPostOffice, putAIContent, removeAIContent, selectAIContents, AI_CONTENT_TYPES } from './post-office.js';
import { composeBatchAIMessages, parseBatchAIResponse, batchRecordsText } from './ai-batch.js';
import { getAIConfig, subscribeAIConfig } from './ai-session.js';
import { chatCompletions, AIConnectionError, redactAIText } from './ai-api.js';
import { avatarMarkup, hydrateAvatars } from './ai-avatar.js';
import { parseDate } from './model.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = { meals:'餐食短评', exercise:'运动短评', study:'学习短评', inventory:'库存短评', letter:'日记长回信' };
const categories = { diary:'日记 / 心情 / 小确幸', meals:'餐食及备注', exercise:'运动及备注', study:'学习及备注', inventory:'当前库存快照' };
const categoryOf = type => type === 'letter' ? 'diary' : type;
const fallback = role => role.builtin || (['saihara','little-tt'].includes(role.id) ? role.id : 'generic');
const roleSnapshot = role => ({ characterId:role.id, characterName:role.name, avatarId:role.avatarId || '', avatarMode:role.avatarMode || 'sticker', avatarFallback:fallback(role) });
const bookOf = host => host.getState().postOffice || defaultPostOffice();
const defaultRole = host => bookOf(host).characters.find(row => row.id === bookOf(host).defaultCharacterId && row.enabled);
let activeComposer = null;

function savedMarkup(item) {
  const meta = `${item.characterName} · ${new Date(item.generatedAt).toLocaleString('zh-CN')}`;
  const content = `<div class="ai-paper-copy"><small>${escape(meta)}</small><p class="ai-content-body">${escape(item.body)}</p><button type="button" class="text-button danger" data-ai-delete="${escape(item.id)}" data-ai-type="${escape(item.type)}">删除${item.type==='letter'?'这封信':'这条短评'}</button></div>`;
  return item.type === 'letter'
    ? `<details class="ai-saved-letter"><summary>${avatarMarkup(item,'medium')}<span>${escape(item.characterName)}的来信<small>${escape(new Date(item.generatedAt).toLocaleString('zh-CN'))}</small></span><span aria-hidden="true">⌄</span></summary>${content}</details>`
    : `<article class="ai-comment-paper">${avatarMarkup(item)}${content}${item.type==='inventory'?'<small class="ai-snapshot-note">按生成时的库存快照保存</small>':''}</article>`;
}

function bindDeletes(slot,host) {
  let disposed = false;
  for (const button of slot.querySelectorAll('[data-ai-delete]')) button.onclick = async () => {
    if (await host.ask('收起这张 AI 纸条？','只删除这一条已保存的 AI 内容，原始生活记录保持完整。','确认删除') && !disposed)
      host.commit(state => removeAIContent(state,button.dataset.aiDelete,button.dataset.aiType),'已收起这张纸条。');
  };
  return () => { disposed = true; };
}

/** Per-category slots display saved results; generation has one shared launcher. */
export function mountDailyAI(slot,host) {
  const type = slot.dataset.aiKind, date = slot.dataset.aiDate || host.getSelectedDate();
  const saved = selectAIContents(host.getState(),{type,...(type==='inventory'?{}:{date})});
  slot.innerHTML = saved.length ? `<section class="${type==='letter'?'ai-reply-area':'ai-comment-area'}" aria-label="${type==='letter'?'回信区':names[type]}">${type==='letter'?'<h3>✉ 回信区</h3>':''}${saved.map(savedMarkup).join('')}</section>` : '';
  hydrateAvatars(slot).catch(()=>{});
  return bindDeletes(slot,host);
}

function closeActiveComposer() {
  if (!activeComposer) return;
  const previous = activeComposer; activeComposer = null;
  previous.dispose(); previous.dialog.remove();
}

/** Saving may re-render the page; navigating or replacing the book cancels. */
export function syncDailyAIComposer(host) {
  if (activeComposer && (activeComposer.page !== location.hash || activeComposer.date !== host.getSelectedDate() || activeComposer.epoch !== host.getBookEpoch?.())) closeActiveComposer();
}

export function mountBatchAI(slot,host) {
  const role = defaultRole(host);
  slot.innerHTML = `<div class="ai-batch-launcher"><button type="button" class="pill pink" data-ai-batch-open>${avatarMarkup(role?{...role,avatarFallback:fallback(role)}:{avatarFallback:'generic'})}<span>✧ AI 一锅出</span></button><p>餐食、运动、学习、库存短评和日记长回信，一次生成后分别收好。</p>${!role?'<p class="ai-default-warning">默认角色已停用或不可用，请在角色管理中重新指定。历史内容仍保留。</p>':''}</div>`;
  hydrateAvatars(slot).catch(()=>{});
  slot.querySelector('[data-ai-batch-open]').onclick = () => {
    if (host.isReadOnly?.() || host.getState()._readOnly) { host.toast('原数据已保护，请先导出并恢复有效备份。'); return; }
    if (!defaultRole(host)) { host.toast('请先到「我的设置 → 角色管理」指定已启用的默认角色。'); return; }
    closeActiveComposer();
    const dialog = document.createElement('dialog'); dialog.className = 'ai-compose-dialog'; dialog.setAttribute('aria-label','AI 一锅出'); document.body.append(dialog);
    const context = { dialog, date:host.getSelectedDate(), page:location.hash, epoch:host.getBookEpoch?.(), dispose:null };
    context.dispose = mountComposer(dialog,host,{date:context.date,characterId:defaultRole(host).id,onClose:closeActiveComposer});
    activeComposer = context; dialog.showModal();
  };
  return () => {};
}

function linkedIds(state,date,selection) {
  const ids = [];
  if (selection.meals) ids.push(...state.meals.filter(row=>row.date===date).map(row=>row.id));
  if (selection.diary && state.diaries.some(row=>row.date===date)) ids.push(`diary:${date}`);
  for (const kind of ['study','exercise']) if (selection[kind]) ids.push(...(state.dayRecords.find(row=>row.date===date)?.[kind]?.items||[]).map(row=>row.id));
  if (selection.inventory) ids.push(...state.inventory.map(row=>row.id));
  return [...new Set(ids)];
}

function mountComposer(dialog,host,initial) {
  let date = initial.date, actor = initial.characterId, types = [...AI_CONTENT_TYPES];
  const selection = {diary:true,meals:true,exercise:true,study:true,inventory:true};
  let records = batchRecordsText(host.getState(),date,selection), edited = false, preview = null, controller = null;
  let serial = 0, busy = false, saving = false, disposed = false, changingRecords = false;
  const allowedRoles = () => bookOf(host).characters.filter(row=>row.enabled);
  const role = allowedRoles().find(row=>row.id===actor);
  dialog.innerHTML = `<div class="ai-compose-head"><h2>🍓 AI 一锅出</h2><button type="button" class="close-button" data-ai-compose-close aria-label="关闭生成面板">×</button></div>
    <p class="ai-privacy-line">勾选想生成的内容，一次请求一起写完。下方记录文字会发送到你配置的 API，头像图片不发送。</p>
    <div class="ai-compose-identity">${avatarMarkup(role?{...role,avatarFallback:fallback(role)}:{avatarFallback:'generic'},'medium')}<label>本次角色<select data-ai-compose-role>${allowedRoles().map(row=>`<option value="${escape(row.id)}" ${row.id===actor?'selected':''}>${escape(row.name)}</option>`).join('')}</select></label><small>临时选择只用于一次请求；下次生成回到全局默认角色。</small></div>
    <label class="form-field">生活记录日期<input type="date" data-ai-compose-date value="${escape(date)}" min="0001-01-01" max="9999-12-31"></label>
    <fieldset class="ai-record-options ai-output-options"><legend>本次一起生成</legend>${Object.entries(names).map(([key,label])=>`<label><input type="checkbox" data-ai-output-type="${key}" checked>${label}</label>`).join('')}</fieldset>
    <fieldset class="ai-record-options"><legend>提供给本次生成的记录</legend>${Object.entries(categories).map(([key,label])=>`<label><input type="checkbox" data-ai-record-category="${key}" checked>${label}</label>`).join('')}<p class="ai-preview-note">勾选的记录作为共同背景，只发送所选日期；库存使用当前快照。可以单独取消某类记录。</p></fieldset>
    <label class="form-field">本次发送的生活记录 · 可修改<textarea data-ai-compose-records rows="8" placeholder="选择记录，或手动填写本次想寄出的内容。">${escape(records)}</textarea></label>
    <div class="ai-length-options"><label class="form-field">短评篇幅<input data-ai-short-length maxlength="500" value="每项约 20—60 个汉字"></label><label class="form-field">日记回信篇幅<input data-ai-letter-length maxlength="500" value="约 600—1000 字，可自行加长"></label></div>
    <details class="ai-request-review"><summary>查看提示词与发送全文</summary><pre data-ai-request-text></pre></details><p class="ai-request-size"></p>
    <p class="ai-compose-status" data-ai-compose-status="idle" role="status">核对内容后，点击生成会发出一次请求。</p>
    <div class="ai-compose-actions"><button type="button" class="primary" data-ai-compose-generate>确认内容并一锅生成</button><button type="button" class="secondary" data-ai-compose-cancel hidden>取消请求</button><a class="text-button" href="#settings" data-ai-config-link>API 设置</a></div>
    <section class="ai-generated-preview" hidden><h3>未保存的预览</h3><div data-ai-preview-identity></div><div data-ai-batch-results></div><details class="ai-raw-response"><summary>查看完整返回原文</summary><pre data-ai-raw-response></pre></details><button type="button" class="primary" data-ai-compose-save>保存全部可用结果</button><p class="ai-preview-note">可以修改或分别保存，短评贴到对应模块，长回信收在所选日期的日记下方。</p></section>`;
  const query = s => dialog.querySelector(s), recordInput = query('[data-ai-compose-records]');
  const setStatus = (state,message) => { const node=query('[data-ai-compose-status]'); node.dataset.aiComposeStatus=state; node.textContent=message; };
  const messages = () => composeBatchAIMessages({config:bookOf(host),characterId:actor,date,types,recordsText:records,shortLengthHint:query('[data-ai-short-length]').value,letterLengthHint:query('[data-ai-letter-length]').value});
  function review() {
    try { const payload=messages(); query('[data-ai-request-text]').textContent=payload.map(row=>`【${row.role}】\n${row.content}`).join('\n\n'); query('.ai-request-size').textContent=`完整发送 ${payload.reduce((n,row)=>n+row.content.length,0).toLocaleString()} 个字符，角色与写作预设只发送一次。`; }
    catch (error) { query('[data-ai-request-text]').textContent=''; query('.ai-request-size').textContent=error.message; }
  }
  const canSave = item => !item.saved && item.body.trim().length>0;
  function controls() {
    query('[data-ai-compose-generate]').disabled=busy||saving;
    query('[data-ai-compose-cancel]').hidden=!busy;
    for (const input of dialog.querySelectorAll('input,textarea,select')) input.disabled=Boolean(busy||saving||input.dataset.aiResultBody && preview?.items.find(item=>item.type===input.dataset.aiResultBody)?.saved);
    for (const button of dialog.querySelectorAll('[data-ai-save-result]')) button.disabled=busy||saving||!canSave(preview.items.find(item=>item.type===button.dataset.aiSaveResult));
    query('[data-ai-compose-save]').disabled=busy||saving||!preview?.items.some(canSave);
  }
  function paintActor() { const chosen=allowedRoles().find(row=>row.id===actor), old=query('.ai-compose-identity > .ai-avatar'); if (old) old.outerHTML=avatarMarkup(chosen?{...chosen,avatarFallback:fallback(chosen)}:{avatarFallback:'generic'},'medium'); hydrateAvatars(dialog).catch(()=>{}); }
  function resetActor() { actor=defaultRole(host)?.id || ''; query('[data-ai-compose-role]').value=actor; paintActor(); review(); }
  function cancel(message='本次请求已取消，已有预览仍保留。') { const wasBusy=busy; serial++; controller?.abort(); controller=null; busy=false; controls(); if (wasBusy) resetActor(); setStatus('cancelled',message); }
  const unsubscribe=subscribeAIConfig(()=>{if (busy) cancel('API 配置已变化，本次请求已取消。请重新核对后生成。');});
  query('[data-ai-compose-close]').onclick=initial.onClose;
  dialog.addEventListener('cancel',event=>{event.preventDefault();initial.onClose();});
  dialog.addEventListener('close',initial.onClose);
  query('[data-ai-config-link]').onclick=initial.onClose;
  query('[data-ai-compose-cancel]').onclick=()=>cancel();
  query('[data-ai-compose-role]').onchange=event=>{actor=event.target.value;paintActor();review();};
  recordInput.oninput=()=>{records=recordInput.value;edited=true;review();};
  query('[data-ai-short-length]').oninput=review; query('[data-ai-letter-length]').oninput=review;

  async function replaceRecords(change,revert) {
    if (changingRecords) { revert(); return; }
    changingRecords=true;
    try {
      if (edited && records && !await host.ask('替换本次发送草稿？','改变日期或勾选内容，会从本地记录重新生成发送预览。手动补充会被替换。','确认替换')) { revert(); return; }
      if (disposed) return;
      change(); records=batchRecordsText(host.getState(),date,selection); recordInput.value=records; edited=false; review();
    } catch (error) { setStatus('error',error.message); }
    finally { changingRecords=false; }
  }
  const dateInput=query('[data-ai-compose-date]');
  dateInput.onchange=()=>{const next=dateInput.value;if (!parseDate(next)) { dateInput.value=date;setStatus('error','请选择有效日期。');return; } replaceRecords(()=>date=next,()=>dateInput.value=date);};
  for (const box of dialog.querySelectorAll('[data-ai-record-category]')) box.onchange=()=>{const next=box.checked;replaceRecords(()=>selection[box.dataset.aiRecordCategory]=next,()=>box.checked=selection[box.dataset.aiRecordCategory]);};
  for (const box of dialog.querySelectorAll('[data-ai-output-type]')) box.onchange=()=>{
    const type=box.dataset.aiOutputType,next=box.checked;
    replaceRecords(()=>{types=AI_CONTENT_TYPES.filter(kind=>kind===type?next:types.includes(kind));selection[categoryOf(type)]=next;query(`[data-ai-record-category="${categoryOf(type)}"]`).checked=next;},()=>box.checked=types.includes(type));
  };

  function paintPreview() {
    query('.ai-generated-preview').hidden=false;
    query('[data-ai-preview-identity]').innerHTML=`${avatarMarkup(preview.snapshot,'medium')}<span>${escape(preview.snapshot.characterName)}<small data-ai-preview-date>保存到 ${escape(preview.snapshot.date)} 的对应模块；库存使用本次快照。</small></span>`;
    query('[data-ai-raw-response]').textContent=preview.rawText;
    query('.ai-raw-response').open=preview.missingTypes.length>0;
    query('[data-ai-batch-results]').innerHTML=preview.items.map(item=>`<article class="ai-batch-result"><h4>${names[item.type]}</h4><label class="form-field">${item.body?'可修改后保存':'本项未识别，可从完整原文整理粘贴'}<textarea rows="${item.type==='letter'?10:3}" data-ai-result-body="${item.type}">${escape(item.body)}</textarea></label><button type="button" class="pill" data-ai-save-result="${item.type}">保存${names[item.type]}</button></article>`).join('');
    for (const input of dialog.querySelectorAll('[data-ai-result-body]')) input.oninput=()=>{preview.items.find(item=>item.type===input.dataset.aiResultBody).body=input.value;controls();};
    for (const button of dialog.querySelectorAll('[data-ai-save-result]')) button.onclick=()=>saveResults(button.dataset.aiSaveResult);
    hydrateAvatars(dialog).catch(()=>{});controls();
  }

  query('[data-ai-compose-generate]').onclick=async()=>{
    if (busy||saving||disposed||changingRecords) return;
    const connection=getAIConfig();
    if (!connection.apiKey||!connection.model) { setStatus('error','请先在「我的设置 → AI 连接实验室」填写本次密钥并选择模型，返回后再生成。');return; }
    // Lock before confirmation so repeated clicks cannot spend another call.
    const requestSerial=++serial; busy=true;controls();
    let sent=false;
    try {
      const payload=messages(), selectedRole=allowedRoles().find(row=>row.id===actor);
      if (!selectedRole) throw new Error('本次角色已停用，请重新选择。');
      if (preview?.items.some(item=>!item.saved&&item.body.trim()) && !await host.ask('重新生成这一锅？','当前未保存的预览会在新结果返回后被替换。重新生成会再使用一次 API 调用。','重新生成')) return;
      const count=payload.reduce((n,row)=>n+row.content.length,0);
      if (count>=30000 && !await host.ask('发送内容较长',`共有 ${count.toLocaleString()} 个字符，模型上下文容量未知，可能超限。未删减任何内容。`,'保持全文发送')) return;
      if (disposed||requestSerial!==serial||JSON.stringify(payload)!==JSON.stringify(messages())||JSON.stringify(connection)!==JSON.stringify(getAIConfig())) return;
      const requestedTypes=[...types], snapshot={date,...roleSnapshot(selectedRole),recordsText:redactAIText(records,connection.apiKey),recordIds:linkedIds(host.getState(),date,selection)};
      // Reject an already full archive before spending a paid generation call.
      const capacityCheck=structuredClone(host.getState());
      try {
        for (const type of requestedTypes) putAIContent(capacityCheck,{...snapshot,type,date:type==='inventory'?'':date,body:'保存容量检查',snapshotId:type==='inventory'?crypto.randomUUID():''});
      } catch (error) { throw new Error(`所选内容无法全部保存：${error.message} 请先导出备份并整理收藏，或减少生成项目。本次未发送请求。`); }
      controller=new AbortController();setStatus('loading','这一锅正在生成，最多等待 10 分钟，可以随时取消。');
      sent=true;
      const result=await chatCompletions({...connection,messages:payload,signal:controller.signal,timeoutMs:600000});
      if (requestSerial!==serial||disposed) return;
      const parsed=parseBatchAIResponse(result.text,requestedTypes), generatedAt=new Date().toISOString(), snapshotId=crypto.randomUUID();
      preview={...parsed,snapshot,incomplete:result.incomplete,items:requestedTypes.map(type=>({type,id:crypto.randomUUID(),body:parsed.items.find(item=>item.type===type)?.body||'',saved:false,generatedAt,snapshotId:type==='inventory'?snapshotId:''}))};
      paintPreview();
      const state=result.incomplete?'incomplete':parsed.missingTypes.length?'partial':'success';
      setStatus(state,result.incomplete?'模型因长度限制停止，完整返回原文已保留。可整理或保存已有内容。':parsed.missingTypes.length?`已保留全部返回原文，以下内容需要手动整理：${parsed.missingTypes.map(type=>names[type]).join('、')}。`:'一锅生成完成，尚未保存。可以分别收好，也可以一次保存全部。');
    } catch (error) {
      if (requestSerial!==serial||disposed) return;
      setStatus(error instanceof AIConnectionError&&error.code==='cancelled'?'cancelled':'error',error instanceof AIConnectionError||!sent&&error instanceof Error?error.message:'这次生成暂时没能完成，原有记录与预览仍保留。');
    } finally {
      if (requestSerial===serial&&!disposed) { busy=false;controller=null;controls();resetActor(); }
    }
  };

  async function saveResults(type) {
    if (!preview||busy||saving||disposed) return;
    const candidates=preview.items.filter(item=>canSave(item)&&(!type||item.type===type));
    if (!candidates.length) return;
    saving=true;controls();
    try {
      if (preview.incomplete&&!await host.ask('保存未完成的内容？','模型因长度限制停止。将按预览原文保存当前选择的内容。','保存当前原文')) return;
      if (disposed) return;
      const key=getAIConfig().apiKey;
      const items=candidates.map(item=>({id:item.id,type:item.type,body:redactAIText(item.body,key),generatedAt:item.generatedAt,snapshotId:item.snapshotId,...preview.snapshot,date:item.type==='inventory'?'':preview.snapshot.date}));
      if (host.commit(state=>{for (const item of items) putAIContent(state,item);},'AI 内容已分别收进手账。')) {
        for (const item of candidates) { item.saved=true;query(`[data-ai-save-result="${item.type}"]`).textContent='已保存'; }
        setStatus('saved',preview.items.some(canSave)?'所选内容已保存，其余预览可以继续收好。':'本次可用结果已保存。');
      }
    } finally { saving=false;if (!disposed) controls(); }
  }
  query('[data-ai-compose-save]').onclick=()=>saveResults();
  hydrateAvatars(dialog).catch(()=>{});review();controls();
  return ()=>{disposed=true;serial++;controller?.abort();unsubscribe();};
}

export function mountPostOfficeArchive(slot,host) {
  const letters=selectAIContents(host.getState(),{type:'letter'});
  slot.innerHTML=`<section class="page ai-post-archive"><h1>🍓 草莓邮局</h1><p>翻开一天，在「AI 一锅出」里一起生成短评和日记长回信。已收藏的来信也会显示在对应日期的日记下方。</p><button type="button" class="pill" data-ai-open-day>翻开日记录</button>${letters.length?`<h2>已收藏的来信</h2>${letters.map(savedMarkup).join('')}`:'<p class="muted">还没有收藏的来信。</p>'}</section>`;
  slot.querySelector('[data-ai-open-day]').onclick=()=>host.openDay(host.getSelectedDate());
  hydrateAvatars(slot).catch(()=>{});
  return bindDeletes(slot,host);
}
