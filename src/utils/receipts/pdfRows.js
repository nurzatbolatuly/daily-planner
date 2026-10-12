import { cleanText } from "./normalize";

// pdf.js отдаёт текст кусками (часто по слову) с координатами. Собираем строки: куски с одним y —
// одна строка, порядок — по x. Чистая функция: тестируется на фикстуре без pdf.js (pdfText.js).

const LINE_TOLERANCE = 2;   // pt: куски одной строки могут отличаться по y на доли пункта
const SPACE_GAP = 1;        // pt: зазор больше — между кусками был пробел («Лук» «репчатый»),
                            // меньше — склеиваем («зеленый» «,» → «зеленый,»; «м» «/» «у» → «м/у»)
const DUPLICATE_SHIFT = 1.5; // pt: жирный текст pdf.js отдаёт дважды со сдвигом («№ 1000001», «:»)

// pages: [[{ str, x, y, w }]] → [{ text, x, cells }] сверху вниз, страница за страницей.
export function groupPdfRows(pages) {
  return pages.flatMap(items => {
    const cells = items
      .filter(i => cleanText(i.str))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const rows = [];
    cells.forEach(c => {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row.y - c.y) <= LINE_TOLERANCE) row.cells.push(c);
      else rows.push({ y: c.y, cells: [c] });
    });

    return rows.map(({ cells: rowCells }) => {
      const sorted = [...rowCells].sort((a, b) => a.x - b.x)
        .filter((c, i, all) => !all.slice(0, i).some(k => k.str === c.str && Math.abs(k.x - c.x) < DUPLICATE_SHIFT));
      const text = sorted.reduce((acc, c, i) => {
        if (i === 0) return c.str;
        const prev = sorted[i - 1];
        return acc + (c.x - (prev.x + prev.w) > SPACE_GAP ? " " : "") + c.str;
      }, "");
      return { text: cleanText(text), x: sorted[0].x, cells: sorted };
    });
  });
}
