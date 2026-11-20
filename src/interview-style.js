// 「面接」タブの見た目(インラインの書き方。アプリのほかの画面と同じ、ピンクの色づかい)
export const S = {
  card: { background: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, border: "1.5px solid #FFE4EF" },
  h: { fontWeight: 800, fontSize: 15, color: "#5C3344", marginBottom: 8 },
  note: { fontSize: 12, color: "#7a4a5e", lineHeight: 1.7 },
  lock: { background: "#F2FAF4", border: "1.5px solid #B7E4C7", borderRadius: 12, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#2E6B3F", lineHeight: 1.7, fontWeight: 600 },
  input: { display: "block", width: "100%", boxSizing: "border-box", border: "1.5px solid #FFD9E8", borderRadius: 8, padding: "10px 12px", fontSize: 16, outline: "none", background: "#fff", fontFamily: "inherit", minHeight: 44 },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#D4789F", marginBottom: 4 },
  primary: { background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 44 },
  ghost: { background: "#FFF0F5", color: "#D4789F", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", minHeight: 44 },
  danger: { background: "#fff0f0", color: "#D9534F", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", minHeight: 44 },
  chip: { border: "1.5px solid #FFD9E8", background: "#fff", color: "#D4789F", borderRadius: 999, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", minHeight: 36, whiteSpace: "nowrap" },
  chipOn: { background: "#FF6B9D", border: "1.5px solid #FF6B9D", color: "#fff" }, // 線は、border のまま書きかえる(border と borderColor を混ぜると、画面を描き直すときに警告が出る)
  badge: { display: "inline-block", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" },
  err: { background: "#FFF0F0", border: "1.5px solid #FFB3B3", color: "#B3261E", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10, lineHeight: 1.6 },
  ok: { color: "#2E7D32", fontWeight: 700, fontSize: 13 },
};

export function badgeStyle(st) {
  return { ...S.badge, background: st.bg, color: st.fg };
}
