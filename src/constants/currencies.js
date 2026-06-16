export const BASE_CUR = "KZT";

export const MAIN_CURR = [
  {code:"KZT",sym:"₸",name:"Казахстанский тенге"},
  {code:"USD",sym:"$",name:"Доллар США"},
  {code:"EUR",sym:"€",name:"Евро"},
];

export const METAL_CURR = [
  {code:"XAU",sym:"г",name:"Золото (Au)"},
  {code:"XAG",sym:"г",name:"Серебро (Ag)"},
];

export const COMMODITY_CURRENCIES = METAL_CURR.map(m => m.code);

export const ALL_CURR = [...MAIN_CURR, ...METAL_CURR,
  {code:"RUB",sym:"₽",name:"Российский рубль"},{code:"GBP",sym:"£",name:"Британский фунт"},
  {code:"CHF",sym:"Fr",name:"Швейцарский франк"},{code:"JPY",sym:"¥",name:"Японская иена"},
  {code:"AED",sym:"د.إ",name:"Дирхам ОАЭ"},{code:"TRY",sym:"₺",name:"Турецкая лира"},
  {code:"CAD",sym:"CA$",name:"Канадский доллар"},{code:"AUD",sym:"A$",name:"Австралийский доллар"},
  {code:"PLN",sym:"zł",name:"Польский злотый"},{code:"UAH",sym:"₴",name:"Украинская гривна"},
  {code:"UZS",sym:"сўм",name:"Узбекский сум"},{code:"KGS",sym:"с",name:"Киргизский сом"},
  {code:"AZN",sym:"₼",name:"Азербайджанский манат"},{code:"GEL",sym:"₾",name:"Грузинский лари"},
  {code:"SGD",sym:"S$",name:"Сингапурский доллар"},{code:"KRW",sym:"₩",name:"Южнокорейская вона"},
  {code:"INR",sym:"₹",name:"Индийская рупия"},{code:"THB",sym:"฿",name:"Тайский бат"},
  {code:"ZAR",sym:"R",name:"Южноафриканский рэнд"},{code:"ILS",sym:"₪",name:"Израильский шекель"},
  {code:"NZD",sym:"NZ$",name:"Новозеландский доллар"},{code:"BTC",sym:"₿",name:"Биткоин"},
];
