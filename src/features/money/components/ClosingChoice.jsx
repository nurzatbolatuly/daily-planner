import { C } from "../../../constants/theme";
import { RadioOption } from "./RadioOption";

// Варианты закрытия долга при переводе (docs/shared-expenses.md §9): переплата / недоплата в обе
// стороны. closing — результат transferClosing (utils/sharedSave.js). Первый вариант выбран по
// умолчанию; порогов «маленькая разница = округление» нет — выбор всегда виден.
const OPTION_TEXT = {
  in: {
    rounding:  gap => [`Лишние ${gap} — округление`, `Долг закрыт, ваша доля станет меньше на ${gap}`],
    keep_debt: gap => [`Оставить долг ${gap}`, "Статус «вернул частично»"],
    forgive:   gap => [`Простить остаток ${gap}`, `Ваша доля станет больше на ${gap}`],
  },
  out: {
    rounding:  gap => [`Оставить ${gap} как округление`, `Ваша доля станет больше на ${gap}`],
    owes_me:   gap => [`Он должен мне ${gap}`, null],
    keep_debt: gap => [`Остаюсь должен ${gap}`, null],
    enough:    gap => ["Он сказал «хватит» — закрыть", `Ваша доля станет меньше на ${gap}`],
  },
};

const SingleOption = ({ text: [label, hint] }) => (
  <p style={{ margin:0, fontSize:14, color:"#fff" }}>
    {label}{hint && <span style={{ display:"block", marginTop:2, fontSize:11, color:C.dim }}>{hint}</span>}
  </p>
);

export function ClosingChoice({ closing, direction, fmt, value, onChange }) {
  const owed = direction === "in" ? closing.debt : -closing.debt;
  if (closing.status === "advance") {
    return (
      <p style={{ margin:"0 0 16px", fontSize:12, color:C.dim, lineHeight:1.5 }}>
        {direction === "in" ? "Он вам сейчас ничего не должен" : "Вы ему сейчас ничего не должны"} — перевод сохранится как аванс и учтётся в следующих счетах.
      </p>
    );
  }
  const head = direction === "in" ? `Долг ${fmt(owed)}` : `Я должен ${fmt(owed)}`;
  if (closing.status === "exact") {
    return <p style={{ margin:"0 0 16px", fontSize:13, color:C.green }}>{head} · закрывается полностью ✓</p>;
  }

  const gap = fmt(Math.abs(closing.diff));
  return (
    <div style={{ marginBottom:16, padding:"12px 14px", borderRadius:12, background:C.monCard }}>
      <p style={{ margin:"0 0 10px", fontSize:13, color:C.mid }}>
        {head} · {closing.status === "over" ? `больше на ${gap}` : `останется ${gap}`}
      </p>
      {closing.options.length === 1 ? (
        // Один вариант (мне перевели больше — всегда округление): без выбора, просто итог.
        <SingleOption text={OPTION_TEXT[direction][closing.options[0].id](gap)}/>
      ) : closing.options.map(o => {
        const [label, hint] = OPTION_TEXT[direction][o.id](gap);
        return <RadioOption key={o.id} checked={value === o.id} label={label} hint={hint} onSelect={() => onChange(o.id)}/>;
      })}
    </div>
  );
}
