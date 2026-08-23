import { useState, useEffect, useCallback } from "react";
import { DEF_EXP, DEF_INC, BILLS_CATEGORY } from "../../../constants/money";
import { supa, supaUpsert } from "../../../lib/supabase";

export function useMoneyData() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [expCats, setExpCats] = useState(DEF_EXP);
  const [incCats, setIncCats] = useState(DEF_INC);
  const [monthPlans, setMonthPlans] = useState([]);
  const [tripPlans, setTripPlans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [goalTopups, setGoalTopups] = useState([]);
  const [debtPeople, setDebtPeople] = useState([]);
  const [debtEvents, setDebtEvents] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [acc, txs, trs, ec, ic, mp, tp, gl, gt, dp, de, rc, ln] = await Promise.all([
        supa.select("accounts", "order=created_at.asc"),
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
      ]);
      // Всегда выставляем массивы целиком (даже пустые), иначе удаление ПОСЛЕДНЕЙ
      // строки таблицы оставляет устаревший стейт. Категории — единственное
      // исключение: при пустой таблице засеваем дефолтами.
      setAccounts(acc || []);
      setTransactions(txs || []);
      setTransfers(trs || []);
      let finalEc = ec?.length ? ec : DEF_EXP.map((c,i)=>({...c, sort_order:i+1}));
      if (!ec?.length) await supaUpsert("exp_categories", finalEc);
      // Категория для оплаты ежемесячных платежей/кредитов — создаётся один раз при первой
      // загрузке после обновления, дальше просто находится по фиксированному id (не дублируется).
      if (!finalEc.some(c => c.id === BILLS_CATEGORY.id)) {
        const billsCat = { ...BILLS_CATEGORY, sort_order: finalEc.length + 1 };
        await supaUpsert("exp_categories", billsCat);
        finalEc = [...finalEc, billsCat];
      }
      setExpCats(finalEc);
      if (ic?.length) setIncCats(ic); else { const s = DEF_INC.map((c,i)=>({...c, sort_order:i+1})); await supaUpsert("inc_categories", s); setIncCats(s); }
      setMonthPlans(mp || []);
      setTripPlans((tp || []).map(p => ({...p, days: p.days||[]})));
      setGoals(gl || []);
      setGoalTopups(gt || []);
      setDebtPeople(dp || []);
      setDebtEvents(de || []);
      setRecurring(rc || []);
      setLoans(ln || []);
    } catch(e) {
      console.error("Load money data:", e);
      setLoadError("Не удалось загрузить данные. Проверьте соединение.");
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  return { accounts, setAccounts, transactions, setTransactions, transfers, setTransfers, expCats, setExpCats, incCats, setIncCats, monthPlans, setMonthPlans, tripPlans, setTripPlans, goals, setGoals, goalTopups, setGoalTopups, debtPeople, setDebtPeople, debtEvents, setDebtEvents, recurring, setRecurring, loans, setLoans, loading, loadError, reload: load };
}
