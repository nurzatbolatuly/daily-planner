import { useMemo, useRef, useState } from "react";
import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { BottomSheet } from "../../../components/BottomSheet";
import { findReceiptOwner } from "../../../lib/receiptsApi";
import { ReceiptError, RECEIPT_ERRORS } from "../../../utils/receipts/normalize";
import { receiptSummary, fmtMoney } from "../../../utils/receipts/receiptView";
import { fmtDateShort } from "../../../utils/format";
import { ReceiptPreviewSheet } from "./ReceiptPreviewSheet";
import { ReceiptItemSheet } from "./ReceiptItemSheet";
import { CategoryChips } from "../../priceCatalog/components/CategoryChips";
import { chip, chipRow, fieldInput, sheetBtn, hintText, errorText } from "./sharedUi";

// Блок «Чек» (docs/receipts.md §3): ссылка из QR (Kaspi, oofd.kz) или PDF-накладная (Арбуз) →
// предпросмотр → прикрепить. Состояние чека — у формы (useTransactionReceipt), здесь только ввод.
// readOnly — карточка для просмотра (SharedEntryFormPage: транзакцию правит форма группы).
// Разбор чеков (lib/receiptLoader) — отдельный чанк, грузится при первом «Ссылка» / «PDF».
const loader = () => import("../../../lib/receiptLoader");

const ERROR_TEXT = {
  [RECEIPT_ERRORS.refund]: "Чеки возврата пока не поддерживаются",
  [RECEIPT_ERRORS.empty]: "Не удалось разобрать чек — формат источника изменился",
  [RECEIPT_ERRORS.format]: "Не удалось разобрать чек — формат источника изменился",
};
const errorMessage = e => (e instanceof ReceiptError ? ERROR_TEXT[e.code] || e.message : "Не удалось загрузить чек");

// Две кнопки источника переносятся на узком экране (iPhone SE — 320px)
const actionRow = { ...chipRow, marginBottom:8 };

