import { useMemo, useState } from "react";
import { C } from "../../../constants/theme";
import { useSave } from "../../../hooks/useSave";
import { supaRpc } from "../../../lib/supabase";
import { newId } from "../../../utils/id";
import { fmtM, getSym, ratesFromAccounts, fmtDateShort } from "../../../utils/format";
import { newTxRpcParams } from "../../../utils/txSave";
import {
  suggestForItem, isForeign, itemCurrency, estimateCharged, validateConfirm, buildInboxTx,
  findInboxMatches, isPossibleRepeat, inboxErrorText, inboxNote, timeLabel, inboxSharePrefill,
} from "../../../utils/walletInbox";
import { localDate } from "../../../utils/date";
import { BottomSheet } from "../../../components/BottomSheet";
import { AccSelect } from "../../../components/AccSelect";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { fieldInput, sheetBtn, hintText, errorText } from "./sharedUi";

// Карточка покупки из «Входящих» (docs/apple-pay-inbox.md §6, §7). Одно главное действие —
// «Записать» (мой расход); остальное — второстепенной строкой. Транзакция — в валюте счёта;
// валютная покупка требует «Списалось со счёта» (§6.1). wallet_inbox_id закрывает покупку в БД.
// onSaved() — записано/закрыто (страница откроет следующую); onDetails(prefill) — в TxPage;
// onShare(prefill) — «оплатил за всех» → в общие расходы (выбор группы — на странице).
export function InboxItemSheet({ item, items, accounts, expCats, transactions, cards, merchants, onClose, onSaved, onDetails, onShare, onDismiss, onLink }) {
  const suggestion = useMemo(() => suggestForItem(item, { cards, merchants, accounts, expCats }), [item, cards, merchants, accounts, expCats]);
  const [accountId, setAccountId] = useState(suggestion.accountId);
  const [categoryId, setCategoryId] = useState(suggestion.categoryId);
  const [amount, setAmount] = useState(item.amount ? String(item.amount) : "");
  const [charged, setCharged] = useState("");
  const [errors, setErrors] = useState({});
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  const account = accounts.find(a => a.id === accountId) || null;
  const foreign = isForeign(item, account);
  const currency = itemCurrency(item, account);
  const rates = useMemo(() => ratesFromAccounts(accounts), [accounts]);
  const estimate = foreign && item.amount ? estimateCharged(item, account, rates) : null;
  const matches = useMemo(() => findInboxMatches(item, transactions, account), [item, transactions, account]);
  const repeat = isPossibleRepeat(item, items);
  const catById = id => expCats.find(c => c.id === id);
  const clearError = key => setErrors(p => ({ ...p, [key]: "" }));

  const { save: record, saving, saveError } = useSave(async () => {
    const tx = buildInboxTx({ id: newId(), item, account, categoryId, amount, charged });
    await supaRpc("save_tx", newTxRpcParams(tx, account));
    onSaved();
  }, { errorMsg: e => inboxErrorText(e, "Не удалось записать покупку") });

  const { save: link, saving: linking, saveError: linkError } = useSave(async txId => {
    await onLink(item.id, txId);
    onSaved();
  }, { errorMsg: e => inboxErrorText(e, "Не удалось связать с расходом") });

  const { save: dismiss, saving: dismissing, saveError: dismissError } = useSave(async () => {
    await onDismiss([item.id]);
    onSaved();
  }, { errorMsg: "Не удалось убрать покупку" });

  const submit = () => {
    const e = validateConfirm({ item, account, categoryId, amount, charged });
    setErrors(e);
    if (!Object.keys(e).length) record();
  };

  // «Подробнее» — TxPage с тем же префиллом: чек, дата, заметка. Валютная — в валюте счёта.
  const details = () => onDetails({
    type: "expense",
    amount: foreign ? charged : amount,
    currency: account?.currency || currency || undefined,
    account_id: accountId || undefined,
    category_id: categoryId || undefined,
    date: localDate(item.occurred_at),
    note: inboxNote(item, account),
    wallet_inbox_id: item.id,
  });

  const busy = saving || linking || dismissing;
  const error = saveError || linkError || dismissError;
  const sub = [timeLabel(item.occurred_at), item.card_label].filter(Boolean).join(" · ");

  return (
    <BottomSheet open onClose={onClose} title={item.merchant || "Покупка без названия"}>
      <p style={{ ...hintText, margin:"0 0 14px", fontSize:13 }}>
        {sub}
        {repeat && <span style={{ marginLeft:8, padding:"2px 8px", borderRadius:10, background:C.warnTint, border:`1px solid ${C.warnBorder}`, color:C.amber, fontSize:11 }}>Возможно, повтор</span>}
      </p>

      {foreign ? (
        <>
          <p style={{ margin:"0 0 12px", fontSize:14, color:C.mid }}>Покупка: <b style={{ color:"#fff" }}>{fmtM(item.amount, item.currency)}</b></p>
          <FieldLabel error={errors.charged}>Списалось со счёта, {getSym(account.currency)}</FieldLabel>
          <NumInput value={charged} onChange={v => { setCharged(v); clearError("charged"); }} placeholder="0"
            style={{ ...fieldInput(!!errors.charged), marginBottom:8 }}/>
          {estimate !== null && (
            <button type="button" onClick={() => { setCharged(String(estimate)); clearError("charged"); }}
              style={{ background:"none", border:"none", padding:0, margin:"0 0 16px", color:C.blue, fontSize:13, cursor:"pointer" }}>
              ≈ {fmtM(estimate, account.currency)} по курсу — подставить
            </button>
          )}
        </>
      ) : (
        <>
          <FieldLabel error={errors.amount}>
            Сумма{currency ? `, ${getSym(currency)}` : ""}{!item.amount ? " — не пришла с телефона" : ""}
          </FieldLabel>
          <NumInput value={amount} onChange={v => { setAmount(v); clearError("amount"); }} placeholder="0" autoFocus={!item.amount}
            style={{ ...fieldInput(!!errors.amount), marginBottom: item.currency || !account ? 16 : 6 }}/>
          {!item.currency && account && <p style={hintText}>Валюта не пришла — как у счёта</p>}
        </>
      )}

      <AccSelect accounts={accounts} value={accountId} onChange={v => { setAccountId(v); clearError("account"); }}
        label={item.card_label && !suggestion.accountId ? `Счёт карты «${item.card_label}» — запомним` : "Счёт"} error={errors.account}/>

      <FieldLabel error={errors.category}>Категория</FieldLabel>
      <div style={{ marginBottom:16 }}>
        <CategoryPicker cats={expCats} value={categoryId} onChange={id => { setCategoryId(id); clearError("category"); }}/>
      </div>

      {matches.length > 0 && (
        <div style={{ padding:12, borderRadius:12, background:C.infoTint, border:`1px solid ${C.infoBorder}`, marginBottom:16 }}>
          <p style={{ margin:"0 0 8px", fontSize:13, color:C.main }}>Похоже, уже записано вручную:</p>
          {matches.slice(0, 3).map(t => (
            <div key={t.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"6px 0" }}>
              <span style={{ fontSize:13, color:C.mid, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {fmtM(t.amount, t.currency)} · {catById(t.category_id)?.name || "Без категории"} · {fmtDateShort(t.date + "T12:00:00")}
              </span>
              <button type="button" disabled={busy} onClick={() => link(t.id)}
                style={{ flexShrink:0, padding:"6px 12px", borderRadius:16, border:`1px solid ${C.infoBorderStrong}`, background:"transparent", color:C.blue, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                Это она
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ ...errorText, textAlign:"center" }}>{error}</p>}
      <button type="button" onClick={submit} disabled={busy} style={{ ...sheetBtn("primary", busy), marginBottom:10 }}>
        {saving ? "Запись…" : "Записать"}
      </button>
      <button type="button" disabled={busy} onClick={() => onShare(inboxSharePrefill({ item, account, categoryId, amount, charged }))}
        style={{ ...sheetBtn("secondary", busy), color:C.green, marginBottom:10 }}>
        В общие расходы — оплатил за всех
      </button>
      <div style={{ display:"flex", gap:8 }}>
        <button type="button" onClick={details} disabled={busy} style={{ ...sheetBtn("secondary", busy), flex:1 }}>Подробнее</button>
        <button type="button" disabled={busy} onClick={() => (confirmDismiss ? dismiss() : setConfirmDismiss(true))}
          style={{ ...sheetBtn(confirmDismiss ? "danger" : "secondary", busy), flex:1 }}>
          {confirmDismiss ? "Точно убрать?" : "Не записывать"}
        </button>
      </div>
    </BottomSheet>
  );
}
