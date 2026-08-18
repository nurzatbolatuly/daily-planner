import { useState } from "react";
import { C } from "../../../constants/theme";
import { PALETTE } from "../../../constants/money";
import { Toggle } from "../../../components/Toggle";
import { FieldLabel } from "../../../components/FieldLabel";
import { BottomSheet } from "../../../components/BottomSheet";
import { Ico } from "../../../components/Ico";
import { NumInput } from "../../../components/NumInput";
import { supaUpsert } from "../../../lib/supabase";
import { fmtAmtAuto, getSym } from "../../../utils/format";
import { computeSplit } from "../../../utils/splitCalc";
import { newId } from "../../../utils/id";
import { PersonRow } from "./PersonRow";

const METHODS = [
  { key: "equal",   label: "Поровну" },
  { key: "exact",   label: "Суммами" },
  { key: "percent", label: "Проценты" },
  { key: "shares",  label: "Доли" },
];

const ME_PERSON = { id: "__me__", name: "Я", color: C.blue };

const REASON_TEXT = {
  negative_share: amt => `Доли остальных превышают сумму на ${amt}`,
  over_total:     amt => `Превышение суммы на ${amt}`,
  unallocated:    amt => `Не разделено ещё ${amt}`,
  no_participants: () => "Выберите хотя бы одного человека",
};

