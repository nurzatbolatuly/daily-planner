import { useState, useEffect, useCallback, useRef } from "react";
import { DEF_EXP, DEF_INC } from "../../../constants/money";
import { todayStr, monthKey } from "../../../utils/date";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [acc, txs, trs, ec, ic, mp, tp, rec] = await Promise.all([
        supa.select("accounts"),
        supa.select("transactions", "order=created_at.desc"),
        supa.select("transfers", "order=created_at.desc"),
        supa.select("exp_categories", "order=sort_order.asc"),
        supa.select("inc_categories", "order=sort_order.asc"),
        supa.select("month_plans"),
        supa.select("trip_plans"),
        supa.select("recurring"),
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
    } catch(e) { console.error("Load money data:", e); }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  // Auto-fire recurring (один раз за загрузку; защита от двойного срабатывания StrictMode/повторных рендеров)
  const firingRef = useRef(false);
  useEffect(() => {
    if (firingRef.current || !recurring.length || !accounts.length) return;
    const day = new Date().getDate(), mk = monthKey(todayStr());
    const due = recurring.filter(r => r.day === day && r.last_fired !== mk && accounts.some(a => a.id === r.acc_id));
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
        const newBal = balByAcc[acc.id] - r.amount;
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

  return { accounts, setAccounts, transactions, setTransactions, transfers, setTransfers, expCats, setExpCats, incCats, setIncCats, monthPlans, setMonthPlans, tripPlans, setTripPlans, recurring, setRecurring, loading, reload: load };
}
