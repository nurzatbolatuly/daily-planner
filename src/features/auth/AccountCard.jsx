import { useRef, useState } from "react";
import { C } from "../../constants/theme";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { useSave } from "../../hooks/useSave";
import { useAuth } from "./AuthProvider";
import { authErrorText } from "./authErrors";

// Блок аккаунта в «Меню»: под кем вошли + выход. Вне AuthProvider (тесты страниц) — ничего.
export function AccountCard() {
  const auth = useAuth();
  const [confirm, setConfirm] = useState(false);
  const signOutRef = useRef(null);
  const { save: execSignOut, saving, saveError, setSaveError } = useSave(() => signOutRef.current(), { errorMsg: authErrorText });
  signOutRef.current = () => auth.signOut();   // успех — AuthProvider сам покажет экран входа

  if (!auth?.userId) return null;

  return (
    <>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderRadius:14, background:C.monCard, marginTop:16 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, color:C.dim, marginBottom:2 }}>Вы вошли как</div>
          <div style={{ fontSize:15, color:C.main, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{auth.email}</div>
        </div>
        <button onClick={() => { setSaveError(null); setConfirm(true); }}
          style={{ flexShrink:0, padding:"10px 16px", borderRadius:30, background:C.errorTint, border:`1px solid ${C.errorBorder}`, color:C.errorLight, fontSize:14, fontWeight:600, cursor:"pointer" }}>
          Выйти
        </button>
      </div>
      <ConfirmSheet
        open={confirm} onClose={() => setConfirm(false)} onConfirm={execSignOut}
        title="Выйти из аккаунта?"
        message="Черновики форм и настройки вида на этом устройстве будут удалены. Данные в аккаунте останутся — войдёте снова по коду из письма."
        confirmLabel={saving ? "Выходим..." : "Выйти"} disabled={saving} error={saveError}
      />
    </>
  );
}
