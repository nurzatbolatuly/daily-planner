import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { todayStr, localDate } from "../../../utils/date";
import { avgRateFn, fmtAmt, fmtAmtAuto, fmtBal, fmtM, getSym, isCommodity, round2, ratesFromAccounts } from "../../../utils/format";
import { newId } from "../../../utils/id";
import { supaRpc, supaUpsert, supabase } from "../../../lib/supabase";
import { FEE_TX_NOTE, SAVINGS_PURPOSES } from "../../../constants/money";
import { computeDebtState } from "../../../utils/debtUtils";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { AccSelect } from "../../../components/AccSelect";
import { CatIcon } from "../../../components/CatIcon";
import { Toggle } from "../../../components/Toggle";

// Анализ сделки: сторона продажи (PnL источника) + сторона покупки (новая средняя получателя).
// refToAvgRate — актуальная цена/курс получателя: toAcc.avg_rate если есть история,
// иначе текущий курс введённый пользователем.
// hasToHistory — есть ли у получателя историческая средняя (toAcc.avg_rate > 0).
function DealAnalysisBanner({ fromAcc, toAcc, impliedSellRate, impliedBuyRate, refToAvgRate, hasToHistory, newToAvgRate, amtNum }) {
  const fromSym   = getSym(fromAcc?.currency);
  const toSym     = getSym(toAcc?.currency);
  const fromIsCom = isCommodity(fromAcc?.currency);
  const toIsCom   = isCommodity(toAcc?.currency);
  const fromIsKzt  = fromAcc?.currency === BASE_CUR;
  const toIsKzt    = toAcc?.currency   === BASE_CUR;

  // KZT — базовая валюта, «продажа ₸» не имеет смысла как P&L
  const hasSell    = !fromIsKzt && (fromAcc?.avg_rate > 0) && (impliedSellRate > 0);
  // hasBuy не требует refToAvgRate — impliedBuyRate считается из fromAcc.avg_rate
  const hasBuy     = !toIsKzt && (impliedBuyRate > 0) && (newToAvgRate != null);

  if (!hasSell && !hasBuy) return null;

  // Сторона продажи: PnL источника
  const sellDiff   = hasSell ? impliedSellRate - fromAcc.avg_rate : 0;
  const sellPct    = hasSell && fromAcc.avg_rate > 0 ? (sellDiff / fromAcc.avg_rate * 100) : 0;
  const sellTotal  = sellDiff * amtNum;
  const sellProfit = sellDiff >= 0;
  const sellColor  = sellProfit ? C.green : C.red;
  const sellBg     = sellProfit ? "rgba(76,175,80,0.10)" : "rgba(244,67,54,0.10)";
  const sellBorder = sellProfit ? "rgba(76,175,80,0.30)" : "rgba(244,67,54,0.30)";

  // Сторона покупки.
  // refForDisplay: «Ср. цена до» = реальная средняя счёта (если есть); иначе — рыночная (если введена).
  // refToAvgRate используется ТОЛЬКО для impliedSellRate на стороне FROM, здесь не используется.
  const toAccAvg     = (toAcc?.avg_rate || 0);
  const refForDisplay = hasToHistory ? toAccAvg : refToAvgRate;
  const hasRefComp   = refForDisplay > 0;
  const buyDiff      = hasRefComp ? impliedBuyRate - refForDisplay : 0;
  const buyPct       = hasRefComp ? (buyDiff / refForDisplay * 100) : 0;
  const buyBetter    = buyDiff < 0; // дешевле → хорошо
  const buyNeutral   = !hasRefComp || Math.abs(buyPct) < 0.5;
  const buyColor     = buyNeutral ? C.mid : (buyBetter ? C.green : C.red);
  const buyBg        = buyNeutral ? "rgba(255,255,255,0.04)" : (buyBetter ? "rgba(76,175,80,0.07)" : "rgba(244,67,54,0.07)");
  const buyBorder    = buyNeutral ? "rgba(255,255,255,0.10)"  : (buyBetter ? "rgba(76,175,80,0.20)" : "rgba(244,67,54,0.20)");
  const refLabel     = hasToHistory ? "Ср. цена до" : "Тек. цена рынка";

  return (
    <div style={{ marginBottom:20 }}>
      {hasSell && (
        <div style={{ background:sellBg, border:`1px solid ${sellBorder}`, borderRadius: hasBuy ? "14px 14px 0 0" : 14, padding:"12px 14px" }}>
          <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:700, color:C.dim, textTransform:"uppercase", letterSpacing:0.8 }}>
            {fromIsCom ? "Продажа металла" : `Продажа ${fromAcc.currency}`}
          </p>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ fontSize:12, color:C.dim }}>Средняя покупки</span>
            <span style={{ fontSize:12, color:C.mid }}>{fmtAmt(fromAcc.avg_rate)} ₸/{fromSym}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, color:C.dim }}>Цена продажи</span>
            <span style={{ fontSize:12, color:C.mid }}>{fmtAmt(impliedSellRate)} ₸/{fromSym}</span>
          </div>
          <div style={{ height:1, background:"rgba(255,255,255,0.08)", marginBottom:8 }}/>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:600, color:sellColor }}>
              {sellProfit ? "Прибыль" : "Убыток"} {sellProfit ? "+" : ""}{fmtAmt(sellDiff)} ₸/{fromSym} ({sellPct >= 0 ? "+" : ""}{fmtAmt(Math.abs(sellPct), 1)}%)
            </span>
            {amtNum > 0 && (
              <span style={{ fontSize:14, fontWeight:700, color:sellColor }}>
                {sellProfit ? "+" : "-"}{fmtAmtAuto(Math.abs(sellTotal))} ₸
              </span>
            )}
          </div>
        </div>
      )}

      {hasBuy && (
        <div style={{ background:buyBg, border:`1px solid ${buyBorder}`, borderTop: hasSell ? "none" : undefined, borderRadius: hasSell ? "0 0 14px 14px" : 14, padding:"12px 14px" }}>
          <p style={{ margin:"0 0 8px", fontSize:11, fontWeight:700, color:C.dim, textTransform:"uppercase", letterSpacing:0.8 }}>
            {toIsCom ? "Покупка металла" : `Покупка ${toAcc.currency}`}
          </p>
          {hasRefComp && (
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontSize:12, color:C.dim }}>{refLabel}</span>
              <span style={{ fontSize:12, color:C.mid }}>{fmtAmt(refForDisplay)} ₸/{toSym}</span>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, color:C.dim }}>Цена входа</span>
            <span style={{ fontSize:12, color:C.mid }}>{fmtAmt(impliedBuyRate)} ₸/{toSym}</span>
          </div>
          <div style={{ height:1, background:"rgba(255,255,255,0.08)", marginBottom:8 }}/>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, color:C.dim }}>Новая средняя</span>
            <span style={{ fontSize:13, fontWeight:700, color:buyColor }}>
              {fmtAmt(newToAvgRate)} ₸/{toSym}
              {!buyNeutral && <> ({buyPct >= 0 ? "+" : ""}{fmtAmt(Math.abs(buyPct), 1)}%)</>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TransferPageMon({ accounts, transfers = [], expCats, goals = [], transactions = [], fxAccount, onBack, edit, prefill = null }) {
  const [fromId,   setFromId]   = useState(edit?.from_id || accounts[0]?.id || "");
  const [toId,     setToId]     = useState(edit?.to_id   || prefill?.to_id || accounts[1]?.id || "");
  const [amt,      setAmt]      = useState(edit ? String(edit.amount) : prefill?.amount ? String(prefill.amount) : "");
  const [toAmt,    setToAmt]    = useState(edit?.to_amt  ? String(edit.to_amt) : prefill?.toAmt ? String(prefill.toAmt) : "");
  const [rate,     setRate]     = useState(edit?.rate    ? String(edit.rate)   : "");
  // Текущий курс/цена счёта-получателя — только для точного P&L, не влияет на балансы
  const [toRate,   setToRate]   = useState("");
  const [fee,      setFee]      = useState(edit?.fee     ? String(edit.fee)    : "");
  const [isDebtRepayment, setIsDebtRepayment] = useState(edit?.is_debt_repayment || prefill?.is_debt_repayment || false);
  const [feeCatId, setFeeCatId] = useState(() => {
    if (!edit?.fee) return "";
    const feeTx = transactions.find(tx =>
      tx.account_id === edit.from_id &&
      tx.amount === edit.fee &&
      tx.date === localDate(edit.created_at) &&
      tx.type === "expense" &&
      tx.note === FEE_TX_NOTE
    );
    return feeTx?.category_id || "";
  });
  const [note,     setNote]     = useState(edit?.note    || "");
  const [errors,   setErrors]   = useState({});

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить перевод" });

  const fromAcc   = accounts.find(a => a.id === fromId);
  const toAcc     = accounts.find(a => a.id === toId);
  const diffCur   = fromAcc?.currency !== toAcc?.currency;

  // Флаг "Возврат долга" показывается когда счёт-получатель — накопительный
  const toAccIsSavings = toAcc ? SAVINGS_PURPOSES.includes(toAcc.purpose) : false;

  // Текущий накопленный долг по счёту-получателю — для авто-подсказки тоггла.
  // Переиспользуем computeDebtState (тот же источник правды, что и SelfDebtCard) — долг
  // в родной валюте/граммах счёта, не в KZT.
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const debtState = useMemo(() => computeDebtState(transfers, accounts, rates), [transfers, accounts, rates]);
  const toAccOutstandingDebt = (toAccIsSavings && toId) ? (debtState.byAcc[toId]?.total || 0) : 0;
  const fromIsKzt = fromAcc?.currency === BASE_CUR;
  const toIsKzt   = toAcc?.currency   === BASE_CUR;
  const fromIsCom = isCommodity(fromAcc?.currency);
  const toIsCom   = isCommodity(toAcc?.currency);

  // Режим «цена за грамм»: продаём металл за тенге
  const pricePerGramMode = diffCur && fromIsCom && toIsKzt;
  // Нужен ручной курс источника: не KZT, не металл, нет avg_rate
  const needManualRate   = diffCur && !fromIsKzt && !fromIsCom && !fromAcc?.avg_rate;
  const showRateField    = pricePerGramMode || needManualRate;
  // toRate нужен только когда from ≠ KZT: для расчёта impliedSellRate через актив-получатель.
  // При from=KZT цена входа = KZT_sent/to_received — refToAvgRate не нужен, поле скрываем.
  const showToRateField  = diffCur && !toIsKzt && !pricePerGramMode && !fromIsKzt;

  const amtNum    = parseFloat(amt)    || 0;
  const rateNum   = parseFloat(rate)   || 0;
  const toRateNum = parseFloat(toRate) || 0;

  const effectiveToAmt = diffCur
    ? (pricePerGramMode ? amtNum * rateNum : (parseFloat(toAmt) || 0))
    : amtNum;

  // Курс источника к KZT
  const fromRateToKzt = fromIsKzt ? 1
    : fromIsCom ? (fromAcc?.avg_rate || 0)
    : (fromAcc?.avg_rate || rateNum || 0);

  // impliedBuyRate: ₸ за единицу toCurrency (реальная стоимость покупки)
  const impliedBuyRate = (!toIsKzt && effectiveToAmt > 0 && fromRateToKzt > 0)
    ? Math.round(amtNum * fromRateToKzt / effectiveToAmt * 100) / 100
    : null;

  // Актуальный курс получателя: введённый пользователем > исторический avg_rate
  // Используется ТОЛЬКО для PnL-расчётов, не влияет на балансы
  const hasToHistory  = (toAcc?.avg_rate || 0) > 0;
  const refToAvgRate  = toRateNum > 0 ? toRateNum : (toAcc?.avg_rate || 0);

  // impliedSellRate: ₸ за единицу fromCurrency (что эффективно получаем за источник)
  // Если to = KZT: курс продажи = KZT_получено / from_продано (refToAvgRate не нужен)
  // Если to = валюта/металл: нужен refToAvgRate для пересчёта to → KZT
  let impliedSellRate = null;
  if (diffCur && amtNum > 0 && effectiveToAmt > 0) {
    if (toIsKzt) {
      impliedSellRate = Math.round(effectiveToAmt / amtNum * 100) / 100;
    } else if (refToAvgRate > 0) {
      impliedSellRate = Math.round(effectiveToAmt * refToAvgRate / amtNum * 100) / 100;
    }
  }

  // Новая средняя получателя после перевода.
  // oldRate = реальная историческая средняя счёта (toAcc.avg_rate), НЕ рыночная цена (refToAvgRate).
  // refToAvgRate используется только для impliedSellRate и цветовой индикации, не для взвешенной средней.
  const toAccAvgRate   = (toAcc?.avg_rate || 0);
  const newToAvgRate = (!toIsKzt && impliedBuyRate != null && effectiveToAmt > 0)
    ? Math.round(avgRateFn(toAcc?.balance || 0, toAccAvgRate > 0 ? toAccAvgRate : impliedBuyRate, effectiveToAmt, impliedBuyRate) * 100) / 100
    : null;

  // ─── SAVE ──────────────────────────────────────────────────────────────────
  saveRef.current = async () => {
    const feeAmt   = parseFloat(fee) || 0;
    const newAmt   = parseFloat(amt);
    const newToAmt = diffCur ? effectiveToAmt : newAmt;

    // Снимок аналитики для записи в transfers.analytics и FX транзакции
    const hasSellSnap = !fromIsKzt && (fromAcc?.avg_rate > 0) && (impliedSellRate > 0);
    const hasBuySnap  = !toIsKzt && (impliedBuyRate != null) && (newToAvgRate != null) && effectiveToAmt > 0;
    const sellDiffSnap = hasSellSnap ? impliedSellRate - fromAcc.avg_rate : 0;
    const pnlKzt       = hasSellSnap ? round2(sellDiffSnap * amtNum) : 0;
    const analyticsData = (hasSellSnap || hasBuySnap) ? {
      has_sell:            hasSellSnap,
      has_buy:             hasBuySnap,
      from_avg_rate:       fromAcc?.avg_rate || null,
      implied_sell_rate:   impliedSellRate,
      sell_pnl:            pnlKzt,
      implied_buy_rate:    impliedBuyRate,
      to_avg_before:       toAcc?.avg_rate || null,
      to_balance_before:   hasBuySnap ? (toAcc?.balance || 0) : null,
      to_amount_added:     hasBuySnap ? effectiveToAmt : null,
      new_to_avg_rate:     newToAvgRate,
    } : null;

    const fromRateToKztSave = fromIsKzt ? 1
      : fromIsCom ? (fromAcc.avg_rate || 0)
      : (fromAcc.avg_rate || rateNum || 0);

    // computedRate: реальная стоимость (на балансы) — не зависит от toRate
    let computedRate = null;
    if (diffCur) {
      if (pricePerGramMode) {
        computedRate = rateNum || null;
      } else if (!toIsKzt && fromRateToKztSave > 0 && newToAmt > 0) {
        computedRate = Math.round(newAmt * fromRateToKztSave / newToAmt * 100) / 100;
      }
    }

    const tr = {
      id:                 edit?.id || newId(),
      from_id:            fromId,
      to_id:              toId,
      amount:             newAmt,
      from_currency:      fromAcc?.currency,
      to_amt:             newToAmt,
      to_currency:        toAcc?.currency,
      rate:               computedRate,
      fee:                feeAmt,
      note,
      is_debt_repayment:  toAccIsSavings ? isDebtRepayment : false,
    };

    if (edit) {
      // ── EDIT ───────────────────────────────────────────────────────────────
      const oldFromAcc = accounts.find(a => a.id === edit.from_id);
      const oldToAcc   = accounts.find(a => a.id === edit.to_id);
      const oldToAmt   = edit.to_amt || edit.amount;
      const oldFee     = edit.fee || 0;

      let oldFeeTxId = null;
      if (oldFee > 0) {
        const oldFeeTx = transactions.find(tx =>
          tx.account_id === edit.from_id &&
          tx.amount === oldFee &&
          tx.date === localDate(edit.created_at) &&
          tx.type === "expense" &&
          tx.note === FEE_TX_NOTE
        );
        oldFeeTxId = oldFeeTx?.id || null;
      }

      const sameFrom = fromId === edit.from_id;
      const sameTo   = toId   === edit.to_id;

      const newFromBal = sameFrom
        ? round2(oldFromAcc.balance + edit.amount + oldFee - newAmt - feeAmt)
        : round2(fromAcc.balance - newAmt - feeAmt);

      const preOldToBal = round2(oldToAcc.balance - oldToAmt);
      let newToBal, newToAvgRateSave = null;

      if (sameTo) {
        newToBal = round2(preOldToBal + newToAmt);
        if (diffCur && computedRate && !toIsKzt) {
          let prevRate = oldToAcc.avg_rate;
          if (edit.rate && oldToAcc.avg_rate && preOldToBal > 0)
            prevRate = (oldToAcc.avg_rate * oldToAcc.balance - oldToAmt * edit.rate) / preOldToBal;
          else if (edit.rate && preOldToBal <= 0)
            prevRate = null;
          const baseRate = prevRate != null ? prevRate : computedRate;
          newToAvgRateSave = Math.round(avgRateFn(preOldToBal, baseRate, newToAmt, computedRate) * 100) / 100;
        }
      } else {
        newToBal = round2(toAcc.balance + newToAmt);
        if (diffCur && computedRate && !toIsKzt) {
          const baseRate = toAcc.avg_rate || computedRate;
          newToAvgRateSave = Math.round(avgRateFn(toAcc.balance, baseRate, newToAmt, computedRate) * 100) / 100;
        }
      }

      const oldFromRestoredBal = !sameFrom ? round2(oldFromAcc.balance + edit.amount + oldFee) : null;
      let oldToRestoredBal = null, oldToRestoredRate = null;
      if (!sameTo) {
        oldToRestoredBal = preOldToBal;
        if (edit.rate && oldToAcc.avg_rate && preOldToBal > 0)
          oldToRestoredRate = Math.round((oldToAcc.avg_rate * oldToAcc.balance - oldToAmt * edit.rate) / preOldToBal * 100) / 100;
      }

      const feeTx = feeAmt > 0 ? {
        id: newId(), type: "expense", amount: feeAmt,
        currency: fromAcc.currency, category_id: feeCatId || null,
        account_id: fromId, date: localDate(edit.created_at), note: FEE_TX_NOTE,
      } : null;

      // Удаляем старую FX транзакцию этого перевода перед пересохранением
      await supabase.from("transactions").delete().eq("transfer_id", edit.id);

      await supaRpc("edit_transfer", {
        p_tr: tr,
        p_from_id: fromId,       p_from_balance:    newFromBal,
        p_to_id:   toId,         p_to_balance:      newToBal,   p_to_avg_rate: newToAvgRateSave,
        p_old_from_id:           sameFrom ? null : edit.from_id,
        p_old_from_balance:      oldFromRestoredBal,
        p_old_to_id:             sameTo   ? null : edit.to_id,
        p_old_to_balance:        oldToRestoredBal,
        p_old_to_avg_rate:       oldToRestoredRate,
        p_old_fee_tx_id:         oldFeeTxId,
        p_fee_tx:                feeTx,
      });

      // Обновляем снимок аналитики
      if (analyticsData) {
        await supabase.from("transfers").update({ analytics: analyticsData }).eq("id", tr.id);
      }
      // Создаём новую FX транзакцию с обновлёнными значениями
      if (fxAccount && hasSellSnap && pnlKzt !== 0) {
        await supabase.from("transactions").insert({
          id:          newId(),
          type:        pnlKzt > 0 ? "income" : "expense",
          amount:      Math.abs(pnlKzt),
          currency:    BASE_CUR,
          account_id:  fxAccount.id,
          date:        todayStr(),
          note:        `${fromAcc.currency}→${toAcc.currency}: курсовая ${pnlKzt > 0 ? "прибыль" : "убыток"}`,
          category_id: null,
          transfer_id: tr.id,
        });
      }

    } else {
      // ── CREATE ─────────────────────────────────────────────────────────────
      const baseFromBal = round2(fromAcc.balance - newAmt);
      const newToBal    = round2(toAcc.balance   + newToAmt);
      let newAvgRate = null;
      if (diffCur && computedRate && !toIsKzt) {
        const oldRate = toAcc.avg_rate || computedRate;
        newAvgRate = Math.round(avgRateFn(toAcc.balance, oldRate, newToAmt, computedRate) * 100) / 100;
      }

      if (feeAmt > 0) {
        const feeTx = {
          id: newId(), type: "expense", amount: feeAmt,
          currency: fromAcc.currency, category_id: feeCatId || null,
          account_id: fromId, date: todayStr(), note: FEE_TX_NOTE,
        };
        await supaRpc("save_transfer_with_fee", {
          p_tr: tr,
          p_from_id: fromId, p_from_balance: round2(baseFromBal - feeAmt),
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

      // Сохраняем снимок аналитики в запись перевода
      if (analyticsData) {
        await supabase.from("transfers").update({ analytics: analyticsData }).eq("id", tr.id);
      }
      // Записываем FX транзакцию в счёт курсовых разниц (не влияет на баланс)
      if (fxAccount && hasSellSnap && pnlKzt !== 0) {
        await supabase.from("transactions").insert({
          id:          newId(),
          type:        pnlKzt > 0 ? "income" : "expense",
          amount:      Math.abs(pnlKzt),
          currency:    BASE_CUR,
          account_id:  fxAccount.id,
          date:        todayStr(),
          note:        `${fromAcc.currency}→${toAcc.currency}: курсовая ${pnlKzt > 0 ? "прибыль" : "убыток"}`,
          category_id: null,
          transfer_id: tr.id,
        });
      }
    }

    const linkedGoal = goals.find(g => g.account_id === toId);
    if (edit) {
      await supabase.from("goal_topups").delete().eq("transfer_id", edit.id);
    }
    if (linkedGoal && !isDebtRepayment) {
      await supaUpsert("goal_topups", {
        id:          newId(),
        goal_id:     linkedGoal.id,
        amount:      newToAmt,
        currency:    toAcc?.currency || tr.to_currency,
        date:        edit ? localDate(edit.created_at) : todayStr(),
        note:        `Перевод: ${fromAcc?.name || ""}`,
        transfer_id: tr.id,
      });
    }

    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!amt || parseFloat(amt) <= 0) errs.amt = "Введите сумму";
    if (!fromId) errs.from = "Выберите счёт отправителя";
    if (!toId)   errs.to   = "Выберите счёт получателя";
    if (fromId && toId && fromId === toId) errs.to = "Нельзя переводить на тот же счёт";
    if (diffCur) {
      if (pricePerGramMode) {
        if (!rate || parseFloat(rate) <= 0) errs.rate = "Введите цену за грамм";
      } else {
        if (!toAmt || parseFloat(toAmt) <= 0) errs.toAmt = "Введите сумму получения";
        if (needManualRate && (!rate || parseFloat(rate) <= 0)) errs.rate = "Укажите курс счёта";
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  const bigInput = (hasErr) => ({
    width:"100%", background:"none", border:"none", outline:"none",
    color: hasErr ? C.errorLight : "#fff", fontSize:28, fontWeight:700,
    padding:"4px 0", boxSizing:"border-box",
  });

  const resetAccFields = () => { setToAmt(""); setRate(""); setToRate(""); };

  const handleToIdChange = (v) => {
    setToId(v);
    resetAccFields();
    setErrors(p => ({ ...p, to: "" }));
    // Авто-предлагаем тоггл если у этого счёта есть непогашенный долг
    const acc = accounts.find(a => a.id === v);
    if (acc && SAVINGS_PURPOSES.includes(acc.purpose)) {
      setIsDebtRepayment((debtState.byAcc[v]?.total || 0) > 0);
    } else {
      setIsDebtRepayment(false);
    }
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={edit ? "Редактировать перевод" : "Новый перевод"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 80px" }}>

        <AccSelect accounts={accounts} value={fromId}
          onChange={v => { setFromId(v); resetAccFields(); setErrors(p => ({...p, from:"", to:""})); }}
          label="Откуда" error={errors.from}/>
        <AccSelect accounts={accounts} value={toId}
          onChange={handleToIdChange}
          label="Куда" error={errors.to}/>
        {errors.to && <p style={{ color:C.errorLight, fontSize:12, marginTop:-10, marginBottom:12 }}>{errors.to}</p>}

        {/* Сумма отправки */}
        <FieldLabel error={errors.amt}>
          {fromIsCom ? "Количество (г)" : `Сумма (${fromAcc?.currency || ""})`}
        </FieldLabel>
        <div style={{ borderBottom:`1px solid ${errors.amt ? "rgba(244,67,54,0.5)" : C.border}`, marginBottom: errors.amt ? 4 : 16 }}>
          <NumInput value={amt} onChange={v => { setAmt(v); setErrors(p => ({...p, amt:""})); }} placeholder="0" style={bigInput(errors.amt)}/>
        </div>
        {errors.amt && <p style={{ color:C.errorLight, fontSize:12, marginBottom:12 }}>{errors.amt}</p>}

        {diffCur && <>
          {/* Сумма получения */}
          {!pricePerGramMode && <>
            <FieldLabel error={errors.toAmt}>
              {toIsCom ? "Получить (г)" : `Получить (${toAcc?.currency || ""})`}
            </FieldLabel>
            <div style={{ borderBottom:`1px solid ${errors.toAmt ? "rgba(244,67,54,0.5)" : C.border}`, marginBottom: errors.toAmt ? 4 : 16 }}>
              <NumInput value={toAmt} onChange={v => { setToAmt(v); setErrors(p => ({...p, toAmt:""})); }} placeholder="0" style={bigInput(errors.toAmt)}/>
            </div>
            {errors.toAmt && <p style={{ color:C.errorLight, fontSize:12, marginBottom:12 }}>{errors.toAmt}</p>}
          </>}

          {/* Цена/г при продаже металла ИЛИ ручной курс при отсутствии avg_rate */}
          {showRateField && <>
            <FieldLabel error={errors.rate}>
              {pricePerGramMode ? "Цена (₸/г)" : `Курс счёта (₸/${fromAcc?.currency || ""})`}
            </FieldLabel>
            <div style={{ borderBottom:`1px solid ${errors.rate ? "rgba(244,67,54,0.5)" : C.border}`, marginBottom: errors.rate ? 4 : 16 }}>
              <NumInput value={rate} onChange={v => { setRate(v); setErrors(p => ({...p, rate:""})); }}
                placeholder={pricePerGramMode ? "напр. 26 000" : "напр. 450"}
                style={bigInput(errors.rate)}/>
            </div>
            {errors.rate && <p style={{ color:C.errorLight, fontSize:12, marginBottom:12 }}>{errors.rate}</p>}
          </>}

          {/* Превью итого в режиме цены за грамм */}
          {pricePerGramMode && effectiveToAmt > 0 && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:C.monCard, borderRadius:10, marginBottom:16 }}>
              <span style={{ fontSize:13, color:C.dim }}>Итого</span>
              <span style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{fmtBal(effectiveToAmt, BASE_CUR)}</span>
            </div>
          )}

          {/* Текущий курс/цена получателя — для точного P&L, не влияет на балансы */}
          {showToRateField && (
            <div style={{ marginBottom:16 }}>
              <FieldLabel>
                {toIsCom ? "Текущая цена (₸/г)" : `Текущий курс (₸/${getSym(toAcc?.currency)})`}
              </FieldLabel>
              <div style={{ borderBottom:`1px solid ${C.border}` }}>
                <NumInput value={toRate} onChange={setToRate}
                  placeholder={toIsCom ? "напр. 50 000" : "напр. 480"}
                  style={{ width:"100%", background:"none", border:"none", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", boxSizing:"border-box" }}/>
              </div>
              <p style={{ margin:"4px 0 0", fontSize:11, color:C.dim }}>
                Для точного P&L — не влияет на балансы
              </p>
            </div>
          )}
        </>}

        {/* Комиссия */}
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

        {/* Комментарий */}
        <FieldLabel>Комментарий</FieldLabel>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:15, padding:"4px 0", marginBottom:24, boxSizing:"border-box" }}/>

        {/* Возврат долга — только когда получатель является накопительным счётом */}
        {toAccIsSavings && (
          <div style={{ marginBottom: 20, padding: "14px 16px", borderRadius: 14, background: isDebtRepayment ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${isDebtRepayment ? "rgba(245,158,11,0.25)" : C.border}`, transition: "background 0.2s, border-color 0.2s" }}>
            <Toggle
              value={isDebtRepayment}
              onChange={setIsDebtRepayment}
              label="Возврат долга самому себе"
            />
            {toAccOutstandingDebt > 0 && (
              <p style={{ margin: "8px 0 0", fontSize: 11, color: isDebtRepayment ? C.amber : C.dim, lineHeight: 1.4 }}>
                Непогашенный долг: {fmtM(toAccOutstandingDebt, toAcc?.currency)}
              </p>
            )}
            {isDebtRepayment && (
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "rgba(245,158,11,0.55)", lineHeight: 1.4 }}>
                Перевод не будет засчитан как накопление
              </p>
            )}
          </div>
        )}

        {/* Анализ сделки: итоговое резюме перед подтверждением */}
        {diffCur && (
          <DealAnalysisBanner
            fromAcc={fromAcc}
            toAcc={toAcc}
            impliedSellRate={impliedSellRate}
            impliedBuyRate={impliedBuyRate}
            refToAvgRate={refToAvgRate}
            hasToHistory={hasToHistory}
            newToAvgRate={newToAvgRate}
            amtNum={amtNum}
          />
        )}

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?"rgba(200,150,30,0.4)":C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Сохранение..." : edit ? "Сохранить" : "Создать перевод"}
        </button>
      </div>
    </div>
  );
}
