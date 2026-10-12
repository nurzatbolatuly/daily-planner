import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { supaUpsert, supa } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { CategoryChips } from "../components/CategoryChips";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { NumInput } from "../../../components/NumInput";
import { UNITS } from "../utils/priceCatalogUtils";

// Признаки товара (docs/receipts.md §7.1): вид — для «Другие варианты», бренд/вариант/фасовка —
// по ним чек другого магазина без кода узнаёт этот товар. Название — свободное, как раньше.
const ATTR_FIELDS = [
  ["kind", "Вид", "Например, Творог"],
  ["brand", "Бренд", "Необязательно"],
  ["variant", "Вариант", "Жирность, сорт, размер"],
];
const PACK_UNITS = ["кг", "л", "шт"];   // фасовка — в базовой единице, как в чеках (0.5 кг)

export function ProductFormPage({ categories, edit, attributesSupported = true, onBack, onDelete }) {
  const [name, setName] = useState(edit?.name || "");
  const [categoryId, setCategoryId] = useState(edit?.category_id || "");
  const [attrs, setAttrs] = useState(() => ({ kind: edit?.kind || "", brand: edit?.brand || "", variant: edit?.variant || "" }));
  const [pack, setPack] = useState(() => ({ qty: edit?.pack_qty != null ? String(edit.pack_qty) : "", unit: edit?.pack_unit || "кг" }));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить товар" });

  saveRef.current = async () => {
    const product = { id: edit?.id || newId(), name: name.trim(), category_id: categoryId || null };
    if (attributesSupported) {
      const packQty = parseFloat(pack.qty) || null;
      const packChanged = packQty !== (edit?.pack_qty != null ? Number(edit.pack_qty) : null) || (packQty && pack.unit !== edit?.pack_unit);
      Object.assign(product, {
        kind: attrs.kind.trim() || null, brand: attrs.brand.trim() || null, variant: attrs.variant.trim() || null,
        pack_qty: packQty, pack_unit: packQty ? pack.unit : null,
        pack_count: packChanged ? null : edit?.pack_count ?? null,   // «5 × 70 г» — пока фасовку не меняли
        name_confirmed: true,   // пользователь проверил товар — правила названий больше не «проверьте»
      });
    }
    await supaUpsert("price_products", product);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!name.trim()) errs.name = "Введите название";
    if (!categoryId) errs.category = "Выберите категорию";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  const del = async () => {
    setConfirmDelete(false);
    try {
      await supa.delete("price_products", `id=eq.${edit.id}`);
      onDelete ? onDelete() : onBack(true);
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать товар" : "Новый товар"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ marginBottom:20 }}>
          <FieldLabel error={errors.name}>Название</FieldLabel>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }}
            placeholder="Например, Молоко 2.5%"
            style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${errors.name?"rgba(244,67,54,0.5)":C.border}`, borderRadius:12, outline:"none", color:"#fff", fontSize:16, padding:"12px 14px" }}
          />
        </div>

        {attributesSupported && (
          <>
            {ATTR_FIELDS.map(([key, label, placeholder]) => (
              <div key={key} style={{ marginBottom:16 }}>
                <FieldLabel>{label}</FieldLabel>
                <input value={attrs[key]} onChange={e => setAttrs(a => ({ ...a, [key]: e.target.value }))} placeholder={placeholder} aria-label={label}
                  style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderRadius:12, outline:"none", color:"#fff", fontSize:16, padding:"12px 14px" }}/>
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <FieldLabel>Фасовка</FieldLabel>
              <div style={{ display:"flex", gap:8 }}>
                <NumInput value={pack.qty} onChange={qty => setPack(p => ({ ...p, qty }))} placeholder="Без фасовки"
                  style={{ flex:1, minWidth:0, boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderRadius:12, outline:"none", color:"#fff", fontSize:16, padding:"12px 14px" }}/>
                {PACK_UNITS.filter(u => UNITS.includes(u)).map(u => (
                  <button key={u} type="button" onClick={() => setPack(p => ({ ...p, unit: u }))}
                    style={{ flexShrink:0, padding:"0 14px", borderRadius:12, cursor:"pointer", fontSize:14, fontWeight:600, border:`1px solid ${pack.unit === u ? C.green : C.border}`, background: pack.unit === u ? C.greenTintStrong : "rgba(255,255,255,0.06)", color: pack.unit === u ? C.green : C.mid }}>{u}</button>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={{ marginBottom:28 }}>
          <FieldLabel error={errors.category}>Категория</FieldLabel>
          {categories.length === 0 ? (
            <p style={{ fontSize:13, color:C.dim }}>Категорий пока нет — сначала добавьте хотя бы одну в «Меню → Каталог цен → Категории».</p>
          ) : (
            <CategoryChips categories={categories} value={categoryId} onChange={v => { setCategoryId(v); setErrors(p => ({...p, category:""})); }}/>
          )}
        </div>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?C.savingDisabled:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        {edit && (
          <button onClick={() => setConfirmDelete(true)} style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}>
            Удалить
          </button>
        )}
        <ConfirmSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={del}
          title="Удалить товар?"
          message="Вместе с товаром удалятся все записанные для него цены."
        />
      </div>
    </div>
  );
}
