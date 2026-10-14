import { defaultPostOffice, selectedDayText, inventoryText, composeAIMessages, putAIContent, removeAIContent, selectAIContents } from './post-office.js';
import { getAIConfig, subscribeAIConfig } from './ai-session.js';
import { chatCompletions, AIConnectionError, redactAIText } from './ai-api.js';
import { avatarMarkup, hydrateAvatars } from './ai-avatar.js';
import { parseDate } from './model.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = { meals:'餐食短评', exercise:'运动短评', study:'学习短评', inventory:'库存短评', letter:'日记回信' };
const categories = { diary:'日记 / 心情 / 小确幸', meals:'餐食及备注', exercise:'运动及备注', study:'学习及备注' };
const fallback = role => role.builtin || (['saihara','little-tt'].includes(role.id) ? role.id : 'generic');
const roleSnapshot = role => ({ characterId:role.id, characterName:role.name, avatarId:role.avatarId || '', avatarMode:role.avatarMode || 'sticker', avatarFallback:fallback(role) });
const bookOf = host => host.getState().postOffice || defaultPostOffice();
const defaultRole = host => bookOf(host).characters.find(row => row.id === bookOf(host).defaultCharacterId && row.enabled);
const byTime = (a,b) => a.generatedAt.localeCompare(b.generatedAt);

function savedMarkup(item) {
  const meta = `${item.characterName} · ${new Date(item.generatedAt).toLocaleString('zh-CN')}`;
  const content = `<div class="ai-paper-copy"><small>${escape(meta)}</small><p class="ai-content-body">${escape(item.body)}</p><button type="button" class="text-button danger" data-ai-delete="${escape(item.id)}" data-ai-type="${escape(item.type)}">删除${item.type==='letter'?'这封信':'这条短评'}</button></div>`;
  return item.type === 'letter'
    ? `<details class="ai-saved-letter"><summary>${avatarMarkup(item,'medium')}<span>${escape(item.characterName)}的来信<small>${escape(new Date(item.generatedAt).toLocaleString('zh-CN'))}</small></span><span aria-hidden="true">⌄</span></summary>${content}</details>`
    : `<article class="ai-comment-paper">${avatarMarkup(item)}${content}${item.type==='inventory'?'<small class="ai-snapshot-note">按生成时的库存快照保存</small>':''}</article>`;
}

/** One local slot per record type. Mounting only reads local data. */
export function mountDailyAI(slot, host) {
  const type=slot.dataset.aiKind, date=slot.dataset.aiDate || host.getSelectedDate();
  let temporary='', dialog=null, disposeComposer=null, disposed=false;
  const config=bookOf(host), saved=selectAIContents(host.getState(), {type,...(type==='inventory'?{}:{date})}).sort(byTime);
  const role=defaultRole(host);
  slot.innerHTML=`<div class="ai-daily-tools"><button type="button" class="ai-role-button" data-ai-choose aria-label="临时切换${escape(names[type])}角色">${avatarMarkup(role ? {...role,avatarFallback:fallback(role)} : {avatarFallback:'generic'})}</button><button type="button" class="text-button" data-ai-open>${type==='letter'?'✉ 写一封回信':'✧ AI 点评'}</button><span class="ai-current-role">${escape(role?.name || '请指定默认角色')}</span><label class="ai-temporary-choice" hidden>仅用于下一次生成<select data-ai-role-choice><option value="">使用全局默认角色</option>${config.characters.filter(row=>row.enabled).map(row=>`<option value="${escape(row.id)}">${escape(row.name)}</option>`).join('')}</select></label></div>${saved.length ? `<section class="${type==='letter'?'ai-reply-area':'ai-comment-area'}" aria-label="${type==='letter'?'回信区':names[type]}">${type==='letter'?'<h3>✉ 回信区</h3>':''}${saved.map(savedMarkup).join('')}</section>` : ''}${!role?'<p class="ai-default-warning">默认角色已停用或不可用，请在角色管理中重新指定。历史内容仍保留。</p>':''}`;
  hydrateAvatars(slot).catch(()=>{});
  const choose=slot.querySelector('[data-ai-role-choice]');
  slot.querySelector('[data-ai-choose]').onclick=()=>{const label=choose.closest('label');label.hidden=!label.hidden;if(!label.hidden)choose.focus();};
  choose.onchange=()=>{temporary=choose.value;const selected=config.characters.find(row=>row.id===temporary)||role;slot.querySelector('.ai-current-role').textContent=selected?.name || '请指定默认角色';slot.querySelector('[data-ai-choose]').innerHTML=avatarMarkup(selected ? {...selected,avatarFallback:fallback(selected)}:{avatarFallback:'generic'});hydrateAvatars(slot).catch(()=>{});};
  slot.querySelector('[data-ai-open]').onclick=()=>{
    if(host.isReadOnly?.() || host.getState()._readOnly){host.toast('原数据已保护，请先导出并恢复有效备份。');return;}
    if(!defaultRole(host)){host.toast('请先到「我的设置 → 角色管理」指定已启用的默认角色。');return;}
    dialog?.remove();
    dialog=document.createElement('dialog');dialog.className='ai-compose-dialog';dialog.setAttribute('aria-label',names[type]);document.body.append(dialog);
    disposeComposer?.();
    disposeComposer=mountComposer(dialog,host,{type,date,characterId:temporary || defaultRole(host).id,onUse:()=>{temporary='';choose.value='';const next=defaultRole(host);slot.querySelector('.ai-current-role').textContent=next?.name || '请指定默认角色';slot.querySelector('[data-ai-choose]').innerHTML=avatarMarkup(next?{...next,avatarFallback:fallback(next)}:{avatarFallback:'generic'});hydrateAvatars(slot).catch(()=>{});}});
    dialog.showModal();
  };
  for(const button of slot.querySelectorAll('[data-ai-delete]'))button.onclick=async()=>{
    if(await host.ask('收起这张 AI 纸条？','只删除这一条已保存的 AI 内容，原始生活记录保持完整。','确认删除') && !disposed)host.commit(state=>removeAIContent(state,button.dataset.aiDelete,button.dataset.aiType),'已收起这张纸条。');
  };
  return ()=>{disposed=true;disposeComposer?.();dialog?.remove();};
}

