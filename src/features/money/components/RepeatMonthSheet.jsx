import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { NumInput } from "../../../components/NumInput";
import { Ico } from "../../../components/Ico";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { buildRepeatSave } from "../../../utils/sharedMirrorSave";
import { fmtAmtAuto } from "../../../utils/format";
import { feesTotalOf } from "./coverageRows";
import { fieldInput, sheetBtn, hintText, errorText } from "./sharedUi";

// «Повторить из прошлого месяца» (docs/shared-expenses.md §5.17): аренда, Wi-Fi — каждый месяц.
// Выбираю галками, правлю суммы (в Tricount они меняются) — копии ложатся на месяц вперёд.
// Автосоздания нет: неверная автозапись хуже лишнего тапа. По умолчанию ничего не отмечено.
export function RepeatMonthSheet({ group, bills, meId, accounts, titleOf, payerOf, sym, onSaved, onClose }) {
  const [picked, setPicked] = useState({});   // { [entry_id]: сумма строкой }
  const count = Object.keys(picked).length;
  const toggle = e => setPicked(p => {
    const { [e.id]: had, ...rest } = p;
    return had !== undefined ? rest : { ...p, [e.id]: String(e.amount) };
  });

  const saveRef = useRef(null);
  const { save, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось повторить покупки" });
  saveRef.current = async () => {
    const picks = bills.filter(b => picked[b.id] !== undefined).map(b => ({ entry: b, amount: Number(picked[b.id]) }));
    await supaRpc("save_shared_entry", { p: buildRepeatSave({ group, picks, meId, accounts, newId }) });
    await onSaved();
  };
  // Состав делится заново (buildRepeatSave): сумма должна покрывать общие сборы, иначе делить нечего.
  const hasComposition = b => (b.shares || []).some(x => x.member_id !== meId);
  const minOf = b => (hasComposition(b) ? feesTotalOf(b.fees || []) : 0);
  const amountError = b => {
    const v = Number(picked[b.id]);
    if (!(v > 0)) return "Введите сумму";
    const min = minOf(b);
    return v > min ? "" : `Больше сборов — ${sym}${fmtAmtAuto(min)}`;
  };
  // Платил я со счёта в другой валюте (или счёт удалён) — копия запишется без списания со счёта.
  const noAccountCopy = b => b.payer_member_id === meId && b.account_id
    && accounts.find(a => a.id === b.account_id)?.currency !== group.currency;
  const invalid = bills.some(b => picked[b.id] !== undefined && amountError(b));

  return (
    <BottomSheet open onClose={onClose} title="Повторить из прошлого месяца">
      <p style={{ ...hintText, margin:"0 0 10px", fontSize:12 }}>Отметьте, что повторяется. Даты сдвинутся на месяц, суммы можно поправить.</p>
      {bills.map(b => {
        const on = picked[b.id] !== undefined;
        return (
          <div key={b.id} style={{ padding:"10px 12px", borderRadius:12, marginBottom:6, background: on ? C.greenTint : C.rowBg, border:`1px solid ${on ? C.greenBorder : C.border}` }}>
            <button onClick={() => toggle(b)} role="checkbox" aria-checked={on}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:10, background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left" }}>
              <span style={{ width:22, height:22, flexShrink:0, borderRadius:6, border:`2px solid ${on ? C.green : C.dim}`, background: on ? C.green : "transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                {on && <Ico n="check" s={13} c="#fff"/>}
              </span>
              <span style={{ flex:1, minWidth:0 }}>
                <span style={{ display:"block", fontSize:14, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{titleOf(b)}</span>
                <span style={{ display:"block", marginTop:2, fontSize:11, color:C.dim }}>платил {payerOf(b)}</span>
              </span>
            </button>
            {on && (
              <>
                <NumInput value={picked[b.id]} onChange={v => setPicked(p => ({ ...p, [b.id]: v }))} prefix={sym} aria-label={`Сумма: ${titleOf(b)}`}
                  style={{ ...fieldInput(!!amountError(b)), marginTop:8, padding:"8px 10px" }}/>
                {amountError(b) && <p style={{ ...errorText, margin:"4px 0 0" }}>{amountError(b)}</p>}
                {noAccountCopy(b) && <p style={{ ...hintText, margin:"4px 0 0" }}>Счёт оплаты в другой валюте — списание с него не запишется, внесите его отдельно.</p>}
              </>
            )}
          </div>
        );
      })}
      {saveError && <p style={{ margin:"8px 0", fontSize:12, color:C.errorLight, textAlign:"center" }}>{saveError}</p>}
      <button onClick={save} disabled={!count || invalid || saving} style={{ ...sheetBtn("primary", !count || invalid || saving), marginTop:10 }}>
        {saving ? "Сохранение..." : count ? `Повторить (${count})` : "Повторить"}
      </button>
    </BottomSheet>
  );
}
