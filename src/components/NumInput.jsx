// Числовой инпут с форматированием тысячных разрядов: 1 000 000
// value/onChange работают с сырой строкой ("1000000", "1500.50") — parseFloat() совместимо
export function NumInput({ value, onChange, style, ...rest }) {
  const fmt = (raw) => {
    if (raw === "" || raw == null) return "";
    const [int, dec] = String(raw).split(".");
    const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return dec !== undefined ? `${intFmt}.${dec}` : intFmt;
  };

  const handleChange = (e) => {
    let raw = e.target.value
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "");
    const dot = raw.indexOf(".");
    if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, "");
    if (/^0\d/.test(raw)) raw = raw.replace(/^0+/, "") || "0";
    onChange(raw);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={fmt(value)}
      onChange={handleChange}
      style={style}
    />
  );
}