function linkedIds(state,date,type,selection) {
  if(type==='inventory')return state.inventory.map(row=>row.id);
  const ids=[];
  if(type==='meals'||selection.meals)ids.push(...state.meals.filter(row=>row.date===date).map(row=>row.id));
  if(type==='letter'&&selection.diary&&state.diaries.some(row=>row.date===date))ids.push(`diary:${date}`);
  for(const kind of ['study','exercise'])if(type===kind||selection[kind])ids.push(...(state.dayRecords.find(row=>row.date===date)?.[kind]?.items||[]).map(row=>row.id));
  return [...new Set(ids)];
}

function mountComposer(dialog,host,initial) {
  let type=initial.type,date=initial.type==='inventory'?'':initial.date,actor=initial.characterId,selection={diary:false,meals:false,study:false,exercise:false};
  let records='',edited=false,preview=null,controller=null,number=0,busy=false,disposed=false;
  const snapshotId=type==='inventory'?crypto.randomUUID():'';
  const allowedRoles=()=>bookOf(host).characters.filter(row=>row.enabled);
  const recordText=()=>type==='inventory'?inventoryText(host.getState()):selectedDayText(host.getState(),date,type==='letter'?selection:{[type]:true});
  if(type!=='letter')records=recordText();
  const role=allowedRoles().find(row=>row.id===actor);
  dialog.innerHTML=`<div class="ai-compose-head"><h2>🍓 ${names[type]}</h2><button type="button" class="close-button" data-ai-compose-close aria-label="关闭生成面板">×</button></div><p class="ai-privacy-line">${type==='inventory'?'只读取当前库存快照，不读取日记或其他生活记录。':type==='letter'?'只读取下方勾选的日期与内容。':'只读取所选日期的'+names[type].replace('短评','')+'记录及备注。'}本次文字会发送到你配置的 API，头像图片不发送。</p><div class="ai-compose-identity">${avatarMarkup(role?{...role,avatarFallback:fallback(role)}:{avatarFallback:'generic'},'medium')}<label>本次角色<select data-ai-compose-role>${allowedRoles().map(row=>`<option value="${escape(row.id)}" ${row.id===actor?'selected':''}>${escape(row.name)}</option>`).join('')}</select></label><small>临时选择只用于一次请求；重新生成会回到全局默认角色。</small></div>${type!=='inventory'?`<label class="form-field">生活记录日期<input type="date" data-ai-compose-date value="${escape(date)}" min="0001-01-01" max="9999-12-31"></label>`:''}${type==='letter'?`<fieldset class="ai-record-options"><legend>明确选择本次提供的内容</legend>${Object.entries(categories).map(([key,label])=>`<label><input type="checkbox" data-ai-record-category="${key}">${label}</label>`).join('')}</fieldset>`:''}<label class="form-field">本次发送的生活记录 · 可修改<textarea data-ai-compose-records rows="8" placeholder="勾选记录，或手动填写本次想寄出的内容。">${escape(records)}</textarea></label><label class="form-field">大致篇幅<input data-ai-compose-length maxlength="500" value="${type==='letter'?'约 600—1000 字':'一句话，约 20—60 个汉字，不加标题'}"></label><details class="ai-request-review"><summary>查看提示词与发送全文</summary><pre data-ai-request-text></pre></details><p class="ai-request-size"></p><p class="ai-compose-status" data-ai-compose-status="idle" role="status">核对上方文字后，点击生成才会发送。关闭面板可取消。</p><div class="ai-compose-actions"><button type="button" class="primary" data-ai-compose-generate>确认内容并生成</button><button type="button" class="secondary" data-ai-compose-cancel hidden>取消请求</button><a class="text-button" href="#settings" data-ai-config-link>API 设置</a></div><section class="ai-generated-preview" hidden><h3>未保存的预览</h3><div data-ai-preview-identity></div><p class="ai-content-body" data-ai-preview-body></p><button type="button" class="primary" data-ai-compose-save>${type==='letter'?'收藏这封信':'保存这条短评'}</button><p class="ai-preview-note">只有点击保存后，才会加入手账与备份。</p></section>`;
  const query=s=>dialog.querySelector(s),recordInput=query('[data-ai-compose-records]');
  const setStatus=(state,message)=>{const node=query('[data-ai-compose-status]');node.dataset.aiComposeStatus=state;node.textContent=message;};
  const messages=()=>composeAIMessages({config:bookOf(host),characterId:actor,type,date,recordsText:records,lengthHint:query('[data-ai-compose-length]').value});
  function review(){try{const payload=messages();query('[data-ai-request-text]').textContent=payload.map(row=>`【${row.role}】\n${row.content}`).join('\n\n');query('.ai-request-size').textContent=`完整发送 ${payload.reduce((n,row)=>n+row.content.length,0).toLocaleString()} 个字符，未裁切预设。`;}catch(error){query('[data-ai-request-text]').textContent='';query('.ai-request-size').textContent=error.message;}}
  function controls(){query('[data-ai-compose-generate]').disabled=busy;query('[data-ai-compose-cancel]').hidden=!busy;for(const input of dialog.querySelectorAll('input,textarea,select'))input.disabled=busy;}
  function paintActor(){const chosen=allowedRoles().find(row=>row.id===actor);const old=query('.ai-compose-identity > .ai-avatar');if(old)old.outerHTML=avatarMarkup(chosen?{...chosen,avatarFallback:fallback(chosen)}:{avatarFallback:'generic'},'medium');hydrateAvatars(dialog).catch(()=>{});}
  function resetActor(){actor=defaultRole(host)?.id || '';query('[data-ai-compose-role]').value=actor;paintActor();review();}
  function cancel(message='本次请求已取消，已有内容仍保留。'){const wasBusy=busy;number++;controller?.abort();controller=null;busy=false;controls();if(wasBusy)resetActor();setStatus('cancelled',message);}
  const unsubscribe=subscribeAIConfig(()=>{if(busy)cancel('API 配置已变化，本次请求已取消。请重新核对后生成。');});
  const close=()=>{cancel();dialog.close();};
  query('[data-ai-compose-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{number++;controller?.abort();controller=null;busy=false;});
  query('[data-ai-config-link]').onclick=close;
  query('[data-ai-compose-cancel]').onclick=()=>cancel();
  query('[data-ai-compose-role]').onchange=event=>{actor=event.target.value;paintActor();review();};
  recordInput.oninput=()=>{records=recordInput.value;edited=true;review();};
  query('[data-ai-compose-length]').oninput=review;
  async function replaceRecords(change,revert){if(edited&&records&& !await host.ask('替换本次发送草稿？','改变日期或勾选内容，会重新从本地记录生成发送预览。尚未发送的手动补充会被替换。','确认替换')){revert();return;}if(disposed)return;change();try{records=recordText();recordInput.value=records;edited=false;review();}catch(error){setStatus('error',error.message);}}
  const dateInput=query('[data-ai-compose-date]');if(dateInput)dateInput.onchange=()=>{const next=dateInput.value;if(!parseDate(next)){dateInput.value=date;setStatus('error','请选择有效日期。');return;}replaceRecords(()=>date=next,()=>dateInput.value=date);};
  for(const box of dialog.querySelectorAll('[data-ai-record-category]'))box.onchange=()=>replaceRecords(()=>selection[box.dataset.aiRecordCategory]=box.checked,()=>box.checked=selection[box.dataset.aiRecordCategory]);
  query('[data-ai-compose-generate]').onclick=async()=>{
    if(busy||disposed)return;
    const connection=getAIConfig();
    if(!connection.apiKey||!connection.model){setStatus('error','请先在「我的设置 → AI 连接实验室」填写本次密钥并选择模型，返回后再生成。');return;}
    let payload,selectedRole;
    try{payload=messages();selectedRole=allowedRoles().find(row=>row.id===actor);if(!selectedRole)throw new Error('本次角色已停用，请重新选择。');
      const count=payload.reduce((n,row)=>n+row.content.length,0);
      if(count>=30000&&!await host.ask('发送内容较长',`共有 ${count.toLocaleString()} 个字符，模型上下文容量未知，可能超限。未删减任何内容。`,'保持全文发送'))return;
      if(disposed||JSON.stringify(payload)!==JSON.stringify(messages())||JSON.stringify(connection)!==JSON.stringify(getAIConfig()))return;
    }catch(error){setStatus('error',error.message);return;}
    const snapshot={type,date,...roleSnapshot(selectedRole),recordsText:redactAIText(records,connection.apiKey),recordIds:linkedIds(host.getState(),date,type,selection),snapshotId};
    const serial=++number;controller=new AbortController();busy=true;controls();setStatus('loading','正在等待回音，最多 120 秒，可以随时取消。');
    initial.onUse();
    try{const result=await chatCompletions({...connection,messages:payload,signal:controller.signal,timeoutMs:120000});if(serial!==number||disposed)return;
      preview={...snapshot,body:result.text,generatedAt:new Date().toISOString(),incomplete:result.incomplete};
      query('.ai-generated-preview').hidden=false;query('[data-ai-preview-body]').textContent=preview.body;query('[data-ai-preview-identity]').innerHTML=`${avatarMarkup(preview,'medium')}<span>${escape(preview.characterName)}</span>`;hydrateAvatars(dialog).catch(()=>{});
      query('[data-ai-compose-save]').disabled=false;query('[data-ai-compose-save]').textContent=type==='letter'?'收藏这封信':'保存这条短评';
      setStatus(result.incomplete?'incomplete':'success',result.incomplete?'模型因长度限制停止。完整返回已显示，但内容可能未完成；可调整篇幅后重新生成。':'生成完成，尚未保存。喜欢的话，再收进手账。');
    }catch(error){if(serial!==number||disposed)return;setStatus(error instanceof AIConnectionError&&error.code==='cancelled'?'cancelled':'error',error instanceof AIConnectionError?error.message:'这次生成暂时没能完成，原有记录与预览仍保留。');}
    finally{if(serial===number&&!disposed){busy=false;controller=null;controls();resetActor();query('[data-ai-compose-generate]').textContent='确认内容并重新生成';}}
  };
  query('[data-ai-compose-save]').onclick=async()=>{
    if(!preview||busy||disposed)return;
    if(preview.incomplete&&!await host.ask('保存未完成的内容？','模型因长度限制停止。当前预览会按原文保存，也可以返回重新生成。','保存当前原文'))return;
    if(disposed)return;
    const {incomplete,...item}=preview;
    host.commit(state=>putAIContent(state,item),type==='letter'?'来信已收藏在这一天的日记下方。':'AI 短评已贴进手账。');
  };
  hydrateAvatars(dialog).catch(()=>{});review();
  return()=>{disposed=true;number++;controller?.abort();unsubscribe();};
}

export function mountPostOfficeArchive(slot,host) {
  const letters=selectAIContents(host.getState(),{type:'letter'}).sort(byTime);
  slot.innerHTML=`<section class="page ai-post-archive"><h1>🍓 草莓邮局</h1><p>写信、阅读与收藏已经搬到每一天的日记下方。先翻开一天，再点击「写一封回信」。</p><button type="button" class="pill" data-ai-open-day>翻开日记录</button>${letters.length?`<h2>已收藏的来信</h2>${letters.map(savedMarkup).join('')}`:'<p class="muted">还没有收藏的来信。</p>'}</section>`;
  slot.querySelector('[data-ai-open-day]').onclick=()=>host.openDay(host.getSelectedDate());
  let disposed=false;
  for(const button of slot.querySelectorAll('[data-ai-delete]'))button.onclick=async()=>{if(await host.ask('收起这封信？','只删除收藏来信，不修改原始日记。','确认删除')&&!disposed)host.commit(state=>removeAIContent(state,button.dataset.aiDelete,'letter'),'来信已收起。');};
  hydrateAvatars(slot).catch(()=>{});
  return()=>{disposed=true;};
}
