import { useState } from "react";
import { C } from "../../../constants/theme";
import { todayStr } from "../../../utils/date";
import { avgRateFn } from "../../../utils/format";
import { supa, supaUpsert } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { AccSelect } from "../../../components/AccSelect";

export function TransferPageMon({ accounts, onBack }) {
  const [fromId, setFromId] = useState(accounts[0]?.id || "");
  const [toId, setToId] = useState(accounts[1]?.id || "");
  const [amt, setAmt] = useState("");
  const [toAmt, setToAmt] = useState("");
  const [rate, setRate] = useState("");
  const [fee, setFee] = useState("");
  const [date] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);
  const diffCur = fromAcc?.currency !== toAcc?.currency;

  const save = async () => {
    if (!amt || fromId === toId) return;
    setSaving(true);
    const tr = { id: crypto.randomUUID(), from_id:fromId, to_id:toId, amount:parseFloat(amt), from_currency:fromAcc?.currency, to_amt:diffCur?(parseFloat(toAmt)||0):parseFloat(amt), to_currency:toAcc?.currency, rate:parseFloat(rate)||null, fee:parseFloat(fee)||0, date, note };
    try {
      await supaUpsert("transfers", tr);
      const newFromBal = fromAcc.balance - parseFloat(amt) - (parseFloat(fee)||0);
      const newToBal = toAcc.balance + (diffCur ? (parseFloat(toAmt)||0) : parseFloat(amt));
      await supa.update("accounts", { balance: newFromBal }, `id=eq.${fromId}`);
      let toUpdate = { balance: newToBal };
      if (diffCur && rate) {
        const oldRate = toAcc.avg_rate || parseFloat(rate);
        const newAvg = Math.round(avgRateFn(toAcc.balance, oldRate, parseFloat(toAmt)||0, parseFloat(rate))*100)/100;
        toUpdate.avg_rate = newAvg;
      }
      await supa.update("accounts", toUpdate, `id=eq.${toId}`);
      onBack(true);
    } catch(e) { console.error(e); setSaving(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Create transfer</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 80px" }}>
        <AccSelect accounts={accounts} value={fromId} onChange={setFromId} label="Transfer from"/>
        <AccSelect accounts={accounts} value={toId} onChange={setToId} label="Transfer to"/>
        <FieldLabel>Amount ({fromAcc?.currency||""})</FieldLabel>
        <div style={{ borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
          <input value={amt} onChange={e => setAmt(e.target.value)} type="number" placeholder="0" style={{ width:"100%", background:"none", border:"none", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
        </div>
        {diffCur && <>
          <FieldLabel>Receive ({toAcc?.currency||""})</FieldLabel>
          <div style={{ borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
            <input value={toAmt} onChange={e => setToAmt(e.target.value)} type="number" placeholder="0" style={{ width:"100%", background:"none", border:"none", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
          </div>
          <FieldLabel>Exchange rate</FieldLabel>
          <input value={rate} onChange={e => setRate(e.target.value)} type="number" placeholder="e.g. 480" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}/>
        </>}
        <FieldLabel>Commission fee</FieldLabel>
        <input value={fee} onChange={e => setFee(e.target.value)} type="number" placeholder="0" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}/>
        <FieldLabel>Comment</FieldLabel>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Comment" style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:15, padding:"4px 0", marginBottom:24, boxSizing:"border-box" }}/>
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>{saving?"Saving...":"Add transfer"}</button>
      </div>
    </div>
  );
}
