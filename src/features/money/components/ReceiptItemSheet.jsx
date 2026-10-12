import { useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { RECEIPT_PACK_UNITS } from "../../../constants/receipts";
import { BottomSheet } from "../../../components/BottomSheet";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { CategoryChips } from "../../priceCatalog/components/CategoryChips";
import { fieldInput, chip, chipRow, sheetBtn, hintText } from "./sharedUi";

// Товар позиции чека в предпросмотре (docs/receipts.md §7.4): поправить вид/бренд/вариант/фасовку —
// название собирается само; «Это тот же товар, что…»; «Не тот товар». Правка — один раз на товар:
// дальше он узнаётся по коду или строке чека. helpers — из ленивого lib/receiptLoader.

const PACK_UNITS = ["г", "кг", "мл", "л", "шт"];

// Фасовка в базовой единице (0.5 кг) ↔ как удобно вводить (500 г).
const toInputPack = pack => {
  if (!pack) return { qty: "", unit: "г" };
  if (pack.unit === "кг" && pack.qty < 1) return { qty: String(+(pack.qty * 1000).toFixed(3)), unit: "г" };
  if (pack.unit === "л" && pack.qty < 1) return { qty: String(+(pack.qty * 1000).toFixed(3)), unit: "мл" };
  return { qty: String(pack.qty), unit: pack.unit };
};
const fromInputPack = ({ qty, unit }) => {
  const n = parseFloat(qty);
  if (!n) return null;
  const u = RECEIPT_PACK_UNITS[unit];
  return { qty: +(n * u.factor).toFixed(6), unit: u.unit };
};

const TEXT_FIELDS = [
  ["core", "Название", "Например, Творог"],
  ["kind", "Вид — для сравнения вариантов", "Например, Творог"],
  ["brand", "Бренд", "Без бренда"],
  ["variant", "Вариант", "Жирность, сорт, размер"],
];

// onApply(edits, categoryId) — categoryId: undefined, если категорию не трогали (тогда она
// по-прежнему наследуется по виду), иначе выбор пользователя (null — без категории).
export function ReceiptItemSheet({ open, item, planItem, helpers, products, categories = [], onApply, onPick, onUnlink, onClose }) {
  const attrs = planItem.edits || planItem.description;
  const [form, setForm] = useState(() => ({
    core: attrs.core || "", kind: attrs.kind || "", brand: attrs.brand || "", variant: attrs.variant || "",
  }));
  const [pack, setPack] = useState(() => toInputPack(attrs.pack));
  const [category, setCategory] = useState(planItem.categoryId || "none");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const byWeight = item.unit === "кг";   // весовой: цена за кг, фасовки нет
  const packChanged = JSON.stringify(pack) !== JSON.stringify(toInputPack(attrs.pack));
  const edits = {
    core: form.core.trim(), kind: form.kind.trim() || null, brand: form.brand.trim() || null, variant: form.variant.trim() || null,
    // «5 × 70 г» сохраняется, пока фасовку не меняли
    pack: byWeight ? null : packChanged ? fromInputPack(pack) : attrs.pack || null,
  };
  const name = helpers.buildDisplayName(edits);
  const found = useMemo(() => (searching ? helpers.searchProducts(products, query, edits.kind) : []),
    [searching, products, query, edits.kind, helpers]);

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <BottomSheet open={open} onClose={onClose} title="Товар">
      <p style={{ ...hintText, margin:"0 0 12px" }}>В чеке: {item.rawName}</p>

      {planItem.match.productId && !searching && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, background:C.greenTint, border:`1px solid ${C.greenBorder}`, marginBottom:12 }}>
          <span style={{ flex:1, minWidth:0, fontSize:13, color:C.main }}>В каталоге: {planItem.match.productName}</span>
          <button type="button" onClick={onUnlink} style={{ background:"none", border:"none", padding:0, color:C.errorLight, fontSize:12, fontWeight:600, cursor:"pointer", flexShrink:0 }}>Не тот товар</button>
        </div>
      )}

      {searching ? (
        <>
          <input value={query} onChange={e => setQuery(e.target.value)} autoFocus placeholder="Поиск в каталоге"
            aria-label="Поиск в каталоге" style={{ ...fieldInput(), marginBottom:8 }}/>
          {found.length === 0 && <p style={hintText}>Ничего не найдено</p>}
          {found.map(p => (
            <button key={p.id} type="button" onClick={() => onPick(p)}
              style={{ width:"100%", textAlign:"left", padding:"12px", borderRadius:10, marginBottom:6, cursor:"pointer", background:C.rowBg, border:`1px solid ${C.border}`, color:C.main, fontSize:14 }}>
              {p.name}
            </button>
          ))}
          <button type="button" onClick={() => setSearching(false)} style={{ ...sheetBtn("secondary"), marginTop:8 }}>Назад</button>
        </>
      ) : (
        <>
          {TEXT_FIELDS.map(([key, label, placeholder]) => (
            <div key={key} style={{ marginBottom:12 }}>
              <FieldLabel>{label}</FieldLabel>
              <input value={form[key]} onChange={set(key)} placeholder={placeholder} aria-label={label} style={fieldInput()}/>
            </div>
          ))}

          {byWeight ? (
            <p style={hintText}>Весовой товар — цена в каталоге за 1 кг.</p>
          ) : (
            <div style={{ marginBottom:12 }}>
              <FieldLabel>Фасовка</FieldLabel>
              <NumInput value={pack.qty} onChange={qty => setPack(p => ({ ...p, qty }))} placeholder="Без фасовки"
                style={{ ...fieldInput(), marginBottom:8 }}/>
              <div style={chipRow}>
                {PACK_UNITS.map(u => (
                  <button key={u} type="button" onClick={() => setPack(p => ({ ...p, unit: u }))} style={chip(pack.unit === u)}>{u}</button>
                ))}
              </div>
            </div>
          )}

          {categories.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <FieldLabel>Категория в каталоге</FieldLabel>
              <CategoryChips categories={categories} value={category} onChange={setCategory} noneLabel="Без категории"/>
              {planItem.categorySource === "kind" && category === planItem.categoryId && (
                <p style={{ ...hintText, margin:"6px 0 0" }}>Выбрана по виду «{attrs.kind}» — как у других товаров каталога.</p>
              )}
            </div>
          )}

          <p style={{ margin:"4px 0 14px", fontSize:13, color:C.mid, lineHeight:1.4 }}>
            Будет: <span style={{ color:"#fff", fontWeight:600 }}>{name || "—"}</span>
          </p>

          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button type="button" onClick={() => onApply(edits, category === (planItem.categoryId || "none") ? undefined : category === "none" ? null : category)} disabled={!edits.core} style={sheetBtn("primary", !edits.core)}>Готово</button>
            <button type="button" onClick={() => setSearching(true)} style={sheetBtn("secondary")}>Это тот же товар, что…</button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
