import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { NumInput } from "../../../components/NumInput";
import { FieldLabel } from "../../../components/FieldLabel";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { getPrecision, roundTo } from "../../../utils/format";
import { buildReconcileSave } from "../../../utils/sharedMirrorSave";
import { fieldInput, segmentWrap, segmentBtn, sheetBtn, hintText } from "./sharedUi";

// «Сверить с Tricount» (docs/shared-expenses.md §5.1d): вписываю баланс из Tricount, вижу разницу.
// Забытую покупку правильнее внести покупкой (доля попадёт в категорию); «Выровнять» пишет
// запись reconcile на разницу — она входит в баланс, но не в статистику.
export function ReconcileSheet({ group, balance, fmt, sym, onSaved, onClose }) {
  const [side, setSide] = useState(balance > 0 ? "owed" : "owe");
  const [value, setValue] = useState("");
  const precision = getPrecision(group.currency);
  const tricount = (side === "owe" ? -1 : 1) * (Number(value) || 0);
  const diff = roundTo(tricount - balance, precision);
  const entered = value !== "";

  const saveRef = useRef(null);
  const { save, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить сверку" });
  saveRef.current = async () => {
    await supaRpc("save_shared_entry", { p: buildReconcileSave({ group, tricountBalance: tricount, appBalance: balance, date: todayStr(), newId }) });
    await onSaved();
  };

  return (
    <BottomSheet open onClose={onClose} title="Сверить с Tricount">
      <FieldLabel>Баланс в Tricount</FieldLabel>
      <div style={{ ...segmentWrap, marginBottom:10 }}>
        <button onClick={() => setSide("owe")} style={segmentBtn(side === "owe")}>Я должен</button>
        <button onClick={() => setSide("owed")} style={segmentBtn(side === "owed")}>Мне должны</button>
      </div>
      <NumInput value={value} onChange={setValue} placeholder="0" prefix={sym} aria-label="Баланс в Tricount" style={{ ...fieldInput(), marginBottom:10 }}/>
      <p style={{ margin:"0 0 6px", fontSize:13, color:C.mid }}>
        В приложении: {balance < 0 ? `я должен ${fmt(-balance)}` : balance > 0 ? `мне должны ${fmt(balance)}` : "рассчитались"}
      </p>
      {entered && (
        <p style={{ margin:"0 0 10px", fontSize:15, fontWeight:700, color: diff === 0 ? C.green : C.amber }}>
          {diff === 0 ? "Совпадает ✓" : `Разница ${diff < 0 ? "−" : "+"}${fmt(Math.abs(diff))}`}
        </p>
      )}
      {entered && diff !== 0 && (
        <p style={hintText}>Забыли внести покупку? Лучше добавить её — доля попадёт в категорию. «Выровнять» — если причину не найти: разница войдёт в баланс, но не в статистику.</p>
      )}
      {saveError && <p style={{ margin:"0 0 8px", fontSize:12, color:C.errorLight, textAlign:"center" }}>{saveError}</p>}
      <button onClick={save} disabled={!entered || diff === 0 || saving} style={sheetBtn("primary", !entered || diff === 0 || saving)}>
        {saving ? "Сохранение..." : "Выровнять"}
      </button>
    </BottomSheet>
  );
}
