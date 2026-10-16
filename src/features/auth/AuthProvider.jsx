import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { LAST_EMAIL_KEY } from "../../constants/auth";

// null — вне провайдера (изолированные тесты страниц): потребители это учитывают.
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Выход стирает localStorage этого устройства: черновики форм, курсы, порядок счетов — данные
// пользователя. Целиком, а не по списку ключей: новый ключ не «забудется». Email — для удобства.
function clearDeviceData() {
  try {
    const lastEmail = localStorage.getItem(LAST_EMAIL_KEY);
    localStorage.clear();
    if (lastEmail) localStorage.setItem(LAST_EMAIL_KEY, lastEmail);
  } catch { /* хранилище недоступно — нечего чистить */ }
}

// status: "loading" — сессия читается из хранилища | "signedOut" | "signedIn".
// Наружу — id и email строками, не объект сессии: обновление токена (раз в час) не
// перерисовывает приложение.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", userId: null, email: null });

  useEffect(() => {
    // INITIAL_SESSION приходит первым событием — getSession отдельно не нужен.
    // Отзыв/истечение refresh-токена → SIGNED_OUT → экран входа.
    // Внутри колбэка только setState: вызовы supabase отсюда блокируют auth-клиент.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setState(prev => (prev.userId === (user?.id ?? null) && prev.status !== "loading")
        ? prev
        : { status: user ? "signedIn" : "signedOut", userId: user?.id ?? null, email: user?.email ?? null });
    });
    return () => subscription.unsubscribe();
  }, []);

  // scope "local" — выйти на этом устройстве, другие сессии не трогать. Без сети supabase-js
  // возвращает ошибку и сессию оставляет — тогда и данные не стираем (вход не потерян).
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    clearDeviceData();
  }, []);

  const value = useMemo(() => ({ ...state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
