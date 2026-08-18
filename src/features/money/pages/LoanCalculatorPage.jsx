import { useState } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym, fmtAmtAuto } from "../../../utils/format";
import { monthlyRateFromPayment, monthlyToAnnualRate, annualToMonthlyRate, loanSummary, simulateEarlyRepayment } from "../../../utils/loan";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";

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

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none",
};

export function LoanCalculatorPage({ onBack }) {
  const [mode, setMode] = useState("payment");

  const [amount, setAmount]     = useState("");
  const [downPay, setDownPay]   = useState("");
  const [months, setMonths]     = useState("");
  const [rate, setRate]         = useState("");
  const [payment, setPayment]   = useState("");

  const [extra, setExtra]           = useState("");
  const [strategy, setStrategy]     = useState("term");
  const [startMonth, setStartMonth] = useState("");

  const amountN   = parseFloat(amount) || 0;
  const downN     = Math.min(parseFloat(downPay) || 0, amountN);
  const principal = Math.max(amountN - downN, 0);
  const monthsN   = parseInt(months, 10) || 0;

  let result = null;

  if (mode === "payment") {
    const rateN = parseFloat(rate) || 0;
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
  } else {
    const rateN  = parseFloat(rate) || 0;
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
              {strategy === "term" ? (
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

        {mode === "prepay" && (
          <p style={{ margin: "12px 2px 0", fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
            По ст. 39 Закона РК «О банках и банковской деятельности» банк не вправе брать комиссию
            за досрочное погашение — кроме случаев, когда оно происходит в первые 6 мес. (для займов
            до 1 года) или 1 год (для займов свыше 1 года) с даты выдачи. Уточняй условия своего
            договора — банк мог прописать более мягкие правила.
          </p>
        )}
      </div>
    </div>
  );
}
