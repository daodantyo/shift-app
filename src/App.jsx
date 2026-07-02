import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAzhuyDJq_JvfzjOBvs6JjloLbozJmsMLs",
  authDomain: "shift-app-fa13d.firebaseapp.com",
  databaseURL: "https://shift-app-fa13d-default-rtdb.firebaseio.com",
  projectId: "shift-app-fa13d",
  storageBucket: "shift-app-fa13d.firebasestorage.app",
  messagingSenderId: "599604964523",
  appId: "1:599604964523:web:2e37264761ec38983c1bee",
  measurementId: "G-26YKL68CMF"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
const INITIAL_CAST = [
  { id: 1, name: "さくら", rank: "ナンバー1" },
  { id: 2, name: "れな", rank: "幹部" },
  { id: 3, name: "みう", rank: "キャスト" },
];
const RANKS = ["ナンバー1", "幹部", "キャスト", "体験入店"];
const RANK_COLORS = { "ナンバー1": "#f1c40f", "幹部": "#e67e22", "キャスト": "#9b59b6", "体験入店": "#95a5a6" };

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

function calcHours(inTime, outTime) {
  if (!inTime || !outTime) return null;
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins <= 0) return null;
  return (mins / 60).toFixed(1);
}

function formatYen(val) {
  if (!val && val !== 0) return "—";
  return "¥" + Number(val).toLocaleString();
}

