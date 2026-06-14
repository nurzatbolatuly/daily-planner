import { useState, useRef, useCallback } from "react";

export function useDragReorder({ items, onReorder, dataAttr, ghost = false, vibrate: doVibrate = false }) {
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [ghostPos, setGhostPos] = useState(null);

  const dragIdRef = useRef(null);
  const dragOverIdRef = useRef(null);
  const itemsRef = useRef(items);
  const onReorderRef = useRef(onReorder);
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

  const getDragHandlers = useCallback(id => ({
    onPointerDown: e => {
      e.stopPropagation();
      if (doVibrate && navigator.vibrate) navigator.vibrate(40);
      dragIdRef.current = id;
      setDragId(id);
      if (ghost) setGhostPos({ x: e.clientX, y: e.clientY });
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
      const onUp = () => {
        executeDropRef.current();
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
    },
  }), [dataAttr, ghost, doVibrate]);

  return { dragId, dragOverId, ghostPos, getDragHandlers };
}
