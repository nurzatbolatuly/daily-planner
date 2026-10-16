// Фиксированный масштаб на телефоне: приложение — как нативное, страница не «плавает».
// Слои защиты (каждый закрывает свой случай):
//   • <meta viewport maximum-scale=1, user-scalable=no> (public/index.html) — Android и автозум
//     iOS при фокусе на поле со шрифтом < 16px;
//   • touch-action: pan-x pan-y на html (index.css) — двойной тап и щипок в Chrome/Safari;
//   • этот модуль — Safari на iOS с 10-й версии игнорирует user-scalable=no для щипка: гасим его
//     жест (gesture*, есть только в WebKit) и касание двумя пальцами.
// Прокрутка одним пальцем, drag-and-drop (useDragReorder) и тапы не затрагиваются.
const block = e => e.preventDefault();
const blockMultiTouch = e => { if (e.touches.length > 1) e.preventDefault(); };

let locked = false;
export function lockZoom() {
  if (locked || typeof document === "undefined") return;
  locked = true;
  ["gesturestart", "gesturechange", "gestureend"].forEach(t => document.addEventListener(t, block, { passive: false }));
  document.addEventListener("touchmove", blockMultiTouch, { passive: false });
}
