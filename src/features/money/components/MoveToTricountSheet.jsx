import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { NumInput } from "../../../components/NumInput";
import { FieldLabel } from "../../../components/FieldLabel";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { buildMoveToTricountSave, movedDebtTitle } from "../../../utils/sharedMirrorSave";
import { RadioOption } from "./RadioOption";
import { fieldInput, sheetBtn, hintText } from "./sharedUi";

// «Записать в Tricount»: у друга сейчас нет денег — его долг с тусы переносится в группу Tricount,
// где он тоже есть, и рассчитаетесь там. В тусе долг закрывается (деньги не двигались), в Tricount
// появляется покупка «Долг с тусы «…»» на него. Групп несколько — выбор, куда записать.
//   targets: [{ group, member }] (sharedSave.tricountTargets); debt — его долг мне в тусе.
export function MoveToTricountSheet({ tusa, tusaMember, tusaMeId, label, debt, targets, members, sym, fmt, onSaved, onClose }) {
  const [targetId, setTargetId] = useState(targets[0]?.group.id);
  const [amount, setAmount] = useState(String(debt));
  const [error, setError] = useState("");
  const target = targets.find(t => t.group.id === targetId);
  const value = Number(amount) || 0;

  const saveRef = useRef(null);
  const { save, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось записать в Tricount" });
  saveRef.current = async () => {
    const mirrorMeId = members.find(m => m.group_id === target.group.id && m.is_me)?.id;
    await supaRpc("save_shared_entry", { p: buildMoveToTricountSave({
      tusa, tusaMember, tusaMeId, target, mirrorMeId, amount: value, date: todayStr(), newId,
    }) });
    await onSaved();
  };
  const submit = () => {
    if (!(value > 0)) return setError("Введите сумму");
    if (value > debt) return setError(`Не больше долга — ${fmt(debt)}`);
    save();
  };

  return (
    <BottomSheet open onClose={onClose} title="Записать в Tricount">
      <p style={{ ...hintText, fontSize:12 }}>
        {label} должен {fmt(debt)}. Долг закроется здесь и перейдёт в Tricount — рассчитаетесь там.
      </p>

      {targets.length > 1 ? (
        <>
          <FieldLabel>Куда записать</FieldLabel>
          <div style={{ marginBottom:12 }}>
            {targets.map(t => (
              <RadioOption key={t.group.id} checked={t.group.id === targetId} onSelect={() => setTargetId(t.group.id)} label={t.group.name}/>
            ))}
          </div>
        </>
      ) : (
        <p style={{ margin:"0 0 12px", fontSize:14 }}>В группу <b>«{target?.group.name}»</b></p>
      )}

      <FieldLabel error={error}>Сумма</FieldLabel>
      <NumInput value={amount} onChange={v => { setAmount(v); setError(""); }} prefix={sym} aria-label="Сумма для Tricount" style={{ ...fieldInput(!!error), marginBottom:10 }}/>

      <div style={{ padding:"10px 12px", borderRadius:12, background:C.monCard, marginBottom:14 }}>
        <p style={{ margin:0, fontSize:11, color:C.dim }}>Комментарий в Tricount</p>
        <p style={{ margin:"2px 0 0", fontSize:14 }}>{movedDebtTitle(tusa.name)}</p>
        <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim }}>платили вы · в доле {label}</p>
      </div>

      {saveError && <p style={{ margin:"0 0 8px", fontSize:12, color:C.errorLight, textAlign:"center" }}>{saveError}</p>}
      <button onClick={submit} disabled={saving || !target} style={sheetBtn("primary", saving || !target)}>
        {saving ? "Сохранение..." : `Записать в «${target?.group.name || "Tricount"}»`}
      </button>
    </BottomSheet>
  );
}
