import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { RU_MON_GEN } from "../../../constants/locale";
import { GOAL_TYPES, SAVINGS_PURPOSES } from "../../../constants/money";
import { todayStr, daysBetween } from "../../../utils/date";
import { fmtBal, getSym, fmtAmtAuto } from "../../../utils/format";
import { supaUpsert, supabase } from "../../../lib/supabase";
import { getSavedOrder } from "../../../utils/accountOrder";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { FieldLabel } from "../../../components/FieldLabel";
import { Ico } from "../../../components/Ico";
import { NumInput } from "../../../components/NumInput";
import { CatIcon } from "../../../components/CatIcon";
import { ColorPickerComp } from "../../../components/ColorPickerComp";
import { CurrencyPage } from "../../../components/CurrencyPage";
import { CalendarPicker } from "../../../components/CalendarPicker";
import { BottomSheet } from "../../../components/BottomSheet";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { GoalCalculator } from "../components/GoalCalculator";

const GOAL_ICONS = ["target", "home", "travel", "wallet", "invest", "salary", "gift", "entertainment", "unplanned", "other"];

function fmtDeadline(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${RU_MON_GEN[m - 1]} ${y} г.`;
}

export function GoalFormPage({ onBack, onDelete, edit, accounts = [] }) {
  const isEdit = !!edit;
  const [name, setName]         = useState(edit?.name || "");
  const [icon, setIcon]         = useState(edit?.icon || "target");
  const [color, setColor]       = useState(edit?.color || C.blue);
  const [target, setTarget]     = useState(edit?.target != null ? String(edit.target) : "");
  const [currency, setCurrency] = useState(edit?.currency || BASE_CUR);
  const [deadline, setDeadline] = useState(edit?.deadline || "");
  const [type, setType]         = useState(edit?.type || "custom");
  const [note, setNote]         = useState(edit?.note || "");
  const [accountId, setAccountId] = useState(edit?.account_id || "");
  const [errors, setErrors]     = useState({});

  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showCurrency, setShowCurrency]     = useState(false);
  const [showCalendar, setShowCalendar]     = useState(false);
  const [showAccPicker, setShowAccPicker]   = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(false);

  const savingsAccounts = getSavedOrder(accounts).filter(a => SAVINGS_PURPOSES.includes(a.purpose));
  const selectedAcc     = savingsAccounts.find(a => a.id === accountId);

  const targetNum = parseFloat(target) || 0;
  const mLeft     = deadline && targetNum > 0 ? Math.max(daysBetween(todayStr(), deadline) / 30, 1) : null;
  const monthly   = mLeft != null ? targetNum / mLeft : null;

  const saveRef   = useRef(null);
  const deleteRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(),    { errorMsg: "Не удалось сохранить цель" });
  const { save: del }                         = useSave(() => deleteRef.current?.(), { errorMsg: "Не удалось удалить цель" });

  saveRef.current = async () => {
    const row = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(), icon, color,
      target: parseFloat(target) || 0,
      currency, deadline: deadline || null,
      type, note: note.trim(),
      account_id: accountId,
    };
    await supaUpsert("goals", row);
    onBack(true);
  };

  deleteRef.current = async () => {
    await supabase.from("goals").delete().eq("id", edit.id);
    onDelete ? onDelete() : onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!name.trim())                        errs.name      = "Введите название";
    if (!target || parseFloat(target) <= 0)  errs.target    = "Укажите сумму";
    if (!accountId)                          errs.accountId = "Выберите счёт для накоплений";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    execSave();
  };

  if (showCurrency) return (
    <CurrencyPage value={currency} onSelect={setCurrency} onBack={() => setShowCurrency(false)}/>
  );

  return (
    <div style={{ minHeight: "calc(100dvh - var(--app-header-h))", background: C.monBg, color: "#fff", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={isEdit ? "Редактировать цель" : "Новая цель"}
        onBack={() => onBack(false)}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>

        {/* Icon + Color */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 20 }}>
          <button onClick={() => setShowIconPicker(true)}
            style={{ background: "none", border: `2px solid ${C.border}`, borderRadius: 14, padding: 6, cursor: "pointer", flexShrink: 0 }}>
            <CatIcon k={icon} size={52} color={color}/>
          </button>
          <div style={{ flex: 1 }}>
            <FieldLabel>Цвет</FieldLabel>
            <ColorPickerComp value={color} onChange={setColor}/>
          </div>
        </div>

        {/* Name */}
        <FieldLabel error={errors.name}>Название</FieldLabel>
        <input
          value={name} onChange={e => { setName(e.target.value); setErrors(p => ({...p, name: ""})); }}
          placeholder="Название цели"
          style={{ width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${errors.name ? C.errorLight : C.border}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, marginBottom: 14, outline: "none" }}
        />

        {/* Target + Currency */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel error={errors.target}>Сумма цели</FieldLabel>
            <NumInput
              value={target}
              onChange={v => { setTarget(v); setErrors(p => ({...p, target: ""})); }}
              placeholder="0"
              style={{ width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${errors.target ? C.errorLight : C.border}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none" }}
            />
          </div>
          <div>
            <FieldLabel>Валюта</FieldLabel>
            <button onClick={() => setShowCurrency(true)}
              style={{ background: C.monCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", height: 47 }}>
              {currency}
            </button>
          </div>
        </div>

        {/* Linked account — обязательное поле */}
        <FieldLabel error={errors.accountId}>Счёт для накоплений</FieldLabel>
        <div
          onClick={() => { setShowAccPicker(true); setErrors(p => ({...p, accountId: ""})); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderRadius: 12, marginBottom: 14, cursor: "pointer",
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${errors.accountId ? "rgba(244,67,54,0.5)" : C.border}`,
          }}
        >
          {selectedAcc ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CatIcon k={selectedAcc.icon} size={32} color={selectedAcc.color}/>
              <div>
                <p style={{ margin: 0, fontSize: 14, color: "#fff" }}>{selectedAcc.name}</p>
                <p style={{ margin: 0, fontSize: 12, color: C.dim }}>{fmtBal(selectedAcc.balance, selectedAcc.currency)}</p>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 14, color: errors.accountId ? "rgba(244,67,54,0.8)" : C.dim }}>
              Выберите счёт
            </span>
          )}
          <Ico n="chevD" s={16} c={C.dim}/>
        </div>
        {errors.accountId && (
          <p style={{ color: C.errorLight, fontSize: 12, marginTop: -10, marginBottom: 14 }}>{errors.accountId}</p>
        )}

        {/* Type */}
        <FieldLabel>Тип цели</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {GOAL_TYPES.map(t => (
            <button key={t.key} onClick={() => setType(t.key)}
              style={{ padding: "8px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                       background: type === t.key ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.06)",
                       color: type === t.key ? C.blue : C.dim }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Deadline */}
        <FieldLabel>Дедлайн (необязательно)</FieldLabel>
        <button onClick={() => setShowCalendar(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: deadline ? "#fff" : C.dim, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>
          <Ico n="calendar" s={16} c={C.dim}/>
          <span style={{ flex: 1, textAlign: "left" }}>{deadline ? fmtDeadline(deadline) : "Выбрать дату"}</span>
          {deadline && (
            <span onClick={e => { e.stopPropagation(); setDeadline(""); }} style={{ display: "flex", cursor: "pointer" }}>
              <Ico n="x" s={16} c={C.dim}/>
            </span>
          )}
        </button>

        {/* Monthly payment preview */}
        {monthly != null && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: C.dim }}>Ежемес. платёж</span>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color }}>
                {getSym(currency)}{fmtAmtAuto(monthly)}
              </span>
              <span style={{ fontSize: 11, color: C.dim }}>&nbsp;/ мес&nbsp;·&nbsp;~{Math.round(mLeft)} мес.</span>
            </div>
          </div>
        )}

        {/* Calculator */}
        {targetNum > 0 && (
          <GoalCalculator
            key={deadline || "no-dl"}
            sym={getSym(currency)}
            defaultAmt={targetNum}
            monthsLeft={mLeft ?? 12}
            color={color}
          />
        )}

        {/* Note */}
        <FieldLabel>Заметка</FieldLabel>
        <textarea
          value={note} onChange={e => setNote(e.target.value)} placeholder="Для чего копим..."
          rows={3}
          style={{ width: "100%", boxSizing: "border-box", background: C.monCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, resize: "none", marginBottom: 20, outline: "none" }}
        />

        {saveError && <p style={{ color: C.errorLight, fontSize: 12, marginBottom: 8 }}>{saveError}</p>}

        <button onClick={save} disabled={saving}
          style={{ width: "100%", padding: 16, borderRadius: 14, background: C.blue, border: "none", color: "#fff", fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Создать цель"}
        </button>

        {isEdit && (
          <button onClick={() => setConfirmDelete(true)}
            style={{ width: "100%", marginTop: 12, padding: 14, borderRadius: 14, background: "rgba(248,113,113,0.1)", border: `1px solid rgba(248,113,113,0.25)`, color: C.errorLight, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Удалить цель
          </button>
        )}
      </div>

      {/* Icon picker */}
      <BottomSheet open={showIconPicker} onClose={() => setShowIconPicker(false)} title="Иконка">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "4px 0 8px" }}>
          {GOAL_ICONS.map(k => (
            <button key={k} onClick={() => { setIcon(k); setShowIconPicker(false); }}
              style={{ background: "none", border: `2px solid ${icon === k ? color : "transparent"}`, borderRadius: 12, padding: 4, cursor: "pointer" }}>
              <CatIcon k={k} size={40} color={icon === k ? color : C.dim}/>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Account picker */}
      <BottomSheet open={showAccPicker} onClose={() => setShowAccPicker(false)} title="Счёт для накоплений">
        {savingsAccounts.length === 0 ? (
          <p style={{ textAlign: "center", padding: "24px 0", color: C.dim, fontSize: 13 }}>
            Нет счетов с назначением «Резерв», «Накопления» или «Инвестиции».{"\n"}Создайте такой счёт в разделе Счета.
          </p>
        ) : (
          savingsAccounts.map(a => (
            <div
              key={a.id}
              onClick={() => { setAccountId(a.id); setShowAccPicker(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 12px", borderRadius: 12, marginBottom: 6, cursor: "pointer",
                background: accountId === a.id ? "rgba(96,165,250,0.1)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${accountId === a.id ? "rgba(96,165,250,0.4)" : C.border}`,
              }}
            >
              <CatIcon k={a.icon} size={40} color={a.color}/>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, color: "#fff" }}>{a.name}</p>
                <p style={{ margin: 0, fontSize: 12, color: C.dim }}>{fmtBal(a.balance, a.currency)}</p>
              </div>
              {accountId === a.id && <Ico n="check" s={18} c={C.blue}/>}
            </div>
          ))
        )}
      </BottomSheet>

      {showCalendar && (
        <CalendarPicker mode="single" value={deadline || todayStr()}
          onChange={v => { setDeadline(v); setShowCalendar(false); }}
          onClose={() => setShowCalendar(false)}/>
      )}

      <ConfirmSheet
        open={confirmDelete} onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); del(); }}
        title="Удалить цель?"
        message="Все пополнения будут удалены автоматически."
        confirmLabel="Удалить"
      />
    </div>
  );
}
