import { C } from "../../../constants/theme";
import { BASE_CUR } from "../../../constants/currencies";
import { getSym, fmtAmt } from "../../../utils/format";

export function DonutChart({ segments, total, size=210 }) {
  const cx=size/2, cy=size/2, r=78, circ=2*Math.PI*r;
  let off=0;
  const slices = segments.map(s => {
    const pct=total>0?s.val/total:0, dash=pct*circ, gap=circ-dash;
    const style={strokeDasharray:`${dash} ${gap}`,strokeDashoffset:-off,stroke:s.color,strokeWidth:26};
    off+=dash; return {...s,style,pct};
  });
  return (
    <div style={{ position:"relative", width:size, height:size, margin:"0 auto" }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r+16} fill="none" stroke="rgba(76,175,80,0.1)" strokeWidth={1}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(76,175,80,0.2)" strokeWidth={26}/>
        {slices.map(s => s.pct>0.003 && <circle key={s.color} cx={cx} cy={cy} r={r} fill="none" style={s.style}/>)}
        <circle cx={cx} cy={cy} r={r-16} fill={C.monCard2}/>
        <circle cx={cx} cy={cy} r={r-3} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="4 6"/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:20, fontWeight:800, color:"#fff" }}>{getSym(BASE_CUR)}{fmtAmt(total,0)}</span>
      </div>
    </div>
  );
}
