import { useState } from "react";
import { C } from "../../../constants/theme";
import { todayStr } from "../../../utils/date";
import { fmtM } from "../../../utils/format";
import { supa } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";

export function TransferHistoryPageMon({ transfers, accounts, onBack }) {
  const [period, setPeriod] = useState("month");
  const [confirmCancel, setConfirmCancel] = useState(null);
  const now = new Date();

  const filtered = transfers.filter(t => {
    const d = new Date(t.date);
    if (period === "day") return t.date === todayStr();
    if (period === "week") { const w = new Date(); w.setDate(w.getDate()-7); return d >= w; }
    if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === "year") return d.getFullYear() === now.getFullYear();
    return true;
  });

  const cancelTransfer = async (t) => {
    const from = accounts.find(a => a.id === t.from_id);
    const to = accounts.find(a => a.id === t.to_id);
    try {
      await supa.delete("transfers", `id=eq.${t.id}`);
      if (from) await supa.update("accounts", { balance: from.balance + t.amount + (t.fee||0) }, `id=eq.${from.id}`);
      if (to) await supa.update("accounts", { balance: to.balance - (t.to_amt||t.amount) }, `id=eq.${to.id}`);
      setConfirmCancel(null);
      onBack();
    } catch(e) { console.error(e); }
  };

  return (
    <div style={{ minHeight:"100vh", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Transfer history</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 40px" }}>
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:16 }}>
          {[["day","Day"],["week","Week"],["month","Month"],["year","Year"],["all","All"]].map(([v,l]) => (
            <button key={v} onClick={() => setPeriod(v)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:period===v?C.monCard2:"transparent", color:period===v?C.green:C.dim }}>{l}</button>
          ))}
        </div>
        {filtered.length === 0 && <p style={{ textAlign:"center", padding:"40px 0", color:C.dim }}>No transfers</p>}
        {filtered.sort((a,b) => b.date.localeCompare(a.date)).map(t => {
          const from = accounts.find(a => a.id === t.from_id);
          const to = accounts.find(a => a.id === t.to_id);
          return (
            <div key={t.id} style={{ background:C.monCard, borderRadius:14, padding:"14px", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:14, fontWeight:500, color:C.main }}>{from?.name} → {to?.name}</span>
                <span style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{fmtM(t.amount, t.from_currency)}</span>
              </div>
              <div style={{ display:"flex", gap:12, fontSize:12, color:C.dim, marginBottom:8 }}>
                <span>{t.date}</span>
                {t.rate && <span>Rate: {t.rate}</span>}
                {t.fee > 0 && <span style={{ color:"#f87171" }}>Fee: {fmtM(t.fee, t.from_currency)}</span>}
              </div>
              {confirmCancel === t.id ? (
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => cancelTransfer(t)} style={{ flex:1, padding:"8px", borderRadius:10, background:"rgba(244,67,54,0.15)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:13, fontWeight:600, cursor:"pointer" }}>Confirm cancel</button>
                  <button onClick={() => setConfirmCancel(null)} style={{ flex:1, padding:"8px", borderRadius:10, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.mid, fontSize:13, cursor:"pointer" }}>Keep</button>
                </div>
              ) : (
                <button onClick={() => setConfirmCancel(t.id)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:20, background:"rgba(244,67,54,0.08)", border:"1px solid rgba(244,67,54,0.2)", color:"rgba(244,67,54,0.7)", fontSize:12, cursor:"pointer" }}>
                  <Ico n="undo" s={14} c="rgba(244,67,54,0.7)"/>Cancel transfer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
