import { useRef } from "react";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { newId } from "../../../utils/id";
import { todayStr } from "../../../utils/date";
import { buildEntryDelete } from "../../../utils/sharedSave";
import { buildPeerTransferSave } from "../../../utils/sharedTransferSave";

// Перевод между двумя другими участниками («Даурен → Асан»): отметить по строке плана
// (row: { from, to, amount }) или отменить уже отмеченный (entry). Мои деньги не двигаются —
// ни счёта, ни транзакции, меняется только итог группы. Монтировать, только когда нужна.
export function PeerTransferSheet({ group, row = null, entry = null, nameOf, fmt, onSaved, onClose }) {
  const undo = !!entry;
  const from = undo ? entry.from_member_id : row.from;
  const to = undo ? entry.to_member_id : row.to;
  const amount = undo ? Number(entry.amount_group) : row.amount;

  const runRef = useRef(null);
  runRef.current = async () => {
    if (undo) await supaRpc("delete_shared_entry", { p: buildEntryDelete({ entry, accounts: [], transactions: [] }) });
    else await supaRpc("save_shared_entry", { p: buildPeerTransferSave({ group, fromId: from, toId: to, amount, date: todayStr(), newId }) });
    await onSaved();
  };
  const { save, saving, saveError } = useSave(() => runRef.current(), { errorMsg: undo ? "Не удалось отменить" : "Не удалось сохранить" });

  const pair = `${nameOf(from)} → ${nameOf(to)}`;
  return (
    <ConfirmSheet open onClose={onClose} onConfirm={save} tone={undo ? "danger" : "confirm"}
      title={undo ? `Отменить перевод ${pair}?` : `${pair}: ${fmt(amount)}`}
      message={undo
        ? "Долг снова появится в плане расчёта группы."
        : "Отметить, что перевод сделан? Ваши счета и статистика не меняются — только итог группы."}
      confirmLabel={saving ? "Сохранение..." : undo ? "Отменить перевод" : "Перевод сделан"}
      disabled={saving} error={saveError}
    />
  );
}
