// ============================================================
//  スタッフ向け:シフトを見るだけの画面(編集不可・ログイン不要)
//  URL: /?view=1&shop=お店ID
// ============================================================
import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue } from "firebase/database";

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
const RANK_COLORS = { "ナンバー1": "#f1c40f", "幹部": "#e67e22", "キャスト": "#9b59b6", "体験入店": "#95a5a6" };

const DARK_LINE_BG = {
  background:
    "linear-gradient(115deg, transparent 48%, rgba(255,255,255,0.10) 48.4%, rgba(255,255,255,0.10) 48.9%, transparent 49.3%)," +
    "linear-gradient(25deg, transparent 22%, rgba(255,255,255,0.07) 22.4%, rgba(255,255,255,0.07) 22.8%, transparent 23.2%)," +
    "linear-gradient(200deg, transparent 55%, rgba(255,255,255,0.08) 55.4%, rgba(255,255,255,0.08) 55.8%, transparent 56.2%)," +
    "linear-gradient(70deg, transparent 78%, rgba(255,255,255,0.06) 78.4%, rgba(255,255,255,0.06) 78.7%, transparent 79.1%)," +
    "linear-gradient(160deg, transparent 12%, rgba(255,255,255,0.05) 12.3%, rgba(255,255,255,0.05) 12.6%, transparent 13%)," +
    "#0a0a0c",
  backgroundAttachment: "fixed",
};

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function rankColor(rank) {
  if (RANK_COLORS[rank]) return RANK_COLORS[rank];
  if (!rank) return "#888";
  let hash = 0;
  for (let i = 0; i < rank.length; i++) hash = rank.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
}

const navBtn = { background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" };

export default function StaffView({ shopId }) {
  const shopBase = `shops/${shopId}`;
  const [cast, setCast] = useState([]);
  const [shifts, setShifts] = useState({});
  const [weekOffset, setWeekOffset] = useState(0);
  const dates = getWeekDates(weekOffset);

  useEffect(() => {
    const u1 = onValue(ref(db, `${shopBase}/data/cast`), (snap) => setCast(snap.val() || []));
    const u2 = onValue(ref(db, `${shopBase}/data/shifts`), (snap) => setShifts(snap.val() || {}));
    return () => { u1(); u2(); };
  }, [shopBase]);

  const getShift = (castId, dateStr) => (shifts[castId] || {})[dateStr] || { status: "off", in: "", out: "" };
  const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const castList = Array.isArray(cast) ? cast.filter(Boolean) : Object.values(cast || {});

  return (
    <div style={{ fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", ...DARK_LINE_BG, color: "#5C3344", padding: 16 }}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 18, marginBottom: 16, color: "#5C3344" }}>🌸 シフト表</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, maxWidth: 500, margin: "0 auto 16px" }}>
        <button onClick={() => setWeekOffset((w) => w - 1)} style={navBtn}>← 前週</button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{formatDate(dates[0])} 〜 {formatDate(dates[6])}</div>
        <button onClick={() => setWeekOffset((w) => w + 1)} style={navBtn}>次週 →</button>
      </div>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        {dates.map((d, i) => {
          const dateStr = d.toDateString();
          const isToday = d.toDateString() === new Date().toDateString();
          const isWeekend = i >= 5;
          const working = castList
            .filter((c) => getShift(c.id, dateStr).status !== "off")
            .sort((a, b) => (getShift(a.id, dateStr).in || "99:99").localeCompare(getShift(b.id, dateStr).in || "99:99"));
          return (
            <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", marginBottom: 10, border: isToday ? "2px solid #FFC93C" : "2px solid transparent" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: working.length ? 8 : 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: isWeekend ? "#FF4D8D" : "#D4789F" }}>{DAYS[i]}</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: isToday ? "#FFC93C" : "#5C3344" }}>{formatDate(d)}</div>
                <div style={{ fontSize: 12, color: "#D4789F" }}>{working.length}名出勤</div>
              </div>
              {working.length === 0 ? (
                <div style={{ fontSize: 12, color: "#FFB6D5" }}>出勤者なし</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {working.map((c) => {
                    const s = getShift(c.id, dateStr);
                    return (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFF5F8", borderRadius: 8, padding: "6px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: rankColor(c.rank) }} />
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
                        </div>
                        <div style={{ fontSize: 12, color: "#D4789F", fontWeight: 700 }}>{s.in || "?"} 〜 {s.out || "?"}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
