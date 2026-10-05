import { useMemo } from "react";
import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";
import { fmtAmtAuto, getSym } from "../../../utils/format";
import { memberLabel, personGroupSummary } from "../../../utils/sharedExpenses";
import { fmtEventDate } from "../../../utils/sharedSave";

const rowBox = { display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:6, background:C.rowBg, border:`1px solid ${C.border}`, cursor:"pointer" };

// «Общие группы» в карточке человека (docs/shared-expenses.md §11.5): вечера, где он контакт
// участника (с долгом этого участника, архивные тоже), и переводы, где деньги реально прислал
// или получил он — в т.ч. за чужую компашку (§5.10). Долг в группах и личный NET — разные
// обязательства, поэтому показываются отдельно, а не одним числом.
export function PersonGroupsBlock({ personId, groups, members, entries, people, navigate }) {
  const summary = useMemo(() => personGroupSummary(personId, { groups, members, entries }), [personId, groups, members, entries]);
  if (!summary.groups.length && !summary.transfers.length) return null;

  const labelIn = m => memberLabel(m, { people, members: members.filter(x => x.group_id === m.group_id) });
  const memberById = id => members.find(m => m.id === id);
  const fmt = (n, cur) => `${getSym(cur)}${fmtAmtAuto(n)}`;

  return (
    <div style={{ marginBottom:20 }}>
      <p style={{ margin:"0 0 8px", fontSize:13, fontWeight:700, color:C.dim }}>Общие группы</p>
      {summary.groups.map(({ group, member, balance }) => {
        const label = labelIn(member);
        const person = people.find(p => p.id === personId);
        return (
          <div key={member.id} onClick={() => navigate("sharedGroup", { groupId: group.id })} style={rowBox}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {group.name}{group.archived ? " · архив" : ""}
              </p>
              <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {[group.date && fmtEventDate(group.date), label !== person?.name && label].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span style={{ fontSize:13, fontWeight:700, whiteSpace:"nowrap", flexShrink:0, color: balance > 0 ? C.green : balance < 0 ? C.errorLight : C.dim }}>
              {balance === 0 ? "закрыто ✓" : `${balance > 0 ? "должен " : "я должен "}${fmt(Math.abs(balance), group.currency)}`}
            </span>
            <Ico n="chevR" s={14} c={C.dim}/>
          </div>
        );
      })}
      {summary.transfers.map(({ entry, group, incoming }) => {
        const member = memberById(incoming ? entry.from_member_id : entry.to_member_id);
        return (
          <div key={entry.id} onClick={() => navigate("editSharedEntry", { entryId: entry.id })} style={rowBox}>
            <Ico n="transfer" s={16} c={incoming ? C.green : C.errorLight}/>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {entry.method === "group" ? "Записано в Tricount" : incoming ? "Прислал" : "Получил от меня"} · {group.name}
              </p>
              <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {[fmtEventDate(entry.date), member && `за «${labelIn(member)}»`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span style={{ fontSize:13, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 }}>{fmt(Number(entry.amount_group), group.currency)}</span>
          </div>
        );
      })}
    </div>
  );
}
