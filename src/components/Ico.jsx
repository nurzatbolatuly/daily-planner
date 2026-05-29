import { PATHS } from "../constants/icons";
import { C } from "../constants/theme";

export const Ico = ({ n, s=20, c=C.main }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {(PATHS[n]||"").split("M").filter(Boolean).map((p,i) => <path key={i} d={`M${p}`}/>)}
  </svg>
);
