// Справочник валют — один на фронт и Edge Functions: supabase/functions/_shared/currencies.json
// (Deno не импортирует файлы из src/, Vite из supabase/ — может). Здесь — прежние экспорты.
// group: main — основные (быстрый выбор), metal — драгметаллы (граммы), other — остальные.
// precision — знаков после запятой для денежного округления (деление счетов, сравнение «ровно /
// переплата / недоплата» в общих расходах). Тенге — целые: тиыны в Kaspi никто не переводит, и
// 10 000 / 3 = 3 333,33 ₸ давало бы ложную «недоплату 0,33».
import currencies from "../../supabase/functions/_shared/currencies.json";

const strip = ({ code, sym, name }) => ({ code, sym, name });
const byGroup = group => currencies.list.filter(c => c.group === group).map(strip);

export const BASE_CUR = currencies.base;

export const MAIN_CURR = byGroup("main");

export const METAL_CURR = byGroup("metal");

export const COMMODITY_CURRENCIES = METAL_CURR.map(m => m.code);

export const ALL_CURR = [...MAIN_CURR, ...METAL_CURR, ...byGroup("other")];

export const CURRENCY_PRECISION = currencies.precision;
export const DEFAULT_PRECISION = currencies.defaultPrecision;
