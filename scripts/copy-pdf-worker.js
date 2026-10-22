// Воркер pdf.js → public/pdfjs/pdf.worker.<версия>.min.mjs (utils/receipts/pdfText.js).
// Через сборщик его подключать нельзя: CRA прогоняет любой .mjs через Babel, тот вставляет импорты
// @babel/runtime по абсолютным путям машины сборки (/vercel/path0/node_modules/…), а воркер —
// отдельный файл без бандла: в браузере импорты не находятся, PDF не читается только в проде.
// Версия в имени — после обновления pdfjs-dist браузер не возьмёт старый воркер из кэша.
// Запуск: postinstall / prestart / prebuild (package.json). Каталог — в .gitignore.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkgDir = path.dirname(require.resolve("pdfjs-dist/package.json", { paths: [root] }));
const { version } = require(path.join(pkgDir, "package.json"));
const outDir = path.join(root, "public", "pdfjs");
const target = `pdf.worker.${version}.min.mjs`;

fs.mkdirSync(outDir, { recursive: true });
for (const name of fs.readdirSync(outDir)) {
  if (name !== target) fs.rmSync(path.join(outDir, name));
}
fs.copyFileSync(path.join(pkgDir, "legacy", "build", "pdf.worker.min.mjs"), path.join(outDir, target));
console.log(`pdf.js worker → public/pdfjs/${target}`);
