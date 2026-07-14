import { useState, useEffect, useCallback, useRef } from "react";
import { DEF_EXP, DEF_INC } from "../../../constants/money";
import { todayStr, monthKey } from "../../../utils/date";
import { round2 } from "../../../utils/format";
import { supa, supaUpsert, supaRpc } from "../../../lib/supabase";

export function useMoneyData() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [expCats, setExpCats] = useState(DEF_EXP);
  const [incCats, setIncCats] = useState(DEF_INC);
  const [monthPlans, setMonthPlans] = useState([]);
  const [tripPlans, setTripPlans] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [goals, setGoals] = useState([]);
  const [goalTopups, setGoalTopups] = useState([]);
  const [debtPeople, setDebtPeople] = useState([]);
  const [debtEvents, setDebtEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [acc, txs, trs, ec, ic, mp, tp, rec, gl, gt, dp, de] = await Promise.all([
        supa.select("accounts", "order=created_at.asc"),
        supa.select("transactions", "order=created_at.desc"),
        supa.select("transfers", "order=created_at.desc"),
        supa.select("exp_categories", "order=sort_order.asc"),
        supa.select("inc_categories", "order=sort_order.asc"),
        supa.select("month_plans"),
        supa.select("trip_plans"),
        supa.select("recurring"),
        supa.select("goals", "order=created_at.asc"),
        supa.select("goal_topups", "order=date.desc"),
        supa.select("debt_people", "order=created_at.asc"),
        supa.select("debt_events", "order=date.desc"),
      ]);
      // Всегда выставляем массивы целиком (даже пустые), иначе удаление ПОСЛЕДНЕЙ
      // строки таблицы оставляет устаревший стейт. Категории — единственное
      // исключение: при пустой таблице засеваем дефолтами.
      setAccounts(acc || []);
      setTransactions(txs || []);
      setTransfers(trs || []);
      if (ec?.length) setExpCats(ec); else { const s = DEF_EXP.map((c,i)=>({...c, sort_order:i+1})); await supaUpsert("exp_categories", s); setExpCats(s); }
      if (ic?.length) setIncCats(ic); else { const s = DEF_INC.map((c,i)=>({...c, sort_order:i+1})); await supaUpsert("inc_categories", s); setIncCats(s); }
      setMonthPlans(mp || []);
      setTripPlans((tp || []).map(p => ({...p, days: p.days||[]})));
      setRecurring(rec || []);
      setGoals(gl || []);
      setGoalTopups(gt || []);
      setDebtPeople(dp || []);
      setDebtEvents(de || []);
    } catch(e) {
      console.error("Load money data:", e);
      setLoadError("Не удалось загрузить данные. Проверьте соединение.");
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  // Auto-fire recurring (один раз за загрузку; защита от двойного срабатывания StrictMode/повторных рендеров)
  const firingRef = useRef(false);
  useEffect(() => {
    if (firingRef.current || !recurring.length || !accounts.length) return;
    const today = new Date();
    const currentDay = today.getDate();
    // Длина текущего месяца — для дней 29/30/31, которых нет в коротких месяцах
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const mk = monthKey(todayStr());
    // Catch-up: срабатывает если день платежа уже наступил (или прошёл) в этом месяце,
    // но платёж ещё не был выполнен. День 31 в коротком месяце = последний день.
    const due = recurring.filter(r => {
      const effectiveDay = Math.min(r.day, daysInMonth);
      return effectiveDay <= currentDay && r.last_fired !== mk && accounts.some(a => a.id === r.acc_id);
    });
    if (!due.length) return;
    firingRef.current = true;
    (async () => {
      // Накапливаем баланс по счёту, чтобы несколько списаний на один счёт не затирали друг друга
      const balByAcc = {};
      accounts.forEach(a => { balByAcc[a.id] = a.balance; });
      for (const r of due) {
        const acc = accounts.find(a => a.id === r.acc_id);
        if (!acc) continue;
        const tx = { id: crypto.randomUUID(), type:"expense", amount:r.amount, currency:acc.currency, category_id:r.cat_id, account_id:r.acc_id, date:todayStr(), note:`${r.name} (авто)` };
        const newBal = round2(balByAcc[acc.id] - r.amount);
        try {
          await supaRpc("fire_recurring", { p_tx: tx, p_account_id: acc.id, p_new_balance: newBal, p_rec_id: r.id, p_month: mk });
          balByAcc[acc.id] = newBal;
          setTransactions(prev => [tx, ...prev]);
          setAccounts(prev => prev.map(a => a.id===acc.id ? {...a, balance: newBal} : a));
          setRecurring(prev => prev.map(rec => rec.id===r.id ? {...rec, last_fired:mk} : rec));
        } catch(e) {
          // Не сбрасываем firingRef — при сбое одного recurring не запускаем всё заново
          // на следующем рендере (это привело бы к двойному списанию).
          console.error("fire_recurring failed:", e);
        }
      }
    })();
  }, [recurring, accounts]);

  return { accounts, setAccounts, transactions, setTransactions, transfers, setTransfers, expCats, setExpCats, incCats, setIncCats, monthPlans, setMonthPlans, tripPlans, setTripPlans, recurring, setRecurring, goals, setGoals, goalTopups, setGoalTopups, debtPeople, setDebtPeople, debtEvents, setDebtEvents, loading, loadError, reload: load };
}
