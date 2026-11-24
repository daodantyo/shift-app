// 上のメニュー(シフト・売上・経費・集計・予定表・キャスト・面接・報酬・希望シフト)。
// 広い画面: 今までどおり、ボタンを横に並べる(入りきらなければ折り返す)。
// スマホ(compact): 「☰ メニュー」ボタン1つ。押すと、3つずつの一覧が開く。選ぶと閉じる。
//   ボタンには、いま開いている画面の名前が出る。tabs の badge(新しい希望シフトの数など)があるときは、ボタンに数が出る。
// tabs: [{ id, label, badge? }]
import { useEffect, useState } from "react";

const MENU_ID = "tab-menu-list";

function Badge({ n }) {
  return (
    <span
      aria-label={`${n}件`}
      style={{ display: "inline-block", minWidth: 18, height: 18, padding: "0 5px", boxSizing: "border-box", borderRadius: 9, background: "#FF4D6D", color: "#fff", fontSize: 11, fontWeight: 800, lineHeight: "18px", textAlign: "center" }}
    >
      {n}
    </span>
  );
}

export default function TabMenu({ tabs, current, onSelect, compact }) {
  return compact ? <CompactMenu tabs={tabs} current={current} onSelect={onSelect} /> : <WideRow tabs={tabs} current={current} onSelect={onSelect} />;
}

// 広い画面(今までと同じ見た目)
function WideRow({ tabs, current, onSelect }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onSelect(t.id)} style={{ padding: "10px 20px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, borderRadius: "8px 8px 0 0", background: current === t.id ? "#FFF5F8" : "transparent", color: current === t.id ? "#5C3344" : "#D4789F" }}>
          {t.label}{t.badge ? ` (${t.badge})` : ""}
        </button>
      ))}
    </div>
  );
}

// スマホ
function CompactMenu({ tabs, current, onSelect }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const cur = tabs.find((t) => t.id === current) || tabs[0];
  const pending = tabs.reduce((n, t) => n + (Number(t.badge) || 0), 0);
  const pick = (id) => { setOpen(false); onSelect(id); };

  return (
    <div style={{ paddingBottom: 14 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 48, padding: "0 14px", boxSizing: "border-box", border: "none", borderRadius: 12, background: "#FFF5F8", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: "#5C3344", textAlign: "left" }}
      >
        <span style={{ color: "#D4789F", flexShrink: 0 }}>☰ メニュー</span>
        {pending > 0 && <Badge n={pending} />}
        <span style={{ flex: 1, minWidth: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur ? cur.label : ""}</span>
        <span aria-hidden="true" style={{ color: "#D4789F", flexShrink: 0 }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id={MENU_ID} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 8 }}>
          {tabs.map((t) => {
            const on = t.id === current;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => pick(t.id)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 4, minHeight: 48, padding: "6px 4px", boxSizing: "border-box", border: on ? "2px solid #FF8FAB" : "2px solid transparent", borderRadius: 10, background: on ? "#FFF5F8" : "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: on ? 800 : 600, color: on ? "#5C3344" : "#A4476F", lineHeight: 1.3 }}
              >
                {t.label}
                {t.badge ? <Badge n={t.badge} /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
