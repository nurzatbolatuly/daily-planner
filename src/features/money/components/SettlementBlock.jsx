import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";

// «Как рассчитаться» — итог группы как в Tricount (utils/sharedSettlement): минимум переводов
// между всеми участниками и баланс каждого. Общий для тусы и Tricount.
//   rows — план (sortPlanRows: мои строки первыми); nets — Map(member_id → баланс);
//   nameOf(id) — подпись участника («Я» для меня); noteOf(row) — подпись под моей строкой
//   (например «вернул частично»), необязательно.
//   onMine(row) — «Получено» / «Вернуть» (перевод со мной, через обычную форму перевода);
//   onMark(row) — «Отметить»: перевод между двумя другими, мои деньги не двигаются;
//   onMember(id) — тап по участнику в моей строке плана и в балансах (шторка участника), необязательно;
//   canAct(row) — false прячет кнопку на моей строке (аванс: возвращать нечего), необязательно.
const rowBox = { display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:6, background:C.rowBg, border:`1px solid ${C.border}` };
const ellipsis = { overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" };
const btnBase = { padding:"8px 14px", borderRadius:20, fontSize:13, fontWeight:600, cursor:"pointer", flexShrink:0 };
const primaryBtn = { ...btnBase, border:"none", background:C.green, color:"#fff" };
const secondaryBtn = { ...btnBase, border:`1px solid ${C.border}`, background:C.fieldBg, color:C.mid };

export function SettlementBlock({ rows, nets, meId, nameOf, fmt, noteOf, onMine, onMark, onMember, canAct, readOnly = false }) {
  // Все участники, рассчитавшиеся тоже: через строку — шторка (переименовать, «Сохранить в Люди»).
  const balances = [...nets].sort((a, b) => b[1] - a[1]);
  const name = id => (id === meId ? "Я" : nameOf(id));

  const planRow = row => {
    const mine = row.from === meId || row.to === meId;
    const incoming = row.to === meId;
    const note = mine && noteOf ? noteOf(row) : null;
    return (
      <div key={`${row.from}>${row.to}`} style={rowBox}>
        <div onClick={mine && onMember ? () => onMember(incoming ? row.from : row.to) : undefined}
          style={{ flex:1, minWidth:0, cursor: mine && onMember ? "pointer" : "default" }}>
          <p style={{ margin:0, fontSize:14, fontWeight:600, display:"flex", alignItems:"center", gap:6, color: mine ? "#fff" : C.mid }}>
            <span style={{ ...ellipsis, minWidth:0 }}>{name(row.from)}</span>
            <span style={{ color:C.dim, flexShrink:0 }}>→</span>
            <span style={{ ...ellipsis, minWidth:0 }}>{name(row.to)}</span>
          </p>
          <p style={{ margin:"2px 0 0", fontSize:12, color: mine ? (incoming ? C.green : C.errorLight) : C.dim, ...ellipsis }}>
            {[fmt(row.amount), note].filter(Boolean).join(" · ")}
          </p>
        </div>
        {!readOnly && (mine
          ? (canAct?.(row) ?? true) && <button onClick={() => onMine(row)} style={primaryBtn}>{incoming ? "Получено" : "Вернуть"}</button>
          : <button onClick={() => onMark(row)} style={secondaryBtn}>Отметить</button>)}
      </div>
    );
  };

  return (
    <div style={{ marginBottom:20 }}>
      <p style={{ margin:"0 0 8px", fontSize:13, fontWeight:700, color:C.dim }}>Как рассчитаться</p>
      {rows.length === 0
        ? <div style={{ ...rowBox, color:C.green, fontSize:14, fontWeight:600 }}><Ico n="check" s={16} c={C.green}/> Все рассчитались</div>
        : rows.map(planRow)}

      {balances.length > 1 && (
        <>
          <p style={{ margin:"14px 0 6px", fontSize:13, fontWeight:700, color:C.dim }}>Балансы</p>
          <div style={{ borderRadius:12, background:C.rowBg, border:`1px solid ${C.border}`, padding:"2px 0" }}>
            {balances.map(([id, x]) => {
              const tappable = onMember && id !== meId;
              return (
                <div key={id} onClick={tappable ? () => onMember(id) : undefined}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", cursor: tappable ? "pointer" : "default" }}>
                  <span style={{ flex:1, minWidth:0, fontSize:14, color: id === meId ? "#fff" : C.main, fontWeight: id === meId ? 700 : 500, ...ellipsis }}>{name(id)}</span>
                  <span style={{ fontSize:14, fontWeight:700, whiteSpace:"nowrap", color: x > 0 ? C.green : x < 0 ? C.errorLight : C.dim }}>
                    {x === 0 ? "0 ✓" : `${x > 0 ? "+" : "−"}${fmt(Math.abs(x))}`}
                  </span>
                  {tappable && <Ico n="chevR" s={12} c={C.dim}/>}
                </div>
              );
            })}
          </div>
          <p style={{ margin:"6px 2px 0", fontSize:11, color:C.dim, lineHeight:1.4 }}>
            + участнику должны, − он должен группе. Переводы выше закрывают все балансы.
          </p>
        </>
      )}
    </div>
  );
}
