import { useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { CatIcon } from "../../../components/CatIcon";
import { BottomSheet } from "../../../components/BottomSheet";
import { fmtAmtAuto, getSym, getPrecision, ratesFromAccounts, toBase } from "../../../utils/format";
import { groupSummary, totalsAcrossGroups } from "../../../utils/sharedExpenses";
import { BASE_CUR } from "../../../constants/currencies";
import { GroupTotalsSheet } from "../components/GroupTotalsSheet";
import { fmtEventDate } from "../../../utils/sharedSave";
import { todayStr } from "../../../utils/date";
import { SHARED_MODES } from "../../../constants/money";

// Тип группы выбирается при создании — их два (§4), название пользователь вводит сам.
// «＋» в шапке — шторка выбора (одна кнопка, а не два плюса — §12.1).
const NEW_GROUP_OPTIONS = [
  { key: "event",  icon: "eating", title: "Туса с друзьями", screen: "addSharedBill",  data: {},
    hint: "Кто-то оплатил счёт за компанию — приложение посчитает, кто кому сколько должен. Платил другой — тоже сюда" },
  { key: "mirror", icon: "home",   title: "Tricount",        screen: "addSharedGroup", data: { mode: SHARED_MODES.mirror },
    hint: "Общие траты ведёте в Tricount — здесь ваша доля по категориям и баланс для сверки" },
];

// Меню → Общие расходы (docs/shared-expenses.md §12.1). Архив — свёрнутым блоком внизу; архивные
// группы с открытым долгом отмечены, чтобы долг не пропал из вида. Сверху — общие итоги по всем
// группам (totalsAcrossGroups, в базовой валюте), по тапу — разбивка по людям и гостям.
export function SharedGroupsListPage({ groups, members, entries, people = [], accounts = [], navigate, onBack }) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [totalsOpen, setTotalsOpen] = useState(false);
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const totals = useMemo(
    () => totalsAcrossGroups({ groups, members, entries, people, toBase: (x, cur) => toBase(x, cur, rates) }),
    [groups, members, entries, people, rates]);
  const baseSym = getSym(BASE_CUR);
  const all = useMemo(() => groups
    .map(g => ({
      g,
      sym: getSym(g.currency),
      summary: groupSummary(entries.filter(e => e.group_id === g.id), members.filter(m => m.group_id === g.id),
        { precision: getPrecision(g.currency), mode: g.mode, month: todayStr().slice(0, 7) }),
    }))
    .sort((a, b) => (b.g.date || "").localeCompare(a.g.date || "") || (b.g.created_at || "").localeCompare(a.g.created_at || "")),
  [groups, members, entries]);
  const rows = all.filter(r => !r.g.archived);
  const archived = all.filter(r => r.g.archived);
  const archivedWithDebt = archived.filter(r => r.summary.owedToMe > 0 || r.summary.iOwe > 0).length;
  const [archiveOpen, setArchiveOpen] = useState(false);

  const create = o => { setChooserOpen(false); navigate(o.screen, o.data); };

  const groupRow = ({ g, sym, summary }) => {
    const isMirror = g.mode === SHARED_MODES.mirror;
    const allSettled = isMirror ? summary.hasEntries && !summary.owedToMe && !summary.iOwe
      : summary.participants > 0 && summary.settled === summary.participants;
    const status = allSettled ? "Рассчитались ✓"
      : summary.owedToMe > 0 ? `Мне должны ${sym}${fmtAmtAuto(summary.owedToMe)}${summary.settled ? ` · ${summary.settled} из ${summary.participants} ✓` : ""}`
      : summary.iOwe > 0 ? `Я должен ${sym}${fmtAmtAuto(summary.iOwe)}`
      : isMirror ? "Покупок пока нет" : "Нет счетов";
    return (
      <div key={g.id} onClick={() => navigate("sharedGroup", { groupId: g.id })}
        style={{ display:"flex", alignItems:"center", gap:12, padding:"14px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:15, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {g.name}{isMirror && <span style={{ marginLeft:6, fontSize:11, fontWeight:600, color:C.blue }}>Tricount</span>}
          </p>
          <p style={{ margin:"3px 0 0", fontSize:12, color: allSettled ? C.green : summary.owedToMe > 0 ? C.mid : C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{status}</p>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          {g.date && <p style={{ margin:0, fontSize:11, color:C.dim }}>{fmtEventDate(g.date)}</p>}
          <p style={{ margin:"3px 0 0", fontSize:12, color:C.dim, whiteSpace:"nowrap" }}>{isMirror ? "за месяц" : "моя доля"} {sym}{fmtAmtAuto(summary.myShare)}</p>
        </div>
        <Ico n="chevR" s={16} c={C.dim}/>
      </div>
    );
  };

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title="Общие расходы" onBack={onBack} right={
        <button onClick={() => setChooserOpen(true)} aria-label="Добавить" style={{ background:"none", border:"none", cursor:"pointer", display:"flex", padding:4 }}>
          <Ico n="plus" s={22} c={C.green}/>
        </button>
      }/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px calc(100px + env(safe-area-inset-bottom, 0px))" }}>

        {(totals.owedToMe > 0 || totals.iOwe > 0) && (
          <button onClick={() => setTotalsOpen(true)} aria-label="Кто кому должен"
            style={{ width:"100%", display:"flex", gap:10, padding:0, marginBottom:16, background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
            {[["Мне должны", totals.owedToMe, C.green, "rgba(76,175,80,0.1)"], ["Я должен", totals.iOwe, C.errorLight, "rgba(244,67,54,0.08)"]].map(([label, value, color, bg]) => (
              <span key={label} style={{ flex:1, minWidth:0, padding:"12px 14px", borderRadius:12, background:bg }}>
                <span style={{ display:"block", fontSize:11, color:C.dim }}>{label}</span>
                <span style={{ display:"block", marginTop:3, fontSize:17, fontWeight:700, color, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{baseSym}{fmtAmtAuto(value)}</span>
              </span>
            ))}
          </button>
        )}

        {all.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 8px" }}>
            <div style={{ display:"inline-flex", marginBottom:14 }}><CatIcon k="eating" size={56} color={C.green}/></div>
            <p style={{ margin:"0 0 6px", fontSize:16, fontWeight:700 }}>Общих расходов пока нет</p>
            <p style={{ margin:"0 0 20px", fontSize:13, color:C.dim, lineHeight:1.5 }}>
              Оплатили счёт за компанию? Внесите его — в вашу категорию попадёт только ваша доля, а приложение посчитает, кто сколько должен.
            </p>
            <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:10 }}>
              {NEW_GROUP_OPTIONS.map((o, i) => (
                <button key={o.key} onClick={() => create(o)}
                  style={{ padding:"13px 22px", borderRadius:30, border: i ? `1px solid ${C.green}` : "none", background: i ? "transparent" : C.green,
                           color: i ? C.green : "#fff", fontSize:15, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
                  <Ico n="plus" s={16} c={i ? C.green : "#fff"}/> {o.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {rows.map(groupRow)}

        {archived.length > 0 && (
          <>
            <button onClick={() => setArchiveOpen(o => !o)} aria-expanded={archiveOpen}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"14px 4px", marginTop:8, background:"none", border:"none", borderTop:`1px solid ${C.border}`, color:C.mid, fontSize:14, cursor:"pointer", textAlign:"left" }}>
              <span style={{ flex:1, minWidth:0 }}>
                Архив ({archived.length}){archivedWithDebt > 0 && <span style={{ color:C.amber }}> · {archivedWithDebt} с долгом</span>}
              </span>
              <span style={{ display:"flex", transform: archiveOpen ? "rotate(90deg)" : "none", transition:"transform 0.2s" }}><Ico n="chevR" s={16} c={C.dim}/></span>
            </button>
            {archiveOpen && archived.map(groupRow)}
          </>
        )}
      </div>

      {totalsOpen && (
        <GroupTotalsSheet totals={totals} baseSym={baseSym} onClose={() => setTotalsOpen(false)}
          onOpenPerson={id => { setTotalsOpen(false); navigate("debtPersonDetail", people.find(p => p.id === id)); }}
          onOpenGroup={id => { setTotalsOpen(false); navigate("sharedGroup", { groupId: id }); }}/>
      )}

      <BottomSheet open={chooserOpen} onClose={() => setChooserOpen(false)} title="Добавить">
        {NEW_GROUP_OPTIONS.map(o => (
          <button key={o.key} onClick={() => create(o)}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:14, borderRadius:14, marginBottom:8, background:C.monCard, border:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left" }}>
            <CatIcon k={o.icon} size={40} color={C.green}/>
            <span style={{ flex:1, minWidth:0 }}>
              <span style={{ display:"block", fontSize:15, fontWeight:600, color:"#fff" }}>{o.title}</span>
              <span style={{ display:"block", marginTop:2, fontSize:12, color:C.dim, lineHeight:1.4 }}>{o.hint}</span>
            </span>
            <Ico n="chevR" s={16} c={C.dim}/>
          </button>
        ))}
      </BottomSheet>
    </div>
  );
}
