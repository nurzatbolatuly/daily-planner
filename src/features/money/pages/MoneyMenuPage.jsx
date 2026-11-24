import { C } from "../../../constants/theme";
import { Ico } from "../../../components/Ico";
import { AccountCard } from "../../auth/AccountCard";

const MENU_ITEMS = [
  { label: "Категории",              key: "menuCats"     },
  { label: "Ежемесячные платежи",    key: "menuMonthly"  },
  { label: "Денежный поток",         key: "cashflow"     },
  { label: "Долги",                  key: "menuDebts"    },
  { label: "Каталог цен",            key: "priceCatalog" },
  { label: "Кредитный калькулятор",  key: "loanCalc"     },
  { label: "Apple Pay",              key: "walletSetup", needs: "wallet" },
  { label: "Общие расходы",          key: "menuShared"   },
];

// needs — пункт виден, только если БД это поддерживает (миграция применена).
export function MoneyMenuPage({ navigate, walletAvailable = false }) {
  const features = { wallet: walletAvailable };
  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: C.monHeader, padding: "14px 16px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#fff" }}>Меню</p>
      </div>
      <div style={{ padding: "12px 16px" }}>
        {MENU_ITEMS.filter(item => !item.needs || features[item.needs]).map(item => (
          <div key={item.key} onClick={() => navigate(item.key)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 16px", borderRadius:14, background:C.monCard, marginBottom:8, cursor:"pointer" }}>
            <span style={{ fontSize: 16, color: "#fff", fontWeight: 500 }}>{item.label}</span>
            <Ico n="chevR" s={18} c={C.dim}/>
          </div>
        ))}
        <AccountCard/>
      </div>
    </div>
  );
}
