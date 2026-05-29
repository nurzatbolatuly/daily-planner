import { C } from "../constants/theme";

export function Spinner({ color = C.green }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
      <div style={{ width:32, height:32, borderRadius:16, border:`3px solid rgba(255,255,255,0.1)`, borderTopColor:color, animation:"spin 0.8s linear infinite" }}/>
    </div>
  );
}
