import { RECEIPT_PDF_MAX_BYTES } from "../../constants/receipts";
import { ReceiptError, RECEIPT_ERRORS } from "./normalize";

// Текст PDF в браузере. pdf.js — только через import(): отдельный чанк, грузится при первом
// PDF, как ExcelJS в utils/export.js (иначе основной бандл вырастет на мегабайт).
// legacy-сборка — с полифиллами для старых Safari. Разбор строк — pdfRows.js (чистый, с тестами).
// Воркер — готовый файл из public/pdfjs (scripts/copy-pdf-worker.js), НЕ через сборщик: Babel CRA
// ломает его импортами по абсолютным путям машины сборки. Версия в имени — та же, что у библиотеки.

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdfjs/pdf.worker.${pdfjs.version}.min.mjs`;
  }
  return pdfjs;
}

const isPdf = file => file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");

// File → [[{ str, x, y, w }]] по страницам (формат groupPdfRows).
export async function extractPdfPages(file) {
  if (!isPdf(file)) throw new ReceiptError(RECEIPT_ERRORS.unsupportedFile, "Это не PDF");
  if (file.size > RECEIPT_PDF_MAX_BYTES) throw new ReceiptError(RECEIPT_ERRORS.unsupportedFile, "Файл слишком большой");

  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const { items } = await (await doc.getPage(n)).getTextContent();
      pages.push(items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
    }
    return pages;
  } finally {
    doc.destroy();
  }
}
