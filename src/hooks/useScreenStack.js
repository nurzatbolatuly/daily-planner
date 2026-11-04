import { useCallback, useEffect, useRef, useState } from "react";

// Навигация стеком экранов внутри раздела (MoneyManagerSection, PriceCatalogSection).
// screen — верхний экран { name, data } или null (корень раздела).
// reload — перезагрузка данных раздела; лежит в ref, чтобы колбэки были стабильными
// (их передают в memo-экраны) и не зависели от объекта данных, который меняется каждый рендер.
export function useScreenStack(reload) {
  const [stack, setStack] = useState([]);
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);
  const doReload = useCallback(() => reloadRef.current?.(), []);

  const navigate = useCallback((name, data) => setStack(s => [...s, { name, data }]), []);
  const goBack = useCallback((withReload = false) => { if (withReload) doReload(); setStack(s => s.slice(0, -1)); }, [doReload]);
  // Заменить текущий экран (с перезагрузкой): форма создала сущность — открываем её вместо формы,
  // чтобы «назад» не возвращал в уже сохранённую форму.
  const replace = useCallback((name, data) => { doReload(); setStack(s => [...s.slice(0, -1), { name, data }]); }, [doReload]);
  // Закрыть n экранов сразу (с перезагрузкой): удалили группу из настроек — к списку, минуя её экран.
  const pop = useCallback(n => { doReload(); setStack(s => s.slice(0, -n)); }, [doReload]);
  const reset = useCallback((withReload = false) => { if (withReload) doReload(); setStack([]); }, [doReload]);

  return { screen: stack.at(-1) ?? null, navigate, goBack, replace, pop, reset };
}
