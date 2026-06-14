import { useState, useEffect } from "react";
import { C } from "../../../constants/theme";
import { todayStr, localDate } from "../../../utils/date";
import { avgRateFn } from "../../../utils/format";
import { supaRpc, supa, supabase } from "../../../lib/supabase";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { AccSelect } from "../../../components/AccSelect";
import { CatIcon } from "../../../components/CatIcon";

export function TransferPageMon({ accounts, expCats, onBack, edit }) {
  const [fromId,    setFromId]    = useState(edit?.from_id || accounts[0]?.id || "");
  const [toId,      setToId]      = useState(edit?.to_id   || accounts[1]?.id || "");
  const [amt,       setAmt]       = useState(edit ? String(edit.amount) : "");
  const [toAmt,     setToAmt]     = useState(edit?.to_amt  ? String(edit.to_amt) : "");
  const [rate,      setRate]      = useState(edit?.rate    ? String(edit.rate)   : "");
  const [fee,       setFee]       = useState(edit?.fee     ? String(edit.fee)    : "");
  const [feeCatId,  setFeeCatId]  = useState("");
  const [note,      setNote]      = useState(edit?.note    || "");
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!edit?.fee) return;
    supabase.from("transactions").select("category_id")
      .eq("account_id", edit.from_id).eq("amount", edit.fee)
      .eq("date", localDate(edit.created_at)).eq("type", "expense")
      .eq("note", "Комиссия за перевод")
      .then(({ data }) => { if (data?.[0]?.category_id) setFeeCatId(data[0].category_id); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fromAcc  = accounts.find(a => a.id === fromId);
  const toAcc    = accounts.find(a => a.id === toId);
  const diffCur  = fromAcc?.currency !== toAcc?.currency;

  const save = async () => {
    if (!amt || fromId === toId) return;
    setSaving(true);

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

    try {
      if (edit) {
        // ── EDIT: revert old, apply new ──────────────────────────────
        const oldFromAcc = accounts.find(a => a.id === edit.from_id);
        const oldToAcc   = accounts.find(a => a.id === edit.to_id);
        const oldToAmt   = edit.to_amt || edit.amount;

        // Find & delete old fee TX (если был создан как отдельная запись)
        let oldFeeWasSeparate = false;
        if ((edit.fee || 0) > 0) {
          const { data: oldFeeTxs } = await supabase.from("transactions")
            .select("id")
            .eq("account_id", edit.from_id)
            .eq("amount", edit.fee)
            .eq("date", localDate(edit.created_at))
            .eq("type", "expense")
            .eq("note", "Комиссия за перевод");
          if (oldFeeTxs?.length > 0) {
            await supabase.from("transactions").delete().eq("id", oldFeeTxs[0].id);
            oldFeeWasSeparate = true;
          }
        }

        // Сколько комиссии было в балансе перевода (старая логика — до моего фикса)
        const oldFeeInBal = oldFeeWasSeparate ? 0 : (edit.fee || 0);

        // Новый баланс отправителя
        let newFromBal;
        if (fromId === edit.from_id) {
          // Тот же счёт: откатить old amount+fee, применить новый
          newFromBal = oldFromAcc.balance + edit.amount + oldFeeInBal - newAmt;
        } else {
          // Другой счёт: восстановить старый и уменьшить новый
          await supa.update("accounts",
            { balance: oldFromAcc.balance + edit.amount + oldFeeInBal },
            `id=eq.${edit.from_id}`
          );
          newFromBal = fromAcc.balance - newAmt;
        }

        // Новый баланс и avg_rate получателя
        let newToBal, newToAvgRate = null;
        const preOldToBal = oldToAcc.balance - oldToAmt;

        if (toId === edit.to_id) {
          // Тот же счёт: откатить old to_amt, применить новый
          newToBal = preOldToBal + newToAmt;

          if (diffCur && parseFloat(rate)) {
            // Восстановить avg_rate до старого перевода
            let prevRate = oldToAcc.avg_rate;
            if (edit.rate && oldToAcc.avg_rate && preOldToBal > 0) {
              prevRate = (oldToAcc.avg_rate * oldToAcc.balance - oldToAmt * edit.rate) / preOldToBal;
            } else if (edit.rate && preOldToBal <= 0) {
              prevRate = null;
            }
            const baseRate = prevRate != null ? prevRate : parseFloat(rate);
            newToAvgRate = Math.round(
              avgRateFn(preOldToBal, baseRate, newToAmt, parseFloat(rate)) * 100
            ) / 100;
          }
        } else {
          // Другой счёт: восстановить старый получатель, применить к новому
          const oldToPatch = { balance: preOldToBal };
          if (edit.rate && oldToAcc.avg_rate) {
            if (preOldToBal > 0) {
              oldToPatch.avg_rate = Math.round(
                (oldToAcc.avg_rate * oldToAcc.balance - oldToAmt * edit.rate) / preOldToBal * 100
              ) / 100;
            } else {
              oldToPatch.avg_rate = null;
            }
          }
          await supa.update("accounts", oldToPatch, `id=eq.${edit.to_id}`);

          newToBal = toAcc.balance + newToAmt;
          if (diffCur && parseFloat(rate)) {
            const baseRate = toAcc.avg_rate || parseFloat(rate);
            newToAvgRate = Math.round(
              avgRateFn(toAcc.balance, baseRate, newToAmt, parseFloat(rate)) * 100
            ) / 100;
          }
        }

        await supaRpc("save_transfer", {
          p_tr: tr,
          p_from_id: fromId, p_from_balance: newFromBal,
          p_to_id:   toId,   p_to_balance:   newToBal, p_to_avg_rate: newToAvgRate,
        });

        if (feeAmt > 0) {
          const feeTx = {
            id: crypto.randomUUID(), type: "expense", amount: feeAmt,
            currency: fromAcc.currency, category_id: feeCatId || null,
            account_id: fromId, date: localDate(edit.created_at), note: "Комиссия за перевод",
          };
          await supaRpc("save_tx", {
            p_tx: feeTx, p_account_id: fromId, p_new_balance: newFromBal - feeAmt,
          });
        }

      } else {
        // ── CREATE ───────────────────────────────────────────────────
        const newFromBal = fromAcc.balance - newAmt;
        const newToBal   = toAcc.balance   + newToAmt;
        let newAvgRate = null;
        if (diffCur && rate) {
          const oldRate = toAcc.avg_rate || parseFloat(rate);
          newAvgRate = Math.round(avgRateFn(toAcc.balance, oldRate, newToAmt, parseFloat(rate)) * 100) / 100;
        }
        await supaRpc("save_transfer", {
          p_tr: tr,
          p_from_id: fromId, p_from_balance: newFromBal,
          p_to_id:   toId,   p_to_balance:   newToBal, p_to_avg_rate: newAvgRate,
        });
        if (feeAmt > 0) {
          const feeTx = {
            id: crypto.randomUUID(), type: "expense", amount: feeAmt,
            currency: fromAcc.currency, category_id: feeCatId || null,
            account_id: fromId, date: todayStr(), note: "Комиссия за перевод",
          };
          await supaRpc("save_tx", {
            p_tx: feeTx, p_account_id: fromId, p_new_balance: newFromBal - feeAmt,
          });
        }
      }

      onBack(true);
    } catch(e) { console.error(e); setSaving(false); }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <div style={{ background:C.monHeader, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => onBack(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.main, display:"flex" }}><Ico n="back" s={22}/></button>
        <span style={{ flex:1, fontSize:17, fontWeight:600, color:"#fff" }}>{edit ? "Edit transfer" : "Create transfer"}</span>
        <div style={{ width:30 }}/>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 80px" }}>
        <AccSelect accounts={accounts} value={fromId} onChange={setFromId} label="Transfer from"/>
        <AccSelect accounts={accounts} value={toId}   onChange={setToId}   label="Transfer to"/>

        <FieldLabel>Amount ({fromAcc?.currency||""})</FieldLabel>
        <div style={{ borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
          <input value={amt} onChange={e => setAmt(e.target.value)} type="number" placeholder="0"
            style={{ width:"100%", background:"none", border:"none", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
        </div>

        {diffCur && <>
          <FieldLabel>Receive ({toAcc?.currency||""})</FieldLabel>
          <div style={{ borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
            <input value={toAmt} onChange={e => setToAmt(e.target.value)} type="number" placeholder="0"
              style={{ width:"100%", background:"none", border:"none", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
          </div>
          <FieldLabel>Exchange rate</FieldLabel>
          <input value={rate} onChange={e => setRate(e.target.value)} type="number" placeholder="e.g. 480"
            style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}/>
        </>}

        <FieldLabel>Commission fee</FieldLabel>
        <input value={fee} onChange={e => { setFee(e.target.value); if (!e.target.value) setFeeCatId(""); }} type="number" placeholder="0"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}/>

        {parseFloat(fee) > 0 && expCats?.length > 0 && !edit && (
          <>
            <FieldLabel>Fee category</FieldLabel>
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

        <FieldLabel>Comment</FieldLabel>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Comment"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:15, padding:"4px 0", marginBottom:24, boxSizing:"border-box" }}/>

        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Saving..." : edit ? "Save changes" : "Add transfer"}
        </button>
      </div>
    </div>
  );
}
