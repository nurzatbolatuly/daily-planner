import { useEffect, useRef, useState } from "react";
import { C } from "../../../constants/theme";
import {
  WALLET_INGEST_URL, WALLET_SHORTCUT_URL, TOKEN_NAME_MAX, TOKEN_LIMIT, TOKEN_DEFAULT_NAME,
  SIGNAL_POLL_MS, SIGNAL_TIMEOUT_MS, SHORTCUT_STEPS, AUTOMATION_STEPS, INSTALL_STEPS,
} from "../../../constants/wallet";
import { useSave } from "../../../hooks/useSave";
import { lastSignalText } from "../../../utils/walletInbox";
import { PageHeader } from "../../../components/PageHeader";
import { BottomSheet } from "../../../components/BottomSheet";
import { ConfirmSheet } from "../../../components/ConfirmSheet";
import { AddButton } from "../../../components/AddButton";
import { AccSelect } from "../../../components/AccSelect";
import { Ico } from "../../../components/Ico";
import { fieldInput, sheetBtn, hintText, errorText } from "../components/sharedUi";

// Настройка Apple Pay → «Входящие» (docs/apple-pay-inbox.md §8.3): ключ устройства, команда,
// автоматизация с проверкой связи; привязки карт и правила продавцов.
export function WalletSetupPage({ wallet, accounts, expCats, onBack }) {
  const { tokens, cards, merchants } = wallet;
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [cardEdit, setCardEdit] = useState(null);
  const signalled = tokens.some(t => t.last_used_at);

  const { save: revoke, saving: revokeSaving, saveError: revokeError } = useSave(async () => {
    await wallet.revokeToken(revoking.id);
    setRevoking(null);
  }, { errorMsg: "Не удалось отозвать ключ" });

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", paddingBottom:80 }}>
      <PageHeader title="Apple Pay" onBack={() => onBack(false)}/>
      <div style={{ padding:"12px 16px" }}>
        <p style={{ ...hintText, fontSize:13 }}>
          Оплатили телефоном или часами — покупка сама появится в «Новых покупках» на Главной; вы только подтверждаете.
          Онлайн-оплаты и пластик iOS не передаёт.
        </p>

        <Step n={1} title="Ключ устройства" done={tokens.length > 0}>
          <AddButton onClick={() => setNewKeyOpen(true)} style={{ marginBottom: tokens.length ? 10 : 0 }}>
            Создать ключ
          </AddButton>
          {tokens.map(t => (
            <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderTop:`1px solid ${C.border}` }}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:15, color:"#fff" }}>{t.name}</p>
                <p style={{ margin:"2px 0 0", fontSize:12, color:C.dim }}>{t.prefix}… · {lastSignalText(t.last_used_at)}</p>
              </div>
              <button type="button" onClick={() => setRevoking(t)}
                style={{ background:"none", border:"none", color:C.errorLight, fontSize:13, fontWeight:600, cursor:"pointer" }}>Отозвать</button>
            </div>
          ))}
        </Step>

        <Step n={2} title="Команда «CashFlow: покупка»">
          <ol style={{ margin:"0 0 12px", paddingLeft:20, color:C.mid, fontSize:13, lineHeight:1.5 }}>
            {INSTALL_STEPS.map(s => <li key={s} style={{ marginBottom:4 }}>{s}</li>)}
          </ol>
          <a href={WALLET_SHORTCUT_URL} download style={{ ...sheetBtn("primary"), textDecoration:"none", marginBottom:12 }}>
            Установить команду
          </a>
          <details>
            <summary style={{ fontSize:13, color:C.dim, cursor:"pointer", marginBottom:8 }}>Не открывается — собрать вручную</summary>
            <ol style={{ margin:"0 0 10px", paddingLeft:20, color:C.mid, fontSize:13, lineHeight:1.5 }}>
              {SHORTCUT_STEPS.map(s => <li key={s} style={{ marginBottom:4 }}>{s}</li>)}
            </ol>
            <p style={{ ...hintText, margin:"0 0 6px" }}>Адрес для «Получить содержимое URL»:</p>
            <CopyField value={WALLET_INGEST_URL} label="Адрес скопирован"/>
          </details>
        </Step>

        <Step n={3} title="Автоматизация" done={signalled}>
          <ol style={{ margin:"0 0 10px", paddingLeft:20, color:C.mid, fontSize:13, lineHeight:1.5 }}>
            {AUTOMATION_STEPS.map(s => <li key={s} style={{ marginBottom:4 }}>{s}</li>)}
          </ol>
          <SignalCheck tokens={tokens} fetchTokens={wallet.fetchTokens} onSignal={wallet.reload} disabled={!tokens.length}/>
        </Step>

        <Section title="Привязанные карты">
          {cards.length ? cards.map(c => {
            const acc = accounts.find(a => a.id === c.account_id);
            return (
              <button key={c.id} type="button" onClick={() => setCardEdit(c)} style={rowBtn}>
                <span style={{ flex:1, minWidth:0, fontSize:14, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.card_label}</span>
                <span style={{ fontSize:13, color:C.mid }}>→ {acc?.name || "счёт удалён"}</span>
                <Ico n="chevR" s={16} c={C.dim}/>
              </button>
            );
          }) : <p style={{ ...hintText, margin:0 }}>Появятся после первой записанной покупки: счёт для карты запоминается сам.</p>}
        </Section>

        {merchants.length > 0 && (
          <Section title="Продавцы → категории">
            <p style={{ ...hintText, margin:"0 0 6px" }}>Запоминаются по вашему последнему выбору. Удалите правило, если оно ошибочное.</p>
            {merchants.map(m => <MerchantRow key={m.id} rule={m} cat={expCats.find(c => c.id === m.category_id)} onRemove={wallet.removeMerchant}/>)}
          </Section>
        )}
      </div>

      {newKeyOpen && <NewKeySheet onIssue={wallet.issueToken} limitReached={tokens.length >= TOKEN_LIMIT} onClose={() => setNewKeyOpen(false)}/>}
      {cardEdit && <CardSheet card={cardEdit} accounts={accounts} onUpdate={wallet.updateCard} onRemove={wallet.removeCard} onClose={() => setCardEdit(null)}/>}
      <ConfirmSheet open={!!revoking} onClose={() => setRevoking(null)} onConfirm={revoke} disabled={revokeSaving} error={revokeError}
        title={`Отозвать ключ «${revoking?.name || ""}»?`}
        message="Команда с этим ключом перестанет присылать покупки. Уже пришедшие останутся во «Входящих»."
        confirmLabel="Отозвать"/>
    </div>
  );
}

