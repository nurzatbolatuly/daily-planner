import { useState, useRef, useMemo } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { fmtAmtAuto, getSym, pluralRu } from "../../../utils/format";
import { groupDeletionImpact, buildGroupDelete } from "../../../utils/sharedGroupSave";
import { RadioOption } from "./RadioOption";
import { sheetBtn, hintText } from "./sharedUi";

const signed = (n, currency) => `${n < 0 ? "−" : "+"}${getSym(currency)}${fmtAmtAuto(Math.abs(n))}`;

// Удаление группы (docs/shared-expenses.md §7.6). Перед удалением явно показывает, что связано
// с группой и что изменится в балансах, статистике и долгах — чтобы ничего не произошло молча.
// Есть операции на счетах или зачёты → по умолчанию предлагается архив, удаление — с выбором
// «оставить операции» / «удалить вместе с ними». Без них — обычное подтверждение.
//   data — всё из стора: groups, members, entries, transactions, debtEvents, accounts.
export function DeleteGroupSheet({ group, data, cats, labelOf, onArchive, onDeleted, onClose }) {
  const impact = useMemo(() => groupDeletionImpact(group, data), [group, data]);
  const [keep, setKeep] = useState(true);
  const accName = id => data.accounts.find(a => a.id === id)?.name || "Счёт";
  const catName = id => cats.find(c => c.id === id)?.name || "Без категории";

  const deleteRef = useRef(null);
  const { save: execDelete, saving, saveError } = useSave(() => deleteRef.current(), { errorMsg: "Не удалось удалить группу" });
  deleteRef.current = async () => {
    await supaRpc("delete_shared_group", { p: buildGroupDelete({ group, impact, keepTransactions: impact.hasLinked && keep }) });
    await onDeleted();
  };

  const { bills, transfers, adjusts } = impact.counts;
  const countsText = [
    bills && `${bills} ${pluralRu(bills, ["счёт", "счёта", "счетов"])}`,
    transfers && `${transfers} ${pluralRu(transfers, ["перевод", "перевода", "переводов"])}`,
    adjusts && `${adjusts} ${pluralRu(adjusts, ["корректировка", "корректировки", "корректировок"])}`,
  ].filter(Boolean).join(" · ") || "Записей нет";
  const analytics = impact.hasLinked && keep ? impact.analytics.keep : impact.analytics.remove;
  const analyticsText = analytics.map(a => `${catName(a.category_id)} ${signed(a.delta, a.currency)}`).join(" · ");
  const debtsText = impact.openDebts
    .map(d => `${labelOf(d.member)} ${d.balance > 0 ? "должен вам" : "— вы должны"} ${getSym(group.currency)}${fmtAmtAuto(Math.abs(d.balance))}`)
    .join(" · ");

  const section = (title, text) => (
    <div style={{ marginBottom:10 }}>
      <p style={{ margin:0, fontSize:12, color:C.dim }}>{title}</p>
      <p style={{ margin:"2px 0 0", fontSize:14, color:"#fff", lineHeight:1.4, overflowWrap:"anywhere" }}>{text}</p>
    </div>
  );

  return (
    <BottomSheet open onClose={onClose} title={`Удалить «${group.name}»?`}>
      {section("Что в группе", countsText)}
      {impact.accountMoves.length > 0 && section("Операции по счетам",
        impact.accountMoves.map(m => [accName(m.account_id), m.out && signed(-m.out, m.currency), m.in && signed(m.in, m.currency)].filter(Boolean).join(" ")).join(" · "))}
      {impact.txRestore.length > 0 && section("Привязанные операции",
        `${impact.txRestore.length} ${pluralRu(impact.txRestore.length, ["останется", "останутся", "останутся"])} на счетах при любом варианте — вернутся прежние категория и заметка`)}
      {impact.offsets > 0 && section("Зачёты с личными долгами", `${impact.offsets} — удалятся, личные долги вернутся к сумме до зачёта`)}
      {impact.openDebts.length > 0 && section("Открытые долги пропадут из вида", debtsText)}
      {!!impact.mirrorBalance && section("Баланс с группой пропадёт из вида",
        impact.mirrorBalance < 0 ? `я должен ${getSym(group.currency)}${fmtAmtAuto(-impact.mirrorBalance)}` : `мне должны ${getSym(group.currency)}${fmtAmtAuto(impact.mirrorBalance)}`)}

      {impact.hasLinked && (
        <div style={{ margin:"6px 0 8px", padding:"4px 14px", borderRadius:12, background:C.monCard }}>
          <RadioOption checked={keep} onSelect={() => setKeep(true)} label="Оставить операции на счетах"
            hint="Балансы не изменятся. Счета станут обычными расходами на полную сумму, переводы — движением денег"/>
          <RadioOption checked={!keep} onSelect={() => setKeep(false)} label="Удалить вместе с операциями"
            hint={`Как будто ничего не было: ${impact.balancesIfDelete.map(b => `${accName(b.account_id)} → ${fmtAmtAuto(b.balance)}`).join(", ") || "балансы без изменений"}`}/>
        </div>
      )}
      {analyticsText && <p style={{ ...hintText, color:C.mid }}>Статистика: {analyticsText}</p>}

      {saveError && <p style={{ margin:"0 0 8px", fontSize:12, color:C.errorLight, textAlign:"center" }}>{saveError}</p>}
      {impact.hasLinked && (
        <button onClick={onArchive} style={{ ...sheetBtn("primary"), marginBottom:10 }}>В архив — ничего не удалять</button>
      )}
      <button onClick={execDelete} disabled={saving} style={sheetBtn("danger", saving)}>{saving ? "Удаление..." : "Удалить"}</button>
    </BottomSheet>
  );
}