export function ReceiptField({
  view, loading = false, loadError = null, readOnly = false, transactionId = null,
  onAttach, onRemove, mismatch = null, notice = null, onOpenTransaction,
}) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(null);           // текст «Загружаем чек…» — пока идёт разбор
  const [error, setError] = useState(null);         // { message, ownerId? }
  const [pending, setPending] = useState(null);     // разобранный чек до «Прикрепить»: { parsed, plan, catalog }
  const [editing, setEditing] = useState(null);     // индекс позиции в правке товара
  const [bulkCategory, setBulkCategory] = useState(false);   // шторка «Категория для товаров без неё»
  const helpers = useRef(null);                     // lib/receiptLoader — после первой загрузки
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [viewOpen, setViewOpen] = useState(false);

  // Разбор → проверка «уже прикреплён к другому расходу» → предпросмотр.
  const run = async (label, load) => {   // load(loaderModule) → разобранный чек
    setBusy(label);
    setError(null);
    setViewOpen(false);
    try {
      const mod = await loader();
      helpers.current = mod;
      const parsed = await load(mod);
      // каталог обязателен: с пустым план создал бы дубли всех товаров (§7.3)
      const [owner, catalog] = await Promise.all([findReceiptOwner(parsed.externalId), mod.fetchCatalogIndex()]);
      if (owner && owner.transaction_id !== transactionId) {
        const tx = owner.transactions;
        const where = tx ? ` ${fmtDateShort(tx.date).toLowerCase()} · ${fmtMoney(Number(tx.amount), tx.currency)}` : "";
        setError({ message: `Чек уже прикреплён к расходу${where}`, ownerId: owner.transaction_id });
        return;
      }
      const full = { products: [], links: [], categories: [], ...catalog };
      setPending({ parsed, plan: mod.planReceipt(parsed, full), catalog: full });
    } catch (e) {
      console.error("Receipt:", e);
      setError({ message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const submitLink = () => {
    const text = linkText.trim();
    if (!text) return;
    setLinkOpen(false);
    run("Загружаем чек…", mod => mod.loadReceiptFromLink(text));
  };

  const pickPdf = e => {
    const file = e.target.files?.[0];
    e.target.value = "";   // тот же файл можно выбрать ещё раз
    if (!file) return;
    run("Читаем PDF…", mod => mod.loadReceiptFromPdf(file));
  };

  const pendingView = useMemo(() => pending && helpers.current.receiptViewFromParsed(pending.parsed, pending.plan, pending.catalog.categories), [pending]);
  const catalogProducts = pending?.catalog.products;
  const byKind = useMemo(() => catalogProducts && helpers.current.categoriesByKind(catalogProducts), [catalogProducts]);

  // Правка товара: выбрали категорию — она пользовательская; не трогали — заново по (возможно новому) виду,
  // если раньше не выбирали её сами.
  const applyEdits = (index, edits, categoryId) => {
    const pi = pending.plan[index];
    const category = categoryId !== undefined ? { categoryId, categorySource: categoryId ? "manual" : null }
      : pi.categorySource === "manual" || pi.categorySource === "bulk" ? {}
      : helpers.current.inheritCategory(pi.match, edits.kind, byKind);
    updatePlan(index, { edits, inCatalog: true, ...category });
  };
  // «Это тот же товар, что…» / «Не тот товар» — категория выбранного товара или снова по виду.
  const relink = (index, match) => {
    const pi = pending.plan[index];
    updatePlan(index, { match, edits: null, inCatalog: true, ...helpers.current.inheritCategory(match, pi.description.kind, byKind) });
  };
  const applyBulkCategory = categoryId => {
    setPending(p => ({ ...p, plan: p.plan.map((pi, i) =>
      (p.parsed.items[i].isService || !pi.inCatalog || pi.categoryId ? pi : { ...pi, categoryId, categorySource: "bulk" })) }));
    setBulkCategory(false);
  };
  const updatePlan = (index, patch) =>
    setPending(p => ({ ...p, plan: p.plan.map((pi, i) => (i === index ? { ...pi, ...patch } : pi)) }));
  const toggleAll = on =>
    setPending(p => ({ ...p, plan: p.plan.map((pi, i) => (p.parsed.items[i].isService ? pi : { ...pi, inCatalog: on })) }));
  const closePending = () => { setPending(null); setEditing(null); setBulkCategory(false); };

  const openLink = () => { setViewOpen(false); setLinkText(""); setLinkOpen(true); };
  const openPdf = () => fileRef.current?.click();

  const sources = (prefix = "") => (
    <div style={actionRow}>
      <button type="button" onClick={openLink} disabled={!!busy} style={{ ...chip(), display:"flex", alignItems:"center", gap:6 }}>
        <Ico n="link" s={14} c={C.mid}/> {prefix}Ссылка из QR
      </button>
      <button type="button" onClick={openPdf} disabled={!!busy} style={{ ...chip(), display:"flex", alignItems:"center", gap:6 }}>
        <Ico n="report" s={14} c={C.mid}/> {prefix}PDF-накладная
      </button>
    </div>
  );

  if (readOnly && !view) return null;

  return (
    <div style={{ marginBottom:16 }}>
      <FieldLabel>Чек</FieldLabel>

      {loading ? (
        <p style={hintText}>Загружаем чек…</p>
      ) : view ? (
        <button type="button" onClick={() => setViewOpen(true)}
          style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:12, cursor:"pointer", textAlign:"left",
            background:C.greenTint, border:`1px solid ${C.greenBorder}`, color:C.main, marginBottom:8 }}>
          <Ico n="receipt" s={18} c={C.green}/>
          <span style={{ flex:1, minWidth:0, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{receiptSummary(view)}</span>
          <Ico n="chevR" s={16} c={C.dim}/>
        </button>
      ) : !readOnly && (
        <>
          {sources()}
          <p style={{ ...hintText, margin:"0 0 8px" }}>Отсканируйте QR на чеке камерой телефона и вставьте ссылку. Позиции чека сохранятся вместе с расходом.</p>
        </>
      )}

      {busy && <p style={{ ...hintText, margin:"0 0 8px", color:C.mid }}>{busy}</p>}
      {loadError && <p style={errorText}>{loadError}</p>}
      {error && (
        <p style={errorText}>
          {error.message}
          {error.ownerId && onOpenTransaction && (
            <button type="button" onClick={() => onOpenTransaction(error.ownerId)}
              style={{ marginLeft:8, background:"none", border:"none", padding:0, color:C.green, fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Открыть
            </button>
          )}
        </p>
      )}
      {mismatch && view && (
        <p style={{ ...hintText, margin:"0 0 8px", color:C.amber }}>
          В чеке {fmtMoney(mismatch.receipt, view.currency)}, в транзакции {fmtMoney(mismatch.transaction, view.currency)}
        </p>
      )}
      {notice && <p style={{ ...hintText, margin:"0 0 8px", color:C.amber }}>{notice}</p>}

      <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={pickPdf} style={{ display:"none" }} aria-label="PDF-накладная"/>

      <BottomSheet open={linkOpen} onClose={() => setLinkOpen(false)} title="Ссылка на чек">
        <input value={linkText} onChange={e => setLinkText(e.target.value)} autoFocus
          onKeyDown={e => { if (e.key === "Enter") submitLink(); }}
          placeholder="receipt.kaspi.kz/… или consumer.oofd.kz/…" aria-label="Ссылка на чек"
          style={{ ...fieldInput(), marginBottom:8 }}/>
        <p style={hintText}>Поддерживаются чеки Kaspi (Magnum GO) и oofd.kz (Small). Можно вставить весь текст из «Поделиться».</p>
        <button type="button" onClick={submitLink} disabled={!linkText.trim()} style={sheetBtn("primary", !linkText.trim())}>Загрузить</button>
      </BottomSheet>

      {/* Одна шторка за раз: список позиций ↔ правка товара позиции */}
      <ReceiptPreviewSheet open={!!pending && editing == null && !bulkCategory} view={pendingView} onClose={closePending}
        onToggle={i => updatePlan(i, { inCatalog: !pending.plan[i].inCatalog })}
        onEdit={setEditing} onToggleAll={toggleAll}
        onBulkCategory={pending?.catalog.categories.length ? () => setBulkCategory(true) : undefined}
        footer={(
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button type="button" onClick={() => { onAttach(pending.parsed, pendingView, pending.plan); closePending(); }} style={sheetBtn("primary")}>Прикрепить</button>
            <button type="button" onClick={closePending} style={sheetBtn("secondary")}>Отмена</button>
          </div>
        )}/>
      {pending && editing != null && (
        <ReceiptItemSheet key={editing} open item={pending.parsed.items[editing]} planItem={pending.plan[editing]}
          helpers={helpers.current} products={pending.catalog.products} categories={pending.catalog.categories}
          onClose={() => setEditing(null)}
          onApply={(edits, categoryId) => { applyEdits(editing, edits, categoryId); setEditing(null); }}
          onPick={p => { relink(editing, { productId: p.id, via: "manual", productName: p.name, confirmed: !!p.name_confirmed, categoryId: p.category_id || null }); setEditing(null); }}
          onUnlink={() => relink(editing, { productId: null, via: null })}
        />
      )}
      <BottomSheet open={bulkCategory} onClose={() => setBulkCategory(false)} title="Категория для товаров без неё">
        <p style={hintText}>Остальные позиции не меняются. Дальше товары этого вида будут получать категорию сами.</p>
        <CategoryChips categories={pending?.catalog.categories || []} value={null} onChange={applyBulkCategory}/>
        <button type="button" onClick={() => setBulkCategory(false)} style={{ ...sheetBtn("secondary"), marginTop:16 }}>Отмена</button>
      </BottomSheet>

      <ReceiptPreviewSheet open={viewOpen} view={view} onClose={() => setViewOpen(false)}
        footer={!readOnly && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {sources("Заменить: ")}
            <button type="button" onClick={() => { onRemove(); setViewOpen(false); }} style={sheetBtn("danger")}>Убрать чек</button>
          </div>
        )}/>
    </div>
  );
}
