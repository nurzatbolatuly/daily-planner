import { C } from "../constants/theme";

export function FieldLabel({ children, error }) {
  return (
    <p style={{ margin:"0 0 6px", fontSize:13, color:error?C.red:C.dim }}>
      {children}
      {error && <span style={{ marginLeft:6, fontSize:12 }}>— {error}</span>}
    </p>
  );
}
