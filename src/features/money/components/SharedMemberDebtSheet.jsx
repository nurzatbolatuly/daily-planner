import { useState, useEffect, useRef } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { Ico } from "../../../components/Ico";
import { debtLineText, debtShareText } from "../../../utils/sharedExpenses";
import { sheetBtn } from "./sharedUi";

const COPIED_MS = 1500;

// Шторка участника на экране вечера (§5.8, §11.7, §12.3): из чего сложился долг, и все действия,
// которые не поместились в строку (на строке — только «Получено»/«Вернуть», §12.0).
// onSaveToPeople — только у участника-гостя (§7.2). onRename — переименовать участника.
// onMoveToTricount — он есть в группе Tricount: перенести долг туда («нет денег — запишем в Tricount»).
export function SharedMemberDebtSheet({ label, groupName, balance, lines, fmt, titleOf, onTransfer, onTreat, onSaveToPeople, onRename, onMoveToTricount, onClose }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const share = async () => {
    const text = debtShareText({ groupName, lines, balance, fmt, titleOf });
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch (e) {
      if (e?.name !== "AbortError") console.error("Share debt:", e); // AbortError — пользователь закрыл меню «Поделиться»
    }
  };

  const btn = tone => ({ ...sheetBtn(tone), marginBottom:10 });

  return (
    <BottomSheet open onClose={onClose} title={label}>
      <div style={{ padding:"4px 0 12px", marginBottom:12, borderBottom:`1px solid ${C.border}` }}>
        {lines.map((l, i) => (
          <p key={i} style={{ margin:"0 0 6px", fontSize:13, color:C.mid, lineHeight:1.4 }}>{debtLineText(l, { fmt, titleOf })}</p>
        ))}
        <p style={{ margin:"8px 0 0", fontSize:15, fontWeight:700, color: balance > 0 ? C.green : balance < 0 ? C.errorLight : C.dim }}>
          {balance > 0 ? `Должен мне ${fmt(balance)}` : balance < 0 ? `Я должен ${fmt(-balance)}` : "Рассчитались ✓"}
        </p>
      </div>

      {balance !== 0 && (
        <button onClick={() => onTransfer(balance > 0 ? "in" : "out")} style={btn("primary")}>
          {balance > 0 ? "Получено" : "Вернуть"}
        </button>
      )}
      {balance > 0 && onMoveToTricount && (
        <button onClick={onMoveToTricount} style={{ ...btn("secondary"), color:C.blue }}>Записать в Tricount</button>
      )}
      {balance > 0 && (
        <button onClick={onTreat} style={btn("secondary")}>Угощаю — простить весь долг</button>
      )}
      {balance !== 0 && (
        <button onClick={share} style={{ ...btn("secondary"), color: copied ? C.green : C.mid }}>
          <Ico n={copied ? "check" : "copy"} s={15} c={copied ? C.green : C.mid}/> {copied ? "Скопировано" : "Поделиться"}
        </button>
      )}
      {onRename && (
        <button onClick={onRename} style={btn("secondary")}>
          <Ico n="edit" s={15} c={C.mid}/> Переименовать
        </button>
      )}
      {onSaveToPeople && (
        <button onClick={onSaveToPeople} style={btn("secondary")}>
          <Ico n="plus" s={15} c={C.mid}/> Сохранить в «Люди»
        </button>
      )}
    </BottomSheet>
  );
}
