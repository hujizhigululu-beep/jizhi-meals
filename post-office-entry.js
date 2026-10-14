import { postOfficeHost } from './app.js';

let mounted;
let cleanup;
let loading;
const main = document.querySelector('#main');
async function refresh() {
  const slot = document.querySelector('#post-office-slot');
  if (slot === mounted) return;
  cleanup?.(); cleanup = null; mounted = slot;
  if (!slot) return;
  try {
    loading ||= import('./post-office-view.js');
    const view = await loading;
    if (mounted === slot && slot.isConnected) cleanup = view.mountPostOffice(slot, postOfficeHost);
  } catch {
    loading = null;
    if (slot.isConnected) slot.textContent = '草莓邮局暂时没能加载，请刷新后重试。其他手账功能仍可使用。';
  }
}
if (main) { new MutationObserver(refresh).observe(main, { childList: true }); refresh(); }
