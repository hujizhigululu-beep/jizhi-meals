// Separate, lazy entry point: AI failures cannot stop the journal's app module.
let labModule;
let loading;
let mountedSlot;
let controller;

function placeholder(slot) {
  slot.innerHTML = `<details class="settings-card settings-group settings-details ai-lab"><summary class="settings-group-summary"><h3 class="settings-group-title">🍓 草莓邮局 · AI 连接实验室</h3><span class="settings-disclosure-mark" aria-hidden="true"></span></summary><div class="settings-group-content"><p role="status">展开后加载连接工具。密钥只留在当前页面内存，不会保存到手账。</p></div></details>`;
  const details = slot.querySelector('details');
  details.addEventListener('toggle', async () => {
    if (!details.open) return;
    try {
      loading ||= import('./ai-lab.js');
      labModule = await loading;
      if (slot !== document.querySelector('#ai-lab-slot')) return;
      mount(slot, true);
    } catch {
      loading = null;
      const status = details.querySelector('[role="status"]');
      if (status) status.textContent = 'AI 连接工具暂时没能加载。可收起后重试；餐食和手账功能仍可使用。';
    }
  });
}

function mount(slot, open = false) {
  controller?.();
  controller = null;
  slot.innerHTML = labModule.renderAILab();
  controller = labModule.mountAILab(slot);
  if (open) slot.querySelector('details').open = true;
}

function refresh() {
  const slot = document.querySelector('#ai-lab-slot');
  if (slot === mountedSlot) return;
  controller?.();
  controller = null;
  mountedSlot = slot;
  if (!slot) return;
  try { if (labModule) mount(slot); else placeholder(slot); }
  catch { slot.textContent = 'AI 实验室暂时不可用；手账功能仍可使用。'; }
}

const main = document.querySelector('#main');
if (main) {
  new MutationObserver(refresh).observe(main, { childList: true });
  refresh();
}
