import { useState, useEffect, useCallback } from "react";
import { DEF_EXP, DEF_INC } from "../../../constants/money";
import { todayStr, monthKey } from "../../../utils/date";
import { supa, supaUpsert } from "../../../lib/supabase";

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
        supa.select("transfers", "order=date.desc"),
        supa.select("exp_categories"),
        supa.select("inc_categories"),
        supa.select("month_plans"),
        supa.select("trip_plans"),
        supa.select("recurring"),
      ]);
      if (acc?.length) setAccounts(acc);
      if (txs?.length) setTransactions(txs);
      if (trs?.length) setTransfers(trs);
      if (ec?.length) setExpCats(ec); else { await supaUpsert("exp_categories", DEF_EXP); setExpCats(DEF_EXP); }
      if (ic?.length) setIncCats(ic); else { await supaUpsert("inc_categories", DEF_INC); setIncCats(DEF_INC); }
      if (mp?.length) setMonthPlans(mp);
      if (tp?.length) setTripPlans(tp.map(p => ({...p, days: p.days||[]})));
      if (rec?.length) setRecurring(rec);
    } catch(e) { console.error("Load money data:", e); }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  // Auto-fire recurring
  useEffect(() => {
    if (!recurring.length) return;
    const today = new Date(), day = today.getDate(), mk = monthKey(todayStr());
    const fire = async () => {
      await Promise.all(recurring.map(async r => {
        if (r.day !== day || r.last_fired === mk) return;
        const acc = accounts.find(a => a.id === r.acc_id);
        if (!acc) return;
        const tx = { id: crypto.randomUUID(), type:"expense", amount:r.amount, currency:acc.currency, category_id:r.cat_id, account_id:r.acc_id, date:todayStr(), note:`${r.name} (авто)` };
        try {
          await supaUpsert("transactions", tx);
          await supa.update("accounts", { balance: acc.balance - r.amount }, `id=eq.${acc.id}`);
          await supa.update("recurring", { last_fired: mk }, `id=eq.${r.id}`);
          setTransactions(prev => [tx, ...prev]);
          setAccounts(prev => prev.map(a => a.id===acc.id ? {...a, balance: a.balance-r.amount} : a));
          setRecurring(prev => prev.map(rec => rec.id===r.id ? {...rec, last_fired:mk} : rec));
        } catch(e) { console.error(e); }
      }));
    };
    fire();
  }, [recurring, accounts]);

  return { accounts, setAccounts, transactions, setTransactions, transfers, setTransfers, expCats, setExpCats, incCats, setIncCats, monthPlans, setMonthPlans, tripPlans, setTripPlans, recurring, setRecurring, loading, reload: load };
}
