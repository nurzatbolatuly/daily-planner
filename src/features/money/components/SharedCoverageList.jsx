import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";
import { NumInput } from "../../../components/NumInput";
import { fmtAmtAuto, pluralRu, roundTo } from "../../../utils/format";
import { AddMemberChips } from "./AddMemberChips";
import { includedHeads, methodCheck, SHARED_SPLIT_METHODS } from "./coverageRows";

// «Кого покрыл» / «Кто в доле» (docs/shared-expenses.md §12.2): галка — участвует / нет; тап по
// строке — шторка участника. Способ деления (method, coverageRows.js):
//   equal — справа сумма доли (× N, фикс, личное — в шторке, одно действие на строку, §12.0);
//   percent / parts / amount — справа поле ввода (%, части, сумма), под именем — сколько выходит.
//   rows: { [member_id]: { included, heads, mode, value, extra, extraNote, weight } };
//   amounts: { [member_id]: число }; payerId — кто платил (подпись «платил» у участника).
//   tapToToggle — Tricount: без галочки и без шторки участника, тап по строке выбирает / снимает
//   человека (× N, фикс и личное — только в тусе).
export function SharedCoverageList({ members, rows, amounts, labelOf, sym, payerId, method = "equal", total = 0, feeAmounts = {}, tapToToggle = false, onWeight, onToggle, onOpen, onAddPerson, onAddGuest, onAddUnnamed }) {
  const heads = includedHeads(members, rows);
  const byWeight = method !== "equal";
  const unit = SHARED_SPLIT_METHODS.find(m => m.id === method)?.unit;
  const check = methodCheck(method, members, rows);
  const distributed = check.total; // для «Суммы» — Σ введённых сумм
  const fmt = n => `${sym}${fmtAmtAuto(n)}`;

  return (
    <div>
      {members.map(m => {
        const row = rows[m.id];
        const on = row?.included;
        const extra = Number(row?.extra) || 0;
        const sub = [
          m.id === payerId && !m.is_me && "платил",
          on && !byWeight && row.heads > 1 && `× ${row.heads}`,
          on && !byWeight && row.mode === "fixed" && "фикс",
          on && !byWeight && extra > 0 && `＋ ${row.extraNote?.trim() || "личное"} ${fmt(extra)}`,
          on && byWeight && method !== "amount" && fmt(amounts[m.id] || 0),
          on && feeAmounts[m.id] > 0 && `＋ сборы ${fmt(feeAmounts[m.id])}`,
          on && byWeight && method === "amount" && feeAmounts[m.id] > 0 && `итого ${fmt(amounts[m.id] || 0)}`,
        ].filter(Boolean);
        return (
          <div key={m.id} onClick={tapToToggle ? () => onToggle(m.id) : undefined}
            style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:6, cursor: tapToToggle ? "pointer" : "default",
                     background: on ? C.greenTint : C.rowBg, border:`1px solid ${on ? C.greenBorder : C.border}` }}>
            {!tapToToggle && (
              <button onClick={() => onToggle(m.id)} aria-label={on ? "Не участвует" : "Участвует"} aria-pressed={!!on}
                style={{ width:24, height:24, flexShrink:0, borderRadius:7, border:`2px solid ${on ? C.green : C.dim}`, background: on ? C.green : "transparent",
                         display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", padding:0 }}>
                {on && <Ico n="check" s={14} c="#fff"/>}
              </button>
            )}
            <div onClick={tapToToggle ? undefined : () => onOpen(m.id)}
              {...(tapToToggle ? { role: "checkbox", "aria-checked": !!on, "aria-label": labelOf(m), tabIndex: 0,
                onKeyDown: e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(m.id); } } } : {})}
              style={{ flex:1, minWidth:0, cursor:"pointer" }}>
              <p style={{ margin:0, fontSize:14, fontWeight:600, color: on ? "#fff" : C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {labelOf(m)}
              </p>
              {sub.length > 0 && (
                <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub.join(" · ")}</p>
              )}
            </div>
            {on && byWeight ? (
              <div onClick={e => e.stopPropagation()} style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                <NumInput value={row.weight ?? ""} onChange={v => onWeight(m.id, v)} placeholder="0" prefix={method === "amount" ? sym : undefined}
                  aria-label={`${SHARED_SPLIT_METHODS.find(x => x.id === method)?.label}: ${labelOf(m)}`}
                  style={{ width: method === "amount" ? 104 : 64, boxSizing:"border-box", background:C.fieldBg, border:`1px solid ${C.border}`,
                           borderRadius:8, padding:"7px 8px", color:"#fff", fontSize:16, outline:"none", textAlign:"right" }}/>
                {unit && <span style={{ fontSize:12, color:C.dim, width:18 }}>{unit}</span>}
              </div>
            ) : (
              <span onClick={tapToToggle ? undefined : () => onOpen(m.id)} style={{ fontSize:14, fontWeight:700, color: on ? "#fff" : C.dim, whiteSpace:"nowrap", flexShrink:0, cursor:"pointer" }}>
                {on ? fmt(amounts[m.id] || 0) : tapToToggle ? "не в доле" : "не участвует"}
              </span>
            )}
          </div>
        );
      })}

      {method === "percent" && (
        <p style={{ margin:"4px 2px 0", fontSize:12, color: check.error ? C.amber : C.green }}>Итого {check.total}%{check.error ? " — нужно 100%" : " ✓"}</p>
      )}
      {method === "parts" && check.total > 0 && (
        <p style={{ margin:"4px 2px 0", fontSize:12, color:C.dim }}>
          Всего {check.total} {pluralRu(Math.round(check.total), ["часть", "части", "частей"])} · 1 часть ≈ {fmt(total / check.total)}
        </p>
      )}
      {method === "amount" && total > 0 && (
        <p style={{ margin:"4px 2px 0", fontSize:12, color: distributed === roundTo(total, 2) ? C.green : C.amber }}>
          Распределено {fmt(distributed)} из {fmt(total)}{distributed === roundTo(total, 2) ? " ✓" : ""}
        </p>
      )}
      {heads > 0 && (
        <p style={{ margin:"4px 2px 0", fontSize:12, color:C.dim }}>Всего в счёте: <b style={{ color:"#fff" }}>{heads} {pluralRu(heads, ["человек", "человека", "человек"])}</b></p>
      )}
      <AddMemberChips onAddPerson={onAddPerson} onAddGuest={onAddGuest} onAddUnnamed={onAddUnnamed} style={{ marginTop:8 }}/>
    </div>
  );
}
