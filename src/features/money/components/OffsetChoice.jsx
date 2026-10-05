import { C } from "../../../constants/theme";
import { offsetOptions } from "../../../utils/sharedExpenses";
import { roundTo } from "../../../utils/format";
import { RadioOption } from "./RadioOption";
import { hintText } from "./sharedUi";

// Перевести или зачесть (docs/shared-expenses.md §10, §12.5): отправитель / получатель перевода —
// человек из «Люди», и у него с вами личный долг в обратную сторону. Зачёт — деньги не двигаются,
// долг в группе закрывается, личный долг уменьшается на ту же сумму. Сумма ≤ min(перевода, |NET|);
// остаток — отдельным переводом со счёта. Нет встречного долга — компонент ничего не показывает.
//   personNet — личный NET человека в валюте группы (+ он должен мне).
//   onChange(offset, cappedAmount) — при выборе зачёта сумма урезается до допустимой.
export function OffsetChoice({ personName, personNet, direction, amount, value, onChange, fmt, precision }) {
  const opts = offsetOptions({ direction, amount: 0, personNet, precision });
  if (!opts.available) return null;
  const amt = Number(amount) || 0;
  const offsetAmount = amt > 0 ? Math.min(amt, opts.max) : opts.max;
  const rest = roundTo(amt - offsetAmount, precision);
  const netAfter = roundTo(Math.abs(personNet) - offsetAmount, precision);

  return (
    <div style={{ marginBottom:16, padding:"12px 14px", borderRadius:12, background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)" }}>
      <p style={{ margin:"0 0 6px", fontSize:13, color:C.amber }}>
        {personNet > 0 ? `Лично ${personName} должен вам ${fmt(personNet)}` : `Ваш личный долг · ${personName} · ${fmt(-personNet)}`}
      </p>
      <RadioOption checked={!value} onSelect={() => onChange(false)} label="Перевести деньги" hint="Личный долг останется как есть"/>
      <RadioOption checked={value} onSelect={() => onChange(true, offsetAmount)} label={`Зачесть ${fmt(offsetAmount)} — без движения денег`}
        hint={`Личный долг станет ${fmt(netAfter)}${netAfter === 0 ? " ✓" : ""}. В «Долгах» появится запись «Зачёт».`}/>
      {value && rest > 0 && <p style={{ ...hintText, margin:"6px 0 0", color:C.mid }}>Зачесть можно не больше {fmt(opts.max)}. Остаток {fmt(rest)} — отдельным переводом со счёта.</p>}
    </div>
  );
}