export default function CabShift() {
  const [tab, setTab] = useState("shift");
  const [cast, setCast] = useState(INITIAL_CAST);
  const [weekOffset, setWeekOffset] = useState(0);
  const dates = getWeekDates(weekOffset);
  const [shifts, setShifts] = useState({});
  const [sales, setSales] = useState({});
  const [stats, setStats] = useState({});
  const [newName, setNewName] = useState("");
  const [newRank, setNewRank] = useState("キャスト");
  const [editingCast, setEditingCast] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState(null);

  // Load from Firebase
  useEffect(() => {
    const dataRef = ref(db, "shiftapp");
    const unsub = onValue(dataRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.cast) setCast(data.cast);
        if (data.shifts) setShifts(data.shifts);
        if (data.sales) setSales(data.sales);
        if (data.stats) setStats(data.stats);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const saveToFirebase = (newData) => {
    set(ref(db, "shiftapp"), newData).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const updateCast = (newCast) => { setCast(newCast); saveToFirebase({ cast: newCast, shifts, sales, stats }); };
  const updateShifts = (newShifts) => { setShifts(newShifts); saveToFirebase({ cast, shifts: newShifts, sales, stats }); };
  const updateSales = (newSales) => { setSales(newSales); saveToFirebase({ cast, shifts, sales: newSales, stats }); };
  const updateStats = (newStats) => { setStats(newStats); saveToFirebase({ cast, shifts, sales, stats: newStats }); };

  const getShift = (castId, dateStr) => (shifts[castId] || {})[dateStr] || { status: "off", in: "", out: "" };
  const getStat = (castId, dateStr) => (stats[castId] || {})[dateStr] || { douhan: 0, shimei: 0, drink: 0 };

  const updateShift = (castId, dateStr, patch) => {
    const newShifts = { ...shifts, [castId]: { ...(shifts[castId] || {}), [dateStr]: { ...getShift(castId, dateStr), ...patch } } };
    updateShifts(newShifts);
  };

  const updateStat = (castId, dateStr, patch) => {
    const newStats = { ...stats, [castId]: { ...(stats[castId] || {}), [dateStr]: { ...getStat(castId, dateStr), ...patch } } };
    updateStats(newStats);
  };

  const addCast = () => {
    if (!newName.trim()) return;
    const id = Date.now();
    const newCast = [...cast, { id, name: newName.trim(), rank: newRank }];
    updateCast(newCast);
    setNewName(""); setNewRank("キャスト"); setShowAddForm(false);
  };

  const removeCast = (id) => updateCast(cast.filter((c) => c.id !== id));
  const saveEdit = () => { if (!editingCast) return; updateCast(cast.map((c) => c.id === editingCast.id ? editingCast : c)); setEditingCast(null); };

  const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const weekSales = dates.reduce((sum, d) => sum + (Number((sales[d.toDateString()] || {}).amount) || 0), 0);
  const totalStat = (castId, key) => dates.reduce((sum, d) => sum + (Number(getStat(castId, d.toDateString())[key]) || 0), 0);
  const rankColor = (rank) => RANK_COLORS[rank] || "#888";
  const openDetail = (castId, dateStr) => setDetailModal({ castId, dateStr });
  const closeDetail = () => setDetailModal(null);

  const totalHours = (castId) => dates.reduce((sum, d) => {
    const s = getShift(castId, d.toDateString());
    const h = calcHours(s.in, s.out);
    return sum + (h ? Number(h) : 0);
  }, 0).toFixed(1);

  if (loading) return (
    <div style={{ fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", background: "#FFF5F8", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 40 }}>🌸</div>
      <div style={{ color: "#D4789F", fontWeight: 700 }}>読み込み中...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", background: "#FFF5F8", color: "#5C3344" }}>
      <div style={{ background: "linear-gradient(135deg, #FFD1E3 0%, #FFB6D5 100%)", padding: "20px 24px 0", boxShadow: "0 2px 20px rgba(255,182,213,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg, #FF8FAB, #FFB6D5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🌸</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#5C3344", fontWeight: 700, fontSize: 20, letterSpacing: 2 }}>キャスト管理</div>
            <div style={{ color: "#D4789F", fontSize: 12 }}>在籍 {cast.length}名</div>
          </div>
          {saved && <div style={{ background: "#6BCB77", color: "#fff", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700 }}>☁️ 保存済み</div>}
        </div>
        <div style={{ display: "flex" }}>
          {[{ id: "shift", label: "シフト" }, { id: "sales", label: "売上" }, { id: "cast", label: "キャスト" }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, borderRadius: "8px 8px 0 0", background: tab === t.id ? "#FFF5F8" : "transparent", color: tab === t.id ? "#5C3344" : "#D4789F" }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 1000, margin: "0 auto" }}>
        {tab === "shift" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <button onClick={() => setWeekOffset((w) => w - 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>← 前週</button>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{formatDate(dates[0])} 〜 {formatDate(dates[6])}</div>
              <button onClick={() => setWeekOffset((w) => w + 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>次週 →</button>
            </div>

            {/* Daily cast cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 16 }}>
              {dates.map((d, i) => {
                const dateStr = d.toDateString();
                const isToday = d.toDateString() === new Date().toDateString();
                const isWeekend = i >= 5;
                const workingCast = cast.filter((c) => getShift(c.id, dateStr).status !== "off")
                  .sort((a, b) => (getShift(a.id, dateStr).in || "99:99").localeCompare(getShift(b.id, dateStr).in || "99:99"));
                return (
                  <div key={i} style={{ background: isToday ? "rgba(255,199,60,0.1)" : "#fff", borderRadius: 10, padding: "8px 6px", border: isToday ? "1.5px solid #FFC93C" : "1.5px solid #FFD9E8", minHeight: 80 }}>
                    <div style={{ textAlign: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: isWeekend ? "#FF4D8D" : "#D4789F" }}>{DAYS[i]}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: isToday ? "#FFC93C" : isWeekend ? "#FF4D8D" : "#5C3344" }}>{formatDate(d)}</div>
                      <div style={{ fontSize: 10, color: "#D4789F" }}>{workingCast.length}名</div>
                    </div>
                    {workingCast.length === 0 ? <div style={{ textAlign: "center", fontSize: 9, color: "#FFB6D5" }}>なし</div>
                      : workingCast.map((c) => (
                        <div key={c.id} style={{ background: `${rankColor(c.rank)}22`, borderRadius: 5, padding: "2px 4px", border: `1px solid ${rankColor(c.rank)}44`, marginBottom: 2 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#5C3344", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                          {getShift(c.id, dateStr).in && <div style={{ fontSize: 9, color: "#D4789F", textAlign: "center" }}>{getShift(c.id, dateStr).in}</div>}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>

            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(255,107,157,0.12)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "100px repeat(7, 1fr)", background: "#FFF0F5", borderBottom: "2px solid #FFD9E8" }}>
                <div style={{ padding: "12px", fontWeight: 700, fontSize: 11, color: "#D4789F" }}>キャスト</div>
                {dates.map((d, i) => {
                  const isToday = d.toDateString() === new Date().toDateString();
                  const isWeekend = i >= 5;
                  return (
                    <div key={i} style={{ padding: "8px 2px", textAlign: "center", borderLeft: "1px solid #FFD9E8" }}>
                      <div style={{ fontSize: 10, color: isWeekend ? "#FF4D8D" : "#D4789F", fontWeight: 600 }}>{DAYS[i]}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? "#FFC93C" : isWeekend ? "#FF4D8D" : "#5C3344", background: isToday ? "rgba(255,199,60,0.15)" : "transparent", borderRadius: 6 }}>{formatDate(d)}</div>
                    </div>
                  );
                })}
              </div>

              {[...cast].sort((a, b) => {
                const today = new Date().toDateString();
                const refDate = dates.find(d => d.toDateString() === today) ? today : dates[0].toDateString();
                const sa = getShift(a.id, refDate); const sb = getShift(b.id, refDate);
                if (sa.status === "off" !== sb.status === "off") return sa.status === "off" ? 1 : -1;
                return (sa.in || "99:99").localeCompare(sb.in || "99:99");
              }).map((member, mi) => (
                <div key={member.id} style={{ borderBottom: mi < cast.length - 1 ? "1px solid #FFF0F5" : "none" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "100px repeat(7, 1fr)" }}>
                    <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "#5C3344" }}>{member.name}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: rankColor(member.rank) }}>{member.rank}</div>
                    </div>
                    {dates.map((d, di) => {
                      const dateStr = d.toDateString();
                      const s = getShift(member.id, dateStr);
                      const isOff = s.status === "off";
                      const hours = calcHours(s.in, s.out);
                      const stat = getStat(member.id, dateStr);
                      return (
                        <div key={di} style={{ padding: "5px 3px", borderLeft: "1px solid #FFD9E8", background: isOff ? "transparent" : "#FFF5F8" }}>
                          <button onClick={() => updateShift(member.id, dateStr, { status: isOff ? "work" : "off" })} style={{ width: "100%", border: "none", borderRadius: 6, padding: "3px 0", fontSize: 11, fontWeight: 700, cursor: "pointer", background: isOff ? "#f0f0f0" : "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: isOff ? "#bbb" : "#fff", marginBottom: 3 }}>
                            {isOff ? "休み" : "出勤"}
                          </button>
                          {!isOff && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <input type="time" value={s.in || ""} onChange={(e) => updateShift(member.id, dateStr, { in: e.target.value })} style={{ width: "100%", border: "1px solid #FFD9E8", borderRadius: 5, padding: "2px 2px", fontSize: 10, outline: "none", color: "#5C3344" }} />
                              <input type="time" value={s.out || ""} onChange={(e) => updateShift(member.id, dateStr, { out: e.target.value })} style={{ width: "100%", border: "1px solid #FFD9E8", borderRadius: 5, padding: "2px 2px", fontSize: 10, outline: "none", color: "#5C3344" }} />
                              {hours && <div style={{ textAlign: "center", fontSize: 9, color: "#D4789F" }}>{hours}h</div>}
                              <button onClick={() => openDetail(member.id, dateStr)} style={{ background: "rgba(255,199,60,0.15)", border: "1px solid rgba(255,199,60,0.3)", borderRadius: 5, padding: "2px 0", fontSize: 9, color: "#FFC93C", cursor: "pointer", fontWeight: 700 }}>
                                本{stat.douhan} 姫{stat.shimei} 💰{stat.drink}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div style={{ display: "grid", gridTemplateColumns: "100px repeat(7, 1fr)", background: "#FFF0F5", borderTop: "2px solid #FFD9E8" }}>
                <div style={{ padding: "10px 10px", fontWeight: 700, fontSize: 11, color: "#D4789F", display: "flex", alignItems: "center" }}>出勤数</div>
                {dates.map((d, di) => {
                  const working = cast.filter((c) => getShift(c.id, d.toDateString()).status !== "off").length;
                  return (
                    <div key={di} style={{ padding: "8px 4px", borderLeft: "1px solid #FFD9E8", textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: working === 0 ? "#FF6B6B" : "#FF6B9D" }}>{working}</div>
                      <div style={{ fontSize: 10, color: "#FFB6D5" }}>名</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "sales" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <button onClick={() => setWeekOffset((w) => w - 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>← 前週</button>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{formatDate(dates[0])} 〜 {formatDate(dates[6])}</div>
              <button onClick={() => setWeekOffset((w) => w + 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>次週 →</button>
            </div>
            <div style={{ background: "linear-gradient(135deg, #FFB6D5, #FF8FAB)", borderRadius: 14, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>週間売上合計</div>
                <div style={{ color: "#fff", fontSize: 28, fontWeight: 800, marginTop: 4 }}>{formatYen(weekSales)}</div>
              </div>
              <div style={{ fontSize: 36 }}>💎</div>
            </div>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#5C3344", marginBottom: 12 }}>キャスト週間成績</div>
              {[...cast].sort((a, b) => totalStat(b.id, "shimei") - totalStat(a.id, "shimei")).map((member) => (
                <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFF5F8", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${rankColor(member.rank)}, #FF8FAB)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>{member.name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{member.name}</div>
                    <div style={{ fontSize: 10, color: rankColor(member.rank), fontWeight: 700 }}>{member.rank}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[{ key: "douhan", label: "本指名", color: "#FF6B6B" }, { key: "shimei", label: "姫指名", color: "#FFC93C" }, { key: "drink", label: "雑費", color: "#5DC9E2" }].map(({ key, label, color }) => (
                      <div key={key} style={{ textAlign: "center", background: `${color}22`, borderRadius: 8, padding: "4px 10px" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color }}>{totalStat(member.id, key)}</div>
                        <div style={{ fontSize: 9, color: "#D4789F" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {dates.map((d, i) => {
              const dateStr = d.toDateString();
              const isWeekend = i >= 5;
              const isToday = d.toDateString() === new Date().toDateString();
              const dayData = sales[dateStr] || {};
              const working = cast.filter((c) => getShift(c.id, dateStr).status !== "off").length;
              return (
                <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 10, border: isToday ? "2px solid #FFC93C" : "2px solid transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ minWidth: 48 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isWeekend ? "#FF4D8D" : "#D4789F" }}>{DAYS[i]}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: isToday ? "#FFC93C" : isWeekend ? "#FF4D8D" : "#5C3344" }}>{formatDate(d)}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFF5F8", borderRadius: 10, padding: "8px 12px", border: "1.5px solid #FFD9E8" }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#FFB6D5" }}>¥</span>
                        <input type="number" placeholder="売上を入力" value={dayData.amount || ""} onChange={(e) => updateSales({ ...sales, [dateStr]: { ...(sales[dateStr] || {}), amount: e.target.value } })} style={{ flex: 1, border: "none", background: "transparent", fontSize: 18, fontWeight: 700, color: "#5C3344", outline: "none" }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 70 }}>
                      <div style={{ fontSize: 12, color: "#FF6B9D", fontWeight: 700 }}>{working}名出勤</div>
                      {dayData.amount && working > 0 && <div style={{ fontSize: 11, color: "#FFC93C", fontWeight: 700 }}>¥{Math.round(Number(dayData.amount) / working).toLocaleString()}/人</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "cast" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>キャスト一覧</div>
              <button onClick={() => setShowAddForm(!showAddForm)} style={{ background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🌸 追加</button>
            </div>
            {showAddForm && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 20, marginBottom: 16, border: "2px solid #FF8FAB" }}>
                <div style={{ fontWeight: 700, marginBottom: 12, color: "#FF6B9D" }}>新しいキャストを追加</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input placeholder="源氏名" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCast()} style={{ flex: 1, minWidth: 140, border: "1.5px solid #FFD9E8", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none" }} />
                  <select value={newRank} onChange={(e) => setNewRank(e.target.value)} style={{ border: "1.5px solid #FFD9E8", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", background: "#fff" }}>
                    {RANKS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <button onClick={addCast} style={{ background: "#FF8FAB", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>追加</button>
                  <button onClick={() => setShowAddForm(false)} style={{ background: "#FFF0F5", color: "#D4789F", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}>キャンセル</button>
                </div>
              </div>
            )}
            {cast.map((member) => (
              <div key={member.id} style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg, ${rankColor(member.rank)}, #FF8FAB)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20 }}>{member.name[0]}</div>
                {editingCast?.id === member.id ? (
                  <div style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={editingCast.name} onChange={(e) => setEditingCast({ ...editingCast, name: e.target.value })} style={{ flex: 1, minWidth: 120, border: "1.5px solid #FF8FAB", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none" }} />
                    <select value={editingCast.rank} onChange={(e) => setEditingCast({ ...editingCast, rank: e.target.value })} style={{ border: "1.5px solid #FFD9E8", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", background: "#fff" }}>
                      {RANKS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <button onClick={saveEdit} style={{ background: "#FF8FAB", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>保存</button>
                    <button onClick={() => setEditingCast(null)} style={{ background: "#FFF0F5", color: "#D4789F", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>キャンセル</button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{member.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: rankColor(member.rank), marginTop: 2 }}>{member.rank}</div>
                      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: "#FF6B6B" }}>本指名 {totalStat(member.id, "douhan")}</span>
                        <span style={{ fontSize: 11, color: "#FFC93C" }}>姫指名 {totalStat(member.id, "shimei")}</span>
                        <span style={{ fontSize: 11, color: "#5DC9E2" }}>雑費 {totalStat(member.id, "drink")}</span>
                      </div>
                    </div>
                    <button onClick={() => setEditingCast({ ...member })} style={{ background: "#FFF0F5", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", color: "#FF6B9D", fontWeight: 600, fontSize: 13 }}>編集</button>
                    <button onClick={() => removeCast(member.id)} style={{ background: "#fff0f0", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", color: "#FF6B6B", fontWeight: 600, fontSize: 13 }}>削除</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {detailModal && (() => {
        const { castId, dateStr } = detailModal;
        const stat = getStat(castId, dateStr);
        const member = cast.find((c) => c.id === castId);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={closeDetail}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 28, minWidth: 300, border: "2px solid #FF8FAB" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>{member?.name}</div>
              <div style={{ fontSize: 12, color: "#D4789F", marginBottom: 20 }}>{dateStr}</div>
              {[{ key: "douhan", label: "本指名", color: "#FF6B6B", emoji: "💖" }, { key: "shimei", label: "姫指名", color: "#FFC93C", emoji: "⭐" }, { key: "drink", label: "雑費", color: "#5DC9E2", emoji: "💰" }].map(({ key, label, color, emoji }) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 20 }}>{emoji}</div>
                  <div style={{ flex: 1, fontWeight: 600 }}>{label}</div>
                  <button onClick={() => updateStat(castId, dateStr, { [key]: Math.max(0, (stat[key] || 0) - 1) })} style={{ width: 32, height: 32, border: "none", borderRadius: 8, background: "#FFF0F5", color: "#5C3344", fontSize: 18, cursor: "pointer", fontWeight: 700 }}>－</button>
                  <div style={{ width: 36, textAlign: "center", fontWeight: 800, fontSize: 20, color }}>{stat[key] || 0}</div>
                  <button onClick={() => updateStat(castId, dateStr, { [key]: (stat[key] || 0) + 1 })} style={{ width: 32, height: 32, border: "none", borderRadius: 8, background: color, color: "#fff", fontSize: 18, cursor: "pointer", fontWeight: 700 }}>＋</button>
                </div>
              ))}
              <button onClick={closeDetail} style={{ width: "100%", background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 8 }}>閉じる</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