// Тугл "Оплатил за других" в форме расхода: выбор участников (существующих
// debt_people или новых, создаются сразу) + способ деления суммы (поровну / точными
// суммами / процентами / долями). Моя доля всегда производная (сумма минус чужие
// доли, см. utils/splitCalc.js) — в UI показывается как превью, в БД не пишется.
// Чужие доли сохраняются в TxPage как debt_events (paid_for_them), привязанные к id
// этой транзакции.
export function SplitToggle({
  enabled, onToggle, people, setPeople, selectedIds, onChangeSelected, amount, currency,
  method, onMethodChange, values, onChangeValues, meIncluded, onToggleMeIncluded,
  error,
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const toggleSelected = id => {
    if (selectedIds.includes(id)) {
      onChangeSelected(selectedIds.filter(x => x !== id));
    } else {
      onChangeSelected([...selectedIds, id]);
      if (method === "shares" && values[id] == null) onChangeValues({ ...values, [id]: "1" });
    }
  };

  const changeMethod = m => {
    if (m === method) return;
    onMethodChange(m);
    if (m === "shares") {
      const next = { __me__: values.__me__ ?? "1" };
      selectedIds.forEach(id => { next[id] = values[id] ?? "1"; });
      onChangeValues(next);
    } else {
      onChangeValues({});
    }
  };

  const addPerson = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const person = { id: newId(), name, color: PALETTE[people.length % PALETTE.length] };
    try {
      await supaUpsert("debt_people", person);
      setPeople(prev => [...prev, person]);
      onChangeSelected([...selectedIds, person.id]);
      if (method === "shares") onChangeValues({ ...values, [person.id]: "1" });
      setNewName("");
    } catch (e) {
      console.error("Create debt person:", e);
    }
    setCreating(false);
  };

  const total   = parseFloat(amount) || 0;
  const sym     = getSym(currency);
  const entries = selectedIds.map(id => ({ id, value: parseFloat(values[id]) || 0 }));
  const result  = selectedIds.length > 0 && total > 0 ? computeSplit(total, entries, method, meIncluded, values.__me__) : null;
  const amountById = Object.fromEntries((result?.others || []).map(o => [o.id, o.amount]));

  const errorText = result && !result.valid
    ? REASON_TEXT[result.reason]?.(`${sym}${fmtAmtAuto(result.gap)}`)
    : null;

  const myEditable = meIncluded && (method === "percent" || method === "shares");

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ padding:"12px 14px", borderRadius:12, background:C.monCard }}>
        <Toggle value={enabled} onChange={onToggle} label="Оплатил за других"/>
      </div>

      {enabled && (
        <div style={{ marginTop:12 }}>
          <FieldLabel>Кто ещё участвует</FieldLabel>
          <div onClick={() => setOpen(true)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, cursor:"pointer", marginBottom:10 }}>
            <span style={{ fontSize:14, color: selectedIds.length ? "#fff" : C.dim }}>
              {selectedIds.length ? `${selectedIds.length} чел.` : "Выбрать людей"}
            </span>
            <Ico n="chevD" s={16} c={C.dim}/>
          </div>

          {selectedIds.length > 0 && (
            <>
              <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                {METHODS.map(m => (
                  <button key={m.key} onClick={() => changeMethod(m.key)}
                    style={{ flex:1, padding:"8px 6px", borderRadius:10, border:"none", cursor:"pointer", fontSize:12, fontWeight:700,
                             background: method === m.key ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
                             color: method === m.key ? C.blue : C.dim }}>
                    {m.label}
                  </button>
                ))}
              </div>

              <div style={{ padding:"10px 14px", borderRadius:12, background:"rgba(255,255,255,0.04)", marginBottom:10 }}>
                <Toggle value={meIncluded} onChange={onToggleMeIncluded} label="Я тоже участвую"/>
              </div>

              <div style={{ marginBottom:10 }}>
                <PersonRow person={ME_PERSON} right={
                  !meIncluded ? (
                    <span style={{ fontSize:12, color:C.dim }}>не участвует</span>
                  ) : myEditable ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, color:C.dim, whiteSpace:"nowrap" }}>{sym}{fmtAmtAuto(result?.me || 0)}</span>
                      <NumInput
                        value={values.__me__ ?? ""}
                        onChange={v => onChangeValues({ ...values, __me__: v })}
                        placeholder="0"
                        suffix={method === "percent" ? " %" : undefined}
                        style={{ width:82, boxSizing:"border-box", background:"rgba(255,255,255,0.07)", border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 8px", color:"#fff", fontSize:13, outline:"none", textAlign:"right" }}
                      />
                    </div>
                  ) : (
                    <span style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{sym}{fmtAmtAuto(result?.me || 0)}</span>
                  )
                }/>
                {selectedIds.map(id => {
                  const person = people.find(p => p.id === id);
                  if (!person) return null;
                  const val = values[id] ?? "";
                  const computed = amountById[id];
                  return (
                    <PersonRow key={id} person={person} right={
                      method === "equal" ? (
                        <span style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{sym}{fmtAmtAuto(computed || 0)}</span>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {method !== "exact" && computed != null && (
                            <span style={{ fontSize:11, color:C.dim, whiteSpace:"nowrap" }}>{sym}{fmtAmtAuto(computed)}</span>
                          )}
                          <NumInput
                            value={val}
                            onChange={v => onChangeValues({ ...values, [id]: v })}
                            placeholder="0"
                            suffix={method === "percent" ? " %" : undefined}
                            prefix={method === "exact" ? sym : undefined}
                            style={{ width:82, boxSizing:"border-box", background:"rgba(255,255,255,0.07)", border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 8px", color:"#fff", fontSize:13, outline:"none", textAlign:"right" }}
                          />
                        </div>
                      )
                    }/>
                  );
                })}
              </div>

              {errorText && (
                <div style={{ padding:"10px 14px", borderRadius:12, background:"rgba(244,67,54,0.08)" }}>
                  <p style={{ margin:0, fontSize:12, color:C.errorLight }}>{errorText}</p>
                </div>
              )}
              {error && <p style={{ color:C.errorLight, fontSize:12, marginTop:8 }}>{error}</p>}
            </>
          )}
        </div>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Выбрать людей">
        {people.map(p => (
          <PersonRow key={p.id} person={p} selected={selectedIds.includes(p.id)} onClick={() => toggleSelected(p.id)}/>
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
