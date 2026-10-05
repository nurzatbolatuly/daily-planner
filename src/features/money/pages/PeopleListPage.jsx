import { useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { computeNetByPerson } from "../../../utils/debtLedger";
import { ratesFromAccounts, pluralRu } from "../../../utils/format";
import { personUsage } from "../../../utils/people";
import { PersonRow } from "../components/PersonRow";
import { PersonEditSheet } from "../components/PersonEditSheet";

// Меню → Люди (и ссылка из «Долгов»): общий список людей для долгов, сплитов и общих групп.
// Добавить, переименовать, скрыть, вернуть, удалить — через PersonEditSheet (§7.5 общих расходов).
export function PeopleListPage({ people = [], debtEvents = [], sharedMembers = [], sharedEntries = [], accounts = [], onReload, onBack }) {
  const [target, setTarget] = useState(null);     // { person } — null-person = новый
  const [showHidden, setShowHidden] = useState(false);

  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const netByPerson = useMemo(() => computeNetByPerson(debtEvents, rates), [debtEvents, rates]);
  const active = people.filter(p => !p.archived);
  const hidden = people.filter(p => p.archived);

  const done = async () => { setTarget(null); await onReload(); };
  const row = p => <PersonRow key={p.id} person={p} onClick={() => setTarget({ person: p })} right={<Ico n="edit" s={16} c={C.dim}/>}/>;

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Люди" onBack={onBack} right={
        <button onClick={() => setTarget({ person: null })} aria-label="Добавить человека"
          style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
          <Ico n="plus" s={22} c={C.green}/>
        </button>
      }/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <p style={{ margin:"0 0 14px", fontSize:12, color:C.dim, lineHeight:1.5 }}>
          Один список для долгов, «Оплатил за других» и общих расходов. Имя меняется сразу везде.
        </p>

        {active.length === 0 && (
          <div style={{ textAlign:"center", padding:"32px 0" }}>
            <p style={{ margin:"0 0 14px", color:C.dim, fontSize:14 }}>Пока никого нет</p>
            <button onClick={() => setTarget({ person: null })}
              style={{ padding:"12px 20px", borderRadius:12, background:"transparent", border:`1px dashed ${C.greenBorderStrong}`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
              <Ico n="plus" s={16} c={C.green}/> Добавить человека
            </button>
          </div>
        )}

        {active.length > 0 && (
          <p style={{ margin:"0 0 8px", fontSize:13, fontWeight:700, color:C.dim }}>
            Всего {active.length} {pluralRu(active.length, ["человек", "человека", "человек"])}{hidden.length ? ` · скрытых ${hidden.length}` : ""}
          </p>
        )}
        {active.map(row)}

        {hidden.length > 0 && (
          <>
            <button onClick={() => setShowHidden(v => !v)}
              style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 4px", marginTop:12, background:"none", border:"none", cursor:"pointer", color:C.dim, fontSize:13, fontWeight:700 }}>
              <span>Скрытые ({hidden.length})</span>
              <Ico n={showHidden ? "chevU" : "chevD"} s={16} c={C.dim}/>
            </button>
            {showHidden && <div style={{ opacity:0.6 }}>{hidden.map(row)}</div>}
          </>
        )}
      </div>

      {target && (
        <PersonEditSheet
          person={target.person}
          people={people}
          usage={target.person && personUsage(target.person.id, { debtEvents, sharedMembers, sharedEntries })}
          net={target.person ? netByPerson[target.person.id]?.net || 0 : 0}
          onClose={() => setTarget(null)}
          onDone={done}
        />
      )}
    </div>
  );
}
