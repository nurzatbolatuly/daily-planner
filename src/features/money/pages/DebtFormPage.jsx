import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { PALETTE, DEBT_BORROW_NOTE_PREFIX, DEBT_LEND_NOTE_PREFIX } from "../../../constants/money";
import { todayStr } from "../../../utils/date";
import { round2 } from "../../../utils/format";
import { newId } from "../../../utils/id";
import { supaUpsert, supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { BottomSheet } from "../../../components/BottomSheet";
import { Ico } from "../../../components/Ico";
import { AccSelect } from "../../../components/AccSelect";
import { PersonRow } from "../components/PersonRow";

// Ручное добавление долга. Оба направления симметричны: счёт необязателен — если выбран,
// реальные деньги двигаются, и запись пишется атомарно (транзакция + баланс + debt_event
// через RPC save_debt_return — она полностью общая, "return" в имени историческое, по факту
// это "tx + balance + debt_event одной транзакцией БД", тот же паттерн переиспользует и
// ReturnModal). "Я должен" (беру в долг) со счётом → доходная транзакция. "Мне должны"
// (дал в долг) со счётом → расходная транзакция. Если счёт не выбран — off-book upsert,
// деньги нигде не учитываются.
export function DebtFormPage({ debtPeople = [], setDebtPeople, accounts = [], onBack }) {
  const [direction, setDirection] = useState("owed_to_me"); // owed_to_me | i_owe
  const [personId, setPersonId] = useState("");
  const [amount, setAmount] = useState("");
  const [accId, setAccId] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const account = accounts.find(a => a.id === accId);

  const saveRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить долг" });

  const selectedPerson = debtPeople.find(p => p.id === personId);

  const addPerson = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const person = { id: newId(), name, color: PALETTE[debtPeople.length % PALETTE.length] };
    try {
      await supaUpsert("debt_people", person);
      setDebtPeople(prev => [...prev, person]);
      setPersonId(person.id);
      setNewName("");
      setPickerOpen(false);
    } catch (e) { console.error("Create debt person:", e); }
    setCreating(false);
  };

  saveRef.current = async () => {
    const amt = parseFloat(amount) || 0;
    const person = debtPeople.find(p => p.id === personId);

    if (direction === "i_owe" && accId) {
      // Счёт выбран: реальные деньги поступают на него.
      const date = todayStr();
      const tx = {
        id: newId(),
        type: "income",
        amount: amt,
        currency: account.currency,
        category_id: null,
        account_id: accId,
        date,
        note: note.trim() ? `${DEBT_BORROW_NOTE_PREFIX} — ${person?.name || ""}: ${note.trim()}` : `${DEBT_BORROW_NOTE_PREFIX} — ${person?.name || ""}`,
      };
      const debtEvent = {
        id: newId(),
        person_id: personId,
        type: "they_paid",
        amount: -amt,
        currency: account.currency,
        date,
        note: note.trim(),
        transaction_id: tx.id,
        account_id: accId,
      };
      await supaRpc("save_debt_return", {
        p_tx: tx, p_account_id: accId, p_new_balance: round2(account.balance + amt), p_debt_event: debtEvent,
      });
    } else if (direction === "i_owe") {
      // Счёт не выбран: off-book запись, деньги не двигаются.
      await supaUpsert("debt_events", {
        id: newId(),
        person_id: personId,
        type: "they_paid",
        amount: -amt,
        currency: BASE_CUR,
        date: todayStr(),
        note: note.trim(),
        transaction_id: null,
        account_id: null,
      });
    } else if (accId) {
      // Счёт выбран: реальные деньги списываются с него.
      const date = todayStr();
      const tx = {
        id: newId(),
        type: "expense",
        amount: amt,
        currency: account.currency,
        category_id: null,
        account_id: accId,
        date,
        note: note.trim() ? `${DEBT_LEND_NOTE_PREFIX} — ${person?.name || ""}: ${note.trim()}` : `${DEBT_LEND_NOTE_PREFIX} — ${person?.name || ""}`,
      };
      const debtEvent = {
        id: newId(),
        person_id: personId,
        // "lent", не "paid_for_them" — та привязка означает "доля сплита" для TxPage
        // (existingSplit/save реконструируют её как сплит между несколькими людьми и
        // пересчитают сумму как равную долю при любой правке транзакции). Это отдельная
        // ручная выдача в долг, не сплит, поэтому нужен отдельный тип, как и "they_paid"
        // у противоположного направления.
        type: "lent",
        amount: amt,
        currency: account.currency,
        date,
        note: note.trim(),
        transaction_id: tx.id,
        account_id: accId,
      };
      await supaRpc("save_debt_return", {
        p_tx: tx, p_account_id: accId, p_new_balance: round2(account.balance - amt), p_debt_event: debtEvent,
      });
    } else {
      // Счёт не выбран: off-book запись, деньги не двигаются.
      await supaUpsert("debt_events", {
        id: newId(),
        person_id: personId,
        type: "paid_for_them",
        amount: amt,
        currency: BASE_CUR,
        date: todayStr(),
        note: note.trim(),
        transaction_id: null,
        account_id: null,
      });
    }
    onBack(true);
  };

  const save = () => {
    const e = {};
    if (!personId) e.person = "Выберите человека";
    if (!amount || parseFloat(amount) <= 0) e.amount = "Введите сумму";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    execSave();
  };

  const changeDirection = (v) => {
    setDirection(v);
    setAccId("");
    setErrors(p => ({ ...p, acc: "" }));
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Новый долг" onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>

        <div style={{ display:"flex", marginBottom:20, borderRadius:12, background:"rgba(255,255,255,0.04)", padding:4 }}>
          {[["owed_to_me","Мне должны"],["i_owe","Я должен"]].map(([v,l]) => (
            <button key={v} onClick={() => changeDirection(v)}
              style={{ flex:1, padding:"10px 0", borderRadius:9, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:direction===v?C.green:"transparent", color:direction===v?"#fff":C.dim }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ marginBottom:16 }}>
          <FieldLabel error={errors.person}>Человек</FieldLabel>
          <div onClick={() => setPickerOpen(true)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:`1px solid ${errors.person?"rgba(244,67,54,0.5)":C.border}`, cursor:"pointer" }}>
            <span style={{ fontSize:14, color: selectedPerson ? "#fff" : C.dim }}>{selectedPerson ? selectedPerson.name : "Выбрать человека"}</span>
            <Ico n="chevD" s={16} c={C.dim}/>
          </div>
        </div>

        <div style={{ marginBottom:16 }}>
          <FieldLabel error={errors.amount}>{account ? `Сумма (${account.currency})` : "Сумма"}</FieldLabel>
          <NumInput
            value={amount} onChange={v => { setAmount(v); setErrors(p => ({...p, amount:""})); }} placeholder="0"
            style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${errors.amount?"rgba(244,67,54,0.5)":C.border}`, borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:18, fontWeight:700, outline:"none" }}
          />
        </div>

        {direction === "i_owe" && (
          <>
            <AccSelect accounts={accounts} value={accId}
              onChange={v => { setAccId(v); setErrors(p => ({...p, acc:""})); }}
              label="Куда поступят деньги (необязательно)" error={errors.acc}
              allowNone noneLabel="Без счёта"/>
            <p style={{ margin:"-10px 0 16px", fontSize:11, color:C.dim, lineHeight:1.4 }}>
              {accId
                ? "Сумма зачислится на счёт и увеличит ваш долг перед человеком"
                : "Деньги нигде не будут учтены, увеличится только долг перед человеком"}
            </p>
          </>
        )}

        {direction === "owed_to_me" && (
          <>
            <AccSelect accounts={accounts} value={accId}
              onChange={v => { setAccId(v); setErrors(p => ({...p, acc:""})); }}
              label="Откуда списать деньги (необязательно)" error={errors.acc}
              allowNone noneLabel="Без счёта"/>
            <p style={{ margin:"-10px 0 16px", fontSize:11, color:C.dim, lineHeight:1.4 }}>
              {accId
                ? "Сумма спишется со счёта и увеличит долг человека перед вами"
                : "Деньги нигде не будут учтены, увеличится только долг человека перед вами"}
            </p>
          </>
        )}

        <div style={{ marginBottom:24 }}>
          <FieldLabel>За что</FieldLabel>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Необязательно"
            style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:14, outline:"none" }}/>
        </div>

        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:15, borderRadius:30, background:saving?C.savingDisabled:C.green, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Выбрать человека">
        {debtPeople.map(p => (
          <PersonRow key={p.id} person={p} selected={personId===p.id} onClick={() => { setPersonId(p.id); setPickerOpen(false); setErrors(e => ({...e, person:""})); }}/>
        ))}
        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Новый человек"
            style={{ flex:1, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", color:"#fff", fontSize:14, outline:"none" }}/>
          <button onClick={addPerson} disabled={!newName.trim() || creating}
            style={{ padding:"10px 16px", borderRadius:10, background:C.green, border:"none", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", opacity:(!newName.trim()||creating)?0.5:1 }}>
            +
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
