import ExcelJS from "exceljs";
import { TRIP_LABELS } from "../constants/money";
import { RU_MONTHS } from "../constants/locale";

// ─── ARGB colour palette ──────────────────────────────────────────────────────
const X = {
  darkHdr:    "FF0B2610",
  sectionBg:  "FF1B4332",
  colHdrBg:   "FF2D6A4F",
  rowAlt:     "FFF0FBF0",
  totalBg:    "FFD8F3DC",
  paidBg:     "FFCBF5CE",
  partialBg:  "FFFEF9C3",
  unpaidBg:   "FFFEE2E2",
  incRow:     "FFF0FDF4",
  expRow:     "FFFEF2F2",
  offWhite:   "FFF9FAFB",
  lightGray:  "FFF3F4F6",
  white:      "FFFFFFFF",
  dark:       "FF111827",
  green:      "FF166534",
  red:        "FF991B1B",
  amber:      "FF92400E",
  blue:       "FF1E40AF",
  gray:       "FF6B7280",
  dimText:    "FF9CA3AF",
  border:     "FFD1D5DB",
};

// ─── Low-level helpers ────────────────────────────────────────────────────────

function st(cell, { bold=false, size=10, color=X.dark, bg=null, align="left",
  valign="middle", wrap=false, italic=false, border=false, indent=0 } = {}) {
  cell.font = { bold, size, color: { argb: color }, italic, name: "Calibri" };
  if (bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { horizontal: align, vertical: valign, wrapText: wrap, indent };
  if (border) {
    const b = { style: "thin", color: { argb: X.border } };
    cell.border = { top: b, left: b, bottom: b, right: b };
  }
}

function numFmt(cell, fmt) { cell.numFmt = fmt; }

function spacer(ws, r, h = 6) { ws.getRow(r).height = h; }

function titleRow(ws, r, text, cols, opts = {}) {
  const { bg = X.darkHdr, color = X.white, size = 16, h = 40 } = opts;
  ws.mergeCells(r, 1, r, cols);
  const cell = ws.getCell(r, 1);
  cell.value = text;
  st(cell, { bold: true, size, color, bg, align: "center", valign: "middle" });
  ws.getRow(r).height = h;
}

function section(ws, r, text, cols, opts = {}) {
  const { bg = X.sectionBg, color = X.white, size = 9 } = opts;
  ws.mergeCells(r, 1, r, cols);
  const cell = ws.getCell(r, 1);
  cell.value = "  " + text.toUpperCase();
  st(cell, { bold: true, size, color, bg, align: "left", valign: "middle" });
  ws.getRow(r).height = 22;
  return r + 1;
}

function colHeaders(ws, r, defs) {
  defs.forEach((d, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = d.label;
    st(cell, { bold: true, size: 9, color: X.white, bg: X.colHdrBg,
      align: d.align || "center", border: true });
  });
  ws.getRow(r).height = 18;
  return r + 1;
}

function widths(ws, arr) {
  arr.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function pctStr(val, total) {
  if (!total) return "—";
  return `${Math.round((val / total) * 100)}%`;
}

function toBaseLocal(amt, cur, rates) {
  return cur === "KZT" ? +amt : +amt * (rates[cur] || 1);
}

function statusInfo(status) {
  if (status === "paid")    return { label: "✓ Оплачено",    bg: X.paidBg,    color: X.green };
  if (status === "partial") return { label: "~ Частично",    bg: X.partialBg, color: X.amber };
  return                           { label: "○ Не оплачено", bg: X.unpaidBg,  color: X.red };
}

async function saveFile(wb, filename) {
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─── TRIP EXPORT ─────────────────────────────────────────────────────────────
//
// Sheet 1 «Обзор»     — сводка, финансы, категории, валюты, места
// Sheet 2 «По дням»   — каждый день с подитогом
// Sheet 3 «Расходы»   — плоская таблица для сортировки/фильтрации в Excel
//
export async function exportTripXLSX({ plan, days, rates, filename }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Daily Planner";

  const toB  = (amt, cur) => toBaseLocal(amt, cur, rates);
  const allE = days.flatMap(d => d.expenses || []);
  const totAll  = allE.reduce((s, e) => s + toB(e.amount,         e.currency), 0);
  const totPaid = allE.reduce((s, e) => s + toB(e.paidAmount || 0, e.currency), 0);
  const totLeft = totAll - totPaid;

  // ── Sheet 1: Обзор ───────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet("Обзор");
  const C1 = 6;
  widths(ws1, [28, 18, 18, 16, 18, 16]);

  titleRow(ws1, 1, `✈  ${plan.name}`, C1, { h: 48, size: 18 });

  ws1.mergeCells(2, 1, 2, C1);
  const sub = ws1.getCell(2, 1);
  sub.value = `${plan.start_date || "—"}  →  ${plan.end_date || "—"}   ·   ${days.length} дн.   ·   ${allE.length} расходов`;
  st(sub, { italic: true, size: 10, color: X.white, bg: X.sectionBg, align: "center" });
  ws1.getRow(2).height = 20;
  spacer(ws1, 3);

  // Financial summary
  let r = 4;
  r = section(ws1, r, "Финансовая сводка", C1);
  r = colHeaders(ws1, r, [
    { label: "Показатель",   align: "left"   },
    { label: "Сумма (₸)",   align: "right"  },
    { label: "% от итога",  align: "center" },
    { label: "Кол-во",      align: "center" },
    { label: "Ср. расход ₸", align: "right" },
  ]);
  const cntPaid    = allE.filter(e => e.status === "paid").length;
  const cntPartial = allE.filter(e => e.status === "partial").length;
  const cntUnpaid  = allE.filter(e => e.status !== "paid" && e.status !== "partial").length;
  const avgAll  = allE.length  ? totAll  / allE.length  : 0;
  const avgPaid = cntPaid      ? totPaid / cntPaid       : 0;

  [
    ["💰 Запланировано",     totAll,  "100%",               allE.length,  avgAll,  X.offWhite, X.dark  ],
    ["✅ Оплачено",          totPaid, pctStr(totPaid,totAll), cntPaid,    avgPaid, X.paidBg,  X.green ],
    ["~ Частично оплачено",  0,       "",                    cntPartial,  0,       X.partialBg, X.amber],
    ["⏳ Осталось оплатить", totLeft, pctStr(totLeft,totAll), cntUnpaid,  0,       X.unpaidBg, X.red  ],
  ].forEach(([lbl, val, p, cnt, avg, bg, color]) => {
    const cells = [lbl, val || null, p || null, cnt || null, avg || null];
    cells.forEach((v, ci) => {
      const cell = ws1.getCell(r, ci + 1);
      cell.value = v;
      st(cell, { size: 10, bold: ci === 0, bg, color: ci === 0 ? X.dark : color, align: ci === 0 ? "left" : ci === 1 || ci === 4 ? "right" : "center", border: true });
      if ((ci === 1 || ci === 4) && v) numFmt(cell, '#,##0 "₸"');
    });
    ws1.getRow(r).height = 18;
    r++;
  });

  spacer(ws1, r++);

  // By category
  r = section(ws1, r, "Расходы по категориям", C1);
  r = colHeaders(ws1, r, [
    { label: "Категория",       align: "left"   },
    { label: "Запланировано ₸", align: "right"  },
    { label: "Оплачено ₸",     align: "right"  },
    { label: "Осталось ₸",     align: "right"  },
    { label: "% оплачено",     align: "center" },
    { label: "Кол-во",         align: "center" },
  ]);
  const byCat = {};
  allE.forEach(e => {
    if (!byCat[e.cat]) byCat[e.cat] = { total: 0, paid: 0, cnt: 0 };
    byCat[e.cat].total += toB(e.amount, e.currency);
    byCat[e.cat].paid  += toB(e.paidAmount || 0, e.currency);
    byCat[e.cat].cnt++;
  });
  Object.entries(byCat).sort((a, b) => b[1].total - a[1].total).forEach(([cat, v], idx) => {
    const bg   = idx % 2 === 0 ? X.white : X.rowAlt;
    const left = v.total - v.paid;
    [TRIP_LABELS[cat] || cat, v.total, v.paid, left, pctStr(v.paid, v.total), v.cnt].forEach((val, ci) => {
      const cell = ws1.getCell(r, ci + 1);
      cell.value = val;
      st(cell, { size: 10, bg, align: ci === 0 ? "left" : ci <= 3 ? "right" : "center", border: true });
      if (ci >= 1 && ci <= 3) numFmt(cell, '#,##0 "₸"');
    });
    ws1.getRow(r).height = 16; r++;
  });
  [" Итого", totAll, totPaid, totLeft, pctStr(totPaid, totAll), allE.length].forEach((val, ci) => {
    const cell = ws1.getCell(r, ci + 1);
    cell.value = val;
    st(cell, { bold: true, size: 10, bg: X.totalBg, align: ci === 0 ? "left" : ci <= 3 ? "right" : "center", border: true });
    if (ci >= 1 && ci <= 3) numFmt(cell, '#,##0 "₸"');
  });
  ws1.getRow(r).height = 18; r++;

  spacer(ws1, r++);

  // By currency
  r = section(ws1, r, "По валютам", C1);
  r = colHeaders(ws1, r, [
    { label: "Валюта",     align: "left"   },
    { label: "Итого",      align: "right"  },
    { label: "Оплачено",   align: "right"  },
    { label: "Осталось",   align: "right"  },
    { label: "Курс к ₸",  align: "center" },
    { label: "≈ ₸ итого", align: "right"  },
  ]);
  const byCur = {};
  allE.forEach(e => {
    if (!byCur[e.currency]) byCur[e.currency] = { total: 0, paid: 0 };
    byCur[e.currency].total += +e.amount;
    byCur[e.currency].paid  += +(e.paidAmount || 0);
  });
  Object.entries(byCur).sort((a, b) => toB(b[1].total, b[0]) - toB(a[1].total, a[0])).forEach(([cur, v], idx) => {
    const bg   = idx % 2 === 0 ? X.white : X.rowAlt;
    const rate = cur === "KZT" ? "базовая" : (rates[cur] || "?");
    [cur, v.total, v.paid, v.total - v.paid, rate, toB(v.total, cur)].forEach((val, ci) => {
      const cell = ws1.getCell(r, ci + 1);
      cell.value = val;
      st(cell, { size: 10, bg, align: ci === 0 ? "left" : [1, 2, 3, 5].includes(ci) ? "right" : "center", border: true });
      if (ci === 5) numFmt(cell, '#,##0 "₸"');
      if ([1, 2, 3].includes(ci)) numFmt(cell, "#,##0.##");
    });
    ws1.getRow(r).height = 16; r++;
  });

  // Places to visit
  const allPlaces = days.flatMap(d => (d.places || []).map(p => ({ ...p, date: d.date, loc: d.location || "" })));
  if (allPlaces.length > 0) {
    spacer(ws1, r++);
    r = section(ws1, r, "Места для посещения", C1);
    r = colHeaders(ws1, r, [
      { label: "Дата",     align: "center" },
      { label: "Город",    align: "left"   },
      { label: "Место",    align: "left"   },
      { label: "Статус",   align: "center" },
    ]);
    allPlaces.forEach((pl, idx) => {
      const bg = pl.done ? X.paidBg : idx % 2 === 0 ? X.white : X.rowAlt;
      [pl.date, pl.loc, pl.name, pl.done ? "✓ Посещено" : "○ Запланировано"].forEach((val, ci) => {
        const cell = ws1.getCell(r, ci + 1);
        cell.value = val;
        st(cell, { size: 10, bg, align: ci === 0 || ci === 3 ? "center" : "left", border: true,
          color: pl.done ? X.green : X.dark, italic: pl.done, bold: ci === 3 });
      });
      ws1.getRow(r).height = 16; r++;
    });
  }

  // ── Sheet 2: По дням ─────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("По дням");
  const C2 = 9;
  widths(ws2, [12, 30, 18, 14, 10, 16, 16, 14, 22]);

  let r2 = 1;
  titleRow(ws2, r2++, `${plan.name}  ·  Расходы по дням`, C2, { h: 32, size: 13 });
  spacer(ws2, r2++);

  days.forEach((day, di) => {
    const exps    = day.expenses || [];
    const dayTot  = exps.reduce((s, e) => s + toB(e.amount, e.currency), 0);
    const dayPaid = exps.reduce((s, e) => s + toB(e.paidAmount || 0, e.currency), 0);

    // Day header
    ws2.mergeCells(r2, 1, r2, C2);
    const dh = ws2.getCell(r2, 1);
    const d  = new Date(day.date + "T00:00:00");
    dh.value = `  День ${di + 1}  ·  ${day.date}  (${d.getDate()} ${RU_MONTHS[d.getMonth()]})${day.location ? "  ·  " + day.location : ""}`;
    st(dh, { bold: true, size: 11, color: X.white, bg: X.sectionBg, valign: "middle" });
    ws2.getRow(r2).height = 26; r2++;

    if (day.note) {
      ws2.mergeCells(r2, 1, r2, C2);
      const nc = ws2.getCell(r2, 1);
      nc.value = "  📝 " + day.note;
      st(nc, { size: 9, color: X.gray, bg: X.offWhite, italic: true });
      ws2.getRow(r2).height = 14; r2++;
    }

    if (exps.length === 0) {
      ws2.mergeCells(r2, 1, r2, C2);
      const ec = ws2.getCell(r2, 1);
      ec.value = "  Нет расходов";
      st(ec, { size: 9, color: X.dimText, bg: X.white, italic: true });
      ws2.getRow(r2).height = 14; r2++;
    } else {
      r2 = colHeaders(ws2, r2, [
        { label: "#",           align: "center" },
        { label: "Название",    align: "left"   },
        { label: "Категория",   align: "left"   },
        { label: "Сумма",       align: "right"  },
        { label: "Валюта",      align: "center" },
        { label: "≈ ₸",        align: "right"  },
        { label: "Оплачено ₸", align: "right"  },
        { label: "Статус",      align: "center" },
        { label: "Заметка",     align: "left"   },
      ]);

      exps.forEach((e, ei) => {
        const si  = statusInfo(e.status);
        const bg  = ei % 2 === 0 ? X.white : X.rowAlt;
        const kzt = toB(e.amount, e.currency);
        const paidKZT = toB(e.paidAmount || 0, e.currency);
        const vals = [
          ei + 1,
          (e.isCash ? "💵 " : "") + e.label,
          TRIP_LABELS[e.cat] || e.cat,
          +e.amount,
          e.currency,
          kzt,
          paidKZT,
          si.label,
          e.note || "",
        ];
        vals.forEach((val, ci) => {
          const cell = ws2.getCell(r2, ci + 1);
          cell.value = val;
          const isStat = ci === 7;
          st(cell, {
            size: 9,
            bg: isStat ? si.bg : bg,
            align: [0, 4, 7].includes(ci) ? "center" : [3, 5, 6].includes(ci) ? "right" : "left",
            border: true,
            color: isStat ? si.color : X.dark,
            bold: isStat,
          });
          if (ci === 3) numFmt(cell, "#,##0.##");
          if (ci === 5 || ci === 6) numFmt(cell, '#,##0 "₸"');
        });
        ws2.getRow(r2).height = 15; r2++;
      });

      // Day subtotal
      [
        `  Итого день ${di + 1}:`, "", "", dayTot, "", dayPaid, dayPaid,
        pctStr(dayPaid, dayTot), "",
      ].forEach((val, ci) => {
        const cell = ws2.getCell(r2, ci + 1);
        cell.value = val;
        st(cell, { bold: true, size: 9, bg: X.totalBg,
          align: ci === 0 ? "left" : [3, 5, 6].includes(ci) ? "right" : "center",
          border: true, color: ci === 7 ? (dayPaid >= dayTot ? X.green : X.red) : X.dark });
        if (ci === 3) numFmt(cell, '#,##0 "₸"');
        if (ci === 5 || ci === 6) numFmt(cell, '#,##0 "₸"');
      });
      ws2.getRow(r2).height = 18; r2++;
    }

    spacer(ws2, r2++, 8);
  });

  // Grand total bar
  ws2.mergeCells(r2, 1, r2, C2);
  const gt = ws2.getCell(r2, 1);
  gt.value = `  ИТОГО ПО ПОЕЗДКЕ:   ${totAll.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₸   |   Оплачено: ${totPaid.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₸   |   Осталось: ${totLeft.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₸   (${pctStr(totPaid, totAll)} оплачено)`;
  st(gt, { bold: true, size: 11, color: X.white, bg: X.darkHdr, align: "left" });
  ws2.getRow(r2).height = 28;

  // ── Sheet 3: Все расходы ─────────────────────────────────────────────────
  const ws3 = wb.addWorksheet("Все расходы");
  const C3 = 10;
  widths(ws3, [12, 8, 28, 18, 14, 10, 16, 16, 16, 22]);

  let r3 = 1;
  titleRow(ws3, r3++, `${plan.name}  ·  Полный список расходов`, C3, { h: 32, size: 13 });
  r3 = colHeaders(ws3, r3, [
    { label: "Дата",        align: "center" },
    { label: "День",        align: "center" },
    { label: "Название",    align: "left"   },
    { label: "Категория",   align: "left"   },
    { label: "Сумма",       align: "right"  },
    { label: "Валюта",      align: "center" },
    { label: "Оплачено",    align: "right"  },
    { label: "≈ ₸",        align: "right"  },
    { label: "Статус",      align: "center" },
    { label: "Заметка",     align: "left"   },
  ]);

  days.forEach((day, di) => {
    (day.expenses || []).forEach((e, ei) => {
      const si  = statusInfo(e.status);
      const bg  = ei % 2 === 0 ? X.white : X.rowAlt;
      const kzt = toB(e.amount, e.currency);
      [day.date, di + 1, (e.isCash ? "💵 " : "") + e.label, TRIP_LABELS[e.cat] || e.cat,
       +e.amount, e.currency, +(e.paidAmount || 0), kzt, si.label, e.note || ""]
        .forEach((val, ci) => {
          const cell = ws3.getCell(r3, ci + 1);
          cell.value = val;
          const isStat = ci === 8;
          st(cell, {
            size: 9, bg: isStat ? si.bg : bg, border: true,
            align: [0, 1, 5, 8].includes(ci) ? "center" : [4, 6, 7].includes(ci) ? "right" : "left",
            color: isStat ? si.color : X.dark, bold: isStat,
          });
          if (ci === 4 || ci === 6) numFmt(cell, "#,##0.##");
          if (ci === 7) numFmt(cell, '#,##0 "₸"');
        });
      ws3.getRow(r3).height = 15; r3++;
    });
  });
  // Totals row
  ["", "", `Итого: ${allE.length} расходов`, "", "", "", "", totAll, pctStr(totPaid, totAll) + " опл.", ""]
    .forEach((val, ci) => {
      const cell = ws3.getCell(r3, ci + 1);
      cell.value = val;
      st(cell, { bold: true, size: 9, bg: X.totalBg,
        align: [4, 6, 7].includes(ci) ? "right" : "center", border: true });
      if (ci === 7) numFmt(cell, '#,##0 "₸"');
    });
  ws3.getRow(r3).height = 18;

  await saveFile(wb, filename);
}

// ─── TRANSACTIONS EXPORT ──────────────────────────────────────────────────────
//
// Sheet 1 «Сводка»       — итог, по категориям, по счетам
// Sheet 2 «Транзакции»   — плоская таблица всех операций
//
export async function exportTransactionsXLSX({ txs, catData, cats, accounts, txType, periodLabel, filename }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Daily Planner";

  const isExp      = txType === "expense";
  const typeLabel  = isExp ? "Расходы" : "Доходы";
  const accentBg   = isExp ? X.expRow : X.incRow;
  const accentColor = isExp ? X.red : X.green;
  const total      = catData.reduce((s, c) => s + c.val, 0);

  // ── Sheet 1: Сводка ──────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet("Сводка");
  const C1 = 5;
  widths(ws1, [30, 16, 18, 16, 18]);

  titleRow(ws1, 1, `${typeLabel}  ·  ${periodLabel}`, C1, { h: 40 });

  // Big total block
  spacer(ws1, 2);
  ws1.mergeCells(3, 1, 3, C1);
  const totLbl = ws1.getCell(3, 1);
  totLbl.value = "ИТОГО ЗА ПЕРИОД";
  st(totLbl, { bold: true, size: 9, color: X.dimText, bg: X.lightGray, align: "center" });
  ws1.getRow(3).height = 16;

  ws1.mergeCells(4, 1, 4, C1);
  const totVal = ws1.getCell(4, 1);
  totVal.value = total;
  numFmt(totVal, '#,##0 "₸"');
  st(totVal, { bold: true, size: 26, color: accentColor, bg: accentBg, align: "center" });
  ws1.getRow(4).height = 48;

  ws1.mergeCells(5, 1, 5, C1);
  const cntCell = ws1.getCell(5, 1);
  cntCell.value = `${txs.length} транзакций  ·  средняя: ${txs.length ? Math.round(total / txs.length).toLocaleString("ru-RU") : 0} ₸`;
  st(cntCell, { size: 10, color: accentColor, bg: accentBg, align: "center", italic: true });
  ws1.getRow(5).height = 20;
  spacer(ws1, 6);

  // By category
  let r = 7;
  r = section(ws1, r, `${typeLabel} по категориям`, C1);
  r = colHeaders(ws1, r, [
    { label: "Категория",         align: "left"   },
    { label: "Кол-во транзакций", align: "center" },
    { label: "Сумма ₸",          align: "right"  },
    { label: "% от итога",       align: "center" },
    { label: "Средняя ₸",        align: "right"  },
  ]);
  catData.forEach((cat, idx) => {
    const cnt = txs.filter(t => t.category_id === cat.id).length;
    const avg = cnt ? cat.val / cnt : 0;
    const bg  = idx % 2 === 0 ? X.white : accentBg;
    [cat.name, cnt, cat.val, pctStr(cat.val, total), avg].forEach((val, ci) => {
      const cell = ws1.getCell(r, ci + 1);
      cell.value = val;
      st(cell, { size: 10, bg, align: ci === 0 ? "left" : [1, 3].includes(ci) ? "center" : "right", border: true });
      if (ci === 2 || ci === 4) numFmt(cell, '#,##0 "₸"');
    });
    ws1.getRow(r).height = 16; r++;
  });
  {
    const avg = txs.length ? total / txs.length : 0;
    [typeLabel + " — Итого", txs.length, total, "100%", avg].forEach((val, ci) => {
      const cell = ws1.getCell(r, ci + 1);
      cell.value = val;
      st(cell, { bold: true, size: 10, bg: X.totalBg, align: ci === 0 ? "left" : [1, 3].includes(ci) ? "center" : "right", border: true });
      if (ci === 2 || ci === 4) numFmt(cell, '#,##0 "₸"');
    });
    ws1.getRow(r).height = 18; r++;
  }

  spacer(ws1, r++);

  // By account
  const byAcc = {};
  txs.forEach(t => {
    const k = t.account_id || "__none__";
    if (!byAcc[k]) byAcc[k] = { total: 0, cnt: 0 };
    byAcc[k].total += +t.amount;
    byAcc[k].cnt++;
  });
  r = section(ws1, r, "По счетам", C1);
  r = colHeaders(ws1, r, [
    { label: "Счёт",              align: "left"   },
    { label: "Кол-во транзакций", align: "center" },
    { label: "Сумма (в валюте)", align: "right"  },
    { label: "% кол-ва",         align: "center" },
    { label: "Валюта счёта",     align: "center" },
  ]);
  Object.entries(byAcc).sort((a, b) => b[1].total - a[1].total).forEach(([id, v], idx) => {
    const acc = accounts.find(a => a.id === id);
    const bg  = idx % 2 === 0 ? X.white : accentBg;
    [acc?.name || "—", v.cnt, v.total, pctStr(v.cnt, txs.length), acc?.currency || "—"].forEach((val, ci) => {
      const cell = ws1.getCell(r, ci + 1);
      cell.value = val;
      st(cell, { size: 10, bg, align: ci === 0 ? "left" : ci === 2 ? "right" : "center", border: true });
      if (ci === 2) numFmt(cell, "#,##0.##");
    });
    ws1.getRow(r).height = 16; r++;
  });

  // ── Sheet 2: Транзакции ──────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("Транзакции");
  const C2 = 6;
  widths(ws2, [12, 26, 24, 16, 10, 26]);
  titleRow(ws2, 1, `${typeLabel}  ·  ${periodLabel}`, C2, { h: 28, size: 12 });
  let r2 = colHeaders(ws2, 2, [
    { label: "Дата",      align: "center" },
    { label: "Категория", align: "left"   },
    { label: "Счёт",      align: "left"   },
    { label: "Сумма",     align: "right"  },
    { label: "Валюта",    align: "center" },
    { label: "Заметка",   align: "left"   },
  ]);
  [...txs].sort((a, b) => b.date.localeCompare(a.date)).forEach((tx, idx) => {
    const cat = cats.find(c => c.id === tx.category_id);
    const acc = accounts.find(a => a.id === tx.account_id);
    const bg  = idx % 2 === 0 ? X.white : accentBg;
    [tx.date, cat?.name || "—", acc?.name || "—", tx.amount, tx.currency, tx.note || ""]
      .forEach((val, ci) => {
        const cell = ws2.getCell(r2, ci + 1);
        cell.value = val;
        st(cell, { size: 9, bg, align: ci === 0 || ci === 4 ? "center" : ci === 3 ? "right" : "left", border: true });
        if (ci === 3) numFmt(cell, "#,##0.##");
      });
    ws2.getRow(r2).height = 15; r2++;
  });

  await saveFile(wb, filename);
}

// ─── PLANS EXPORT ─────────────────────────────────────────────────────────────
//
// Sheet 1 «План YYYY-MM» — сводка + расходы + накопления + доходы со статусами
//
export async function exportPlansXLSX({ expRows, incRows, savingsRows, totals, rates, planMonth, planYear, filename }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Daily Planner";

  const { totalPlanExp, totalPlanInc, totalPlanSav,
    totalActExp, totalActInc, totalActSav, totalPlanExpAll } = totals;
  const monthLabel = `${RU_MONTHS[planMonth]} ${planYear}`;
  const toB = (amt, cur) => toBaseLocal(amt, cur, rates);

  const ws = wb.addWorksheet(`План ${monthLabel}`);
  const C  = 6;
  widths(ws, [32, 18, 18, 18, 16, 16]);

  titleRow(ws, 1, `ПЛАН НА ${monthLabel.toUpperCase()}`, C, { h: 48, size: 16 });
  spacer(ws, 2);

  // Key metrics table
  let r = 3;
  r = section(ws, r, "Ключевые показатели месяца", C);
  r = colHeaders(ws, r, [
    { label: "Показатель",     align: "left"   },
    { label: "По плану ₸",    align: "right"  },
    { label: "Факт ₸",        align: "right"  },
    { label: "Остаток ₸",     align: "right"  },
    { label: "% выполнения",  align: "center" },
    { label: "Статус",        align: "center" },
  ]);

  const balancePlan = totalPlanInc - totalPlanExpAll;
  const balanceAct  = totalActInc  - totalActExp - totalActSav;
  const metricsData = [
    { label: "💰 Доходы",                plan: totalPlanInc, act: totalActInc,
      bg: totalActInc >= totalPlanInc ? X.paidBg : X.partialBg },
    { label: "💸 Расходы",               plan: totalPlanExp, act: totalActExp,
      bg: totalActExp <= totalPlanExp  ? X.paidBg : X.unpaidBg },
    { label: "🏦 Накопления / Инвест.",   plan: totalPlanSav, act: totalActSav,
      bg: totalActSav >= totalPlanSav  ? X.paidBg : X.partialBg },
    { label: "✅ Баланс (доход − расход)", plan: balancePlan, act: balanceAct,
      bg: balanceAct >= 0 ? X.paidBg : X.unpaidBg },
  ];
  metricsData.forEach(({ label, plan, act, bg }) => {
    const rest    = plan - act;
    const pct_    = plan ? Math.round((act / plan) * 100) : act > 0 ? 100 : 0;
    const good    = rest >= 0;
    const status  = pct_ >= 100 ? "✓ Выполнено" : pct_ >= 70 ? "↗ Почти"  : pct_ > 0 ? "~ В процессе" : "○ Не начато";
    [label, plan, act, rest, `${pct_}%`, status].forEach((val, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = val;
      const isStat = ci === 5;
      st(cell, {
        bold: ci === 0 || isStat, size: 10,
        bg: isStat ? (pct_ >= 100 ? X.paidBg : pct_ >= 50 ? X.partialBg : X.unpaidBg) : bg,
        align: ci === 0 ? "left" : [1, 2, 3].includes(ci) ? "right" : "center",
        border: true,
        color: isStat ? (pct_ >= 100 ? X.green : pct_ >= 50 ? X.amber : X.red) : (good ? X.dark : X.red),
      });
      if ([1, 2, 3].includes(ci)) numFmt(cell, '#,##0 "₸"');
    });
    ws.getRow(r).height = 18; r++;
  });

  spacer(ws, r++);

  // ── Reusable section renderer ─────────────────────────────────────────────
  const planCols = [
    { label: "Категория / Позиция", align: "left"   },
    { label: "План ₸",             align: "right"  },
    { label: "Факт ₸",             align: "right"  },
    { label: "Остаток ₸",          align: "right"  },
    { label: "% выполнения",       align: "center" },
    { label: "Статус",             align: "center" },
  ];

  function renderSection(label, rows, rowBg) {
    r = section(ws, r, label, C);
    r = colHeaders(ws, r, planCols);

    rows.forEach((row_, idx) => {
      const pb      = toB(row_.plan, row_.planCurrency);
      const rest    = pb - row_.actual;
      const pct_    = pb > 0 ? Math.round((row_.actual / pb) * 100) : 0;
      const status  = pb === 0 ? "— Без плана"
        : pct_ >= 100 ? "✓ Выполнено"
        : pct_ >= 80  ? "↗ Почти"
        : pct_ > 0    ? "~ В процессе"
        : "○ Не начато";
      const statBg  = pb === 0 ? X.lightGray
        : pct_ >= 100 ? X.paidBg
        : pct_ >= 50  ? X.partialBg
        : X.unpaidBg;
      const bg = idx % 2 === 0 ? X.white : rowBg;

      [row_.cat?.name || "—", pb, row_.actual, rest, `${pct_}%`, status].forEach((val, ci) => {
        const cell = ws.getCell(r, ci + 1);
        cell.value = val;
        const isStat = ci === 5;
        st(cell, {
          bold: ci === 0 || isStat, size: 10,
          bg: isStat ? statBg : bg,
          align: ci === 0 ? "left" : [1, 2, 3].includes(ci) ? "right" : "center",
          border: true,
          color: isStat ? (pct_ >= 100 ? X.green : pct_ >= 50 ? X.amber : X.red) : X.dark,
        });
        if ([1, 2, 3].includes(ci)) numFmt(cell, '#,##0 "₸"');
      });
      ws.getRow(r).height = 16; r++;

      // Sub-items (plan breakdown positions)
      (row_.items || []).filter(it => it.amount > 0).forEach(it => {
        const itAmt = toB(it.amount, row_.planCurrency);
        ["  • " + (it.label || "—"), itAmt, "", "", "", ""].forEach((val, ci) => {
          const cell = ws.getCell(r, ci + 1);
          cell.value = val;
          st(cell, { size: 9, color: X.gray, bg: X.offWhite, italic: true,
            align: ci === 0 ? "left" : ci === 1 ? "right" : "center" });
          if (ci === 1) numFmt(cell, '#,##0 "₸"');
        });
        ws.getRow(r).height = 13; r++;
      });
    });

    // Section total
    const sTotPlan = rows.reduce((s, rw) => s + toB(rw.plan, rw.planCurrency), 0);
    const sTotAct  = rows.reduce((s, rw) => s + rw.actual, 0);
    const sRest    = sTotPlan - sTotAct;
    const sPct     = sTotPlan > 0 ? Math.round((sTotAct / sTotPlan) * 100) : 0;
    [" Итого по разделу", sTotPlan, sTotAct, sRest, `${sPct}%`, ""].forEach((val, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = val;
      st(cell, { bold: true, size: 10, bg: X.totalBg,
        align: ci === 0 ? "left" : [1, 2, 3].includes(ci) ? "right" : "center", border: true,
        color: sRest >= 0 ? X.dark : X.red });
      if ([1, 2, 3].includes(ci)) numFmt(cell, '#,##0 "₸"');
    });
    ws.getRow(r).height = 18; r++;
    spacer(ws, r++);
  }

  renderSection("Расходы", expRows, X.expRow);
  if (savingsRows.length > 0) renderSection("Накопления / Инвестиции", savingsRows, "FFF0F9FF");
  renderSection("Доходы", incRows, X.incRow);

  await saveFile(wb, filename);
}
