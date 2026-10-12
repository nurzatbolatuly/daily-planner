import { memo } from "react";
import { C } from "../../../constants/theme";
import { BottomSheet } from "../../../components/BottomSheet";
import { fmtMoney, fmtReceiptDate, itemQtyLabel, itemsMismatch } from "../../../utils/receipts/receiptView";
import { Ico } from "../../../components/Ico";
import { hintText } from "./sharedUi";

// Статус позиции в каталоге (catalogMatch.planItemStatus) → подпись и цвет.
const STATUS = {
  matched: ["в каталоге", C.green],
  matchedUnconfirmed: ["в каталоге · проверьте", C.amber],
  new: ["новый товар", C.green],
  newUnconfirmed: ["новый товар · проверьте", C.amber],
  skipped: ["не в каталог", C.dim],
  service: ["служебная", C.dim],
};

// Позиции чека (docs/receipts.md §3.1, §7.4): перед «Прикрепить» и при просмотре прикреплённого.
// footer — кнопки сценария (прикрепить / заменить / убрать), шторка о них не знает.
// onToggle / onEdit / onToggleAll — только в предпросмотре перед «Прикрепить»: галочка «в каталог»
// (по умолчанию у всех, кроме служебных) и правка товара позиции.
// onBulkCategory — «Категория для товаров без неё» (только если в каталоге есть категории).
export const ReceiptPreviewSheet = memo(function ReceiptPreviewSheet({ open, view, onClose, footer, onToggle, onEdit, onToggleAll, onBulkCategory }) {
  if (!view) return null;
  const mismatch = itemsMismatch(view);
  const selectable = !!onToggle;
  const goods = view.items.filter(i => !i.isService);
  const allOn = goods.every(i => i.inCatalog);
  const withoutCategory = goods.filter(i => i.inCatalog && !i.categoryName).length;
  return (
    <BottomSheet open={open} onClose={onClose} title="Чек">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, marginBottom:4 }}>
        <span style={{ fontSize:15, fontWeight:600, color:C.main, minWidth:0, overflow:"hidden", textOverflow:"ellipsis" }}>{view.merchant}</span>
        <span style={{ fontSize:17, fontWeight:700, color:"#fff", flexShrink:0 }}>{fmtMoney(view.total, view.currency)}</span>
      </div>
      <p style={{ ...hintText, margin:"0 0 12px" }}>{fmtReceiptDate(view)} · {view.items.length} поз.</p>

      {mismatch != null && (
        <p style={{ margin:"0 0 12px", padding:"8px 10px", borderRadius:10, fontSize:12, lineHeight:1.4, color:C.amber, background:C.warnTint, border:`1px solid ${C.warnBorder}` }}>
          Сумма позиций {fmtMoney(mismatch, view.currency)} не сходится с итогом — проверьте чек.
        </p>
      )}

      {selectable && goods.length > 0 && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <span style={{ fontSize:12, color:C.dim }}>В каталог цен: {goods.filter(i => i.inCatalog).length} из {goods.length}</span>
          <button type="button" onClick={() => onToggleAll(!allOn)}
            style={{ background:"none", border:"none", padding:"6px 0", color:C.green, fontSize:12, fontWeight:600, cursor:"pointer" }}>
            {allOn ? "Снять все" : "Выбрать все"}
          </button>
        </div>
      )}
      {selectable && onBulkCategory && withoutCategory > 0 && (
        <button type="button" onClick={onBulkCategory}
          style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", marginBottom:6, borderRadius:10, cursor:"pointer",
            background:C.fieldBg, border:`1px dashed ${C.border}`, color:C.mid, fontSize:13 }}>
          <span>Категория для товаров без неё · {withoutCategory}</span>
          <span style={{ color:C.green, fontWeight:600 }}>Выбрать</span>
        </button>
      )}

      <ul style={{ listStyle:"none", margin:"0 0 12px", padding:0 }}>
        {view.items.map(item => {
          const [label, color] = STATUS[item.isService ? "service" : item.status] || [];
          const editable = selectable && !item.isService;
          return (
            <li key={item.key} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${C.border}`, opacity:item.isService ? 0.5 : 1 }}>
              {editable && (
                <input type="checkbox" checked={item.inCatalog} onChange={() => onToggle(item.index)}
                  aria-label={`В каталог: ${item.name}`} style={{ width:20, height:20, accentColor:C.green, flexShrink:0, margin:0 }}/>
              )}
              <div onClick={editable ? () => onEdit(item.index) : undefined}
                style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:10, cursor:editable ? "pointer" : "default" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, color:C.main, lineHeight:1.35, overflowWrap:"anywhere" }}>{item.name}</p>
                  <p style={{ margin:"2px 0 0", fontSize:11, color:C.dim }}>
                    {itemQtyLabel(item, view.currency)}{label && <span style={{ color }}> · {label}</span>}
                    {item.categoryName && item.inCatalog && <span> · {item.categoryName}{item.categorySource === "kind" ? " (по виду)" : ""}</span>}
                  </p>
                </div>
                <span style={{ fontSize:13, fontWeight:600, color:C.mid, flexShrink:0 }}>{fmtMoney(item.sum, view.currency)}</span>
                {editable && <Ico n="chevR" s={14} c={C.dim}/>}
              </div>
            </li>
          );
        })}
        {view.adjustments.map((a, i) => (
          <li key={`adj-${i}`} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", fontSize:13, color:C.mid }}>
            <span>{a.name}</span><span>{fmtMoney(a.sum, view.currency)}</span>
          </li>
        ))}
      </ul>

      {footer}
    </BottomSheet>
  );
});
