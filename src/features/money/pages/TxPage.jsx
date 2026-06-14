import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { todayStr, addDays } from "../../../utils/date";
import { supaRpc } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { CatIcon } from "../../../components/CatIcon";
import { CurrencyPage } from "../../../components/CurrencyPage";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { AccSelect } from "../../../components/AccSelect";

export function TxPage({ accounts, expCats, incCats, onBack, edit }) {
  const [type, setType] = useState(edit?.type || "expense");
  const [amt, setAmt] = useState(edit?.amount ? String(edit.amount) : "");
  const [cur, setCur] = useState(edit?.currency || BASE_CUR);
  const [cat, setCat] = useState(edit?.category_id || "");
  const [accId, setAccId] = useState(edit?.account_id || "");
  const [date, setDate] = useState(edit?.date || todayStr());
  const [note, setNote] = useState(edit?.note || "");
  const [showCur, setShowCur] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const cats = type === "expense" ? expCats : incCats;

  if (edit?.note === "Balance adjustment") {
    return (
      <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"#fff", display:"flex" }}><Ico n="back" s={22}/></button>
          <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff", textAlign:"center", marginRight:34 }}>Balance Adjustment</span>
        </div>
        <div style={{ flex:1, padding:"24px 16px" }}>
          <div style={{ background:C.monCard, borderRadius:16, padding:"20px 18px", marginBottom:16 }}>
            <p style={{ margin:"0 0 16px", fontSize:13, color:C.dim }}>This record was created automatically when the account balance was changed manually.</p>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontSize:14, color:C.dim }}>Change</span>
              <span style={{ fontSize:20, fontWeight:700, color: edit.type === "income" ? C.green : "#f87171" }}>
                {edit.type === "income" ? "+" : "−"}{edit.amount.toLocaleString("ru-RU")} {edit.currency}
              </span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontSize:14, color:C.dim }}>Date</span>
              <span style={{ fontSize:14, color:"#fff" }}>{edit.date}</span>
            </div>
            <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"12px 0" }}/>
            <p style={{ margin:0, fontSize:12, color:C.dim, textAlign:"center" }}>Cannot be edited or deleted</p>
          </div>
        </div>
      </div>
    );
  }

  if (showCur) return <CurrencyPage value={cur} onSelect={v => { setCur(v); setShowCur(false); }} onBack={() => setShowCur(false)}/>;

  const today = todayStr();
  const dateShorts = [
    {key:today, label:`${new Date().getMonth()+1}/${new Date().getDate()}`, sub:"today"},
    {key:addDays(today,-1), label:`${new Date(addDays(today,-1)).getMonth()+1}/${new Date(addDays(today,-1)).getDate()}`, sub:"yesterday"},
    {key:addDays(today,-2), label:`${new Date(addDays(today,-2)).getMonth()+1}/${new Date(addDays(today,-2)).getDate()}`, sub:"2 days ago"},
    {key:addDays(today,-3), label:`${new Date(addDays(today,-3)).getMonth()+1}/${new Date(addDays(today,-3)).getDate()}`, sub:"3 days ago"},
  ];

  const save = async () => {
    const e = {};
    if (!amt || parseFloat(amt) <= 0) e.amt = "Enter amount";
    if (!cat) e.cat = "Select category";
    if (!accId) e.acc = "Select account";
    setErrors(e); if (Object.keys(e).length > 0) return;
    setSaving(true);
    const acc = accounts.find(a => a.id === accId);
    const delta = type === "income" ? parseFloat(amt) : -parseFloat(amt);
    const tx = { id: edit?.id || crypto.randomUUID(), type, amount: parseFloat(amt), currency: cur, category_id: cat, account_id: accId, date, note };
    // Новый баланс: при редактировании сначала откатываем старую дельту, затем применяем новую.
    const oldDelta = edit ? (edit.type === "income" ? -edit.amount : edit.amount) : 0;
    const newBal = acc.balance + oldDelta + delta;
    try {
      await supaRpc("save_tx", { p_tx: tx, p_account_id: accId, p_new_balance: newBal });
      onBack(true);
    } catch(e) { console.error(e); setSaving(false); }
  };

  const del = async () => {
    if (!edit) return;
    const acc = accounts.find(a => a.id === edit.account_id);
    const delta = edit.type === "income" ? -edit.amount : edit.amount;
    try {
      await supaRpc("delete_tx", {
        p_id: edit.id,
        p_account_id: acc ? acc.id : null,
        p_new_balance: acc ? acc.balance + delta : null,
      });
      onBack(true);
    } catch(e) { console.error(e); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader }}>
        <div style={{ display:"flex", alignItems:"center", padding:"14px 16px 0" }}>
          <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"#fff", marginRight:12, display:"flex" }}><Ico n="back" s={22}/></button>
          <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff", textAlign:"center", marginRight:34 }}>{edit?"Edit Transaction":"Add Transaction"}</span>
        </div>
        <div style={{ display:"flex", marginTop:12 }}>
          {[["expense","EXPENSES"],["income","INCOME"]].map(([v,l]) => (
            <button key={v} onClick={() => { setType(v); setCat(""); }} style={{ flex:1, padding:"12px 0", background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, color:type===v?"#fff":C.dim, borderBottom:type===v?"2px solid #fff":"2px solid transparent" }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"0 16px 80px" }}>
        <div style={{ textAlign:"center", padding:"24px 24px 16px" }}>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:16 }}>
            <input value={amt} onChange={e => { setAmt(e.target.value); setErrors(p => ({...p, amt:""})); }} type="number" placeholder="0" style={{ background:"none", border:"none", outline:"none", color:errors.amt?C.red:"#fff", fontSize:38, fontWeight:700, textAlign:"center", width:"min(180px, 50%)" }}/>
            <button onClick={() => setShowCur(true)} style={{ background:"none", border:"none", color:C.green, fontSize:22, fontWeight:700, cursor:"pointer" }}>{cur}</button>
          </div>
          <div style={{ height:1, background:errors.amt?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.15)", margin:"8px 40px 0" }}/>
          {errors.amt && <p style={{ color:C.red, fontSize:12, marginTop:4 }}>{errors.amt}</p>}
        </div>
        <div style={{ marginBottom:4 }}>
          <AccSelect accounts={accounts} value={accId} onChange={v => { setAccId(v); const a=accounts.find(ac=>ac.id===v); if(a) setCur(a.currency); }} error={errors.acc} label="Account"/>
        </div>
        <div style={{ marginBottom:16 }}>
          <FieldLabel error={errors.cat}>Categories</FieldLabel>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(64px, 1fr))", gap:10 }}>
            {cats.map(c => { const sel = cat === c.id; return (
              <button key={c.id} onClick={() => { setCat(c.id); setErrors(p => ({...p, cat:""})); }} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, padding:"10px 4px", borderRadius:12, background:sel?c.color:"transparent", border:"none", cursor:"pointer" }}>
                <CatIcon k={c.icon} size={44} color={sel?"rgba(0,0,0,0.25)":c.color}/>
                <span style={{ fontSize:11, color:sel?"#fff":C.mid, textAlign:"center", wordBreak:"break-word" }}>{c.name}</span>
              </button>
            ); })}
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <FieldLabel>Date</FieldLabel>
          <div style={{ display:"flex", alignItems:"center", gap:8, overflowX:"auto", paddingBottom:4 }}>
            {dateShorts.map(ds => (
              <button key={ds.key} onClick={() => setDate(ds.key)} style={{ flexShrink:0, padding:"10px 12px", borderRadius:10, cursor:"pointer", background:date===ds.key?C.green:"transparent", border:"none", textAlign:"center", minWidth:60 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:date===ds.key?"#fff":C.mid }}>{ds.label}</p>
                <p style={{ margin:0, fontSize:11, color:date===ds.key?"rgba(255,255,255,0.8)":C.dim }}>{ds.sub}</p>
              </button>
            ))}
            <button onClick={() => setShowCal(true)} style={{ flexShrink:0, background:"none", border:"none", cursor:"pointer", padding:"0 8px", display:"flex" }}><Ico n="clock" s={22} c={C.dim}/></button>
          </div>
        </div>
        <div style={{ marginBottom:24 }}>
          <FieldLabel>Comment</FieldLabel>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Comment" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:15, padding:"4px 0", boxSizing:"border-box" }}/>
        </div>
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>{saving?"Saving...":"Save"}</button>
        {edit && <button onClick={del} style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}>Delete transaction</button>}
      </div>
      {showCal && <CalendarPicker mode="single" value={date} onChange={v => { setDate(v); setShowCal(false); }} onClose={() => setShowCal(false)}/>}
    </div>
  );
}
