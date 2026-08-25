import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym, fmtAmtAuto } from "../../../utils/format";
import { pad } from "../../../utils/date";
import { supaUpsert, supa } from "../../../lib/supabase";
import { getSavedOrder } from "../../../utils/accountOrder";
import { newId } from "../../../utils/id";
import { useSave } from "../../../hooks/useSave";
import { SAVINGS_PURPOSES } from "../../../constants/money";
import { Ico } from "../../../components/Ico";
import { NumInput } from "../../../components/NumInput";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { CatIcon } from "../../../components/CatIcon";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { CurrencyPage } from "../../../components/CurrencyPage";
import { ConfirmSheet } from "../../../components/ConfirmSheet";

// День платежа хранится как полная дата в items[].date ("YYYY-MM-DD") — но редактируется как
// просто "число месяца", т.к. месяц статьи и так фиксирован (= месяц плана). Тут — обратное
// извлечение числа из даты для поля ввода.
const dayOf = (dateStr) => dateStr ? String(parseInt(dateStr.split("-")[2], 10)) : "";

export function PlanRowPageMon({ expCats, incCats, accounts = [], onBack, edit, month, prefillCatId, prefillAccId, prefillType }) {
  const [type,    setType]    = useState(edit?.type || prefillType || "expense");
  const [catId,   setCatId]   = useState(edit?.cat_id  || prefillCatId  || "");
  const [accId,   setAccId]   = useState(edit?.acc_id  || prefillAccId  || "");
  const [planCur, setPlanCur] = useState(edit?.plan_currency || BASE_CUR);
  const planMonthKey = edit?.month || month;
  const [items,   setItems]   = useState(() => {
    if (edit?.items?.length) return edit.items.map(it => ({ id: it.id || newId(), label: it.label || "", amount: it.amount != null ? String(it.amount) : "", day: dayOf(it.date), done: it.done || false }));
    if (edit?.plan) return [{ id: newId(), label: "", amount: String(edit.plan), day: "", done: false }];
    return [{ id: newId(), label: "", amount: "", day: "", done: false }];
  });
  const [showCur, setShowCur] = useState(false);
  const [errors,  setErrors]  = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveRef = useRef(null);
  const deleteRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить план" });
  const { save: execDelete, saving: deleting, saveError: deleteError } = useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить план" });

  if (showCur) return <CurrencyPage value={planCur} onSelect={v => { setPlanCur(v); setShowCur(false); }} onBack={() => setShowCur(false)}/>;

  const savingsAccounts = getSavedOrder(accounts).filter(a => SAVINGS_PURPOSES.includes(a.purpose));

  const switchType = (v) => { setType(v); setCatId(""); setAccId(""); setErrors({}); };

  const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const setItem = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  const addItem = () => setItems(prev => [...prev, { id: newId(), label: "", amount: "", day: "", done: false }]);
  const delItem = (id) => setItems(prev => prev.length === 1 ? prev : prev.filter(it => it.id !== id));

  // День статьи (опционально) → полная дата в границах месяца плана, зажатая по факт. числу
  // дней в месяце (как day у recurring/loans) — год/месяц берутся из planMonthKey, не вводятся.
  const dateFromDay = (day) => {
    const n = parseInt(day, 10);
    if (!n) return null;
    const [y, mo] = planMonthKey.split("-").map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    return `${planMonthKey}-${pad(Math.min(n, daysInMonth))}`;
  };

  saveRef.current = async () => {
    // done не редактируется в этой форме (нет поля) — просто переносится как было, чтобы правка
    // плана (название/сумма/день) не сбрасывала отметку "уже зафиксировано", поставленную с ленты
    // "Денежный поток" (CashflowPage.markPlanItemDone).
    const cleanItems = items
      .map(it => ({ id: it.id, label: it.label.trim(), amount: parseFloat(it.amount) || 0, date: type === "savings" ? null : dateFromDay(it.day), done: it.done || false }))
      .filter(it => it.amount > 0);
    const p = {
      id:            edit?.id || newId(),
      cat_id:        type !== "savings" ? catId : null,
      acc_id:        type === "savings" ? accId : null,
      type,
      plan:          cleanItems.reduce((s, it) => s + it.amount, 0),
      plan_currency: planCur,
      month:         planMonthKey,
      items:         cleanItems,
    };
    await supaUpsert("month_plans", p);
    onBack(true);
  };

  deleteRef.current = async () => {
    await supa.delete("month_plans", `id=eq.${edit.id}`);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (type === "savings" && !accId) errs.acc = "Выберите счёт";
    if (type !== "savings" && !catId)  errs.cat = "Выберите категорию";
    const cleanItems = items
      .map(it => ({ id: it.id, label: it.label.trim(), amount: parseFloat(it.amount) || 0 }))
      .filter(it => it.amount > 0);
    if (!cleanItems.length) errs.items = "Добавьте хотя бы одну статью с суммой";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  const inputBox = { background:"rgba(255,255,255,0.04)", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать план" : "Добавить план"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        {/* Type tabs */}
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:20 }}>
          {[["expense","Расходы"],["income","Доходы"],["savings","Накопления"]].map(([v,l]) => (
            <button key={v} onClick={() => switchType(v)} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:type===v?C.monCard2:"transparent", color:type===v?C.green:C.dim }}>
              {l}
            </button>
          ))}
        </div>

        {/* Plan items */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <FieldLabel error={errors.items}>Статьи плана</FieldLabel>
          <button onClick={() => setShowCur(true)} style={{ background:"none", border:"none", color:C.green, fontSize:15, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
            {planCur} ▾
          </button>
        </div>
        {items.map(it => (
          <div key={it.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <input value={it.label} onChange={e => setItem(it.id, { label:e.target.value })} placeholder={type === "savings" ? "Цель (напр. резервный фонд)" : "Статья (напр. продукты)"} style={{ ...inputBox, flex:1, minWidth:0 }}/>
            <NumInput value={it.amount} onChange={v => { setItem(it.id, { amount:v }); setErrors(p => ({...p, items:""})); }} placeholder="0" style={{ ...inputBox, width:96, fontWeight:600, textAlign:"right" }}/>
            {type !== "savings" && (
              <input
                type="number" min="1" max="31" value={it.day}
                onChange={e => setItem(it.id, { day:e.target.value })}
                placeholder="День"
                title="День платежа (опционально) — статья появится на ленте «Денежный поток»"
                style={{ ...inputBox, width:52, textAlign:"center" }}
              />
            )}
            <button onClick={() => delItem(it.id)} disabled={items.length===1} style={{ background:"none", border:"none", cursor:items.length===1?"default":"pointer", padding:4, display:"flex", opacity:items.length===1?0.3:1 }}>
              <Ico n="x" s={16} c="rgba(244,67,54,0.6)"/>
            </button>
          </div>
        ))}
        {type !== "savings" && (
          <p style={{ margin:"-4px 0 8px", fontSize:11, color:C.dim }}>«День» — опционально, число месяца плана. Если указано, статья появится на ленте «Денежный поток».</p>
        )}
        {errors.items && <p style={{ color:C.red, fontSize:12, marginBottom:8 }}>{errors.items}</p>}
        <button onClick={addItem} style={{ width:"100%", padding:"10px", borderRadius:10, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:12 }}>+ Добавить статью</button>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px", borderRadius:10, background:"rgba(255,255,255,0.04)", marginBottom:24 }}>
          <span style={{ fontSize:13, color:C.dim }}>Итого</span>
          <span style={{ fontSize:18, fontWeight:700, color:"#fff" }}>{getSym(planCur)}{fmtAmtAuto(total)}</span>
        </div>

        {/* Category picker (expense / income) */}
        {type !== "savings" && (
          <>
            <FieldLabel error={errors.cat}>Категория</FieldLabel>
            <div style={{ marginBottom:24 }}>
              <CategoryPicker cats={type === "expense" ? expCats : incCats} value={catId} onChange={id => { setCatId(id); setErrors(p => ({...p, cat:""})); }} cols="repeat(4,1fr)"/>
            </div>
          </>
        )}

        {/* Account picker (savings) */}
        {type === "savings" && (
          <>
            <FieldLabel error={errors.acc}>Счёт</FieldLabel>
            {savingsAccounts.length === 0 && (
              <p style={{ color:C.dim, fontSize:13, marginBottom:24 }}>Нет накопительных счетов. Укажите назначение счёта в настройках.</p>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:24 }}>
              {savingsAccounts.map(a => {
                const sel = accId === a.id;
                return (
                  <button key={a.id} onClick={() => { setAccId(a.id); setErrors(p => ({...p, acc:""})); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:12, background:sel?"rgba(76,175,80,0.12)":"rgba(255,255,255,0.04)", border:`1px solid ${sel?"rgba(76,175,80,0.4)":C.border}`, cursor:"pointer" }}>
                    <CatIcon k={a.icon} size={36} color={a.color}/>
                    <div style={{ flex:1, textAlign:"left" }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:600, color:"#fff" }}>{a.name}</p>
                      <p style={{ margin:0, fontSize:11, color:C.dim }}>{a.purpose} · {a.currency}</p>
                    </div>
                    {sel && <Ico n="check" s={18} c={C.green}/>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {saveError && <p style={{ color:C.red, fontSize:13, marginBottom:12 }}>{saveError}</p>}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:saving?"default":"pointer", opacity:saving?0.6:1 }}>
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        {edit && (
          <>
            {deleteError && <p style={{ color:C.red, fontSize:13, marginTop:8 }}>{deleteError}</p>}
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer", opacity:deleting?0.6:1 }}
            >
              Удалить
            </button>
          </>
        )}
      </div>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); execDelete(); }}
        title="Удалить статью плана?"
        message="Эта статья бюджетного плана будет удалена безвозвратно."
        confirmLabel="Удалить"
      />
    </div>
  );
}
