/* Vite 엔트리 — env가 주입된 config를 먼저 올린 뒤 앱 스크립트를 순서대로 로드 */
import './config.js';

import engineUrl from './engine.js?url';
import bodyMapUrl from './body-map.js?url';
import storeUrl from './store.js?url';
import appUrl from './app.js?url';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

(async () => {
  await loadScript(engineUrl);
  await loadScript(bodyMapUrl);
  await loadScript(storeUrl);
  await loadScript(appUrl);
})().catch((err) => {
  console.error('[boot]', err);
});
