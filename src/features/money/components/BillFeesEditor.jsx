import { C } from "../../../constants/theme";
import { NumInput } from "../../../components/NumInput";
import { FieldLabel } from "../../../components/FieldLabel";
import { Ico } from "../../../components/Ico";
import { newId } from "../../../utils/id";
import { fieldInput, chip, chipRow, hintText } from "./sharedUi";

const SPLITS = [["equal", "поровну"], ["proportional", "по заказу"]];

// Общие сборы в счёте — доставка, сервис, комиссия (splitCalc.splitWithFees): вычитаются из суммы,
// остаток делится выбранным способом, сбор раскладывается сверху на всех в доле — поровну по
// людям или пропорционально заказу.
//   fees: [{ id, title, amount (строка ввода), split: "equal" | "proportional" }]
//   supported — в БД есть колонка fees (миграция v30); нет — сборы не сохранятся, предупреждаем.
export function BillFeesEditor({ fees, onChange, sym, supported = true }) {
  if (!supported && fees.length === 0) {
    return (
      <p role="alert" style={{ ...hintText, margin:"16px 0 0", color:C.amber }}>
        Доставка и сборы пока недоступны: запустите в Supabase миграцию v30 из tables.sql.
      </p>
    );
  }
  const patch = (id, p) => onChange(fees.map(f => (f.id === id ? { ...f, ...p } : f)));
  const add = () => onChange([...fees, { id: newId(), title: "", amount: "", split: "equal" }]);

  return (
    <div style={{ marginTop:16 }}>
      {fees.length > 0 && <FieldLabel>Доставка, сервис, комиссия</FieldLabel>}
      {fees.map(f => (
        <div key={f.id} style={{ padding:"10px 12px", borderRadius:12, marginBottom:6, background:C.rowBg, border:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input value={f.title} onChange={e => patch(f.id, { title: e.target.value })} placeholder="Доставка" aria-label="Название сбора"
              style={{ ...fieldInput(), flex:1, minWidth:0, padding:"8px 10px" }}/>
            <NumInput value={f.amount} onChange={v => patch(f.id, { amount: v })} placeholder="0" prefix={sym} aria-label={`Сумма сбора: ${f.title || "сбор"}`}
              style={{ ...fieldInput(), width:110, padding:"8px 10px", textAlign:"right" }}/>
            <button onClick={() => onChange(fees.filter(x => x.id !== f.id))} aria-label={`Убрать сбор: ${f.title || "сбор"}`}
              style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4, flexShrink:0 }}>
              <Ico n="trash" s={16} c={C.dim}/>
            </button>
          </div>
          <div style={{ ...chipRow, marginTop:8 }}>
            {SPLITS.map(([v, label]) => (
              <button key={v} onClick={() => patch(f.id, { split: v })} aria-pressed={f.split === v} style={{ ...chip(f.split === v), padding:"5px 12px", fontSize:12 }}>{label}</button>
            ))}
          </div>
        </div>
      ))}
      {!supported && (
        <p role="alert" style={{ ...hintText, margin:"0 0 6px", color:C.amber }}>
          Сборы восстановлены из долей. Чтобы они сохранялись с названием и способом, запустите в Supabase миграцию v30.
        </p>
      )}
      <button onClick={add} disabled={!supported} style={{ display: supported ? "block" : "none", background:"none", border:"none", padding:"4px 0", color:C.green, fontSize:13, fontWeight:600, cursor:"pointer" }}>
        ＋ Доставка, сервис или комиссия
      </button>
      {fees.length > 0 && (
        <p style={{ ...hintText, margin:"4px 0 0" }}>Сборы вычитаются из суммы, остаток делится как выбрано выше, а сбор — сверху на всех в доле.</p>
      )}
    </div>
  );
}
