import { postOfficeHost } from './app.js';
let settingsModule,dailyModule,loadingSettings,loadingDaily;
const mounts=new Map();
async function refresh(){
  for(const [node,cleanup]of mounts)if(!node.isConnected){cleanup?.();mounts.delete(node);}
  for(const slot of document.querySelectorAll('[data-ai-daily-slot],#ai-settings-slot,#post-office-slot')){
    if(mounts.has(slot))continue;
    mounts.set(slot,null);
    try{
      if(slot.id==='ai-settings-slot'){
        loadingSettings ||= import('./ai-settings.js');settingsModule=await loadingSettings;
        if(slot.isConnected)mounts.set(slot,settingsModule.mountAISettings(slot,postOfficeHost));
      }else{
        loadingDaily ||= import('./ai-daily.js');dailyModule=await loadingDaily;
        if(slot.isConnected)mounts.set(slot,slot.id==='post-office-slot'?dailyModule.mountPostOfficeArchive(slot,postOfficeHost):dailyModule.mountDailyAI(slot,postOfficeHost));
      }
    }catch{if(slot.isConnected)slot.innerHTML='<p class="footer-note">AI 纸条暂时无法打开，请刷新后重试。</p>';}
  }
}
const main=document.querySelector('#main');
if(main){new MutationObserver(refresh).observe(main,{childList:true});refresh();}
