import { useState, useMemo, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { BILLS_CATEGORY_ID } from "../../../constants/money";
import { supaRpc } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { todayStr, monthKey } from "../../../utils/date";
import { fmtM, fmtAmtAuto, getSym, round2, toBase, ratesFromAccounts } from "../../../utils/format";
import { monthlyPayment, annualToMonthlyRate } from "../../../utils/loan";
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
        return {
          kind: "bill", id: r.id, name: r.name, day: r.day,
          amount: r.amount, currency: acc?.currency || BASE_CUR,
          paid: r.last_fired === mk, raw: r,
        };
      });
    const loanRows = loans
      .filter(l => l.status === "active")
      .map(l => ({
        kind: "loan", id: l.id, name: l.name, day: l.day,
        // Аннуитетный платёж фиксирован на весь срок — считается от ИСХОДНОГО principal,
        // не от remaining_principal (см. подробный комментарий в LoanDetailPage.jsx).
        amount: monthlyPayment(l.principal, annualToMonthlyRate(l.rate_annual), l.term_months),
        currency: l.currency || BASE_CUR,
        paid: l.last_paid_month === mk, raw: l,
      }));
    // Неоплаченные — сверху по дню оплаты, оплаченные в этом месяце — вниз.
    return [...bills, ...loanRows].sort((a, b) => (a.paid !== b.paid ? (a.paid ? 1 : -1) : a.day - b.day));
  }, [recurring, loans, accounts, mk]);

  const totalKzt = useMemo(
    () => items.reduce((s, it) => s + toBase(it.amount, it.currency, rates), 0),
    [items, rates]
  );

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

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Ежемесячные платежи" onBack={onBack}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>

        <div style={{ padding:"14px 16px", borderRadius:14, background:C.monCard, marginBottom:16, textAlign:"center" }}>
          <p style={{ margin:0, fontSize:12, color:C.dim }}>Всего в месяц</p>
          <p style={{ margin:"4px 0 0", fontSize:24, fontWeight:800, color:"#fff" }}>{sym}{fmtAmtAuto(totalKzt)}</p>
        </div>

        {items.length === 0 && (
          <p style={{ textAlign:"center", padding:"40px 0", color:C.dim, fontSize:14 }}>Пока нет ежемесячных платежей</p>
        )}

        {items.map(it => {
          const isBill = it.kind === "bill";
          return (
            <div key={it.id} onClick={() => navigate(isBill ? "editBill" : "loanDetail", it.raw)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 12px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer", opacity: it.paid ? 0.55 : 1 }}>
              <div style={{ width:38, textAlign:"center", flexShrink:0 }}>
                <p style={{ margin:0, fontSize:18, fontWeight:700, color:"#fff" }}>{it.day}</p>
                <p style={{ margin:0, fontSize:10, color:C.dim }}>число</p>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:15, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.name}</p>
                <p style={{ margin:"2px 0 0", fontSize:12, color: it.paid ? C.green : C.dim }}>{it.paid ? "Оплачено в этом месяце" : "Не оплачено"}</p>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <p style={{ margin:0, fontSize:15, fontWeight:700, color: it.paid ? C.dim : "#fff", textDecoration: it.paid ? "line-through" : "none" }}>
                  {fmtM(it.amount, it.currency)}
                </p>
                {!it.paid && (
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

        <button
          onClick={() => setAddOpen(true)}
          style={{ width:"100%", padding:13, borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
        >
          <Ico n="plus" s={16} c={C.green}/> Добавить
        </button>
      </div>

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
    </div>
  );
}
