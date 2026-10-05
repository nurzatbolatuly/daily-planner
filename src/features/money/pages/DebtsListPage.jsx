import { useMemo } from "react";
import { C } from "../../../constants/theme";
import { fmtAmtAuto, getSym, ratesFromAccounts, toBase } from "../../../utils/format";
import { totalsAcrossGroups } from "../../../utils/sharedExpenses";
import { BASE_CUR } from "../../../constants/currencies";
import { computeNetByPerson } from "../../../utils/debtLedger";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { PersonRow } from "../components/PersonRow";

const sym = getSym(BASE_CUR);

// Личный NET и долги в общих группах — разные обязательства и в одно число не складываются
// (docs/shared-expenses.md §11.6): долг в группах — отдельной строкой «+ 9 910 в общих группах».
export function DebtsListPage({ debtPeople = [], debtEvents = [], accounts = [], sharedGroups = [], sharedMembers = [], sharedEntries = [], navigate, onBack }) {
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const byPerson = useMemo(() => computeNetByPerson(debtEvents, rates), [debtEvents, rates]);
  const groupDebt = useMemo(() => {
    const { rows } = totalsAcrossGroups({ groups: sharedGroups, members: sharedMembers, entries: sharedEntries, people: debtPeople, toBase: (x, cur) => toBase(x, cur, rates) });
    return Object.fromEntries(rows.filter(r => r.personId).map(r => [r.personId, r.owedToMe - r.iOwe]));
  }, [sharedGroups, sharedMembers, sharedEntries, debtPeople, rates]);

  // Скрытый человек остаётся в списке, пока у него открытый долг (личный или в группах) —
  // иначе деньги пропали бы из вида.
  const visiblePeople = debtPeople.filter(p => !p.archived || (byPerson[p.id]?.net || 0) !== 0 || !!groupDebt[p.id]);

  const totals = useMemo(() => {
    let owedToMe = 0, iOwe = 0;
    Object.values(byPerson).forEach(p => { if (p.net > 0) owedToMe += p.net; else iOwe += -p.net; });
    return { owedToMe, iOwe };
  }, [byPerson]);

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Долги" onBack={onBack} right={
        <button onClick={() => navigate("menuPeople")}
          style={{ background:"none", border:"none", cursor:"pointer", color:C.green, fontSize:14, fontWeight:600, padding:4 }}>
          Люди
        </button>
      }/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>

        {(totals.owedToMe > 0 || totals.iOwe > 0) && (
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <div style={{ flex:1, padding:"12px 14px", borderRadius:12, background:"rgba(76,175,80,0.1)" }}>
              <p style={{ margin:0, fontSize:11, color:C.dim }}>Вам должны</p>
              <p style={{ margin:"3px 0 0", fontSize:17, fontWeight:700, color:C.green }}>{sym}{fmtAmtAuto(totals.owedToMe)}</p>
            </div>
            <div style={{ flex:1, padding:"12px 14px", borderRadius:12, background:"rgba(244,67,54,0.08)" }}>
              <p style={{ margin:0, fontSize:11, color:C.dim }}>Вы должны</p>
              <p style={{ margin:"3px 0 0", fontSize:17, fontWeight:700, color:C.errorLight }}>{sym}{fmtAmtAuto(totals.iOwe)}</p>
            </div>
          </div>
        )}

        {visiblePeople.length === 0 && (
          <p style={{ textAlign:"center", padding:"40px 0", color:C.dim, fontSize:14 }}>Пока никто никому не должен</p>
        )}

        {visiblePeople.map(person => {
          const net = byPerson[person.id]?.net || 0;
          const label = net === 0 ? "в расчёте" : net > 0 ? "должен вам" : "вы должны";
          const color = net === 0 ? C.dim : net > 0 ? C.green : C.errorLight;
          const inGroups = groupDebt[person.id] || 0;
          return (
            <PersonRow
              key={person.id}
              person={person}
              onClick={() => navigate("debtPersonDetail", person)}
              right={
                <div style={{ textAlign:"right", marginRight:8 }}>
                  <p style={{ margin:0, fontSize:14, fontWeight:700, color }}>{sym}{fmtAmtAuto(Math.abs(net))}</p>
                  <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim }}>{label}</p>
                  {inGroups !== 0 && (
                    <p style={{ margin:"2px 0 0", fontSize:11, color:C.violet, whiteSpace:"nowrap" }}>
                      {inGroups > 0 ? "+" : "−"} {sym}{fmtAmtAuto(Math.abs(inGroups))} в общих группах
                    </p>
                  )}
                </div>
              }
            />
          );
        })}

        <button
          onClick={() => navigate("addDebt")}
          style={{ width:"100%", padding:13, borderRadius:12, background:"transparent", border:`1px dashed rgba(76,175,80,0.4)`, color:C.green, fontSize:14, fontWeight:600, cursor:"pointer", marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
        >
          <Ico n="plus" s={16} c={C.green}/> Добавить долг
        </button>
      </div>
    </div>
  );
}
