import { useState } from "react";
import { C } from "../../../constants/theme";
import { PALETTE } from "../../../constants/money";
import { Toggle } from "../../../components/Toggle";
import { FieldLabel } from "../../../components/FieldLabel";
import { BottomSheet } from "../../../components/BottomSheet";
import { Ico } from "../../../components/Ico";
import { supaUpsert } from "../../../lib/supabase";
import { fmtAmtAuto, getSym } from "../../../utils/format";
import { splitEqually } from "../../../utils/debtLedger";
import { newId } from "../../../utils/id";
import { PersonRow } from "./PersonRow";

// Тугл "Оплатил за других" в форме расхода: выбор участников (существующих
// debt_people или новых, создаются сразу) + равный сплит суммы. Доля
// пользователя остаётся расходом, доли остальных сохраняются в TxPage как
// debt_events (paid_for_them), привязанные к id этой транзакции.
export function SplitToggle({ enabled, onToggle, people, setPeople, selectedIds, onChangeSelected, amount, currency }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const toggleSelected = id => onChangeSelected(
    selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
  );

  const addPerson = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const person = { id: newId(), name, color: PALETTE[people.length % PALETTE.length] };
    try {
      await supaUpsert("debt_people", person);
      setPeople(prev => [...prev, person]);
      onChangeSelected([...selectedIds, person.id]);
      setNewName("");
    } catch (e) {
      console.error("Create debt person:", e);
    }
    setCreating(false);
  };

  const total = parseFloat(amount) || 0;
  const shares = selectedIds.length > 0 ? splitEqually(total, 1 + selectedIds.length) : [];
  const myShare = shares[0] || 0;
  const otherShare = shares[1] || 0;

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

          {selectedIds.length > 0 && total > 0 && (
            <div style={{ padding:"10px 14px", borderRadius:12, background:"rgba(76,175,80,0.08)" }}>
              <p style={{ margin:0, fontSize:12, color:C.dim }}>
                Ваша доля: <span style={{ color:"#fff", fontWeight:600 }}>{getSym(currency)}{fmtAmtAuto(myShare)}</span>
                {" · "}на человека: <span style={{ color:"#fff", fontWeight:600 }}>{getSym(currency)}{fmtAmtAuto(otherShare)}</span>
              </p>
            </div>
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
