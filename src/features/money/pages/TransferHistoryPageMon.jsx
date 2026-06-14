import { useState, useEffect } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { fmtM } from "../../../utils/format";
import { getSavedOrder } from "../../../utils/accountOrder";
import { localDate } from "../../../utils/date";
import { supa, supabase } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";

const MONTHS   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_S = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtGroupDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTHS[m-1]} ${d}, ${y}`;
}

function getPeriodFilter(period, offset, now) {
  if (period === "day") {
    const d = new Date(now); d.setDate(d.getDate() + offset);
    const str = localDate(d);
    const label = offset === 0 ? "Today" : offset === -1 ? "Yesterday" : str;
    return { fn: t => localDate(t.created_at) === str, label };
  }
  if (period === "week") {
    const mon = new Date(now);
    const dow = mon.getDay() || 7;
    mon.setDate(mon.getDate() - dow + 1 + offset * 7);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
    const fmt = d => `${d.getDate()} ${MONTHS_S[d.getMonth()]}`;
    return { fn: t => { const d = new Date(t.created_at); return d >= mon && d <= sun; }, label: `${fmt(mon)} – ${fmt(sun)}` };
  }
  if (period === "month") {
    const total = now.getFullYear() * 12 + now.getMonth() + offset;
    const y = Math.floor(total / 12);
    const m = total % 12;
    return { fn: t => { const d = new Date(t.created_at); return d.getFullYear() === y && d.getMonth() === m; }, label: `${MONTHS[m]} ${y}` };
  }
  if (period === "year") {
    const y = now.getFullYear() + offset;
    return { fn: t => new Date(t.created_at).getFullYear() === y, label: String(y) };
  }
  return { fn: () => true, label: "All time" };
}

const ArrowDown = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 15l7 7 7-7"/>
  </svg>
);

export function TransferHistoryPageMon({ transfers, accounts, navigate, onBack }) {
  const [period,        setPeriod]        = useState("month");
  const [periodOffset,  setPeriodOffset]  = useState(0);
  const [selAccIds,     setSelAccIds]     = useState(new Set());
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [detailT,       setDetailT]       = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const now = new Date();
  const orderedAccounts = getSavedOrder(accounts);

  useEffect(() => {
    if (!detailT) return;
    const fresh = transfers.find(t => t.id === detailT.id);
    if (!fresh) setDetailT(null);
    else setDetailT(fresh);
  }, [transfers]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAcc = (id) => setSelAccIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const { fn: periodFn, label: periodLabel } = getPeriodFilter(period, periodOffset, now);

  const filtered = transfers
    .filter(periodFn)
    .filter(t => selAccIds.size === 0 || selAccIds.has(t.from_id) || selAccIds.has(t.to_id));

  const changePeriod = (p) => { setPeriod(p); setPeriodOffset(0); };

  const cancelTransfer = async (t) => {
    const from = accounts.find(a => a.id === t.from_id);
    const to   = accounts.find(a => a.id === t.to_id);
    try {
      await supa.delete("transfers", `id=eq.${t.id}`);
      if (t.fee > 0) {
        const { data: feeTxs } = await supabase.from("transactions").select("id")
          .eq("account_id", t.from_id).eq("amount", t.fee).eq("date", localDate(t.created_at))
          .eq("type", "expense").eq("note", "Комиссия за перевод");
        if (feeTxs?.length > 0)
          await supabase.from("transactions").delete().eq("id", feeTxs[0].id);
      }
      if (from)
        await supa.update("accounts", { balance: from.balance + t.amount + (t.fee||0) }, `id=eq.${from.id}`);
      if (to) {
        const toAmt   = t.to_amt || t.amount;
        const prevBal = to.balance - toAmt;
        const patch   = { balance: prevBal };
        if (t.rate && to.avg_rate) {
          patch.avg_rate = prevBal > 0
            ? Math.round((to.avg_rate * to.balance - toAmt * t.rate) / prevBal * 100) / 100
            : null;
        }
        await supa.update("accounts", patch, `id=eq.${to.id}`);
      }
      setConfirmCancel(false);
      onBack();
    } catch(e) { console.error(e); }
  };

  // ── DETAIL VIEW ─────────────────────────────────────────────────────────────
  if (detailT) {
    const t      = transfers.find(tr => tr.id === detailT.id) ?? detailT;

    const lbl = (text) => (
      <p style={{ margin:"0 0 8px", fontSize:12, color:C.dim, fontWeight:500 }}>{text}</p>
    );
    const accRow = (acc) => (
      <div style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(255,255,255,0.05)", padding:"12px 14px", borderRadius:12, marginBottom:20 }}>
        {acc
          ? <CatIcon k={acc.icon} size={36} color={acc.color}/>
          : <div style={{ width:36, height:36, borderRadius:18, background:"rgba(255,255,255,0.06)" }}/>
        }
        <span style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{acc?.name ?? "—"}</span>
      </div>
    );

    // Balance adjustment — read-only view
    if (t.is_adjustment) {
      const adjAcc = accounts.find(a => a.id === t.from_id);
      const delta  = t.to_amt ?? t.amount;
      const isPos  = delta >= 0;
      return (
        <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
          <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => setDetailT(null)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
            <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Balance adjustment</span>
            <div style={{ width:30 }}/>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"20px 16px 40px" }}>
            {lbl("Account")}
            {accRow(adjAcc)}
            {lbl("Amount")}
            <p style={{ margin:"0 0 20px", fontSize:26, fontWeight:700, color: isPos ? "#34d399" : "#f87171" }}>
              {isPos ? "+" : "−"}{fmtM(Math.abs(delta), t.from_currency)}
            </p>
            {lbl("Date")}
            <p style={{ margin:0, fontSize:16, fontWeight:600, color:"#fff" }}>{fmtGroupDate(localDate(t.created_at))}</p>
          </div>
        </div>
      );
    }

    const from   = accounts.find(a => a.id === t.from_id);
    const to     = accounts.find(a => a.id === t.to_id);
    const toAmt  = t.to_amt ?? t.amount;
    const toCur  = t.to_currency || t.from_currency;
    const diffCur = t.from_currency !== toCur;
    const foreignCur = t.from_currency !== BASE_CUR ? t.from_currency : toCur;

    return (
      <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => { setDetailT(null); setConfirmCancel(false); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
          <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Transfer</span>
          <button onClick={() => navigate("editTransfer", t)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}><Ico n="edit" s={20} c={C.green}/></button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"20px 16px 100px" }}>
          {lbl("Transfer from account")}
          {accRow(from)}

          {lbl("Transfer to account")}
          {accRow(to)}

          {lbl("Transfer amount")}
          <p style={{ margin:"0 0 4px", fontSize:22, fontWeight:700, color:"#fff" }}>{fmtM(t.amount, t.from_currency)}</p>
          {diffCur && <p style={{ margin:"0 0 20px", fontSize:14, color:C.green }}>→ {fmtM(toAmt, toCur)}</p>}
          {!diffCur && <div style={{ marginBottom:20 }}/>}

          {t.rate && <>
            {lbl("Exchange rate")}
            <p style={{ margin:"0 0 20px", fontSize:16, fontWeight:600, color:"#fff" }}>1 {foreignCur} = {t.rate} {BASE_CUR}</p>
          </>}

          {t.fee > 0 && <>
            {lbl("Commission fee")}
            <p style={{ margin:"0 0 20px", fontSize:16, fontWeight:600, color:"#fff" }}>{fmtM(t.fee, t.from_currency)}</p>
          </>}

          {t.note && <>
            {lbl("Comment")}
            <p style={{ margin:"0 0 20px", fontSize:16, fontWeight:600, color:"#fff" }}>{t.note}</p>
          </>}

          {lbl("Date")}
          <p style={{ margin:0, fontSize:16, fontWeight:600, color:"#fff" }}>{fmtGroupDate(localDate(t.created_at))}</p>
        </div>

        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px calc(16px + env(safe-area-inset-bottom, 0px))", background:C.monBg, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          {confirmCancel ? (
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => cancelTransfer(t)} style={{ flex:1, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.15)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:14, fontWeight:600, cursor:"pointer" }}>Confirm cancel</button>
              <button onClick={() => setConfirmCancel(false)} style={{ flex:1, padding:"14px", borderRadius:30, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.mid, fontSize:14, cursor:"pointer" }}>Keep</button>
            </div>
          ) : (
            <button onClick={() => setConfirmCancel(true)} style={{ width:"100%", padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.08)", border:"1px solid rgba(244,67,54,0.2)", color:"rgba(244,67,54,0.8)", fontSize:14, fontWeight:600, cursor:"pointer" }}>Cancel transfer</button>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  const selAccList = orderedAccounts.filter(a => selAccIds.has(a.id));
  const sortedFiltered = [...filtered].sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );
  const grouped = sortedFiltered.reduce((acc, t) => {
    const key = localDate(t.created_at);
    (acc[key] = acc[key] || []).push(t);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Transfer history</span>
        <div style={{ width:30 }}/>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 40px" }}>
        {/* Period tabs */}
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:8 }}>
          {[["day","Day"],["week","Week"],["month","Month"],["year","Year"],["all","All"]].map(([v,l]) => (
            <button key={v} onClick={() => changePeriod(v)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:period===v?C.monCard2:"transparent", color:period===v?C.green:C.dim }}>{l}</button>
          ))}
        </div>

        {/* Period navigation */}
        {period !== "all" && (
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
            <button onClick={() => setPeriodOffset(o => o - 1)} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 8px", display:"flex" }}>
              <Ico n="back" s={18} c={C.mid}/>
            </button>
            <span style={{ flex:1, fontSize:13, fontWeight:600, color:"#fff", textAlign:"center" }}>{periodLabel}</span>
            {periodOffset < 0 && (
              <button onClick={() => setPeriodOffset(0)} style={{ padding:"3px 10px", borderRadius:20, background:"rgba(76,175,80,0.12)", border:"1px solid rgba(76,175,80,0.3)", color:C.green, fontSize:11, fontWeight:700, cursor:"pointer" }}>Now</button>
            )}
            <button onClick={() => setPeriodOffset(o => o + 1)} disabled={periodOffset >= 0} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 8px", display:"flex", opacity:periodOffset >= 0 ? 0.2 : 1 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {/* Account filter button */}
        <button onClick={() => setPickerOpen(true)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:12, background:"rgba(255,255,255,0.04)", border:`1px solid ${selAccIds.size > 0 ? C.green : C.border}`, cursor:"pointer", marginBottom:14, boxSizing:"border-box" }}>
          {selAccIds.size === 0 ? (
            <><Ico n="filter" s={16} c={C.dim}/><span style={{ flex:1, fontSize:13, color:C.dim, textAlign:"left" }}>Filter by account</span><Ico n="chevD" s={14} c={C.dim}/></>
          ) : selAccIds.size === 1 ? (
            <><CatIcon k={selAccList[0].icon} size={24} color={selAccList[0].color}/><span style={{ flex:1, fontSize:13, color:"#fff", textAlign:"left" }}>{selAccList[0].name}</span><span onClick={e => { e.stopPropagation(); setSelAccIds(new Set()); }} style={{ fontSize:11, color:C.dim, padding:"2px 8px", borderRadius:8, background:"rgba(255,255,255,0.08)", cursor:"pointer" }}>✕ Clear</span></>
          ) : (
            <><Ico n="filter" s={16} c={C.green}/><span style={{ flex:1, fontSize:13, color:C.green, textAlign:"left" }}>{selAccIds.size} accounts</span><span onClick={e => { e.stopPropagation(); setSelAccIds(new Set()); }} style={{ fontSize:11, color:C.dim, padding:"2px 8px", borderRadius:8, background:"rgba(255,255,255,0.08)", cursor:"pointer" }}>✕ Clear</span></>
          )}
        </button>

        {filtered.length === 0 && <p style={{ textAlign:"center", padding:"40px 0", color:C.dim }}>No transfers</p>}

        {/* Grouped by date */}
        {sortedDates.map(date => (
          <div key={date}>
            <p style={{ margin:"0 0 8px", fontSize:12, fontWeight:600, color:C.dim }}>{fmtGroupDate(date)}</p>
            {grouped[date].map(t => {
              if (t.is_adjustment) {
                const adjAcc = accounts.find(a => a.id === t.from_id);
                const delta  = t.to_amt ?? t.amount;
                const isPos  = delta >= 0;
                return (
                  <div key={t.id} onClick={() => setDetailT(t)} style={{ background:C.monCard, borderRadius:14, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <div style={{ flexShrink:0, opacity:0.35 }}><Ico n="edit" s={14} c={C.mid}/></div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontSize:13, fontWeight:500, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{adjAcc?.name ?? "—"}</span>
                          <span style={{ fontSize:13, fontWeight:600, color: isPos ? "#34d399" : "#f87171", flexShrink:0, marginLeft:8 }}>
                            {isPos ? "+" : "−"}{fmtM(Math.abs(delta), t.from_currency)}
                          </span>
                        </div>
                        <span style={{ fontSize:12, color:C.dim }}>Balance adjustment</span>
                      </div>
                    </div>
                  </div>
                );
              }

              const from  = accounts.find(a => a.id === t.from_id);
              const to    = accounts.find(a => a.id === t.to_id);
              const toAmt = t.to_amt ?? t.amount;
              const toCur = t.to_currency || t.from_currency;
              const diffCur = t.from_currency !== toCur;
              return (
                <div key={t.id} onClick={() => setDetailT(t)} style={{ background:C.monCard, borderRadius:14, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ flexShrink:0, display:"flex", alignItems:"center" }}>
                      <ArrowDown/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                          <span style={{ fontSize:13, fontWeight:500, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{from?.name ?? "—"}</span>
                        </div>
                        <span style={{ fontSize:13, fontWeight:500, color:"#fff", flexShrink:0, marginLeft:8 }}>{fmtM(t.amount, t.from_currency)}</span>
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                          <span style={{ fontSize:13, color:C.mid, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{to?.name ?? "—"}</span>
                        </div>
                        {diffCur && <span style={{ fontSize:13, color:C.green, flexShrink:0, marginLeft:8 }}>{fmtM(toAmt, toCur)}</span>}
                      </div>
                    </div>
                  </div>
                  {(t.note || t.fee > 0) && (
                    <div style={{ display:"flex", gap:6, fontSize:12, color:C.dim, marginTop:4, paddingLeft:24 }}>
                      {t.note && <span style={{ flex:1, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.note}</span>}
                      {t.note && t.fee > 0 && <span>·</span>}
                      {t.fee > 0 && <span style={{ color:"#f87171", flexShrink:0 }}>{fmtM(t.fee, t.from_currency)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ marginBottom:16 }}/>
          </div>
        ))}
      </div>

      {/* Account picker bottom sheet */}
      {pickerOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:60, display:"flex", flexDirection:"column", justifyContent:"flex-end" }} onClick={() => setPickerOpen(false)}>
          <div style={{ background:C.monCard2, borderRadius:"20px 20px 0 0", padding:"16px 16px calc(32px + env(safe-area-inset-bottom, 0px))", maxHeight:"70dvh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,0.2)", margin:"0 auto 12px" }}/>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <p style={{ margin:0, fontSize:16, fontWeight:600, color:"#fff" }}>Filter by account</p>
              <button onClick={() => setPickerOpen(false)} style={{ padding:"6px 14px", borderRadius:20, background:C.green, border:"none", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>Done</button>
            </div>
            <div onClick={() => { setSelAccIds(new Set()); setPickerOpen(false); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:selAccIds.size===0?"rgba(76,175,80,0.1)":"rgba(255,255,255,0.03)", border:`1px solid ${selAccIds.size===0?"rgba(76,175,80,0.4)":C.border}` }}>
              <div style={{ width:40, height:40, borderRadius:20, background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n="filter" s={18} c={C.dim}/></div>
              <span style={{ flex:1, fontSize:14, color:"#fff" }}>All accounts</span>
              {selAccIds.size === 0 && <Ico n="check" s={18} c={C.green}/>}
            </div>
            {orderedAccounts.map(a => {
              const sel = selAccIds.has(a.id);
              return (
                <div key={a.id} onClick={() => toggleAcc(a.id)} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:sel?"rgba(76,175,80,0.1)":"rgba(255,255,255,0.03)", border:`1px solid ${sel?"rgba(76,175,80,0.4)":C.border}` }}>
                  <CatIcon k={a.icon} size={40} color={a.color}/>
                  <span style={{ flex:1, fontSize:14, color:"#fff" }}>{a.name}</span>
                  {sel && <Ico n="check" s={18} c={C.green}/>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
