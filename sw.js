const CACHE = 'jizhi-meals-shell-v1.4-1';
const FILES = ['./', './index.html', './style.css', './journal.css', './v11.css', './timeline.css', './compact.css', './fridge.css', './summary-ui.css', './settings-ui.css', './soft-ui.css', './timeline-story.css', './meal-density.css', './macaron-palette.css', './strawberry-ui.css', './settings-view.js', './runway.js', './app.js', './model.js', './storage.js', './summary.js', './timeline.js', './share-card.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable.png', './icons/apple-touch-icon.png', './assets/milk-carton.svg', './assets/notebook-whisper.svg', './assets/credits.html', './assets/licenses/OpenMoji-CC-BY-SA-4.0.txt', './assets/licenses/asset-manifest.json', './assets/licenses/OpenMoji-selected-authors.csv', ...['strawberry','croissant','bento','stew','basket','shrimp','egg','chicken','meat','beans','milk'].map(name => `./assets/food/${name}.svg`)];
FILES.push('./month-calendar.js','./month-calendar.css','./activity.js','./stickers.js','./day-records-view.js','./day-records.css','./share-journal.js','./share-layouts-a.js','./share-layouts-b.js','./share-editor.js','./share-editor.css','./assets/stickers/catalog.json',...['milk','strawberry','book','shoe','star','heart','bow','fork'].map(name=>`./assets/stickers/${name}.svg`));
self.addEventListener('install', event => {
  // Fetch one complete release; keep the current worker until its open tabs close.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(path => new Request(path, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('jizhi-meals-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request).then(cached => cached || fetch(event.request).catch(() => {
    if (event.request.mode === 'navigate') return cache.match('./index.html');
    return Response.error();
  }))));
});
