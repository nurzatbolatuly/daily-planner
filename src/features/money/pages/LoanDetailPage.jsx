import { useState, useEffect, useMemo, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { BILLS_CATEGORY_ID } from "../../../constants/money";
import { supabase, supa, supaRpc, supaUpsert } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { todayStr, monthKey } from "../../../utils/date";
import { getSym, fmtAmtAuto, fmtDateShort, round2 } from "../../../utils/format";
import { addMonths } from "../../../utils/cashflowTimeline";
import { monthlyPayment, annualToMonthlyRate, loanSummary, simulateLumpSumRepayment, remainingAfterPayments, effectivePayment, remainingMonthsFromBalance } from "../../../utils/loan";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { BottomSheet } from "../../../components/BottomSheet";
import { AccSelect } from "../../../components/AccSelect";
import { NumInput } from "../../../components/NumInput";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { ConfirmSheet } from "../../../components/ConfirmSheet";

function fmtDate(s) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function LoanDetailPage({ loan, accounts = [], navigate, onReload, onBack }) {
  const sym = getSym(loan.currency || BASE_CUR);
  const monthlyRate = annualToMonthlyRate(loan.rate_annual);
  // Аннуитетный платёж — фиксированная сумма на весь срок (считается от ИСХОДНОГО principal,
  // не от remaining_principal — иначе платёж пересчитывался бы от остатка каждый раз и падал
  // с каждым взносом вместо того чтобы оставаться постоянным, как положено аннуитету). Меняется
  // только соотношение тело/проценты внутри платежа. Пересчитать сам платёж можно только явным
  // действием — досрочным погашением со стратегией «уменьшить платёж» (см. Этап 6), либо
  // вручную задать факт. сумму от банка (loan.payment, v19) — см. effectivePayment.
  const currentPayment = effectivePayment(loan, monthlyRate);
  // Чистое расчётное значение (без фикс. переопределения) — подсказка в форме редактирования.
  const monthlyPaymentFormula = monthlyPayment(loan.principal, monthlyRate, loan.term_months);
  const pct = loan.principal > 0 ? Math.min((loan.principal - loan.remaining_principal) / loan.principal, 1) : 0;
  // Сколько ЕЩЁ платежей при текущем эффективном платеже (не исходный term_months минус
  // счётчик — платёж мог отличаться от расчётного графика, см. remainingMonthsFromBalance).
  const monthsLeft = remainingMonthsFromBalance(loan.remaining_principal, monthlyRate, currentPayment);
  const linkedAcc = accounts.find(a => a.id === loan.acc_id);
  const mk = monthKey(todayStr());
  const paidThisMonth = loan.last_paid_month === mk;
  // Дата первого платежа ещё не наступила (новый кредит, первый платёж в след. месяце) —
  // платить рано, показываем дату старта вместо "Оплачено"/"Оплатить" (см. ту же ловушку
  // в MonthlyPaymentsListPage.jsx и фильтр по start_date в utils/cashflowTimeline.js).
  const notStarted = !!loan.start_date && monthKey(loan.start_date) > mk;

  // Ленивая загрузка истории платежей ТОЛЬКО этого кредита — не раздувает общий стор useMoneyData.
  const [payments, setPayments] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const fetchPayments = async () => {
    const { data, error } = await supabase.from("loan_payments").select("*").eq("loan_id", loan.id).order("date", { ascending: false });
    if (error) { console.error(error); setLoadError("Не удалось загрузить историю платежей"); return; }
    setPayments(data || []);
  };
  useEffect(() => {
    let cancelled = false;
    supabase.from("loan_payments").select("*").eq("loan_id", loan.id).order("date", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error(error); setLoadError("Не удалось загрузить историю платежей"); return; }
        setPayments(data || []);
      });
    return () => { cancelled = true; };
  }, [loan.id]);

  const stats = useMemo(() => {
    const totalPaid     = payments.reduce((s, p) => s + p.amount, 0);
    const totalInterest = payments.reduce((s, p) => s + p.interest_part, 0);
    const totalEarly     = payments.filter(p => p.is_early_repayment).reduce((s, p) => s + p.principal_part, 0);
    return { totalPaid, totalInterest, totalEarly };
  }, [payments]);

  // Оставшийся срок = исходный срок минус уже сделанные ОБЫЧНЫЕ платежи (досрочные его не считают —
  // они гасят тело сверх графика, не заменяют собой плановый платёж) минус платежи, уже сделанные
  // ДО того как кредит попал в приложение (months_paid_at_creation, импорт старой рассрочки —
  // у них нет строк в loan_payments, только это число на самом кредите).
  const regularPaymentsCount = payments.filter(p => !p.is_early_repayment).length + (loan.months_paid_at_creation || 0);
  const remainingMonths = Math.max(loan.term_months - regularPaymentsCount, 1);

  // Оплатить очередной платёж. Сумма по умолчанию — плановый платёж (фикс. от банка или
  // расчётный аннуитет, см. effectivePayment), но редактируемая: банк списывает округлённую
  // сумму, а не то, что выходит при делении платежа на тело/проценты с копейками. Пользователь
  // правит сумму под факт из банка — проценты по-прежнему считаются формулой от
  // remaining_principal, а тело = введённая сумма минус проценты (clamp на случай последнего
  // платежа). Плановый currentPayment при этом не трогаем.
  const payInterestPart = round2(loan.remaining_principal * monthlyRate);
  // Если обычный плановый платёж уже с запасом покрывает остаток тела + проценты — это
  // последний платёж по кредиту, и дефолтная сумма должна закрыть его РОВНО в ноль, а не
  // списать фиксированный платёж и оставить кредит "подвисшим" на пару тенге/долларов.
  const closingAmount = round2(loan.remaining_principal + payInterestPart);
  const isFinalPayment = closingAmount <= currentPayment + 0.01;

  const [payOpen, setPayOpen] = useState(false);
  const [payAccId, setPayAccId] = useState("");
  const [payAmtInput, setPayAmtInput] = useState("");
  const openPay = () => {
    setPayAccId(loan.acc_id || accounts[0]?.id || "");
    setPayAmtInput(String(isFinalPayment ? closingAmount : round2(currentPayment)));
    setPayOpen(true);
  };
  const payPrincipalPart = round2(Math.max(Math.min((parseFloat(payAmtInput) || 0) - payInterestPart, loan.remaining_principal), 0));

  const payRef = useRef(null);
  const { save: execPay, saving: paying, saveError: payError, setSaveError: setPayError } = useSave(
    () => payRef.current(),
    { errorMsg: "Не удалось оплатить" }
  );
  payRef.current = async () => {
    const acc = accounts.find(a => a.id === payAccId);
    if (!acc) return;
    const interestPart  = payInterestPart;
    const principalPart = payPrincipalPart;
    const payAmt         = round2(parseFloat(payAmtInput) || 0);
    const newRemaining   = round2(Math.max(loan.remaining_principal - principalPart, 0));
    const newStatus      = newRemaining <= 0.01 ? "closed" : "active";
    const tx = {
      id: newId(), type: "expense", amount: payAmt, currency: acc.currency,
      category_id: BILLS_CATEGORY_ID, account_id: acc.id, date: todayStr(), note: loan.name,
    };
    const payment = {
      id: newId(), date: todayStr(), amount: payAmt,
      principal_part: principalPart, interest_part: interestPart,
      is_early_repayment: false, note: "",
    };
    const newBal = round2(acc.balance - payAmt);
    await supaRpc("pay_loan", {
      p_tx: tx, p_account_id: acc.id, p_new_balance: newBal,
      p_loan_id: loan.id, p_month: mk, p_payment: payment,
      p_new_remaining: newRemaining, p_new_status: newStatus,
    });
    setPayOpen(false);
    await fetchPayments();
    onReload();
  };
  const pay = () => { if (payAccId && (parseFloat(payAmtInput) || 0) > 0) execPay(); };

  // Досрочное погашение разовым платежом. Число "через сколько платежей" — только для
  // предпросмотра (что будет, если внести сумму после N плановых платежей); само действие
  // всегда применяется СЕЙЧАС, от текущего remaining_principal. last_paid_month НЕ трогаем —
  // это отдельное от планового платежа действие, не должно влиять на бейдж «оплачено в месяце».
  const [lumpOpen, setLumpOpen] = useState(false);
  const [lumpAmt, setLumpAmt] = useState("");
  const [lumpMonthNum, setLumpMonthNum] = useState("1");
  const [lumpAccId, setLumpAccId] = useState("");
  const openLump = () => {
    setLumpAmt(""); setLumpMonthNum("1"); setLumpAccId(loan.acc_id || accounts[0]?.id || "");
    setLumpOpen(true);
  };

  const lumpPreview = useMemo(() => {
    const amt = parseFloat(lumpAmt) || 0;
    if (amt <= 0) return null;
    const monthNum = Math.max(parseInt(lumpMonthNum, 10) || 1, 1);
    const base = loanSummary(loan.remaining_principal, monthlyRate, remainingMonths);
    const sim  = simulateLumpSumRepayment(loan.remaining_principal, monthlyRate, remainingMonths, amt, monthNum);
    return {
      monthsSaved: Math.max(remainingMonths - sim.months, 0),
      overpaySaved: Math.max(base.overpay - sim.overpay, 0),
    };
  }, [lumpAmt, lumpMonthNum, loan.remaining_principal, monthlyRate, remainingMonths]);

  const lumpRef = useRef(null);
  const { save: execLump, saving: lumping, saveError: lumpError, setSaveError: setLumpError } = useSave(
    () => lumpRef.current(),
    { errorMsg: "Не удалось внести досрочный платёж" }
  );
  lumpRef.current = async () => {
    const acc = accounts.find(a => a.id === lumpAccId);
    if (!acc) return;
    const amt = round2(Math.min(parseFloat(lumpAmt) || 0, loan.remaining_principal));
    if (amt <= 0) return;
    const newRemaining = round2(Math.max(loan.remaining_principal - amt, 0));
    const newStatus    = newRemaining <= 0.01 ? "closed" : "active";
    const tx = {
      id: newId(), type: "expense", amount: amt, currency: acc.currency,
      category_id: BILLS_CATEGORY_ID, account_id: acc.id, date: todayStr(), note: `${loan.name} (досрочно)`,
    };
    const payment = {
      id: newId(), date: todayStr(), amount: amt,
      principal_part: amt, interest_part: 0,
      is_early_repayment: true, note: "",
    };
    const newBal = round2(acc.balance - amt);
    await supaRpc("pay_loan", {
      p_tx: tx, p_account_id: acc.id, p_new_balance: newBal,
      p_loan_id: loan.id, p_month: loan.last_paid_month, p_payment: payment,
      p_new_remaining: newRemaining, p_new_status: newStatus,
    });
    setLumpOpen(false);
    await fetchPayments();
    onReload();
  };
  const submitLump = () => {
    const amt = parseFloat(lumpAmt) || 0;
    if (!lumpAccId || amt <= 0) return;
    execLump();
  };

  // Правка базовых полей (название/счёт/день/категория) — без пересчёта условий кредита.
  // Дата первого платежа/месяцев уже оплачено — тоже здесь (v18): нужны для кредитов,
  // созданных ДО появления этих полей на экране создания, чтобы не пересоздавать запись.
  // Пересчёт remaining_principal/last_paid_month из них происходит ТОЛЬКО если у кредита ещё
  // нет ни одного платежа в приложении (payments.length === 0, см. editRef.current ниже) —
  // иначе это стёрло бы прогресс, уже отслеженный реальными оплатами через LoanDetailPage.
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(loan.name);
  const [editAccId, setEditAccId] = useState(loan.acc_id || "");
  const [editDay, setEditDay] = useState(String(loan.day));
  const [editStartDate, setEditStartDate] = useState(loan.start_date || todayStr());
  const [showEditStartCal, setShowEditStartCal] = useState(false);
  const [editMonthsPaid, setEditMonthsPaid] = useState(String(loan.months_paid_at_creation || 0));
  // Факт. ежемесячный платёж от банка (v19) — переопределяет расчётный аннуитет, см.
  // effectivePayment. Пусто = использовать расчёт по ставке/сроку, как раньше.
  const [editPayment, setEditPayment] = useState(loan.payment != null ? String(loan.payment) : "");
  const [editNameError, setEditNameError] = useState("");
  const openEdit = () => {
    setEditName(loan.name); setEditAccId(loan.acc_id || ""); setEditDay(String(loan.day));
    setEditStartDate(loan.start_date || todayStr());
    setEditMonthsPaid(String(loan.months_paid_at_creation || 0));
    setEditPayment(loan.payment != null ? String(loan.payment) : "");
    setEditNameError(""); setEditOpen(true);
  };
  const noAppPayments = payments.length === 0;

  const editRef = useRef(null);
  const { save: execEdit, saving: savingEdit, saveError: editError } = useSave(
    () => editRef.current(),
    { errorMsg: "Не удалось сохранить" }
  );
  editRef.current = async () => {
    const editMonthsPaidN = Math.min(Math.max(parseInt(editMonthsPaid, 10) || 0, 0), loan.term_months);
    const editPaymentN = parseFloat(editPayment);
    const editEffPayment = Number.isFinite(editPaymentN) && editPaymentN > 0 ? editPaymentN : null;
    const updated = {
      ...loan, name: editName.trim(), acc_id: editAccId || null,
      day: parseInt(editDay, 10) || 1,
      start_date: editStartDate,
      months_paid_at_creation: editMonthsPaidN,
      payment: editEffPayment != null ? round2(editEffPayment) : null,
    };
    // Кредит ещё ни разу не оплачивался в приложении — можно безопасно пересчитать остаток
    // тела/статус "оплачено в этом месяце" от новых значений, как при создании (LoanCalculatorPage).
    // Уже оплаченные месяцы считаются ФАКТИЧЕСКИМ платежом (editEffPayment), если он задан —
    // та же логика, что в LoanCalculatorPage.saveLoanRef (см. комментарий там).
    if (noAppPayments) {
      const remaining = editMonthsPaidN > 0
        ? round2(remainingAfterPayments(loan.principal, monthlyRate, loan.term_months, editMonthsPaidN, editEffPayment))
        : loan.principal;
      updated.remaining_principal = remaining;
      updated.last_paid_month = editMonthsPaidN > 0 ? monthKey(addMonths(editStartDate, editMonthsPaidN - 1)) : "";
      updated.status = remaining <= 0.01 ? "closed" : "active";
    }
    await supaUpsert("loans", updated);
    setEditOpen(false);
    onReload();
  };
  const saveEdit = () => {
    if (!editName.trim()) { setEditNameError("Введите название"); return; }
    execEdit();
  };

  // Удаление кредита: loan_payments удаляются каскадно по FK (ON DELETE CASCADE). Сами
  // транзакции (списания со счёта, уже созданные при оплате) НЕ трогаем — остаются в истории
  // счёта «осиротевшими», как и при удалении счёта (см. ловушку в SKILL.md), это осознанно.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const delLoan = async () => {
    setConfirmDelete(false);
    try {
      await supa.delete("loans", `id=eq.${loan.id}`);
      onBack(true);
    } catch(err) { console.error(err); }
  };

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: "#fff", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={loan.name} onBack={() => onBack(false)}
        right={
          <button onClick={openEdit} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <Ico n="edit" s={20} c={C.mid}/>
          </button>
        }
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 80px" }}>

        {/* Progress card */}
        <div style={{ background: C.monCard, borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Остаток долга</p>
          <p style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
            {sym}{fmtAmtAuto(loan.remaining_principal)}
          </p>
          <p style={{ margin: "2px 0 12px", fontSize: 12, color: C.dim }}>из {sym}{fmtAmtAuto(loan.principal)}</p>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: C.dim }}>
              Погашено{loan.status !== "closed" && monthsLeft != null && ` · осталось ${monthsLeft} мес.`}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>{Math.round(pct * 100)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
            <div style={{ height: 8, borderRadius: 4, width: `${pct * 100}%`, background: C.blue, transition: "width 0.5s ease" }}/>
          </div>

          {loan.status === "closed" ? (
            <p style={{ margin: "12px 0 0", fontSize: 13, fontWeight: 700, color: C.emerald }}>Кредит погашен полностью</p>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Платёж {loan.day} числа</p>
                <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700, color: "#fff" }}>{sym}{fmtAmtAuto(currentPayment)}</p>
              </div>
              {notStarted ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.dim }}>Первый платёж {fmtDateShort(loan.start_date)}</span>
              ) : paidThisMonth ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>Оплачено в этом месяце</span>
              ) : (
                <button onClick={openPay}
                  style={{ padding: "9px 18px", borderRadius: 20, background: C.greenDim, border: `1px solid ${C.green}`, color: C.green, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Оплатить
                </button>
              )}
            </div>
          )}

          {loan.status !== "closed" && (
            <button onClick={openLump}
              style={{ width: "100%", marginTop: 12, padding: 12, borderRadius: 12, background: "transparent", border: `1px dashed rgba(96,165,250,0.4)`, color: C.blue, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Досрочное погашение
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: C.monCard }}>
            <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Всего оплачено</p>
            <p style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 700, color: "#fff" }}>{sym}{fmtAmtAuto(stats.totalPaid)}</p>
          </div>
          <div style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: C.monCard }}>
            <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Из них проценты</p>
            <p style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 700, color: C.amber }}>{sym}{fmtAmtAuto(stats.totalInterest)}</p>
          </div>
        </div>
        {stats.totalEarly > 0 && (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(76,175,80,0.08)", border: `1px solid rgba(76,175,80,0.2)`, marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Досрочных платежей</p>
            <p style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 700, color: C.green }}>{sym}{fmtAmtAuto(stats.totalEarly)}</p>
          </div>
        )}

        {/* Linked account */}
        {linkedAcc && (
          <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 11, color: C.dim }}>Счёт списания</p>
            <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: "#fff" }}>{linkedAcc.name}</p>
          </div>
        )}

        {/* Payment history */}
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: C.dim }}>История платежей</p>

        {loadError && <p style={{ textAlign: "center", padding: "12px 0", color: C.errorLight, fontSize: 13 }}>{loadError}</p>}

        {!loadError && payments.length === 0 ? (
          <p style={{ textAlign: "center", padding: "24px 0", color: C.dim, fontSize: 13 }}>Пока нет платежей</p>
        ) : (
          payments.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, color: C.dim, width: 38, flexShrink: 0 }}>{fmtDate(p.date)}</span>
              <div style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, color: C.main }}>{sym}{fmtAmtAuto(p.amount)}</span>
                  {p.is_early_repayment && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: "rgba(76,175,80,0.15)", padding: "2px 6px", borderRadius: 6 }}>ДОСРОЧНО</span>
                  )}
                  {!p.transaction_id && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 6 }}>БЕЗ СЧЁТА</span>
                  )}
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: C.dim }}>
                  тело: {sym}{fmtAmtAuto(p.principal_part)} · проценты: {sym}{fmtAmtAuto(p.interest_part)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pay sheet */}
      <BottomSheet open={payOpen} onClose={() => { setPayOpen(false); setPayError(null); }} title="Оплатить кредит">
        <AccSelect accounts={accounts} value={payAccId} onChange={setPayAccId} label="Счёт списания"/>
        <FieldLabel>Сумма платежа</FieldLabel>
        <NumInput
          value={payAmtInput}
          onChange={setPayAmtInput}
          placeholder={String(round2(currentPayment))}
          style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", marginBottom: 8, boxSizing: "border-box" }}
        />
        {isFinalPayment ? (
          <p style={{ margin: "0 0 16px", fontSize: 12, color: C.green, lineHeight: 1.4 }}>
            Это последний платёж — сумма закрывает остаток долга полностью.
            {" "}(тело {sym}{fmtAmtAuto(payPrincipalPart)} · проценты {sym}{fmtAmtAuto(payInterestPart)})
          </p>
        ) : (
          <p style={{ margin: "0 0 16px", fontSize: 12, color: C.dim, lineHeight: 1.4 }}>
            Плановый платёж {sym}{fmtAmtAuto(currentPayment)} — если банк списал другую сумму (округление), укажите её здесь.
            {" "}(тело {sym}{fmtAmtAuto(payPrincipalPart)} · проценты {sym}{fmtAmtAuto(payInterestPart)})
          </p>
        )}
        {payError && <p style={{ color: C.errorLight, fontSize: 13, textAlign: "center", marginBottom: 8 }}>{payError}</p>}
        <button onClick={pay} disabled={paying}
          style={{ width: "100%", padding: 15, borderRadius: 30, background: paying ? C.savingDisabled : C.green, border: "none", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          {paying ? "Оплата..." : "Оплатить"}
        </button>
      </BottomSheet>

      {/* Lump-sum early repayment sheet */}
      <BottomSheet open={lumpOpen} onClose={() => { setLumpOpen(false); setLumpError(null); }} title="Досрочное погашение">
        <FieldLabel>Сумма</FieldLabel>
        <NumInput
          value={lumpAmt}
          onChange={setLumpAmt}
          placeholder="0"
          style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", marginBottom: 16, boxSizing: "border-box" }}
        />
        <FieldLabel>Через сколько платежей от сегодня (для предпросмотра)</FieldLabel>
        <input
          type="number" min="1" max={remainingMonths}
          value={lumpMonthNum}
          onChange={e => setLumpMonthNum(e.target.value)}
          style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 16, padding: "4px 0", marginBottom: 16, boxSizing: "border-box" }}
        />
        <AccSelect accounts={accounts} value={lumpAccId} onChange={setLumpAccId} label="Счёт списания"/>

        {lumpPreview && (
          <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: C.dim }}>Срок сократится на</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{lumpPreview.monthsSaved} мес.</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: C.dim }}>Экономия на процентах</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{sym}{fmtAmtAuto(lumpPreview.overpaySaved)}</span>
            </div>
          </div>
        )}

        <p style={{ margin: "0 0 16px", fontSize: 11, color: C.dim, lineHeight: 1.4 }}>
          Списывается сразу со счёта и уменьшает тело долга. Плановый ежемесячный платёж остаётся тем же — срок кредита сокращается.
        </p>

        {lumpError && <p style={{ color: C.errorLight, fontSize: 13, textAlign: "center", marginBottom: 8 }}>{lumpError}</p>}
        <button onClick={submitLump} disabled={lumping}
          style={{ width: "100%", padding: 15, borderRadius: 30, background: lumping ? C.savingDisabled : C.blue, border: "none", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          {lumping ? "Оплата..." : "Внести досрочный платёж"}
        </button>
      </BottomSheet>

      {/* Edit sheet */}
      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Редактировать кредит">
        <FieldLabel error={editNameError}>Название</FieldLabel>
        <input
          value={editName}
          onChange={e => { setEditName(e.target.value); setEditNameError(""); }}
          style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${editNameError ? "rgba(244,67,54,0.5)" : C.border}`, outline: "none", color: "#fff", fontSize: 16, padding: "4px 0", marginBottom: 16, boxSizing: "border-box" }}
        />
        <AccSelect accounts={accounts} value={editAccId} onChange={setEditAccId} label="Счёт списания"/>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>День оплаты</FieldLabel>
          <input
            type="number" min="1" max="31"
            value={editDay}
            onChange={e => setEditDay(e.target.value)}
            style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <FieldLabel>Дата первого платежа</FieldLabel>
          <button onClick={() => setShowEditStartCal(true)}
            style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", textAlign: "left", cursor: "pointer" }}>
            {fmtDateShort(editStartDate)}
          </button>
        </div>

        <div style={{ marginBottom: 8 }}>
          <FieldLabel>Сколько месяцев уже оплачено</FieldLabel>
          <NumInput value={editMonthsPaid} onChange={setEditMonthsPaid} placeholder="0"
            style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", boxSizing: "border-box" }}/>
        </div>

        <div style={{ marginBottom: 8 }}>
          <FieldLabel>Ежемесячный платёж по факту (необязательно)</FieldLabel>
          <NumInput value={editPayment} onChange={setEditPayment} placeholder={String(round2(monthlyPaymentFormula))}
            style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", color: "#fff", fontSize: 22, fontWeight: 600, padding: "4px 0", boxSizing: "border-box" }}/>
        </div>
        <p style={{ margin: "-4px 0 16px", fontSize: 12, color: C.dim, lineHeight: 1.4 }}>
          Банк обычно округляет платёж — впишите точную сумму, которую он реально списывает.
          Пусто — считаем по формуле ({sym}{fmtAmtAuto(monthlyPaymentFormula)}).
        </p>
        <p style={{ margin: "-4px 0 16px", fontSize: 12, color: C.dim, lineHeight: 1.4 }}>
          {noAppPayments
            ? "Остаток долга и статус «оплачено в этом месяце» пересчитаются от этих двух полей."
            : "У кредита уже есть платежи в приложении — остаток долга ими же и отслеживается, эти поля изменят только дату старта и оставшийся срок в расчётах, не остаток."}
        </p>

        {editError && <p style={{ color: C.errorLight, fontSize: 13, textAlign: "center", marginBottom: 8 }}>{editError}</p>}
        <button onClick={saveEdit} disabled={savingEdit}
          style={{ width: "100%", padding: 15, borderRadius: 30, background: savingEdit ? C.savingDisabled : C.green, border: "none", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          {savingEdit ? "Сохранение..." : "Сохранить"}
        </button>
        <button
          onClick={() => { setEditOpen(false); setConfirmDelete(true); }}
          style={{ width: "100%", marginTop: 10, padding: 14, borderRadius: 30, background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.3)", color: C.red, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
        >
          Удалить кредит
        </button>
      </BottomSheet>

      {showEditStartCal && (
        <CalendarPicker mode="single" value={editStartDate}
          onChange={v => { setEditStartDate(v); setShowEditStartCal(false); }}
          onClose={() => setShowEditStartCal(false)}/>
      )}

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={delLoan}
        title="Удалить кредит?"
        message="Кредит и история его платежей будут удалены. Уже созданные транзакции (списания со счёта) останутся в истории счёта."
      />
    </div>
  );
}
