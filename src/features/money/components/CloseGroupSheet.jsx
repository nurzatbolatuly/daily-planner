import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { getPrecision } from "../../../utils/format";
import { memberBalances, mirrorBalance } from "../../../utils/sharedExpenses";
import { SHARED_MODES } from "../../../constants/money";
import { buildArchiveSave } from "../../../utils/sharedGroupSave";
import { RadioOption } from "./RadioOption";
import { sheetBtn, hintText } from "./sharedUi";

// «Закрыть группу» / «В архив» (docs/shared-expenses.md §7.6, §12.3). Если остались долги —
// показать их, чтобы они не пропали из вида молча: простить оставшееся («угощаю») или оставить.
// Мои долги участникам не прощаются — их прощает не тот, кто должен. У квартиры долг — с группой
// целиком (§4): показываем мой баланс, прощать нечего.
export function CloseGroupSheet({ group, members, entries, labelOf, fmt, onSaved, onClose }) {
  const [forgive, setForgive] = useState(false);
  const precision = getPrecision(group.currency);
  const isMirror = group.mode === SHARED_MODES.mirror;
  const balances = useMemo(() => (isMirror ? {} : memberBalances(entries, members, { precision })), [isMirror, entries, members, precision]);
  const groupBalance = isMirror ? mirrorBalance(entries, members.find(m => m.is_me)?.id, { precision }) : 0;
  const others = members.filter(m => !m.is_me && balances[m.id]?.balance);
  const owedToMe = others.filter(m => balances[m.id].balance > 0);
  const iOwe = others.filter(m => balances[m.id].balance < 0);
  const owedSum = owedToMe.reduce((s, m) => s + balances[m.id].balance, 0);

  const saveRef = useRef(null);
  const { save, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось отправить в архив" });
  saveRef.current = async () => {
    await supaRpc("save_shared_entry", { p: buildArchiveSave({ group, members, entries, forgive, date: todayStr(), newId, precision }) });
    await onSaved();
  };

  const debtLine = (m, text) => (
    <div key={m.id} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"6px 0", fontSize:14 }}>
      <span style={{ minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{labelOf(m)}</span>
      <span style={{ flexShrink:0, whiteSpace:"nowrap", color:C.mid }}>{text}</span>
    </div>
  );

  return (
    <BottomSheet open onClose={onClose} title={others.length ? "Закрыть группу" : "В архив"}>
      {isMirror && (
        <p style={{ ...hintText, fontSize:13 }}>
          {groupBalance === 0
            ? "Баланс с группой — 0. Группа уйдёт в архив — вернуть можно в её настройках."
            : `Баланс с группой: ${groupBalance < 0 ? `я должен ${fmt(-groupBalance)}` : `мне должны ${fmt(groupBalance)}`}. Он останется виден в архиве.`}
        </p>
      )}
      {!isMirror && others.length === 0 && <p style={{ ...hintText, fontSize:13 }}>Все рассчитались. Группа уйдёт в архив — вернуть можно в её настройках.</p>}

      {owedToMe.length > 0 && (
        <div role="group" aria-label="Ещё должны мне" style={{ marginBottom:12 }}>
          <p style={{ margin:"0 0 4px", fontSize:13, fontWeight:700, color:C.dim }}>Ещё должны мне</p>
          {owedToMe.map(m => debtLine(m, fmt(balances[m.id].balance)))}
          <RadioOption checked={!forgive} onSelect={() => setForgive(false)} label="Оставить долги"
            hint="Будут видны в архиве и в общих итогах — можно получить позже"/>
          <RadioOption checked={forgive} onSelect={() => setForgive(true)} label={`Простить всё оставшееся — ${fmt(owedSum)}`}
            hint="«Угощаю»: суммы добавятся к вашей доле в категориях счетов"/>
        </div>
      )}

      {iOwe.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <p style={{ margin:"0 0 4px", fontSize:13, fontWeight:700, color:C.dim }}>Я ещё должен</p>
          {iOwe.map(m => debtLine(m, fmt(-balances[m.id].balance)))}
          <p style={{ ...hintText, margin:"4px 0 0" }}>Этот долг останется виден в архиве — вернуть можно в любой момент.</p>
        </div>
      )}

      {saveError && <p style={{ margin:"0 0 8px", fontSize:12, color:C.errorLight, textAlign:"center" }}>{saveError}</p>}
      <button onClick={save} disabled={saving} style={sheetBtn("primary", saving)}>{saving ? "Сохранение..." : "В архив"}</button>
    </BottomSheet>
  );
}
