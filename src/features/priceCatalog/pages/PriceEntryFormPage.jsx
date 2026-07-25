import { useMemo, useRef, useState } from "react";
import { C } from "../../../constants/theme";
import { todayStr } from "../../../utils/date";
import { supaUpsert, supa } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { Ico } from "../../../components/Ico";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { UNITS } from "../utils/priceCatalogUtils";

const fieldStyle = (hasError) => ({
  width:"100%", boxSizing:"border-box", background:C.monCard, border:`1px solid ${hasError?C.errorLight:C.border}`,
  borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:16, outline:"none",
});

export function PriceEntryFormPage({ product, sources = [], prefillSource, edit, onBack }) {
  const isEdit = !!edit;
  const [source, setSource] = useState(edit?.source || prefillSource || "");
  const [price, setPrice] = useState(edit?.price != null ? String(edit.price) : "");
  const [qty, setQty] = useState(edit?.qty != null ? String(edit.qty) : "1");
  const [unit, setUnit] = useState(edit?.unit || "шт");
  const [date, setDate] = useState(edit?.date || todayStr());
  const [note, setNote] = useState(edit?.note || "");
  const [errors, setErrors] = useState({});
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef(null);
  const deleteRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить цену" });
  const { save: del } = useSave(() => deleteRef.current?.(), { errorMsg: "Не удалось удалить" });

  const suggestions = useMemo(() => {
    const q = source.trim().toLowerCase();
    return sources.filter(s => s.toLowerCase() !== q && (!q || s.toLowerCase().includes(q))).slice(0, 6);
  }, [source, sources]);

  saveRef.current = async () => {
    const entry = {
      id: edit?.id || newId(),
      product_id: product.id,
      source: source.trim(),
      price: parseFloat(price) || 0,
      qty: parseFloat(qty) || 1,
      unit,
      date,
      note: note.trim(),
    };
    await supaUpsert("price_entries", entry);
    onBack(true);
  };

  deleteRef.current = async () => {
    await supa.delete("price_entries", `id=eq.${edit.id}`);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!source.trim()) errs.source = "Укажите источник";
    if (!price || parseFloat(price) <= 0) errs.price = "Укажите цену";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader
        title={isEdit ? "Редактировать цену" : "Новая цена"}
        onBack={() => onBack(false)}
        right={isEdit ? (
          <button onClick={() => setConfirmDelete(true)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex" }}>
            <Ico n="trash" s={20} c={C.errorLight}/>
          </button>
        ) : <div style={{ width:30 }}/>}
      />
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ background:C.monCard, borderRadius:12, padding:"12px 14px", marginBottom:20 }}>
          <p style={{ margin:0, fontSize:11, color:C.dim }}>Товар</p>
          <p style={{ margin:"3px 0 0", fontSize:15, fontWeight:700, color:"#fff" }}>{product.name}</p>
        </div>

        <div style={{ marginBottom:14, position:"relative" }}>
          <FieldLabel error={errors.source}>Источник</FieldLabel>
          <input
            value={source}
            onChange={e => { setSource(e.target.value); setErrors(p => ({...p, source:""})); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
            placeholder="Название магазина или места"
            style={fieldStyle(errors.source)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{ position:"absolute", left:0, right:0, top:"100%", marginTop:4, background:C.monCard2, borderRadius:10, border:`1px solid ${C.border}`, zIndex:5, overflow:"hidden" }}>
              {suggestions.map(s => (
                <div key={s} onMouseDown={() => { setSource(s); setShowSuggestions(false); }}
                  style={{ padding:"10px 14px", fontSize:14, color:C.main, cursor:"pointer" }}>
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <FieldLabel error={errors.price}>Цена</FieldLabel>
            <NumInput value={price} onChange={setPrice} placeholder="0" style={fieldStyle(errors.price)}/>
          </div>
          <div style={{ width:90 }}>
            <FieldLabel>Кол-во</FieldLabel>
            <NumInput value={qty} onChange={setQty} placeholder="1" style={fieldStyle(false)}/>
          </div>
          <div style={{ width:80 }}>
            <FieldLabel>Ед.</FieldLabel>
            <select value={unit} onChange={e => setUnit(e.target.value)} style={{ ...fieldStyle(false), padding:"12px 8px" }}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <FieldLabel>Дата</FieldLabel>
        <button onClick={() => setShowCalendar(true)}
          style={{ display:"flex", alignItems:"center", gap:8, width:"100%", background:C.monCard, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:14, cursor:"pointer", marginBottom:14 }}>
          <Ico n="calendar" s={16} c={C.dim}/>
          {date}
        </button>

        <FieldLabel>Заметка</FieldLabel>
        <input
          value={note} onChange={e => setNote(e.target.value)} placeholder="Необязательно"
          style={{ ...fieldStyle(false), fontSize:14, marginBottom:20 }}
        />

        {saveError && <p style={{ color:C.errorLight, fontSize:12, marginBottom:8 }}>{saveError}</p>}

        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?C.savingDisabled:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      {showCalendar && (
        <CalendarPicker mode="single" value={date}
          onChange={v => { setDate(v); setShowCalendar(false); }}
          onClose={() => setShowCalendar(false)}/>
      )}

      <ConfirmSheet
        open={confirmDelete} onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); del(); }}
        title="Удалить запись цены?"
      />
    </div>
  );
}
