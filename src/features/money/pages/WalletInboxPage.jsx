import { memo, useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { useSave } from "../../../hooks/useSave";
import { supaRpc } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { fmtM, pluralRu } from "../../../utils/format";
import {
  groupByDay, suggestForItem, isPossibleRepeat, bulkReady, buildBulk, inboxErrorText, timeLabel, fmtInboxAmount,
} from "../../../utils/walletInbox";
import { PageHeader } from "../../../components/PageHeader";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { AddButton } from "../../../components/AddButton";
import { CatIcon } from "../../../components/CatIcon";
import { Ico } from "../../../components/Ico";
import { InboxItemSheet } from "../components/InboxItemSheet";

// «Новые покупки» из Apple Pay (docs/apple-pay-inbox.md §8.2). После записи открывается следующая
// покупка — пачку разбирают подряд; список пуст — назад. Записанное попадает в общие данные через
// onRecorded (перезагрузка раздела + очереди).
export function WalletInboxPage({ wallet, accounts, expCats, transactions, onRecorded, onDetails, onBack }) {
  const { items, cards, merchants, loadError, reload } = wallet;
  const [openId, setOpenId] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const ctx = useMemo(() => ({ cards, merchants, accounts, expCats, transactions }), [cards, merchants, accounts, expCats, transactions]);
  const groups = useMemo(() => groupByDay(items), [items]);
  const ready = useMemo(() => bulkReady(items, ctx), [items, ctx]);
  const readyTotal = ready.map(it => fmtM(it.amount, accounts.find(a => a.id === suggestForItem(it, ctx).accountId)?.currency)).join(", ");
  const open = items.find(it => it.id === openId) || null;

  // Записали/закрыли покупку: следующая по списку (ещё не закрытая) или назад, если больше нет.
  const afterResolved = () => {
    const ordered = groups.flatMap(g => g.items);
    const next = ordered.find(it => it.id !== openId);
    onRecorded();
    if (next) setOpenId(next.id);
    else { setOpenId(null); onBack(false); }   // данные уже перезагружены onRecorded
  };

  const { save: recordBulk, saving: bulkSaving, saveError: bulkError } = useSave(async () => {
    // По одной: у каждой своя транзакция БД; упала одна — остальные уже записаны, список обновится.
    try {
      for (const { params } of buildBulk(ready, ctx, newId)) await supaRpc("save_tx", params);
    } finally {
      onRecorded();
    }
    setBulkOpen(false);
  }, { errorMsg: e => inboxErrorText(e, "Не все покупки записались — список обновлён") });

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", paddingBottom:80 }}>
      <PageHeader title={items.length ? `Новые покупки · ${items.length}` : "Новые покупки"} onBack={() => onBack(false)}/>
      <div style={{ padding:"12px 16px" }}>
        {loadError && (
          <div style={{ padding:12, borderRadius:12, background:C.errorTint, border:`1px solid ${C.errorBorder}`, marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, color:C.errorLight }}>{loadError}</span>
            <button type="button" onClick={reload} style={{ background:"none", border:"none", color:C.main, fontSize:13, fontWeight:600, cursor:"pointer" }}>Повторить</button>
          </div>
        )}

        {ready.length > 1 && (
          <AddButton icon="check" onClick={() => setBulkOpen(true)} style={{ marginBottom:12 }}>
            Записать все с подсказкой ({ready.length})
          </AddButton>
        )}

        {!items.length && !loadError && (
          <div style={{ textAlign:"center", padding:"48px 16px" }}>
            <Ico n="walletLine" s={36} c={C.dim}/>
            <p style={{ margin:"12px 0 0", fontSize:15, color:C.mid }}>Новых покупок нет</p>
            <p style={{ margin:"6px 0 0", fontSize:13, color:C.dim }}>Оплаты телефоном появятся здесь сами</p>
          </div>
        )}

        {groups.map(g => (
          <div key={g.key} style={{ marginBottom:12 }}>
            <p style={{ margin:"4px 4px 8px", fontSize:12, fontWeight:600, color:C.dim, textTransform:"uppercase" }}>{g.label}</p>
            <div style={{ background:C.monCard, borderRadius:16, overflow:"hidden" }}>
              {g.items.map((it, i) => (
                <InboxRow key={it.id} item={it} ctx={ctx} repeat={isPossibleRepeat(it, items)} first={i === 0} onOpen={setOpenId}/>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <InboxItemSheet key={open.id} item={open} items={items} accounts={accounts} expCats={expCats} transactions={transactions}
          cards={cards} merchants={merchants} onClose={() => setOpenId(null)} onSaved={afterResolved}
          onDetails={prefill => { setOpenId(null); onDetails(prefill); }}
          onDismiss={wallet.dismiss} onLink={wallet.link}/>
      )}

      <ConfirmSheet open={bulkOpen} onClose={() => setBulkOpen(false)} onConfirm={recordBulk} tone="confirm"
        disabled={bulkSaving} error={bulkError}
        title={`Записать ${ready.length} ${pluralRu(ready.length, ["покупку", "покупки", "покупок"])}?`}
        message={`Со счётом и категорией по подсказке: ${readyTotal}. Остальные останутся во «Входящих».`}
        confirmLabel={bulkSaving ? "Запись…" : "Записать"}/>
    </div>
  );
}

// Строка покупки: категория по подсказке (или «?»), продавец, время · карта → счёт, сумма.
const InboxRow = memo(function InboxRow({ item, ctx, repeat, first, onOpen }) {
  const { accountId, categoryId } = suggestForItem(item, ctx);
  const account = ctx.accounts.find(a => a.id === accountId);
  const cat = ctx.expCats.find(c => c.id === categoryId);
  const where = account ? `${item.card_label || "карта"} → ${account.name}` : item.card_label ? `${item.card_label} · счёт не выбран` : "карта не определилась";
  return (
    <button type="button" onClick={() => onOpen(item.id)}
      style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"none", border:"none",
        borderTop: first ? "none" : `1px solid ${C.border}`, cursor:"pointer", textAlign:"left" }}>
      {cat ? <CatIcon k={cat.icon} size={36} color={cat.color}/> : (
        <div style={{ width:36, height:36, borderRadius:18, background:C.fieldBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:C.dim, fontWeight:700 }}>?</div>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:15, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.merchant || "Без названия"}</p>
        <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {timeLabel(item.occurred_at)} · {where}{repeat ? " · возможно, повтор" : ""}
        </p>
      </div>
      <span style={{ flexShrink:0, fontSize:15, fontWeight:600, color: item.amount ? C.main : C.amber }}>
        {item.amount ? fmtInboxAmount(item.amount, item.currency || account?.currency) : "сумма?"}
      </span>
    </button>
  );
});
