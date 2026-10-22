import { useState, useRef, useCallback, useEffect } from "react";

// На время перетаскивания запрещаем выделение на всей странице: иначе браузер выделяет текст
// рядом, а потом начинает нативный drag выделенного — шлёт pointercancel вместо pointerup,
// и перестановка не применяется.
function lockSelection() {
  const s = document.body.style;
  const prev = { userSelect: s.userSelect, webkitUserSelect: s.webkitUserSelect };
  s.userSelect = "none";
  s.webkitUserSelect = "none";
  window.getSelection?.()?.removeAllRanges();
  return () => {
    s.userSelect = prev.userSelect;
    s.webkitUserSelect = prev.webkitUserSelect;
  };
}

export function useDragReorder({ items, onReorder, dataAttr, ghost = false, vibrate: doVibrate = false }) {
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [ghostPos, setGhostPos] = useState(null);

  const dragIdRef = useRef(null);
  const dragOverIdRef = useRef(null);
  const itemsRef = useRef(items);
  const onReorderRef = useRef(onReorder);
  const cleanupRef = useRef(null);
  itemsRef.current = items;
  onReorderRef.current = onReorder;

  const executeDrop = useCallback(() => {
    const fromId = dragIdRef.current;
    const toId = dragOverIdRef.current;
    dragIdRef.current = null;
    dragOverIdRef.current = null;
    setDragId(null);
    setDragOverId(null);
    if (ghost) setGhostPos(null);
    if (!fromId || !toId || fromId === toId) return;
    const curr = itemsRef.current;
    const fi = curr.findIndex(x => x.id === fromId);
    const ti = curr.findIndex(x => x.id === toId);
    if (fi < 0 || ti < 0) return;
    const next = [...curr];
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    onReorderRef.current(next);
  }, [ghost]);

  const executeDropRef = useRef(executeDrop);
  executeDropRef.current = executeDrop;

  // Размонтирование посреди перетаскивания — снять слушатели и вернуть выделение.
  useEffect(() => () => cleanupRef.current?.(), []);

  const getDragHandlers = useCallback(id => ({
    onPointerDown: e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation();
      // Мышь: не начинать выделение текста и нативный drag. Тач: не влияет на прокрутку —
      // у ручки touch-action: none.
      e.preventDefault();
      cleanupRef.current?.();
      if (doVibrate && navigator.vibrate) navigator.vibrate(40);
      dragIdRef.current = id;
      setDragId(id);
      if (ghost) setGhostPos({ x: e.clientX, y: e.clientY });
      const unlockSelection = lockSelection();
      const onMove = moveEvent => {
        moveEvent.preventDefault();
        if (ghost) setGhostPos({ x: moveEvent.clientX, y: moveEvent.clientY });
        const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const overId = el?.closest(`[data-${dataAttr}]`)?.dataset[dataAttr] || null;
        if (overId !== dragOverIdRef.current) {
          dragOverIdRef.current = overId;
          setDragOverId(overId);
        }
      };
      const cleanup = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        unlockSelection();
        cleanupRef.current = null;
      };
      const onUp = () => {
        cleanup();
        executeDropRef.current();
      };
      // Жест перехватила система (звонок, свайп назад) — отмена без перестановки.
      const onCancel = () => {
        cleanup();
        dragOverIdRef.current = null;
        executeDropRef.current();
      };
      cleanupRef.current = cleanup;
      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
  }), [dataAttr, ghost, doVibrate]);

  return { dragId, dragOverId, ghostPos, getDragHandlers };
}
