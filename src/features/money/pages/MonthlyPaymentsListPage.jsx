import { useState, useMemo, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { BILLS_CATEGORY_ID } from "../../../constants/money";
import { supaRpc } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { todayStr, monthKey } from "../../../utils/date";
import { fmtM, fmtAmtAuto, fmtDateShort, getSym, round2, toBase, ratesFromAccounts } from "../../../utils/format";
import { annualToMonthlyRate, effectivePayment, remainingMonthsFromBalance } from "../../../utils/loan";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { BottomSheet } from "../../../components/BottomSheet";
import { AccSelect } from "../../../components/AccSelect";
import { NumInput } from "../../../components/NumInput";
import { Ico } from "../../../components/Ico";

const sym = getSym(BASE_CUR);

export function MonthlyPaymentsListPage({ recurring = [], loans = [], accounts = [], navigate, onReload, onBack }) {
  const mk = monthKey(todayStr());
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);

  const items = useMemo(() => {
    const bills = recurring
      .filter(r => r.active !== false)
      .map(r => {
        const acc = accounts.find(a => a.id === r.acc_id);
        // Платёж, у которого дата первого взноса ещё не наступила (v19) — та же логика,
        // что и у кредитов ниже: не считается неоплаченным до этой даты.
        const notStarted = !!r.start_date && monthKey(r.start_date) > mk;
        return {
          kind: "bill", id: r.id, name: r.name, day: r.day,
          amount: r.amount, currency: acc?.currency || BASE_CUR,
          paid: notStarted ? true : r.last_fired === mk, notStarted, raw: r,
        };
      });
    const loanRows = loans
      .filter(l => l.status === "active")
      .map(l => {
        // Кредит, у которого дата первого платежа ещё не наступила (новый кредит, первый
        // платёж в следующем месяце) — не должен предлагать оплату уже сейчас, см. day-based
        // ловушку в utils/cashflowTimeline.js. notStarted-строка визуально как оплаченная
        // (приглушена, без кнопки), но с отдельной подписью даты старта.
        const notStarted = !!l.start_date && monthKey(l.start_date) > mk;
        const monthlyRate = annualToMonthlyRate(l.rate_annual);
        // Факт. платёж по банку, если задан (loan.payment) — иначе расчётный аннуитет от
        // исходного principal, не от remaining_principal (см. LoanDetailPage.jsx).
        const amount = effectivePayment(l, monthlyRate);
        return {
          kind: "loan", id: l.id, name: l.name, day: l.day, amount,
          currency: l.currency || BASE_CUR,
          paid: notStarted ? true : l.last_paid_month === mk, notStarted, raw: l,
          remainingMonths: remainingMonthsFromBalance(l.remaining_principal, monthlyRate, amount),
        };
      });
    // Неоплаченные — сверху по дню оплаты, оплаченные (и ещё не стартовавшие) — вниз.
    return [...bills, ...loanRows].sort((a, b) => (a.paid !== b.paid ? (a.paid ? 1 : -1) : a.day - b.day));
  }, [recurring, loans, accounts, mk]);

  // Кредиты/платежи, которые ещё не стартовали, не входят в обязательства ЭТОГО месяца —
  // ни в общую сумму, ни в статистику "оплачено/не оплачено".
  const dueItems = useMemo(() => items.filter(it => !it.notStarted), [items]);
  const totalKzt = useMemo(
    () => dueItems.reduce((s, it) => s + toBase(it.amount, it.currency, rates), 0),
    [dueItems, rates]
  );
  const paidThisMonth = useMemo(() => {
    const paid = dueItems.filter(it => it.paid);
    return {
      count: paid.length, total: dueItems.length,
      sum: paid.reduce((s, it) => s + toBase(it.amount, it.currency, rates), 0),
    };
  }, [dueItems, rates]);

  // Долговая нагрузка по кредитам целиком (не только этот месяц) — общий долг/погашено/остаток,
  // чтобы видеть картину за пределами текущего платежа.
  const loanDebt = useMemo(() => {
    const activeLoans = loans.filter(l => l.status === "active");
    if (activeLoans.length === 0) return null;
    const totalPrincipal = activeLoans.reduce((s, l) => s + toBase(l.principal, l.currency || BASE_CUR, rates), 0);
    const totalRemaining = activeLoans.reduce((s, l) => s + toBase(l.remaining_principal, l.currency || BASE_CUR, rates), 0);
    return { totalPrincipal, totalRemaining, totalPaid: Math.max(totalPrincipal - totalRemaining, 0) };
  }, [loans, rates]);

  // Режим выбора — посчитать сумму произвольного набора платежей (не только "этот месяц" по
  // умолчанию сверху). Пока активен, тап по строке переключает чекбокс вместо перехода в
  // деталку/форму, кнопка "Оплатить" скрыта, чтобы не задеть оплату случайным тапом.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const toggleSelectMode = () => { setSelectMode(p => !p); setSelected(new Set()); };
  const toggleSelected = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectedStats = useMemo(() => {
    const picked = items.filter(it => selected.has(it.id));
    return { count: picked.length, sum: picked.reduce((s, it) => s + toBase(it.amount, it.currency, rates), 0) };
  }, [items, selected, rates]);

  const [addOpen, setAddOpen] = useState(false);
  const [payItem, setPayItem] = useState(null);
  const [payAccId, setPayAccId] = useState("");
  const [payCurrency, setPayCurrency] = useState(BASE_CUR);
  const [payAmt, setPayAmt] = useState("");

  const openPay = (it) => {
    const acc = accounts.find(a => a.id === it.raw.acc_id) || accounts[0];
    setPayItem(it);
    setPayAccId(acc?.id || "");
    setPayCurrency(acc?.currency || it.currency);
    setPayAmt(String(it.amount));
  };

  const saveRef = useRef(null);
  const { save: execPay, saving: paying, saveError: payError, setSaveError: setPayError } = useSave(
    () => saveRef.current(),
    { errorMsg: "Не удалось оплатить" }
  );
  saveRef.current = async () => {
    const acc = accounts.find(a => a.id === payAccId);
    if (!acc) return;
    const amt = parseFloat(payAmt) || 0;
    const tx = {
      id: newId(), type: "expense", amount: amt, currency: acc.currency,
      category_id: BILLS_CATEGORY_ID, account_id: acc.id, date: todayStr(), note: payItem.name,
    };
    const newBal = round2(acc.balance - amt);
    await supaRpc("fire_recurring", {
      p_tx: tx, p_account_id: acc.id, p_new_balance: newBal,
      p_rec_id: payItem.id, p_month: mk,
    });
    setPayItem(null);
    onReload();
  };
  const pay = () => {
    if (!payAccId || !parseFloat(payAmt)) return;
    execPay();
  };

  // Массовая оплата выбранных платежей одним счётом списания — сценарий "несколько
  // рассрочек одного банка в один день". Суммы НЕ редактируются (в отличие от одиночной
  // оплаты) — берётся тот же эффективный платёж, что уже показан в строке (фикс. от банка
  // или расчётный). Уже оплаченные/ещё не стартовавшие в выборке просто игнорируются —
  // их нельзя оплатить повторно.
  const payableSelected = useMemo(
    () => items.filter(it => selected.has(it.id) && !it.paid && !it.notStarted),
    [items, selected]
  );
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkAccId, setBulkAccId] = useState("");
  const openBulkPay = () => {
    setBulkAccId(accounts[0]?.id || "");
    setBulkPayOpen(true);
  };
  const bulkPayTotal = useMemo(
    () => payableSelected.reduce((s, it) => s + toBase(it.amount, it.currency, rates), 0),
    [payableSelected, rates]
  );

  const bulkPayRef = useRef(null);
  const { save: execBulkPay, saving: bulkPaying, saveError: bulkPayError, setSaveError: setBulkPayError } = useSave(
    () => bulkPayRef.current(),
    { errorMsg: "Не удалось оплатить" }
  );
  bulkPayRef.current = async () => {
    const acc = accounts.find(a => a.id === bulkAccId);
    if (!acc) return;
    // Последовательно, не параллельно — каждый вызов выставляет АБСОЛЮТНЫЙ баланс счёта,
    // при параллельных запросах поздний ответ затёр бы результат предыдущего.
    let runningBalance = acc.balance;
    for (const it of payableSelected) {
      if (it.kind === "bill") {
        const tx = {
          id: newId(), type: "expense", amount: it.amount, currency: acc.currency,
          category_id: BILLS_CATEGORY_ID, account_id: acc.id, date: todayStr(), note: it.name,
        };
        runningBalance = round2(runningBalance - it.amount);
        await supaRpc("fire_recurring", {
          p_tx: tx, p_account_id: acc.id, p_new_balance: runningBalance,
          p_rec_id: it.raw.id, p_month: mk,
        });
      } else {
        const l = it.raw;
        const monthlyRate = annualToMonthlyRate(l.rate_annual);
        const interestPart = round2(l.remaining_principal * monthlyRate);
        // Та же "последний платёж закрывает в ноль" логика, что в LoanDetailPage.openPay —
        // иначе массовая оплата почти доплаченной рассрочки списала бы полный плановый
        // платёж и оставила бы кредит "висеть" на пару тенге.
        const closingAmount = round2(l.remaining_principal + interestPart);
        const amt = closingAmount <= it.amount + 0.01 ? closingAmount : it.amount;
        const principalPart = round2(Math.max(Math.min(amt - interestPart, l.remaining_principal), 0));
        const newRemaining = round2(Math.max(l.remaining_principal - principalPart, 0));
        const newStatus = newRemaining <= 0.01 ? "closed" : "active";
        const tx = {
          id: newId(), type: "expense", amount: amt, currency: acc.currency,
          category_id: BILLS_CATEGORY_ID, account_id: acc.id, date: todayStr(), note: it.name,
        };
        const payment = {
          id: newId(), date: todayStr(), amount: amt,
          principal_part: principalPart, interest_part: interestPart,
          is_early_repayment: false, note: "",
        };
        runningBalance = round2(runningBalance - amt);
        await supaRpc("pay_loan", {
          p_tx: tx, p_account_id: acc.id, p_new_balance: runningBalance,
          p_loan_id: l.id, p_month: mk, p_payment: payment,
          p_new_remaining: newRemaining, p_new_status: newStatus,
        });
      }
    }
    setBulkPayOpen(false);
    setSelectMode(false);
    setSelected(new Set());
    onReload();
  };
  const bulkPay = () => { if (bulkAccId && payableSelected.length > 0) execBulkPay(); };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Ежемесячные платежи" onBack={onBack} right={
        <button onClick={toggleSelectMode} style={{ background:"none", border:"none", color: selectMode ? C.green : C.mid, fontSize:14, fontWeight:600, cursor:"pointer", padding:"4px 2px" }}>
          {selectMode ? "Готово" : "Выбрать"}
        </button>
      }/>
      <div style={{ flex:1, overflowY:"auto", padding: selectMode ? "16px 16px 140px" : "16px 16px 100px" }}>

        <div style={{ padding:"14px 16px", borderRadius:14, background:C.monCard, marginBottom:12, textAlign:"center" }}>
          <p style={{ margin:0, fontSize:12, color:C.dim }}>Всего в месяц</p>
          <p style={{ margin:"4px 0 10px", fontSize:24, fontWeight:800, color:"#fff" }}>{sym}{fmtAmtAuto(totalKzt)}</p>

          {paidThisMonth.total > 0 && (
            <>
              <div style={{ height:6, borderRadius:3, background:"rgba(255,255,255,0.08)" }}>
                <div style={{ height:6, borderRadius:3, width:`${(paidThisMonth.sum / (totalKzt || 1)) * 100}%`, background:C.green, transition:"width 0.4s ease" }}/>
              </div>
              <p style={{ margin:"8px 0 0", fontSize:12, color:C.dim }}>
                Оплачено <span style={{ color:C.green, fontWeight:700 }}>{paidThisMonth.count} из {paidThisMonth.total}</span>
                {" · "}{sym}{fmtAmtAuto(paidThisMonth.sum)} из {sym}{fmtAmtAuto(totalKzt)}
              </p>
            </>
          )}
        </div>

        {loanDebt && (
          <div style={{ padding:"14px 16px", borderRadius:14, background:C.monCard, marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <div>
                <p style={{ margin:0, fontSize:11, color:C.dim }}>Остаток долга по кредитам</p>
                <p style={{ margin:"2px 0 0", fontSize:17, fontWeight:800, color:"#fff" }}>{sym}{fmtAmtAuto(loanDebt.totalRemaining)}</p>
              </div>
              <div style={{ textAlign:"right" }}>
                <p style={{ margin:0, fontSize:11, color:C.dim }}>Уже погашено</p>
                <p style={{ margin:"2px 0 0", fontSize:17, fontWeight:800, color:C.blue }}>{sym}{fmtAmtAuto(loanDebt.totalPaid)}</p>
              </div>
            </div>
            <div style={{ height:6, borderRadius:3, background:"rgba(255,255,255,0.08)" }}>
              <div style={{ height:6, borderRadius:3, width:`${loanDebt.totalPrincipal > 0 ? (loanDebt.totalPaid / loanDebt.totalPrincipal) * 100 : 0}%`, background:C.blue, transition:"width 0.4s ease" }}/>
            </div>
            <p style={{ margin:"6px 0 0", fontSize:11, color:C.dim }}>из {sym}{fmtAmtAuto(loanDebt.totalPrincipal)} взято всего</p>
          </div>
        )}

        {items.length === 0 && (
          <p style={{ textAlign:"center", padding:"40px 0", color:C.dim, fontSize:14 }}>Пока нет ежемесячных платежей</p>
        )}

        {items.map(it => {
          const isBill = it.kind === "bill";
          const isSelected = selected.has(it.id);
          return (
            <div key={it.id}
              onClick={() => selectMode ? toggleSelected(it.id) : navigate(isBill ? "editBill" : "loanDetail", it.raw)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:14, background: isSelected ? "rgba(76,175,80,0.12)" : C.monCard, border: isSelected ? `1px solid ${C.green}` : "1px solid transparent", marginBottom:8, cursor:"pointer", opacity: !selectMode && it.paid ? 0.55 : 1 }}>
              {selectMode && (
                <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background: isSelected ? C.green : "transparent", border: `2px solid ${isSelected ? C.green : C.border}` }}>
                  {isSelected && <Ico n="check" s={13} c="#fff"/>}
                </div>
              )}
              <div style={{ width:38, textAlign:"center", flexShrink:0 }}>
                <p style={{ margin:0, fontSize:18, fontWeight:700, color:"#fff" }}>{it.day}</p>
                <p style={{ margin:0, fontSize:10, color:C.dim }}>число</p>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:15, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.name}</p>
                <p style={{ margin:"2px 0 0", fontSize:12, color: it.notStarted ? C.dim : it.paid ? C.green : C.dim }}>
                  {it.notStarted ? `Первый платёж ${fmtDateShort(it.raw.start_date)}` : it.paid ? "Оплачено в этом месяце" : "Не оплачено"}
                </p>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <p style={{ margin:0, fontSize:15, fontWeight:700, color: it.paid ? C.dim : "#fff", textDecoration: it.paid && !it.notStarted ? "line-through" : "none" }}>
                  {fmtM(it.amount, it.currency)}
                </p>
                {!isBill && !it.notStarted && it.remainingMonths != null && (
                  <p style={{ margin:"1px 0 0", fontSize:10, color:C.dim }}>ост. {it.remainingMonths} мес.</p>
                )}
                {!selectMode && !it.paid && (
                  <button
                    onClick={isBill
                      ? e => { e.stopPropagation(); openPay(it); }
                      : e => { e.stopPropagation(); navigate("loanDetail", it.raw); }}
                    style={{ marginTop:4, padding:"5px 12px", borderRadius:20, background:C.greenDim, border:`1px solid ${C.green}`, color:C.green, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    Оплатить
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!selectMode && (
          <button
            onClick={() => setAddOpen(true)}
            style={{ width:"100%", padding:13, borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
          >
            <Ico n="plus" s={16} c={C.green}/> Добавить
          </button>
        )}
      </div>

      {selectMode && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px calc(12px + env(safe-area-inset-bottom, 0px))", background:C.monHeader, borderTop:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div>
            <span style={{ fontSize:13, color:C.dim }}>Выбрано: <span style={{ color:"#fff", fontWeight:700 }}>{selectedStats.count}</span></span>
            <p style={{ margin:"2px 0 0", fontSize:18, fontWeight:800, color:"#fff" }}>{sym}{fmtAmtAuto(selectedStats.sum)}</p>
          </div>
          {payableSelected.length > 0 && (
            <button onClick={openBulkPay}
              style={{ padding:"11px 20px", borderRadius:24, background:C.greenDim, border:`1px solid ${C.green}`, color:C.green, fontSize:14, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
              Оплатить {payableSelected.length}
            </button>
          )}
        </div>
      )}

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Добавить">
        <div onClick={() => { setAddOpen(false); navigate("addBill"); }}
          style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontSize:15, color:"#fff" }}>Платёж</p>
            <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim }}>Подписка, аренда — фиксированная сумма</p>
          </div>
          <Ico n="chevR" s={18} c={C.dim}/>
        </div>
        <div onClick={() => { setAddOpen(false); navigate("loanCalc", { saveMode: true }); }}
          style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:14, background:C.monCard, cursor:"pointer" }}>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontSize:15, color:"#fff" }}>Рассрочка / кредит</p>
            <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim }}>Через калькулятор — сумма, ставка, срок</p>
          </div>
          <Ico n="chevR" s={18} c={C.dim}/>
        </div>
      </BottomSheet>

      <BottomSheet open={!!payItem} onClose={() => { setPayItem(null); setPayError(null); }} title={payItem ? `Оплатить «${payItem.name}»` : ""}>
        {payItem && (
          <>
            <AccSelect
              accounts={accounts}
              value={payAccId}
              onChange={setPayAccId}
              onCurrencyChange={setPayCurrency}
              label="Счёт списания"
            />
            <div style={{ marginBottom:16 }}>
              <p style={{ margin:"0 0 6px", fontSize:13, color:C.dim }}>Сумма ({payCurrency})</p>
              <NumInput
                value={payAmt}
                onChange={setPayAmt}
                placeholder="0"
                style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0", boxSizing:"border-box" }}
              />
            </div>
            {payError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{payError}</p>}
            <button onClick={pay} disabled={paying} style={{ width:"100%", padding:"15px", borderRadius:30, background:paying?C.savingDisabled:C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
              {paying ? "Оплата..." : "Оплатить"}
            </button>
          </>
        )}
      </BottomSheet>

      <BottomSheet open={bulkPayOpen} onClose={() => { setBulkPayOpen(false); setBulkPayError(null); }} title={`Оплатить ${payableSelected.length} платежей`}>
        <AccSelect accounts={accounts} value={bulkAccId} onChange={setBulkAccId} label="Счёт списания"/>

        <div style={{ marginBottom:16 }}>
          {payableSelected.map(it => (
            <div key={it.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:13, color:C.main, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginRight:8 }}>{it.name}</span>
              <span style={{ fontSize:13, fontWeight:600, color:"#fff", flexShrink:0 }}>{fmtM(it.amount, it.currency)}</span>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", marginBottom:16 }}>
          <span style={{ fontSize:14, color:C.dim }}>Итого спишется</span>
          <span style={{ fontSize:18, fontWeight:800, color:"#fff" }}>{sym}{fmtAmtAuto(bulkPayTotal)}</span>
        </div>

        {selectedStats.count > payableSelected.length && (
          <p style={{ margin:"-8px 0 16px", fontSize:12, color:C.dim, lineHeight:1.4 }}>
            {selectedStats.count - payableSelected.length} из выбранного уже оплачено или ещё не стартовало — пропущено.
          </p>
        )}

        {bulkPayError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{bulkPayError}</p>}
        <button onClick={bulkPay} disabled={bulkPaying || !bulkAccId} style={{ width:"100%", padding:"15px", borderRadius:30, background:bulkPaying?C.savingDisabled:C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {bulkPaying ? "Оплата..." : `Оплатить ${sym}${fmtAmtAuto(bulkPayTotal)}`}
        </button>
      </BottomSheet>
    </div>
  );
}
