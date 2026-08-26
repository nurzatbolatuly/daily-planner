import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym, fmtAmtAuto, fmtDateShort, round2 } from "../../../utils/format";
import { monthKey, pad } from "../../../utils/date";
import { addMonths } from "../../../utils/cashflowTimeline";
import { newId } from "../../../utils/id";
import { supaUpsert } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { monthlyRateFromPayment, monthlyToAnnualRate, annualToMonthlyRate, loanSummary, simulateEarlyRepayment, simulateLumpSumRepayment, remainingAfterPayments } from "../../../utils/loan";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { BottomSheet } from "../../../components/BottomSheet";
import { CalendarPicker } from "../../../components/CalendarPicker";

const sym = getSym(BASE_CUR);

const MODES = [
  { key: "payment", label: "Платёж" },
  { key: "rate",    label: "Ставка" },
  { key: "prepay",  label: "Досрочное" },
];

const STRATEGIES = [
  { key: "term",    label: "Сократить срок" },
  { key: "payment", label: "Уменьшить платёж" },
];

const PREPAY_MODES = [
  { key: "monthly", label: "Ежемесячно" },
  { key: "lump",    label: "Разовый платёж" },
];

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none",
};

// Дефолтный день ежемесячного платежа — 14 число, тот же дефолт, что и у recurring-платежей
// (`BillFormPage`: `edit?.day || 14`). Дата первого платежа по умолчанию — 14-е ТЕКУЩЕГО месяца
// (не следующего — как и у BillFormPage, это просто отправная точка для CalendarPicker, а не
// попытка угадать реальный график; пользователь поправит на настоящую дату при необходимости).
const DEFAULT_PAYMENT_DAY = 14;
const defaultLoanStartDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(DEFAULT_PAYMENT_DAY)}`;
};

export function LoanCalculatorPage({ onBack, saveMode = false }) {
  const [mode, setMode] = useState("payment");

  const [amount, setAmount]     = useState("");
  const [downPay, setDownPay]   = useState("");
  const [months, setMonths]     = useState("");
  const [rate, setRate]         = useState("");
  const [payment, setPayment]   = useState("");

  const [prepayMode, setPrepayMode] = useState("monthly"); // "monthly" | "lump"
  const [extra, setExtra]           = useState("");
  const [strategy, setStrategy]     = useState("term");
  const [startMonth, setStartMonth] = useState("");
  const [lumpAmt, setLumpAmt]           = useState("");
  const [lumpMonthNum, setLumpMonthNum] = useState("1");

  const [saveOpen, setSaveOpen] = useState(false);
  const [loanName, setLoanName] = useState("");
  const [loanStartDate, setLoanStartDate] = useState(defaultLoanStartDate());
  const [showStartCal, setShowStartCal] = useState(false);
  const [monthsPaid, setMonthsPaid] = useState("0");
  const [loanNameError, setLoanNameError] = useState("");

  const openSave = () => {
    setLoanName("");
    setLoanStartDate(defaultLoanStartDate());
    setMonthsPaid("0");
    setLoanNameError("");
    setSaveOpen(true);
  };

  const saveLoanRef = useRef(null);
  const { save: execSaveLoan, saving: savingLoan, saveError: saveLoanError } = useSave(
    () => saveLoanRef.current(),
    { errorMsg: "Не удалось сохранить кредит" }
  );
  saveLoanRef.current = async () => {
    const monthlyRate = annualToMonthlyRate(rateN);
    // Тело считается по графику вперёд на уже оплаченные месяцы — remaining_principal сразу
    // отражает реальный остаток старой рассрочки, а не исходную сумму займа.
    const remaining = monthsPaidN > 0
      ? round2(remainingAfterPayments(principal, monthlyRate, monthsN, monthsPaidN))
      : principal;
    // last_paid_month — месяц ПОСЛЕДНЕГО из уже оплаченных платежей (считая от даты первого
    // платежа), чтобы "оплачено в этом месяце" сразу показывало верный статус, а не считало
    // текущий месяц неоплаченным. Для нового кредита (0 месяцев оплачено) остаётся "" —
    // до наступления даты первого платежа кредит нигде не показывается как просроченный,
    // см. фильтр по start_date в utils/cashflowTimeline.js.
    const lastPaidMonth = monthsPaidN > 0 ? monthKey(addMonths(loanStartDate, monthsPaidN - 1)) : "";
    const loan = {
      id: newId(),
      name: loanName.trim(),
      principal,
      currency: BASE_CUR,
      rate_annual: rateN,
      term_months: monthsN,
      remaining_principal: remaining,
      day: new Date(loanStartDate + "T12:00:00").getDate(),
      acc_id: null,
      cat_id: null,
      start_date: loanStartDate,
      status: remaining <= 0.01 ? "closed" : "active",
      last_paid_month: lastPaidMonth,
      months_paid_at_creation: monthsPaidN,
      note: "",
    };
    await supaUpsert("loans", loan);
    onBack(true);
  };
  const saveLoan = () => {
    if (!loanName.trim()) { setLoanNameError("Введите название"); return; }
    execSaveLoan();
  };

  const amountN   = parseFloat(amount) || 0;
  const downN     = Math.min(parseFloat(downPay) || 0, amountN);
  const principal = Math.max(amountN - downN, 0);
  const monthsN   = parseInt(months, 10) || 0;
  const rateN     = parseFloat(rate) || 0;

  // Сколько платежей по графику уже сделано ДО того, как кредит попал в приложение (импорт
  // старой рассрочки) — зажимается в [0, срок]. Для нового кредита остаётся 0.
  const monthsPaidN = Math.min(Math.max(parseInt(monthsPaid, 10) || 0, 0), monthsN);

  let result = null;

  if (mode === "payment") {
    if (principal > 0 && monthsN > 0) {
      const { payment: pay, total, overpay } = loanSummary(principal, annualToMonthlyRate(rateN), monthsN);
      result = { payment: pay, total, overpay };
    }
  } else if (mode === "rate") {
    const paymentN = parseFloat(payment) || 0;
    if (principal > 0 && monthsN > 0 && paymentN > 0) {
      const mr = monthlyRateFromPayment(principal, paymentN, monthsN);
      if (mr != null) {
        const annualRate = monthlyToAnnualRate(mr);
        const total   = paymentN * monthsN;
        const overpay = Math.max(total - principal, 0);
        result = { annualRate, total, overpay };
      }
    }
  } else if (prepayMode === "monthly") {
    const extraN = parseFloat(extra) || 0;
    const startN = Math.max(parseInt(startMonth, 10) || 1, 1);
    if (principal > 0 && monthsN > 0 && extraN > 0) {
      const monthlyRate = annualToMonthlyRate(rateN);
      const base = loanSummary(principal, monthlyRate, monthsN);
      const sim  = simulateEarlyRepayment(principal, monthlyRate, monthsN, extraN, { strategy, startMonth: startN });
      result = {
        basePayment: base.payment, baseOverpay: base.overpay,
        newMonths: sim.months, newPayment: sim.finalPayment, newOverpay: sim.overpay,
        savings: Math.max(base.overpay - sim.overpay, 0),
        monthsSaved: Math.max(monthsN - sim.months, 0),
      };
    }
  } else {
    const lumpN      = parseFloat(lumpAmt) || 0;
    const lumpMonthN = Math.max(parseInt(lumpMonthNum, 10) || 1, 1);
    if (principal > 0 && monthsN > 0 && lumpN > 0) {
      const monthlyRate = annualToMonthlyRate(rateN);
      const base = loanSummary(principal, monthlyRate, monthsN);
      const sim  = simulateLumpSumRepayment(principal, monthlyRate, monthsN, lumpN, lumpMonthN);
      result = {
        baseOverpay: base.overpay,
        newMonths: sim.months, newOverpay: sim.overpay,
        savings: Math.max(base.overpay - sim.overpay, 0),
        monthsSaved: Math.max(monthsN - sim.months, 0),
      };
    }
  }

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: "#fff", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Кредитный калькулятор" onBack={() => onBack(false)}/>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 40px" }}>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {MODES.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                       background: mode === m.key ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
                       color: mode === m.key ? C.blue : C.dim }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Amount */}
        <FieldLabel>Сумма займа / товара</FieldLabel>
        <NumInput value={amount} onChange={setAmount} placeholder="0" style={{ ...inputStyle, marginBottom: 14 }}/>

        {/* Down payment */}
        <FieldLabel>Первоначальный взнос (необязательно)</FieldLabel>
        <NumInput value={downPay} onChange={setDownPay} placeholder="0" style={{ ...inputStyle, marginBottom: 14 }}/>

        {mode === "rate" ? (
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Платёж в месяц</FieldLabel>
              <NumInput value={payment} onChange={setPayment} placeholder="0" style={inputStyle}/>
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Срок, мес.</FieldLabel>
              <NumInput value={months} onChange={setMonths} placeholder="0" style={inputStyle}/>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Ставка, % годовых</FieldLabel>
              <NumInput value={rate} onChange={setRate} placeholder="0" style={inputStyle}/>
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Срок, мес.</FieldLabel>
              <NumInput value={months} onChange={setMonths} placeholder="0" style={inputStyle}/>
            </div>
          </div>
        )}

        {mode === "prepay" && (
          <>
            <FieldLabel>Тип досрочного погашения</FieldLabel>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {PREPAY_MODES.map(m => (
                <button key={m.key} onClick={() => setPrepayMode(m.key)}
                  style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                           background: prepayMode === m.key ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
                           color: prepayMode === m.key ? C.blue : C.dim }}>
                  {m.label}
                </button>
              ))}
            </div>

            {prepayMode === "monthly" ? (
              <>
                <FieldLabel>Доп. платёж в месяц, сверх обязательного</FieldLabel>
                <NumInput value={extra} onChange={setExtra} placeholder="0" style={{ ...inputStyle, marginBottom: 14 }}/>

                <FieldLabel>Стратегия</FieldLabel>
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {STRATEGIES.map(s => (
                    <button key={s.key} onClick={() => setStrategy(s.key)}
                      style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                               background: strategy === s.key ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
                               color: strategy === s.key ? C.blue : C.dim }}>
                      {s.label}
                    </button>
                  ))}
                </div>

                <FieldLabel>Начать с платежа № (необязательно, по умолчанию — с первого)</FieldLabel>
                <NumInput value={startMonth} onChange={setStartMonth} placeholder="1" style={{ ...inputStyle, marginBottom: 14 }}/>
              </>
            ) : (
              <>
                <FieldLabel>Сумма разового платежа</FieldLabel>
                <NumInput value={lumpAmt} onChange={setLumpAmt} placeholder="0" style={{ ...inputStyle, marginBottom: 14 }}/>

                <FieldLabel>На каком платеже по счёту вносится (1 = на первом)</FieldLabel>
                <NumInput value={lumpMonthNum} onChange={setLumpMonthNum} placeholder="1" style={{ ...inputStyle, marginBottom: 14 }}/>
              </>
            )}
          </>
        )}

        {principal > 0 && (
          <p style={{ margin: "-4px 0 14px", fontSize: 12, color: C.dim }}>
            Тело кредита: {sym}{fmtAmtAuto(principal)}
          </p>
        )}

        {/* Result */}
        <div style={{ background: C.monCard, borderRadius: 16, padding: "16px 16px", marginTop: 6 }}>
          {!result ? (
            <p style={{ margin: 0, fontSize: 13, color: C.dim, textAlign: "center" }}>
              {mode === "prepay" ? "Заполните сумму, срок и доп. платёж, чтобы увидеть выгоду" : "Заполните сумму и срок, чтобы увидеть результат"}
            </p>
          ) : mode === "payment" ? (
            <>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: C.dim }}>Ежемесячный платёж</p>
              <p style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 800, color: C.blue }}>
                {sym}{fmtAmtAuto(result.payment)}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <span>Всего выплат</span>
                <span style={{ color: "#fff" }}>{sym}{fmtAmtAuto(result.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, marginTop: 6 }}>
                <span>Переплата</span>
                <span style={{ color: C.amber }}>{sym}{fmtAmtAuto(result.overpay)}</span>
              </div>
            </>
          ) : mode === "rate" ? (
            <>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: C.dim }}>Ставка</p>
              <p style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 800, color: C.blue }}>
                {fmtAmtAuto(result.annualRate)}% годовых
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <span>Всего выплат</span>
                <span style={{ color: "#fff" }}>{sym}{fmtAmtAuto(result.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, marginTop: 6 }}>
                <span>Переплата</span>
                <span style={{ color: C.amber }}>{sym}{fmtAmtAuto(result.overpay)}</span>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: C.dim }}>Экономия на процентах</p>
              <p style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 800, color: C.green }}>
                {sym}{fmtAmtAuto(result.savings)}
              </p>
              {prepayMode === "lump" || strategy === "term" ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <span>Новый срок</span>
                  <span style={{ color: "#fff" }}>{result.newMonths} мес. вместо {monthsN} {result.monthsSaved > 0 && <span style={{ color: C.green }}>(−{result.monthsSaved})</span>}</span>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <span>Платёж под конец срока</span>
                  <span style={{ color: "#fff" }}>{sym}{fmtAmtAuto(result.newPayment)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dim, marginTop: 6 }}>
                <span>Переплата было / станет</span>
                <span><span style={{ color: C.dim, textDecoration: "line-through" }}>{sym}{fmtAmtAuto(result.baseOverpay)}</span>{" → "}<span style={{ color: C.amber }}>{sym}{fmtAmtAuto(result.newOverpay)}</span></span>
              </div>
            </>
          )}
        </div>

        {saveMode && mode === "payment" && result && (
          <button onClick={openSave}
            style={{ width: "100%", padding: 13, borderRadius: 12, background: "transparent", border: `1px dashed rgba(76,175,80,0.4)`, color: C.green, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 12 }}>
            Сохранить как кредит
          </button>
        )}

        {mode === "prepay" && (
          <p style={{ margin: "12px 2px 0", fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
            По ст. 39 Закона РК «О банках и банковской деятельности» банк не вправе брать комиссию
            за досрочное погашение — кроме случаев, когда оно происходит в первые 6 мес. (для займов
            до 1 года) или 1 год (для займов свыше 1 года) с даты выдачи. Уточняй условия своего
            договора — банк мог прописать более мягкие правила.
          </p>
        )}
      </div>

      <BottomSheet open={saveOpen} onClose={() => setSaveOpen(false)} title="Сохранить как кредит">
        <FieldLabel error={loanNameError}>Название</FieldLabel>
        <input
          value={loanName}
          onChange={e => { setLoanName(e.target.value); setLoanNameError(""); }}
          placeholder="Например, Рассрочка на телефон"
          style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${loanNameError?"rgba(244,67,54,0.5)":C.border}`, outline:"none", color:"#fff", fontSize:16, padding:"4px 0", marginBottom:16, boxSizing:"border-box" }}
        />
        <div style={{ marginBottom:8 }}>
          <FieldLabel>Дата первого платежа</FieldLabel>
          <button onClick={() => setShowStartCal(true)}
            style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0", textAlign:"left", cursor:"pointer" }}>
            {fmtDateShort(loanStartDate)}
          </button>
        </div>
        <p style={{ margin:"-4px 0 20px", fontSize:12, color:C.dim, lineHeight:1.4 }}>
          Новый кредит — выберите будущую дату, если первый платёж только в следующем месяце.
          Уже действующая рассрочка — укажите дату самого первого платежа по графику (в прошлом).
        </p>

        <div style={{ marginBottom:8 }}>
          <FieldLabel>Сколько месяцев уже оплачено</FieldLabel>
          <NumInput value={monthsPaid} onChange={setMonthsPaid} placeholder="0"
            style={{ ...inputStyle, fontSize:22, fontWeight:600 }}/>
        </div>
        <p style={{ margin:"-4px 0 20px", fontSize:12, color:C.dim, lineHeight:1.4 }}>
          0 — для нового кредита. Если добавляете уже действующую рассрочку, укажите число платежей,
          сделанных по графику до этого момента — остаток тела долга посчитается автоматически.
        </p>

        <p style={{ margin:"-8px 0 20px", fontSize:12, color:C.dim, lineHeight:1.4 }}>
          Счёт списания и категория выбираются при оплате очередного платежа — не здесь.
        </p>
        {saveLoanError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveLoanError}</p>}
        <button onClick={saveLoan} disabled={savingLoan}
          style={{ width:"100%", padding:"15px", borderRadius:30, background:savingLoan?C.savingDisabled:C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {savingLoan ? "Сохранение..." : "Создать кредит"}
        </button>
      </BottomSheet>

      {showStartCal && (
        <CalendarPicker mode="single" value={loanStartDate}
          onChange={v => { setLoanStartDate(v); setShowStartCal(false); }}
          onClose={() => setShowStartCal(false)}/>
      )}
    </div>
  );
}
