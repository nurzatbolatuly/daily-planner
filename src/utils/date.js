export const pad = n => String(n).padStart(2, "0");

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

export const addDays = (s, n) => {
  const d = new Date(s);
  d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

export const daysBetween = (a, b) => Math.round((new Date(b)-new Date(a))/(1000*60*60*24));

export const monthKey = d => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}`;
};