const rowBtn = { width:"100%", display:"flex", alignItems:"center", gap:8, padding:"12px 0", background:"none", border:"none", borderTop:`1px solid ${C.border}`, cursor:"pointer", textAlign:"left" };

function Step({ n, title, done = false, children }) {
  return (
    <div style={{ background:C.monCard, borderRadius:16, padding:14, marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <span style={{ width:26, height:26, borderRadius:13, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:13, fontWeight:700, background: done ? C.green : C.fieldBg, color: done ? "#fff" : C.mid }}>
          {done ? <Ico n="check" s={14} c="#fff"/> : n}
        </span>
        <span style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background:C.monCard, borderRadius:16, padding:"14px 14px 4px", marginBottom:12 }}>
      <p style={{ margin:"0 0 8px", fontSize:15, fontWeight:600, color:"#fff" }}>{title}</p>
      {children}
    </div>
  );
}

// Поле только для чтения + «Скопировать». Нет доступа к буферу — поле выделяется для ручного копирования.
function CopyField({ value, label = "Скопировано" }) {
  const [state, setState] = useState(null);   // null | "ok" | "manual"
  const inputRef = useRef(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("ok");
    } catch {
      inputRef.current?.select();
      setState("manual");
    }
  };
  return (
    <div style={{ marginBottom:4 }}>
      <div style={{ display:"flex", gap:8 }}>
        <input ref={inputRef} readOnly value={value} onFocus={e => e.target.select()}
          style={{ ...fieldInput(), flex:1, minWidth:0, fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace" }}/>
        <button type="button" onClick={copy} aria-label="Скопировать"
          style={{ flexShrink:0, width:48, borderRadius:10, border:`1px solid ${C.border}`, background:C.fieldBg, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Ico n={state === "ok" ? "check" : "copy"} s={18} c={state === "ok" ? C.green : C.mid}/>
        </button>
      </div>
      {state && <p style={{ ...hintText, margin:"6px 0 0", color: state === "ok" ? C.green : C.mid }}>{state === "ok" ? label : "Выделено — скопируйте вручную"}</p>}
    </div>
  );
}

function NewKeySheet({ onIssue, limitReached, onClose }) {
  const [name, setName] = useState(TOKEN_DEFAULT_NAME);
  const [issued, setIssued] = useState(null);
  const { save: issue, saving, saveError } = useSave(async () => setIssued(await onIssue(name.trim())), {
    errorMsg: e => (/too_many_tokens/.test(e?.message) ? `Не больше ${TOKEN_LIMIT} ключей — отзовите ненужный` : "Не удалось создать ключ"),
  });
  const valid = name.trim().length > 0;

  return (
    <BottomSheet open onClose={onClose} title={issued ? "Ключ создан" : "Новый ключ"}>
      {issued ? (
        <>
          <p style={{ margin:"0 0 12px", fontSize:14, color:C.main, lineHeight:1.5 }}>
            Скопируйте ключ и вставьте его в команду. <b>Больше мы его не покажем</b> — если потеряете, создайте новый.
          </p>
          <CopyField value={issued.token} label="Ключ скопирован"/>
          <button type="button" onClick={onClose} style={{ ...sheetBtn("primary"), marginTop:16 }}>Готово</button>
        </>
      ) : (
        <>
          <p style={{ ...hintText, fontSize:13 }}>Отдельный ключ на каждое устройство — так его можно отозвать, не трогая остальные.</p>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={TOKEN_NAME_MAX} placeholder="Название устройства"
            aria-label="Название устройства" style={{ ...fieldInput(), marginBottom:16 }}/>
          {limitReached && <p style={errorText}>Уже {TOKEN_LIMIT} ключей — отзовите ненужный.</p>}
          {saveError && <p style={{ ...errorText, textAlign:"center" }}>{saveError}</p>}
          <button type="button" onClick={issue} disabled={!valid || saving || limitReached} style={sheetBtn("primary", !valid || saving || limitReached)}>
            {saving ? "Создание…" : "Создать"}
          </button>
        </>
      )}
    </BottomSheet>
  );
}

// «Проверить связь»: опрос «последнего сигнала» ключей, пока экран открыт. Успех — сигнал новее, чем
// был в момент нажатия (время сервера; часы телефона не участвуют).
function SignalCheck({ tokens, fetchTokens, onSignal, disabled }) {
  const [check, setCheck] = useState({ state: "idle" });
  const latest = list => list.reduce((m, t) => Math.max(m, t.last_used_at ? Date.parse(t.last_used_at) : 0), 0);

  useEffect(() => {
    if (check.state !== "waiting") return;
    const poll = setInterval(async () => {
      try {
        if (latest(await fetchTokens()) > check.baseline) { setCheck({ state: "ok" }); onSignal(); }
      } catch { /* сеть моргнула — следующий опрос */ }
    }, SIGNAL_POLL_MS);
    const stop = setTimeout(() => setCheck(s => (s.state === "waiting" ? { state: "timeout" } : s)), SIGNAL_TIMEOUT_MS);
    return () => { clearInterval(poll); clearTimeout(stop); };
  }, [check, fetchTokens, onSignal]);

  const text = {
    waiting: "Запустите команду вручную в «Командах» — ждём сигнал…",
    ok: "✅ Связь есть — покупки будут приходить",
    timeout: "Сигнала нет. Проверьте ключ в команде и интернет, затем ещё раз.",
  }[check.state];
  return (
    <>
      <button type="button" disabled={disabled || check.state === "waiting"} onClick={() => setCheck({ state: "waiting", baseline: latest(tokens) })}
        style={sheetBtn("secondary", disabled || check.state === "waiting")}>
        {check.state === "waiting" ? "Ждём сигнал…" : "Проверить связь"}
      </button>
      {disabled && <p style={{ ...hintText, margin:"8px 0 0" }}>Сначала создайте ключ.</p>}
      {text && <p style={{ ...hintText, margin:"8px 0 0", color: check.state === "ok" ? C.green : check.state === "timeout" ? C.amber : C.mid }}>{text}</p>}
    </>
  );
}

function CardSheet({ card, accounts, onUpdate, onRemove, onClose }) {
  const { save, saving, saveError } = useSave(async action => { await action(); onClose(); }, { errorMsg: "Не удалось сохранить привязку" });
  return (
    <BottomSheet open onClose={onClose} title={`Карта «${card.card_label}»`}>
      <AccSelect accounts={accounts} value={card.account_id} label="Счёт для покупок этой картой"
        onChange={id => id !== card.account_id && save(() => onUpdate(card.id, id))}/>
      {saveError && <p style={{ ...errorText, textAlign:"center" }}>{saveError}</p>}
      <button type="button" disabled={saving} onClick={() => save(() => onRemove(card.id))} style={sheetBtn("danger", saving)}>
        Удалить привязку
      </button>
      <p style={{ ...hintText, margin:"10px 0 0" }}>Без привязки счёт для этой карты спросим при следующей покупке.</p>
    </BottomSheet>
  );
}

function MerchantRow({ rule, cat, onRemove }) {
  const { save: remove, saving, saveError } = useSave(() => onRemove(rule.id), { errorMsg: "Не удалось удалить" });
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 0", borderTop:`1px solid ${C.border}` }}>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:14, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rule.merchant_key}</p>
        <p style={{ margin:"2px 0 0", fontSize:12, color: saveError ? C.errorLight : C.dim }}>{saveError || `→ ${cat?.name || "категория удалена"}`}</p>
      </div>
      <button type="button" disabled={saving} onClick={remove} aria-label={`Удалить правило ${rule.merchant_key}`}
        style={{ background:"none", border:"none", cursor:"pointer", padding:6, display:"flex", opacity: saving ? 0.5 : 1 }}>
        <Ico n="trash" s={18} c={C.dim}/>
      </button>
    </div>
  );
}
