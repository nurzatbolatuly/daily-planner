import { NumericFormat } from "react-number-format";

// Числовой инпут с форматированием тысячных разрядов: 1 000 000
// value/onChange работают с сырой строкой ("1000000", "1500.50") — parseFloat() совместимо
export function NumInput({ value, onChange, style, ...rest }) {
  return (
    <NumericFormat
      {...rest}
      value={value ?? ""}
      onValueChange={({ value: raw }, { source }) => { if (source === 'event') onChange(raw); }}
      thousandSeparator=" "
      decimalSeparator="."
      allowedDecimalSeparators={[",", "."]}
      allowNegative={false}
      type="text"
      inputMode="decimal"
      style={style}
    />
  );
}
