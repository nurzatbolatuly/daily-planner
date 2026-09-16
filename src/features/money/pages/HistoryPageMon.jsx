import { useState, useEffect, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { SAVINGS_PURPOSES, BALANCE_ADJUSTMENT_NOTE, FEE_TX_NOTE } from "../../../constants/money";
import { fmtM, fmtAmt, fmtAmtAuto, getSym, isCommodity, round2, avgRateFn } from "../../../utils/format";
import { getSavedOrder } from "../../../utils/accountOrder";
import { localDate } from "../../../utils/date";
import { supabase, supaRpc } from "../../../lib/supabase";
import { RU_MON_GEN, RU_MONTHS_S } from "../../../constants/locale";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { BottomSheet } from "../../../components/BottomSheet";

function fmtGroupDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${RU_MON_GEN[m-1]} ${y}`;
}

// Период считаем по уже нормализованному entry.date (YYYY-MM-DD) — транзакции и переводы
// приводятся к нему заранее (см. entries ниже), т.к. у переводов своя дата в created_at.
function getPeriodFilter(period, offset, now) {
  if (period === "day") {
    const d = new Date(now); d.setDate(d.getDate() + offset);
    const str = localDate(d);
    const label = offset === 0 ? "Сегодня" : offset === -1 ? "Вчера" : str;
    return { fn: e => e.date === str, label };
  }
  if (period === "week") {
    const mon = new Date(now);
    const dow = mon.getDay() || 7;
    mon.setDate(mon.getDate() - dow + 1 + offset * 7);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
    const fmt = d => `${d.getDate()} ${RU_MONTHS_S[d.getMonth()]}`;
    return { fn: e => { const d = new Date(e.date); return d >= mon && d <= sun; }, label: `${fmt(mon)} – ${fmt(sun)}` };
  }
  if (period === "month") {
    const total = now.getFullYear() * 12 + now.getMonth() + offset;
    const y = Math.floor(total / 12);
    const m = total % 12;
    return { fn: e => { const d = new Date(e.date); return d.getFullYear() === y && d.getMonth() === m; }, label: `${RU_MON_GEN[m]} ${y}` };
  }
  if (period === "year") {
    const y = now.getFullYear() + offset;
    return { fn: e => new Date(e.date).getFullYear() === y, label: String(y) };
  }
  return { fn: () => true, label: "Всё время" };
}

const OP_TYPES = [["all", "Всё"], ["expense", "Расходы"], ["income", "Доходы"], ["transfer", "Переводы"]];

const ArrowDown = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 15l7 7 7-7"/>
  </svg>
);

// Баннер аналитики сделки из сохранённого снимка (transfer.analytics)
function StoredDealBanner({ analytics, fromCurrency, toCurrency }) {
  if (!analytics) return null;
  const { has_sell, has_buy, from_avg_rate, implied_sell_rate, sell_pnl,
          implied_buy_rate, to_avg_before, new_to_avg_rate,
          to_balance_before, to_amount_added } = analytics;
  if (!has_sell && !has_buy) return null;

  const displayNewAvg = (has_buy && to_balance_before != null && to_amount_added != null && implied_buy_rate != null)
    ? Math.round(avgRateFn(to_balance_before, (to_avg_before || 0) > 0 ? to_avg_before : implied_buy_rate, to_amount_added, implied_buy_rate) * 100) / 100
    : new_to_avg_rate;

  const fromSym  = getSym(fromCurrency);
  const toSym    = getSym(toCurrency);
  const fromIsCom = isCommodity(fromCurrency);
  const toIsCom   = isCommodity(toCurrency);

  const sellDiff   = has_sell ? implied_sell_rate - from_avg_rate : 0;
  const sellPct    = has_sell && from_avg_rate > 0 ? (sellDiff / from_avg_rate * 100) : 0;
  const sellProfit = sellDiff >= 0;
  const sellColor  = sellProfit ? C.green : C.red;
  const sellBg     = sellProfit ? "rgba(76,175,80,0.10)" : "rgba(244,67,54,0.10)";
  const sellBorder = sellProfit ? "rgba(76,175,80,0.30)" : "rgba(244,67,54,0.30)";

  const hasRefComp = (to_avg_before || 0) > 0;
  const buyDiff    = hasRefComp ? implied_buy_rate - to_avg_before : 0;
  const buyPct     = hasRefComp && to_avg_before > 0 ? (buyDiff / to_avg_before * 100) : 0;
  const buyBetter  = buyDiff < 0;
  const buyNeutral = !hasRefComp || Math.abs(buyPct) < 0.5;
  const buyColor   = buyNeutral ? C.mid : (buyBetter ? C.green : C.red);
  const buyBg      = buyNeutral ? "rgba(255,255,255,0.04)" : (buyBetter ? "rgba(76,175,80,0.07)" : "rgba(244,67,54,0.07)");
  const buyBorder  = buyNeutral ? "rgba(255,255,255,0.10)" : (buyBetter ? "rgba(76,175,80,0.20)" : "rgba(244,67,54,0.20)");

  return (
    <div style={{ marginBottom:20 }}>
      {has_sell && (
        <div style={{ background:sellBg, border:`1px solid ${sellBorder}`, borderRadius: has_buy ? "14px 14px 0 0" : 14, padding:"12px 14px" }}>
          <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:700, color:C.dim, textTransform:"uppercase", letterSpacing:0.8 }}>
            {fromIsCom ? "Продажа металла" : `Продажа ${fromCurrency}`}
          </p>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ fontSize:12, color:C.dim }}>Средняя покупки</span>
            <span style={{ fontSize:12, color:C.mid }}>{fmtAmt(from_avg_rate)} ₸/{fromSym}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, color:C.dim }}>Цена продажи</span>
            <span style={{ fontSize:12, color:C.mid }}>{fmtAmt(implied_sell_rate)} ₸/{fromSym}</span>
          </div>
          <div style={{ height:1, background:"rgba(255,255,255,0.08)", marginBottom:8 }}/>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:600, color:sellColor }}>
              {sellProfit ? "Прибыль" : "Убыток"} {sellProfit ? "+" : ""}{fmtAmt(sellDiff)} ₸/{fromSym} ({sellPct >= 0 ? "+" : ""}{fmtAmt(Math.abs(sellPct), 1)}%)
            </span>
            <span style={{ fontSize:14, fontWeight:700, color:sellColor }}>
              {sellProfit ? "+" : "-"}{fmtAmtAuto(Math.abs(sell_pnl))} ₸
            </span>
          </div>
        </div>
      )}
      {has_buy && (
        <div style={{ background:buyBg, border:`1px solid ${buyBorder}`, borderTop: has_sell ? "none" : undefined, borderRadius: has_sell ? "0 0 14px 14px" : 14, padding:"12px 14px" }}>
          <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:700, color:C.dim, textTransform:"uppercase", letterSpacing:0.8 }}>
            {toIsCom ? "Покупка металла" : `Покупка ${toCurrency}`}
          </p>
          {hasRefComp && (
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontSize:12, color:C.dim }}>Ср. цена до</span>
              <span style={{ fontSize:12, color:C.mid }}>{fmtAmt(to_avg_before)} ₸/{toSym}</span>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, color:C.dim }}>Цена входа</span>
            <span style={{ fontSize:12, color:C.mid }}>{fmtAmt(implied_buy_rate)} ₸/{toSym}</span>
          </div>
          <div style={{ height:1, background:"rgba(255,255,255,0.08)", marginBottom:8 }}/>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, color:C.dim }}>Новая средняя</span>
            <span style={{ fontSize:13, fontWeight:700, color:buyColor }}>
              {fmtAmt(displayNewAvg)} ₸/{toSym}
              {!buyNeutral && <> ({buyPct >= 0 ? "+" : ""}{fmtAmt(Math.abs(buyPct), 1)}%)</>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Долг самому себе (снятие с накопительного счёта), определяется по сторонам перевода —
// без привязки к "текущему" счёту, т.к. в общей истории такого контекста нет (см. AccDetailPage,
// где та же идея завязана на конкретный открытый счёт).
function selfDebtBadge(t, accounts) {
  if (t.is_adjustment) return null;
  const from = accounts.find(a => a.id === t.from_id);
  const to   = accounts.find(a => a.id === t.to_id);
  if (from && SAVINGS_PURPOSES.includes(from.purpose)) return { label: "Долг самому себе", color: C.amber, bg: "rgba(245,158,11,0.12)" };
  if (to && SAVINGS_PURPOSES.includes(to.purpose) && t.is_debt_repayment) return { label: "Возврат долга себе", color: C.amber, bg: "rgba(245,158,11,0.12)" };
  return null;
}

// Долги людям: транзакция привязана к debt_events через transaction_id (см. AccDetailPage).
function personDebtBadge(tx, debtEvents, debtPeople) {
  const evt = debtEvents.find(e => e.transaction_id === tx.id && (e.type === "they_paid" || e.type === "lent" || e.type === "return"));
  if (!evt) return null;
  const name = debtPeople.find(p => p.id === evt.person_id)?.name || "—";
  if (evt.type === "they_paid") return { label: `Взял в долг у ${name}`, color: C.errorLight, bg: "rgba(244,67,54,0.12)" };
  if (evt.type === "lent") return { label: `Дал в долг · ${name}`, color: C.amber, bg: "rgba(245,158,11,0.12)" };
  if (tx.type === "income") return { label: `${name} вернул(а) долг`, color: C.green, bg: "rgba(76,175,80,0.12)" };
  return { label: `Вернул(а) долг · ${name}`, color: C.blue, bg: "rgba(96,165,250,0.12)" };
}

function DebtBadge({ badge }) {
  if (!badge) return null;
  return (
    <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, padding: "2px 7px", borderRadius: 6 }}>
      {badge.label}
    </span>
  );
}

function TxRow({ tx, cat, badge, onClick }) {
  const title = cat?.name || (badge ? "Долг" : (tx.note || "Без категории"));
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 8, background: C.monCard, cursor: "pointer" }}>
      <CatIcon k={cat?.icon || "other"} size={44} color={cat?.color || C.dim}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.main, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
        {tx.note && !badge && <p style={{ margin: 0, fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.note}</p>}
        <DebtBadge badge={badge}/>
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: tx.type === "income" ? C.emerald : "#fff", flexShrink: 0 }}>
        {tx.type === "income" ? "+" : ""}{fmtM(tx.amount, tx.currency)}
      </p>
    </div>
  );
}

function TransferRow({ t, accounts, badge, onClick }) {
  if (t.is_adjustment) {
    const adjAcc = accounts.find(a => a.id === t.from_id);
    const delta  = t.to_amt ?? t.amount;
    const isPos  = delta >= 0;
    return (
      <div onClick={onClick} style={{ background:C.monCard, borderRadius:14, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <div style={{ flexShrink:0, opacity:0.35 }}><Ico n="edit" s={14} c={C.mid}/></div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, fontWeight:500, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{adjAcc?.name ?? "—"}</span>
              <span style={{ fontSize:13, fontWeight:600, color: isPos ? C.emerald : C.errorLight, flexShrink:0, marginLeft:8 }}>
                {isPos ? "+" : "−"}{fmtM(Math.abs(delta), t.from_currency)}
              </span>
            </div>
            <span style={{ fontSize:12, color:C.dim }}>{BALANCE_ADJUSTMENT_NOTE}</span>
          </div>
        </div>
      </div>
    );
  }

  const from    = accounts.find(a => a.id === t.from_id);
  const to      = accounts.find(a => a.id === t.to_id);
  const toAmt   = t.to_amt ?? t.amount;
  const toCur   = t.to_currency || t.from_currency;
  const diffCur = t.from_currency !== toCur;

  return (
    <div onClick={onClick} style={{ background:C.monCard, borderRadius:14, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}>
      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <div style={{ flexShrink:0, display:"flex", alignItems:"center" }}><ArrowDown/></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
            <span style={{ fontSize:13, fontWeight:500, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{from?.name ?? "—"}</span>
            <span style={{ fontSize:13, fontWeight:500, color:"#fff", flexShrink:0, marginLeft:8 }}>{fmtM(t.amount, t.from_currency)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:C.mid, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{to?.name ?? "—"}</span>
            {diffCur && <span style={{ fontSize:13, color:C.green, flexShrink:0, marginLeft:8 }}>{fmtM(toAmt, toCur)}</span>}
          </div>
        </div>
      </div>
      {(t.note || t.fee > 0 || badge) && (
        <div style={{ display:"flex", gap:6, fontSize:12, color:C.dim, marginTop:4, paddingLeft:24, alignItems:"center", flexWrap:"wrap" }}>
          {badge && <span style={{ fontSize:10, fontWeight:600, color:badge.color, background:badge.bg, padding:"2px 7px", borderRadius:6, flexShrink:0 }}>{badge.label}</span>}
          {t.note && <span style={{ flex:1, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.note}</span>}
          {t.note && t.fee > 0 && <span>·</span>}
          {t.fee > 0 && <span style={{ color:C.errorLight, flexShrink:0 }}>{fmtM(t.fee, t.from_currency)}</span>}
        </div>
      )}
    </div>
  );
}

// Единая история операций по всем счетам: транзакции (доходы/расходы) и переводы вперемешку,
// отсортированные по времени и сгруппированные по дате — раньше здесь были только переводы,
// теперь это общая лента для раздела "Счета" (см. MoneyAccountsSection → "История").
export function HistoryPageMon({ transactions, transfers, accounts, expCats, incCats, debtEvents = [], debtPeople = [], navigate, onReload, onBack }) {
  const [period,        setPeriod]        = useState("month");
  const [periodOffset,  setPeriodOffset]  = useState(0);
  const [opType,        setOpType]        = useState("all");
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
  const changePeriod = (p) => { setPeriod(p); setPeriodOffset(0); };

  const catFor = (tx) => (tx.type === "expense" ? expCats : incCats).find(c => c.id === tx.category_id);

  const entries = useMemo(() => [
    ...transactions.map(t => ({ kind: "tx", data: t, date: t.date, sortAt: t.created_at || t.date })),
    ...transfers.map(t => ({ kind: "transfer", data: t, date: localDate(t.created_at), sortAt: t.created_at })),
  ], [transactions, transfers]);

  const filtered = useMemo(() => entries
    .filter(e => period === "all" || periodFn(e))
    .filter(e => {
      if (selAccIds.size === 0) return true;
      return e.kind === "tx" ? selAccIds.has(e.data.account_id) : (selAccIds.has(e.data.from_id) || selAccIds.has(e.data.to_id));
    })
    .filter(e => {
      if (opType === "all") return true;
      if (opType === "transfer") return e.kind === "transfer";
      return e.kind === "tx" && e.data.type === opType;
    })
    .sort((a, b) => String(b.sortAt || "").localeCompare(String(a.sortAt || "")))
  , [entries, period, periodOffset, selAccIds, opType]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelTransfer = async (t) => {
    const from  = accounts.find(a => a.id === t.from_id);
    const to    = accounts.find(a => a.id === t.to_id);
    try {
      let feeTxId = null;
      if (t.fee > 0) {
        const { data: feeTxs } = await supabase.from("transactions").select("id")
          .eq("account_id", t.from_id).eq("amount", t.fee).eq("date", localDate(t.created_at))
          .eq("type", "expense").eq("note", FEE_TX_NOTE);
        if (feeTxs?.length > 0) feeTxId = feeTxs[0].id;
      }

      const toAmt       = t.to_amt || t.amount;
      const prevToBal   = to ? round2(to.balance - toAmt) : null;
      let   prevToRate  = null;
      if (to && t.rate && to.avg_rate && prevToBal > 0)
        prevToRate = Math.round((to.avg_rate * to.balance - toAmt * t.rate) / prevToBal * 100) / 100;

      await supabase.from("transactions").delete().eq("transfer_id", t.id);

      await supaRpc("cancel_transfer", {
        p_id:          t.id,
        p_from_id:     t.from_id,
        p_from_balance: from ? round2(from.balance + t.amount + (t.fee || 0)) : 0,
        p_to_id:        to?.id ?? null,
        p_to_balance:   prevToBal,
        p_to_avg_rate:  prevToRate,
        p_fee_tx_id:    feeTxId,
      });

      await supabase.from("goal_topups").delete().eq("transfer_id", t.id);

      setConfirmCancel(false);
      setDetailT(null);
      onReload();
    } catch(err) { console.error(err); }
  };

  // ── DETAIL VIEW (только переводы — у транзакций редактирование открывается сразу на editTx) ──
  if (detailT) {
    const t = transfers.find(tr => tr.id === detailT.id) ?? detailT;

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

    if (t.is_adjustment) {
      const adjAcc = accounts.find(a => a.id === t.from_id);
      const delta  = t.to_amt ?? t.amount;
      const isPos  = delta >= 0;
      return (
        <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
          <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => setDetailT(null)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
            <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{BALANCE_ADJUSTMENT_NOTE}</span>
            <div style={{ width:30 }}/>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"20px 16px 40px" }}>
            {lbl("Счёт")}
            {accRow(adjAcc)}
            {lbl("Сумма")}
            <p style={{ margin:"0 0 20px", fontSize:26, fontWeight:700, color: isPos ? C.emerald : C.errorLight }}>
              {isPos ? "+" : "−"}{fmtM(Math.abs(delta), t.from_currency)}
            </p>
            {lbl("Дата")}
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
    const foreignCur = toCur !== BASE_CUR ? toCur : t.from_currency;

    return (
      <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => { setDetailT(null); setConfirmCancel(false); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
          <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>Перевод</span>
          <button onClick={() => navigate("editTransfer", t)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}><Ico n="edit" s={20} c={C.green}/></button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"20px 16px 100px" }}>
          {lbl("Откуда")}
          {accRow(from)}

          {lbl("Куда")}
          {accRow(to)}

          {lbl("Сумма перевода")}
          <p style={{ margin:"0 0 4px", fontSize:22, fontWeight:700, color:"#fff" }}>{fmtM(t.amount, t.from_currency)}</p>
          {diffCur && <p style={{ margin:"0 0 20px", fontSize:14, color:C.green }}>→ {fmtM(toAmt, toCur)}</p>}
          {!diffCur && <div style={{ marginBottom:20 }}/>}

          {t.rate && <>
            {lbl("Курс обмена")}
            <p style={{ margin:"0 0 20px", fontSize:16, fontWeight:600, color:"#fff" }}>1 {foreignCur} = {fmtAmt(t.rate)} {BASE_CUR}</p>
          </>}

          {t.fee > 0 && <>
            {lbl("Комиссия")}
            <p style={{ margin:"0 0 20px", fontSize:16, fontWeight:600, color:"#fff" }}>{fmtM(t.fee, t.from_currency)}</p>
          </>}

          {t.note && <>
            {lbl("Комментарий")}
            <p style={{ margin:"0 0 20px", fontSize:16, fontWeight:600, color:"#fff" }}>{t.note}</p>
          </>}

          {t.is_debt_repayment && (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:12, background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.22)", marginBottom:20 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:C.amber, flexShrink:0 }}/>
              <span style={{ fontSize:13, color:C.amber, fontWeight:600 }}>Возврат долга самому себе</span>
            </div>
          )}

          {lbl("Дата")}
          <p style={{ margin:"0 0 20px", fontSize:16, fontWeight:600, color:"#fff" }}>{fmtGroupDate(localDate(t.created_at))}</p>

          {t.analytics && (
            <StoredDealBanner
              analytics={t.analytics}
              fromCurrency={t.from_currency}
              toCurrency={t.to_currency || t.from_currency}
            />
          )}
        </div>

        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px calc(16px + env(safe-area-inset-bottom, 0px))", background:C.monBg, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          {confirmCancel ? (
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => cancelTransfer(t)} style={{ flex:1, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.15)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:14, fontWeight:600, cursor:"pointer" }}>Подтвердить отмену</button>
              <button onClick={() => setConfirmCancel(false)} style={{ flex:1, padding:"14px", borderRadius:30, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.mid, fontSize:14, cursor:"pointer" }}>Оставить</button>
            </div>
          ) : (
            <button onClick={() => setConfirmCancel(true)} style={{ width:"100%", padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.08)", border:"1px solid rgba(244,67,54,0.2)", color:"rgba(244,67,54,0.8)", fontSize:14, fontWeight:600, cursor:"pointer" }}>Отменить перевод</button>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  const selAccList = orderedAccounts.filter(a => selAccIds.has(a.id));
  const grouped = filtered.reduce((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc; }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>История операций</span>
        <div style={{ width:30 }}/>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 40px" }}>
        {/* Type tabs */}
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:8 }}>
          {OP_TYPES.map(([v, l]) => (
            <button key={v} onClick={() => setOpType(v)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:opType===v?C.monCard2:"transparent", color:opType===v?C.green:C.dim }}>{l}</button>
          ))}
        </div>

        {/* Period tabs */}
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:8 }}>
          {[["day","День"],["week","Неделя"],["month","Месяц"],["year","Год"],["all","Все"]].map(([v,l]) => (
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
              <button onClick={() => setPeriodOffset(0)} style={{ padding:"3px 10px", borderRadius:20, background:"rgba(76,175,80,0.12)", border:"1px solid rgba(76,175,80,0.3)", color:C.green, fontSize:11, fontWeight:700, cursor:"pointer" }}>Сейчас</button>
            )}
            <button onClick={() => setPeriodOffset(o => o + 1)} disabled={periodOffset >= 0} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 8px", display:"flex", opacity:periodOffset >= 0 ? 0.2 : 1 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {/* Account filter button */}
        <button onClick={() => setPickerOpen(true)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:12, background:"rgba(255,255,255,0.04)", border:`1px solid ${selAccIds.size > 0 ? C.green : C.border}`, cursor:"pointer", marginBottom:14, boxSizing:"border-box" }}>
          {selAccIds.size === 0 ? (
            <><Ico n="filter" s={16} c={C.dim}/><span style={{ flex:1, fontSize:13, color:C.dim, textAlign:"left" }}>Фильтр по счёту</span><Ico n="chevD" s={14} c={C.dim}/></>
          ) : selAccIds.size === 1 ? (
            <><CatIcon k={selAccList[0].icon} size={24} color={selAccList[0].color}/><span style={{ flex:1, fontSize:13, color:"#fff", textAlign:"left" }}>{selAccList[0].name}</span><span onClick={e => { e.stopPropagation(); setSelAccIds(new Set()); }} style={{ fontSize:11, color:C.dim, padding:"2px 8px", borderRadius:8, background:"rgba(255,255,255,0.08)", cursor:"pointer" }}>✕ Сбросить</span></>
          ) : (
            <><Ico n="filter" s={16} c={C.green}/><span style={{ flex:1, fontSize:13, color:C.green, textAlign:"left" }}>Счетов: {selAccIds.size}</span><span onClick={e => { e.stopPropagation(); setSelAccIds(new Set()); }} style={{ fontSize:11, color:C.dim, padding:"2px 8px", borderRadius:8, background:"rgba(255,255,255,0.08)", cursor:"pointer" }}>✕ Сбросить</span></>
          )}
        </button>

        {filtered.length === 0 && <p style={{ textAlign:"center", padding:"40px 0", color:C.dim }}>Нет операций</p>}

        {/* Grouped by date */}
        {sortedDates.map(date => (
          <div key={date}>
            <p style={{ margin:"0 0 8px", fontSize:12, fontWeight:600, color:C.dim }}>{fmtGroupDate(date)}</p>
            {grouped[date].map(e => e.kind === "tx"
              ? <TxRow key={`tx-${e.data.id}`} tx={e.data} cat={catFor(e.data)} badge={personDebtBadge(e.data, debtEvents, debtPeople)} onClick={() => navigate("editTx", e.data)}/>
              : <TransferRow key={`tr-${e.data.id}`} t={e.data} accounts={accounts} badge={selfDebtBadge(e.data, accounts)} onClick={() => setDetailT(e.data)}/>
            )}
            <div style={{ marginBottom:16 }}/>
          </div>
        ))}
      </div>

      {/* Account picker bottom sheet */}
      <BottomSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Фильтр по счёту"
        right={<button onClick={() => setPickerOpen(false)} style={{ padding:"6px 14px", borderRadius:20, background:C.green, border:"none", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>Готово</button>}
      >
        <div onClick={() => { setSelAccIds(new Set()); setPickerOpen(false); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:12, marginBottom:6, cursor:"pointer", background:selAccIds.size===0?"rgba(76,175,80,0.1)":"rgba(255,255,255,0.03)", border:`1px solid ${selAccIds.size===0?"rgba(76,175,80,0.4)":C.border}` }}>
          <div style={{ width:40, height:40, borderRadius:20, background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n="filter" s={18} c={C.dim}/></div>
          <span style={{ flex:1, fontSize:14, color:"#fff" }}>Все счета</span>
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
      </BottomSheet>
    </div>
  );
}
