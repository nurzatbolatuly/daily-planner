import { useState, useEffect, useRef } from "react";
import { C } from "../../../constants/theme";
import { todayStr, localDate } from "../../../utils/date";
import { avgRateFn } from "../../../utils/format";
import { supaRpc, supabase, supaUpsert } from "../../../lib/supabase";
import { FEE_TX_NOTE } from "../../../constants/money";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { AccSelect } from "../../../components/AccSelect";
import { CatIcon } from "../../../components/CatIcon";

export function TransferPageMon({ accounts, expCats, goals = [], onBack, edit }) {
  const [fromId,    setFromId]    = useState(edit?.from_id || accounts[0]?.id || "");
  const [toId,      setToId]      = useState(edit?.to_id   || accounts[1]?.id || "");
  const [amt,       setAmt]       = useState(edit ? String(edit.amount) : "");
  const [toAmt,     setToAmt]     = useState(edit?.to_amt  ? String(edit.to_amt) : "");
  const [rate,      setRate]      = useState(edit?.rate    ? String(edit.rate)   : "");
  const [fee,       setFee]       = useState(edit?.fee     ? String(edit.fee)    : "");
  const [feeCatId,  setFeeCatId]  = useState("");
  const [note,      setNote]      = useState(edit?.note    || "");
  const [errors,    setErrors]    = useState({});

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить перевод" });

  useEffect(() => {
    if (!edit?.fee) return;
    supabase.from("transactions").select("category_id")
      .eq("account_id", edit.from_id).eq("amount", edit.fee)
      .eq("date", localDate(edit.created_at)).eq("type", "expense")
      .eq("note", FEE_TX_NOTE)
      .then(({ data }) => { if (data?.[0]?.category_id) setFeeCatId(data[0].category_id); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fromAcc  = accounts.find(a => a.id === fromId);
  const toAcc    = accounts.find(a => a.id === toId);
  const diffCur  = fromAcc?.currency !== toAcc?.currency;

  // Async body — читается из saveRef чтобы useSave мог быть вызван unconditionally до early returns
  saveRef.current = async () => {
    const feeAmt   = parseFloat(fee)  || 0;
    const newAmt   = parseFloat(amt);
    const newToAmt = diffCur ? (parseFloat(toAmt) || 0) : newAmt;

    const tr = {
      id:            edit?.id || crypto.randomUUID(),
      from_id:       fromId,
      to_id:         toId,
      amount:        newAmt,
      from_currency: fromAcc?.currency,
      to_amt:        newToAmt,
      to_currency:   toAcc?.currency,
      rate:          parseFloat(rate) || null,
      fee:           feeAmt,
      note,
    };

    if (edit) {
      // ── EDIT: всё атомарно через edit_transfer ───────────────────
      const oldFromAcc = accounts.find(a => a.id === edit.from_id);
      const oldToAcc   = accounts.find(a => a.id === edit.to_id);
      const oldToAmt   = edit.to_amt || edit.amount;
      const oldFee     = edit.fee || 0;

      // Ищем ID старой fee-транзакции до RPC (нет в props)
      let oldFeeTxId = null;
      if (oldFee > 0) {
        const { data: oldFeeTxs } = await supabase.from("transactions").select("id")
          .eq("account_id", edit.from_id).eq("amount", oldFee)
          .eq("date", localDate(edit.created_at)).eq("type", "expense")
          .eq("note", FEE_TX_NOTE);
        if (oldFeeTxs?.length > 0) oldFeeTxId = oldFeeTxs[0].id;
      }

      const sameFrom = fromId === edit.from_id;
      const sameTo   = toId   === edit.to_id;

      // p_from_balance включает вычет и нового amount, и новой комиссии
      const newFromBal = sameFrom
        ? oldFromAcc.balance + edit.amount + oldFee - newAmt - feeAmt
        : fromAcc.balance - newAmt - feeAmt;

      const preOldToBal = oldToAcc.balance - oldToAmt;
      let newToBal, newToAvgRate = null;

      if (sameTo) {
        newToBal = preOldToBal + newToAmt;
        if (diffCur && parseFloat(rate)) {
          let prevRate = oldToAcc.avg_rate;
          if (edit.rate && oldToAcc.avg_rate && preOldToBal > 0)
            prevRate = (oldToAcc.avg_rate * oldToAcc.balance - oldToAmt * edit.rate) / preOldToBal;
          else if (edit.rate && preOldToBal <= 0)
            prevRate = null;
          const baseRate = prevRate != null ? prevRate : parseFloat(rate);
          newToAvgRate = Math.round(avgRateFn(preOldToBal, baseRate, newToAmt, parseFloat(rate)) * 100) / 100;
        }
      } else {
        newToBal = toAcc.balance + newToAmt;
        if (diffCur && parseFloat(rate)) {
          const baseRate = toAcc.avg_rate || parseFloat(rate);
          newToAvgRate = Math.round(avgRateFn(toAcc.balance, baseRate, newToAmt, parseFloat(rate)) * 100) / 100;
        }
      }

      // Восстановительные балансы для старых счетов при смене
      const oldFromRestoredBal = !sameFrom ? oldFromAcc.balance + edit.amount + oldFee : null;
      let oldToRestoredBal = null, oldToRestoredRate = null;
      if (!sameTo) {
        oldToRestoredBal = preOldToBal;
        if (edit.rate && oldToAcc.avg_rate && preOldToBal > 0)
          oldToRestoredRate = Math.round((oldToAcc.avg_rate * oldToAcc.balance - oldToAmt * edit.rate) / preOldToBal * 100) / 100;
      }

      const feeTx = feeAmt > 0 ? {
        id: crypto.randomUUID(), type: "expense", amount: feeAmt,
        currency: fromAcc.currency, category_id: feeCatId || null,
        account_id: fromId, date: localDate(edit.created_at), note: FEE_TX_NOTE,
      } : null;

      await supaRpc("edit_transfer", {
        p_tr: tr,
        p_from_id: fromId,    p_from_balance:    newFromBal,
        p_to_id:   toId,      p_to_balance:      newToBal,  p_to_avg_rate:   newToAvgRate,
        p_old_from_id:        sameFrom ? null : edit.from_id,
        p_old_from_balance:   oldFromRestoredBal,
        p_old_to_id:          sameTo ? null : edit.to_id,
        p_old_to_balance:     oldToRestoredBal,
        p_old_to_avg_rate:    oldToRestoredRate,
        p_old_fee_tx_id:      oldFeeTxId,
        p_fee_tx:             feeTx,
      });

    } else {
      // ── CREATE ───────────────────────────────────────────────────
      const baseFromBal = fromAcc.balance - newAmt;
      const newToBal    = toAcc.balance   + newToAmt;
      let newAvgRate = null;
      if (diffCur && rate) {
        const oldRate = toAcc.avg_rate || parseFloat(rate);
        newAvgRate = Math.round(avgRateFn(toAcc.balance, oldRate, newToAmt, parseFloat(rate)) * 100) / 100;
      }
      if (feeAmt > 0) {
        const feeTx = {
          id: crypto.randomUUID(), type: "expense", amount: feeAmt,
          currency: fromAcc.currency, category_id: feeCatId || null,
          account_id: fromId, date: todayStr(), note: FEE_TX_NOTE,
        };
        await supaRpc("save_transfer_with_fee", {
          p_tr: tr,
          p_from_id: fromId, p_from_balance: baseFromBal - feeAmt,
          p_to_id:   toId,   p_to_balance:   newToBal,   p_to_avg_rate: newAvgRate,
          p_fee_tx:  feeTx,
        });
      } else {
        await supaRpc("save_transfer", {
          p_tr: tr,
          p_from_id: fromId, p_from_balance: baseFromBal,
          p_to_id:   toId,   p_to_balance:   newToBal,   p_to_avg_rate: newAvgRate,
        });
      }
    }

    // Авто-пополнение цели: если счёт-получатель привязан к цели
    const linkedGoal = goals.find(g => g.account_id === toId);
    if (edit) {
      // При редактировании: удаляем старый авто-topup этого перевода (если был)
      await supabase.from("goal_topups").delete().eq("transfer_id", edit.id);
    }
    if (linkedGoal) {
      const topupRow = {
        id:          crypto.randomUUID(),
        goal_id:     linkedGoal.id,
        amount:      newToAmt,
        currency:    toAcc?.currency || tr.to_currency,
        date:        edit ? localDate(edit.created_at) : todayStr(),
        note:        `Перевод: ${fromAcc?.name || ""}`,
        transfer_id: tr.id,
      };
      await supaUpsert("goal_topups", topupRow);
    }

    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!amt || parseFloat(amt) <= 0) errs.amt = "Введите сумму";
    if (!fromId) errs.from = "Выберите счёт отправителя";
    if (!toId)   errs.to   = "Выберите счёт получателя";
    if (fromId && toId && fromId === toId) errs.to = "Нельзя переводить на тот же счёт";
    if (diffCur && (!toAmt || parseFloat(toAmt) <= 0)) errs.toAmt = "Введите сумму получения";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать перевод" : "Новый перевод"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 80px" }}>
        <AccSelect accounts={accounts} value={fromId} onChange={v => { setFromId(v); setErrors(p => ({...p, from:"", to:""})); }} label="Откуда" error={errors.from}/>
        <AccSelect accounts={accounts} value={toId}   onChange={v => { setToId(v);   setErrors(p => ({...p, to:""})); }}   label="Куда"   error={errors.to}/>
        {errors.to && <p style={{ color:C.errorLight, fontSize:12, marginTop:-10, marginBottom:12 }}>{errors.to}</p>}

        <FieldLabel error={errors.amt}>Сумма ({fromAcc?.currency||""})</FieldLabel>
        <div style={{ borderBottom:`1px solid ${errors.amt ? "rgba(244,67,54,0.5)" : C.border}`, marginBottom:errors.amt ? 4 : 16 }}>
          <NumInput value={amt} onChange={v => { setAmt(v); setErrors(p => ({...p, amt:""})); }} placeholder="0"
            style={{ width:"100%", background:"none", border:"none", outline:"none", color:errors.amt ? C.errorLight : "#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
        </div>
        {errors.amt && <p style={{ color:C.errorLight, fontSize:12, marginBottom:12 }}>{errors.amt}</p>}

        {diffCur && <>
          <FieldLabel error={errors.toAmt}>Получить ({toAcc?.currency||""})</FieldLabel>
          <div style={{ borderBottom:`1px solid ${errors.toAmt ? "rgba(244,67,54,0.5)" : C.border}`, marginBottom:errors.toAmt ? 4 : 16 }}>
            <NumInput value={toAmt} onChange={v => { setToAmt(v); setErrors(p => ({...p, toAmt:""})); }} placeholder="0"
              style={{ width:"100%", background:"none", border:"none", outline:"none", color:errors.toAmt ? C.errorLight : "#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
          </div>
          {errors.toAmt && <p style={{ color:C.errorLight, fontSize:12, marginBottom:12 }}>{errors.toAmt}</p>}
          <FieldLabel>Курс обмена</FieldLabel>
          <input value={rate} onChange={e => setRate(e.target.value)} type="number" placeholder="напр. 480"
            style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}/>
        </>}

        <FieldLabel>Комиссия</FieldLabel>
        <NumInput value={fee} onChange={v => { setFee(v); if (!v) setFeeCatId(""); }} placeholder="0"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}/>

        {parseFloat(fee) > 0 && expCats?.length > 0 && !edit && (
          <>
            <FieldLabel>Категория комиссии</FieldLabel>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(64px, 1fr))", gap:8, marginBottom:16 }}>
              {expCats.map(c => {
                const sel = feeCatId === c.id;
                return (
                  <button key={c.id} onClick={() => setFeeCatId(sel ? "" : c.id)}
                    style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 4px", borderRadius:10, background:sel?c.color:"transparent", border:"none", cursor:"pointer" }}>
                    <CatIcon k={c.icon} size={40} color={sel?"rgba(0,0,0,0.25)":c.color}/>
                    <span style={{ fontSize:10, color:sel?"#fff":C.mid, textAlign:"center", wordBreak:"break-word" }}>{c.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <FieldLabel>Комментарий</FieldLabel>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:15, padding:"4px 0", marginBottom:24, boxSizing:"border-box" }}/>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Сохранение..." : edit ? "Сохранить" : "Создать перевод"}
        </button>
      </div>
    </div>
  );
}
