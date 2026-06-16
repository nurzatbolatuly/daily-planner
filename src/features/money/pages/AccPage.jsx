import { useState, useRef } from "react";
import { C } from "../../../constants/theme";
import { BASE_CUR, COMMODITY_CURRENCIES } from "../../../constants/currencies";
import { ACC_ICONS } from "../../../constants/icons";
import { ACC_PURPOSES } from "../../../constants/money";
import { getSym, fmtAmt } from "../../../utils/format";
import { supa, supaRpc } from "../../../lib/supabase";
import { useSave } from "../../../hooks/useSave";
import { PageHeader } from "../../../components/PageHeader";
import { Ico } from "../../../components/Ico";
import { FieldLabel } from "../../../components/FieldLabel";
import { NumInput } from "../../../components/NumInput";
import { CatIcon } from "../../../components/CatIcon";
import { Toggle } from "../../../components/Toggle";
import { ColorPickerComp } from "../../../components/ColorPickerComp";
import { CurrencyPage } from "../../../components/CurrencyPage";
import { ConfirmSheet } from "../../../components/ConfirmSheet";

export function AccPage({ onBack, edit }) {
  const [name, setName] = useState(edit?.name || "");
  const [icon, setIcon] = useState(edit?.icon || "wallet");
  const [color, setColor] = useState(edit?.color || C.green);
  const [cur, setCur] = useState(edit?.currency || BASE_CUR);
  const [bal, setBal] = useState(edit?.balance != null ? String(edit.balance) : "");
  const [inTotal, setInTotal] = useState(edit?.in_total !== false);
  const [purpose, setPurpose] = useState(edit?.purpose || "daily");
  const [avgRate, setAvgRate] = useState(edit?.avg_rate ? String(edit.avg_rate) : "");
  const [showCur, setShowCur] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = !!edit;
  const activeCur = isEdit ? edit.currency : cur;
  const isCom = COMMODITY_CURRENCIES.includes(activeCur);

  // Refs hold latest closures so useSave is called unconditionally before any early returns
  const saveRef = useRef(null);
  const deleteRef = useRef(null);
  const { save: execSave, saving, saveError } = useSave(() => saveRef.current(), { errorMsg: "Не удалось сохранить счёт" });
  const { save: del } = useSave(() => deleteRef.current?.(), { errorMsg: "Не удалось удалить счёт" });

  saveRef.current = async () => {
    const newBal = parseFloat(bal) || 0;
    const acc = {
      id: edit?.id || crypto.randomUUID(),
      name: name.trim(), icon, color, currency: cur,
      balance: newBal, in_total: inTotal,
      avg_rate: parseFloat(avgRate) || null,
      purpose,
    };
    const diff = isEdit ? newBal - edit.balance : 0;
    const adj = (isEdit && diff !== 0) ? {
      id: crypto.randomUUID(),
      from_id: acc.id,
      amount: Math.abs(diff),
      to_amt: diff,
      from_currency: acc.currency,
    } : null;
    await supaRpc("save_account", { p_acc: acc, p_adj: adj });
    onBack(true);
  };

  deleteRef.current = async () => {
    await supa.delete("accounts", `id=eq.${edit.id}`);
    onBack(true);
  };

  const save = () => {
    const errs = {};
    if (!name.trim()) errs.name = "Введите название";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    execSave();
  };

  const handleDelete = () => { setConfirmDelete(false); del(); };

  if (showCur) return <CurrencyPage value={cur} onSelect={setCur} onBack={() => setShowCur(false)}/>;
  const iconKeys = Object.keys(ACC_ICONS);

  return (
    <div style={{ minHeight:"calc(100dvh - var(--app-header-h))", background:C.monBg, color:"#fff", display:"flex", flexDirection:"column" }}>
      <PageHeader title={isEdit ? "Редактировать счёт" : "Новый счёт"} onBack={() => onBack(false)}/>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 100px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, padding:"16px", borderRadius:16, background:C.monCard }}>
          <CatIcon k={icon} size={52} color={color}/>
          <div>
            <p style={{ margin:0, fontSize:18, fontWeight:700, color:"#fff" }}>{name||"Счёт"}</p>
            <p style={{ margin:0, fontSize:14, color:C.green }}>
              {isCom ? `${fmtAmt(parseFloat(bal)||0, 3)} г` : `${getSym(cur)}${fmtAmt(parseFloat(bal)||0)}`}
            </p>
          </div>
        </div>
        <div style={{ marginBottom:20 }}>
          <FieldLabel>{isCom ? "Количество (г)" : "Баланс"}</FieldLabel>
          <NumInput
            value={bal} onChange={setBal} placeholder="0"
            style={{ width:"100%", background:"none", border:"none", borderBottom:"1px solid rgba(255,255,255,0.2)", outline:"none", color:"#fff", fontSize:28, fontWeight:700, padding:"4px 0", marginBottom:12, boxSizing:"border-box" }}
          />
          {isEdit
            ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:12, background:"rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize:13, color:C.dim }}>Валюта</span>
                <div>
                  <span style={{ fontSize:15, fontWeight:700, color:C.dim }}>{cur}</span>
                  <span style={{ fontSize:11, color:C.dim, marginLeft:8 }}>Нельзя изменить</span>
                </div>
              </div>
            )
            : (
              <button onClick={() => setShowCur(true)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"12px 14px", borderRadius:12, background:"rgba(76,175,80,0.1)", border:`1px solid rgba(76,175,80,0.3)`, cursor:"pointer", boxSizing:"border-box" }}>
                <span style={{ fontSize:13, color:C.mid }}>Валюта</span>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:16, fontWeight:700, color:C.green }}>{cur}</span>
                  <Ico n="chevD" s={14} c={C.green}/>
                </div>
              </button>
            )
          }
        </div>
        {activeCur !== BASE_CUR && (
          <div style={{ marginBottom:16 }}>
            <FieldLabel>{isCom ? "Средняя цена покупки (₸/г)" : `Курс (1 ${activeCur} = ? ₸)`}</FieldLabel>
            <div style={{ display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid rgba(255,255,255,0.2)", paddingBottom:8 }}>
              <NumInput value={avgRate} onChange={setAvgRate} placeholder={isCom ? "напр. 23000" : "напр. 478"}
                style={{ flex:1, background:"none", border:"none", outline:"none", color:"#fff", fontSize:22, fontWeight:600, padding:"4px 0" }}/>
              <span style={{ fontSize:16, fontWeight:700, color:C.dim }}>₸{isCom ? "/г" : ""}</span>
            </div>
            <p style={{ margin:"6px 0 0", fontSize:11, color:C.dim }}>
              {isCom
                ? "Средняя цена покупки за грамм. Обновляется автоматически при каждой покупке."
                : "Используется для расчёта общего баланса. Обновляется автоматически при переводах."
              }
            </p>
          </div>
        )}
        <div style={{ marginBottom:16 }}>
          <FieldLabel error={errors.name}>Название</FieldLabel>
          <input value={name} onChange={e => { setName(e.target.value); setErrors(p => ({...p, name:""})); }} placeholder="Название счёта"
            style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${errors.name?"rgba(244,67,54,0.5)":"rgba(255,255,255,0.2)"}`, outline:"none", color:"#fff", fontSize:18, padding:"4px 0", boxSizing:"border-box" }}/>
          {errors.name && <p style={{ color:C.red, fontSize:12, marginTop:4 }}>{errors.name}</p>}
        </div>
        <div style={{ marginBottom:16 }}>
          <FieldLabel>Назначение</FieldLabel>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
            {ACC_PURPOSES.map(p => (
              <button key={p.key} onClick={() => setPurpose(p.key)}
                style={{ padding:"10px 4px", borderRadius:10, border:`1px solid ${purpose===p.key ? C.green : C.border}`, background: purpose===p.key ? "rgba(76,175,80,0.15)" : "transparent", color: purpose===p.key ? C.green : C.dim, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <FieldLabel>Иконка</FieldLabel>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {iconKeys.map(k => (
              <button key={k} onClick={() => setIcon(k)} style={{ width:50, height:50, borderRadius:25, border:icon===k?"3px solid #fff":"3px solid transparent", background:"transparent", cursor:"pointer", padding:0 }}>
                <CatIcon k={k} size={44} color={color}/>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:20 }}><FieldLabel>Цвет</FieldLabel><ColorPickerComp value={color} onChange={setColor}/></div>
        <div style={{ padding:"14px 16px", borderRadius:12, background:C.monCard, marginBottom:24 }}>
          <Toggle value={!inTotal} onChange={v => setInTotal(!v)} label="Исключить из общего баланса"/>
        </div>
        {saveError && <p style={{ color:C.errorLight, fontSize:13, textAlign:"center", marginBottom:8 }}>{saveError}</p>}
        <button onClick={save} disabled={saving}
          style={{ width:"100%", padding:"15px", borderRadius:30, background:saving?C.savingDisabled:C.yellow, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" }}>
          {saving?"Сохранение...":"Сохранить"}
        </button>
        {isEdit && (
          <button onClick={() => setConfirmDelete(true)}
            style={{ width:"100%", marginTop:10, padding:"14px", borderRadius:30, background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", color:C.red, fontSize:15, fontWeight:600, cursor:"pointer" }}>
            Удалить счёт
          </button>
        )}
        <ConfirmSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          title="Удалить счёт?"
          message="Транзакции и переводы этого счёта останутся в базе как «осиротевшие» — без привязки к счёту."
          confirmLabel="Удалить счёт"
        />
      </div>
    </div>
  );
}
