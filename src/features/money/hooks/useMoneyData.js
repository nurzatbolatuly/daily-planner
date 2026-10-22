import { useState, useEffect, useCallback, useMemo } from "react";
import { DEF_EXP, DEF_INC } from "../../../constants/money";
import { supa, supaUpsert, supabase } from "../../../lib/supabase";
import { buildPersonalTransactions } from "../../../utils/personalTransactions";
import { buildSharedTxIndex } from "../../../utils/txBadges";
import { newId } from "../../../utils/id";
import { missingSystemCategories, systemCategoryIds } from "../../../utils/systemCategories";
import { migrateLegacyOrder } from "../../../utils/accountOrder";

// Пустая таблица (новый пользователь) → засеваем дефолтами со своими id; затем досоздаём
// недостающие системные категории (utils/systemCategories.js). Находятся по system_key — повторная
// загрузка их не задваивает (а БД не даст: UNIQUE (user_id, system_key), v38).
async function ensureCategories(table, kind, loaded, defaults) {
  let cats = loaded?.length ? loaded : defaults.map((c, i) => ({ ...c, id: newId(), sort_order: i + 1 }));
  if (!loaded?.length) await supaUpsert(table, cats);
  const missing = missingSystemCategories(kind, cats);
  if (missing.length) {
    await supaUpsert(table, missing);
    cats = [...cats, ...missing];
  }
  return cats;
}

export function useMoneyData() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [expCats, setExpCats] = useState([]);
  const [incCats, setIncCats] = useState([]);
  const [monthPlans, setMonthPlans] = useState([]);
  const [tripPlans, setTripPlans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [goalTopups, setGoalTopups] = useState([]);
  const [debtPeople, setDebtPeople] = useState([]);
  const [debtEvents, setDebtEvents] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loans, setLoans] = useState([]);
  const [plannedIncomes, setPlannedIncomes] = useState([]);
  const [plannedExpenses, setPlannedExpenses] = useState([]);
  const [sharedGroups, setSharedGroups] = useState([]);
  const [sharedMembers, setSharedMembers] = useState([]);
  const [sharedEntries, setSharedEntries] = useState([]);
  // Что поддерживает БД пользователя (миграции запускаются вручную): { fees } — v30.
  const [sharedSchema, setSharedSchema] = useState({ fees: true });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [acc, txs, trs, ec, ic, mp, tp, gl, gt, dp, de, rc, ln, pi, pe, sg, sm, se, feesProbe] = await Promise.all([
        // Порядок — пользовательский (v39); NULL — ещё не переставляли, тогда по дате создания.
        supa.select("accounts", "order=sort_order.asc.nullslast&order=created_at.asc"),
        supa.select("transactions", "order=created_at.desc"),
        supa.select("transfers", "order=created_at.desc"),
        supa.select("exp_categories", "order=sort_order.asc"),
        supa.select("inc_categories", "order=sort_order.asc"),
        supa.select("month_plans"),
        supa.select("trip_plans"),
        supa.select("goals", "order=created_at.asc"),
        supa.select("goal_topups", "order=date.desc"),
        supa.select("debt_people", "order=created_at.asc"),
        supa.select("debt_events", "order=date.desc"),
        supa.select("recurring", "order=day.asc"),
        supa.select("loans", "order=day.asc"),
        supa.select("planned_incomes", "order=expected_date.asc"),
        supa.select("planned_expenses", "order=expected_date.asc"),
        supa.select("shared_groups", "order=created_at.desc"),
        supa.select("shared_members", "order=sort_order.asc&order=created_at.asc"),
        supa.select("shared_entries", "order=date.desc&order=created_at.desc"),
        // Миграция v30 (сборы в счёте) может быть ещё не запущена: тогда сборы молча не сохранятся.
        // Проверяем колонку вместе с загрузкой (не бросает — ошибка в результате); форма предупредит,
        // а не потеряет данные. 42703 — «нет колонки».
        // TODO: удалить проверку (и sharedSchema, feesSupported, feesFromEntry-восстановление) после v30.
        supabase.from("shared_entries").select("fees").limit(1),
      ]);
      setSharedSchema({ fees: feesProbe.error?.code !== "42703" });
      // Всегда выставляем массивы целиком (даже пустые), иначе удаление ПОСЛЕДНЕЙ
      // строки таблицы оставляет устаревший стейт. Категории — единственное
      // исключение: при пустой таблице засеваем дефолтами.
      setAccounts(await migrateLegacyOrder(acc || []));
      setTransactions(txs || []);
      setTransfers(trs || []);
      setExpCats(await ensureCategories("exp_categories", "exp", ec, DEF_EXP));
      setIncCats(await ensureCategories("inc_categories", "inc", ic, DEF_INC));
      setMonthPlans(mp || []);
      setTripPlans((tp || []).map(p => ({...p, days: p.days||[]})));
      setGoals(gl || []);
      setGoalTopups(gt || []);
      setDebtPeople(dp || []);
      setDebtEvents(de || []);
      setRecurring(rc || []);
      setLoans(ln || []);
      setPlannedIncomes(pi || []);
      setPlannedExpenses(pe || []);
      setSharedGroups(sg || []);
      setSharedMembers(sm || []);
      setSharedEntries(se || []);
    } catch(e) {
      console.error("Load money data:", e);
      setLoadError("Не удалось загрузить данные. Проверьте соединение.");
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  // «Мои» доходы и расходы для ВСЕЙ статистики (Главная, Аналитика, Бюджет, цели) — одна точка
  // сборки, см. utils/personalTransactions.js. Балансы и история счёта — по сырым transactions.
  const personalTransactions = useMemo(
    () => buildPersonalTransactions({ transactions, debtEvents, sharedGroups, sharedMembers, sharedEntries }),
    [transactions, debtEvents, sharedGroups, sharedMembers, sharedEntries]
  );

  // Какая транзакция к какой записи общей группы относится — для бейджей истории и подписей
  // виртуальных строк (utils/txBadges.js). Один индекс на все списки.
  const sharedTxIndex = useMemo(
    () => buildSharedTxIndex({ sharedGroups, sharedMembers, sharedEntries, people: debtPeople }),
    [sharedGroups, sharedMembers, sharedEntries, debtPeople]
  );

  // id системных категорий пользователя ({ bills, fxLoss, fxGain }) — формы ставят их сами.
  const systemCats = useMemo(() => systemCategoryIds(expCats, incCats), [expCats, incCats]);

  return { accounts, setAccounts, transactions, setTransactions, transfers, setTransfers, expCats, setExpCats, incCats, setIncCats, monthPlans, setMonthPlans, tripPlans, setTripPlans, goals, setGoals, goalTopups, setGoalTopups, debtPeople, setDebtPeople, debtEvents, setDebtEvents, recurring, setRecurring, loans, setLoans, plannedIncomes, setPlannedIncomes, plannedExpenses, setPlannedExpenses,
    // Общие расходы — только чтение: все изменения идут через RPC (этапы 5+) и reload(),
    // сеттеры наружу не отдаём (instruction.md §18).
    sharedGroups, sharedMembers, sharedEntries, sharedSchema,
    personalTransactions, sharedTxIndex, systemCats,
    loading, loadError, reload: load };
}
