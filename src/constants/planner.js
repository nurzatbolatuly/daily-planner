export const DEFAULT_COLOR_LABELS = [
  { id:"none",   label:"Без метки", hex:"#6b7280" },
  { id:"red",    label:"Срочно",    hex:"#f87171" },
  { id:"blue",   label:"Работа",    hex:"#60a5fa" },
  { id:"green",  label:"Личное",    hex:"#34d399" },
  { id:"amber",  label:"Финансы",   hex:"#fbbf24" },
  { id:"purple", label:"Учёба",     hex:"#a78bfa" },
];

export const STATUS_CONFIG = {
  active:    { label:"Активна",  dim:false, tag:null },
  done:      { label:"Готово",   dim:true,  tag:null },
  hold:      { label:"Холд",     dim:true,  tag:"HOLD" },
  cancelled: { label:"Отменена", dim:true,  tag:"ОТМЕНЕНО" },
};

export const TIME_OF_DAY = [
  { id:"morning",   label:"Утро",   icon:"🌅" },
  { id:"afternoon", label:"День",   icon:"☀️" },
  { id:"evening",   label:"Вечер",  icon:"🌇" },
  { id:"night",     label:"Ночь",   icon:"🌙" },
];

export const WEEKDAYS = [
  { id:1,label:"Пн" },{ id:2,label:"Вт" },{ id:3,label:"Ср" },
  { id:4,label:"Чт" },{ id:5,label:"Пт" },{ id:6,label:"Сб" },{ id:0,label:"Вс" },
];
