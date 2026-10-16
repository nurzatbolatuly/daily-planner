import { useState } from "react";
import { C } from "../../constants/theme";

// Код из письма: ячейки — только отрисовка, ввод — ОДНО настоящее поле поверх них
// (прозрачное, на всю площадь). Отдельные input на каждую цифру ломают автоподстановку
// кода iOS (autoComplete="one-time-code") и вставку из буфера.
//   length — сколько ячеек показывать; maxLength — сколько цифр принимает поле (код может
//   оказаться длиннее настроенного — ячеек станет больше, ввод не обрежется).
//   shakeKey — меняется после неверного кода: ячейки «встряхиваются» заново (поле не пересоздаётся).
export function OtpInput({ value, onChange, length, maxLength, disabled, error, inputRef, shakeKey, label }) {
  const [focused, setFocused] = useState(false);
  const cells = Math.max(length, value.length);
  const active = Math.min(value.length, cells - 1);

  const cellStyle = i => {
    const isActive = focused && !disabled && i === active;
    const border = error ? C.errorBorder : isActive ? C.green : value[i] ? C.greenBorder : C.border;
    return {
      height: cells > 6 ? "clamp(40px, 11vw, 48px)" : "clamp(44px, 13vw, 56px)", borderRadius: 14, background: error ? C.errorTint : value[i] ? C.greenTint : C.fieldBg,
      border: `1.5px solid ${border}`, boxShadow: isActive ? `0 0 0 4px ${C.greenTint}` : "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: cells > 6 ? 20 : 24, fontWeight: 700, color: C.main, fontVariantNumeric: "tabular-nums",
      transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
    };
  };

  return (
    <div style={{ position: "relative", opacity: disabled ? 0.6 : 1 }}>
      {/* key — только у ячеек: анимация перезапускается, поле ввода (фокус, автоподстановка) — то же. */}
      <div key={shakeKey} aria-hidden className={error ? "auth-shake" : undefined} style={{ display: "grid", gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))`, gap: cells > 6 ? 6 : "clamp(6px, 2.4vw, 10px)" }}>
        {Array.from({ length: cells }, (_, i) => (
          <div key={i} style={cellStyle(i)}>
            {value[i] ?? (focused && !disabled && i === active
              ? <span className="otp-caret" style={{ width: 2, height: 24, borderRadius: 1, background: C.green }}/>
              : null)}
          </div>
        ))}
      </div>
      {/* 16px — иначе iOS зумит. Текст и каретка прозрачные: видно только ячейки. */}
      <input
        ref={inputRef} aria-label={label} aria-invalid={!!error}
        inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" enterKeyHint="go"
        maxLength={maxLength} disabled={disabled} value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", boxSizing: "border-box",
          background: "transparent", border: "none", outline: "none", color: "transparent",
          caretColor: "transparent", WebkitTextFillColor: "transparent", fontSize: 16, cursor: "text" }}
      />
    </div>
  );
}
