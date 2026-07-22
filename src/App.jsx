import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, set, onValue, update, remove } from "firebase/database";
import ShiftRequestForm from "./ShiftRequestForm";

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
const INITIAL_CAST = [
  { id: 1, name: "さくら", rank: "ナンバー1" },
  { id: 2, name: "れな", rank: "幹部" },
  { id: 3, name: "みう", rank: "キャスト" },
];
const RANKS = ["ナンバー1", "幹部", "キャスト", "体験入店"];
const RANK_COLORS = { "ナンバー1": "#f1c40f", "幹部": "#e67e22", "キャスト": "#9b59b6", "体験入店": "#95a5a6" };

// 黒地に白い線が交差する背景デザイン
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

function TimeSelect({ value, onChange, style }) {
  const [h, m] = (value || "").split(":");
  const hour = h || "";
  const minute = m || "";
  const setHour = (newH) => onChange(newH && minute ? `${newH}:${minute}` : newH ? `${newH}:00` : "");
  const setMinute = (newM) => onChange(hour ? `${hour}:${newM}` : "");
  const selectStyle = {
    border: "1px solid #FFD9E8",
    borderRadius: 5,
    padding: "2px 2px",
    fontSize: 10,
    outline: "none",
    color: "#5C3344",
    background: "#fff",
    ...style,
  };
  return (
    <div style={{ display: "flex", gap: 2 }}>
      <select value={hour} onChange={(e) => setHour(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
        <option value="">--</option>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((hh) => (
          <option key={hh} value={hh}>{hh}</option>
        ))}
      </select>
      <select value={minute} onChange={(e) => setMinute(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
        <option value="">--</option>
        <option value="00">00</option>
        <option value="30">30</option>
      </select>
    </div>
  );
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
  // LINEの希望シフトフォームは ?request=1 でアクセスした時だけ表示する
  const isRequestPage = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("request") === "1";
  // スタッフ用のシフト閲覧専用ページは ?view=1 でアクセスした時だけ表示する(パスワード不要)
  const isViewPage = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "1";

  // ↓ 管理画面に入るためのパスワード。好きな文字列に変更してください
  const ADMIN_PASSWORD = "sakura2026";

  const [unlocked, setUnlocked] = useState(
    typeof window !== "undefined" && localStorage.getItem("shiftAppUnlocked") === "1"
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleUnlock = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      localStorage.setItem("shiftAppUnlocked", "1");
      setUnlocked(true);
      setPasswordError("");
    } else {
      setPasswordError("パスワードが違います");
      setPasswordInput("");
    }
  };

  const [tab, setTab] = useState("shift");
  const [cast, setCast] = useState(INITIAL_CAST);
  const [weekOffset, setWeekOffset] = useState(0);
  const dates = getWeekDates(weekOffset);
  const [shifts, setShifts] = useState({});
  const [sales, setSales] = useState({});
  const [stats, setStats] = useState({});
  const [expenses, setExpenses] = useState({});
  const [settings, setSettings] = useState({ showConfirmedShifts: true });
  const [requests, setRequests] = useState({});
  const [newName, setNewName] = useState("");
  const [newRank, setNewRank] = useState("キャスト");
  const [editingCast, setEditingCast] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState(null);
  const [expandedStatCastId, setExpandedStatCastId] = useState(null);
  const [statEditDateStr, setStatEditDateStr] = useState(null);

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
        if (data.expenses) setExpenses(data.expenses);
        if (data.settings) setSettings((s) => ({ ...s, ...data.settings }));
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 希望シフトの読み込み
  useEffect(() => {
    const reqRef = ref(db, "shiftRequests");
    const unsub = onValue(reqRef, (snapshot) => {
      setRequests(snapshot.val() || {});
    });
    return () => unsub();
  }, []);

  const saveToFirebase = (newData) => {
    set(ref(db, "shiftapp"), newData).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const updateCast = (newCast) => { setCast(newCast); saveToFirebase({ cast: newCast, shifts, sales, stats, expenses, settings }); };
  const updateShifts = (newShifts) => { setShifts(newShifts); saveToFirebase({ cast, shifts: newShifts, sales, stats, expenses, settings }); };
  const updateSales = (newSales) => { setSales(newSales); saveToFirebase({ cast, shifts, sales: newSales, stats, expenses, settings }); };
  const updateStats = (newStats) => { setStats(newStats); saveToFirebase({ cast, shifts, sales, stats: newStats, expenses, settings }); };
  const updateExpenses = (newExpenses) => { setExpenses(newExpenses); saveToFirebase({ cast, shifts, sales, stats, expenses: newExpenses, settings }); };
  const updateSettings = (newSettings) => { setSettings(newSettings); saveToFirebase({ cast, shifts, sales, stats, expenses, settings: newSettings }); };

  const getExpenseList = (dateStr) => {
    const obj = expenses[dateStr] || {};
    return Object.keys(obj).map((id) => {
      const item = obj[id] || {};
      return { id: id, category: item.category, amount: item.amount };
    });
  };

  const addExpense = (dateStr) => {
    const id = "e" + Date.now();
    const newExpenses = { ...expenses, [dateStr]: { ...(expenses[dateStr] || {}), [id]: { category: "", amount: "" } } };
    updateExpenses(newExpenses);
  };

  const updateExpense = (dateStr, id, patch) => {
    const newExpenses = {
      ...expenses,
      [dateStr]: { ...(expenses[dateStr] || {}), [id]: { ...((expenses[dateStr] || {})[id] || {}), ...patch } },
    };
    updateExpenses(newExpenses);
  };

  const removeExpense = (dateStr, id) => {
    const dayExpenses = { ...(expenses[dateStr] || {}) };
    delete dayExpenses[id];
    updateExpenses({ ...expenses, [dateStr]: dayExpenses });
  };

  // ===== 毎月の支払い(家賃などの固定費)=====
  const recurringList = Object.entries(settings.recurring || {}).map(([id, r]) => ({ id, ...(r || {}) }));
  const addRecurring = () => updateSettings({ ...settings, recurring: { ...(settings.recurring || {}), ["r" + Date.now()]: { name: "", day: "", amount: "" } } });
  const updateRecurring = (id, patch) => updateSettings({ ...settings, recurring: { ...(settings.recurring || {}), [id]: { ...((settings.recurring || {})[id] || {}), ...patch } } });
  const removeRecurring = (id) => { const r = { ...(settings.recurring || {}) }; delete r[id]; updateSettings({ ...settings, recurring: r }); };
  // 支払日まであと何日か(0=今日)
  const daysUntilPay = (day) => {
    const d = Number(day);
    if (!d) return null;
    const now = new Date();
    const today = now.getDate();
    const dim = (y, m) => new Date(y, m + 1, 0).getDate();
    const thisMonthDay = Math.min(d, dim(now.getFullYear(), now.getMonth()));
    if (thisMonthDay >= today) return thisMonthDay - today;
    const ny = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const nm = (now.getMonth() + 1) % 12;
    return dim(now.getFullYear(), now.getMonth()) - today + Math.min(d, dim(ny, nm));
  };
  // 「経費に追加」ボタン: 今日の経費として記録する
  const payToExpense = (r) => {
    const dateStr = new Date().toDateString();
    const id = "e" + Date.now();
    updateExpenses({ ...expenses, [dateStr]: { ...(expenses[dateStr] || {}), [id]: { category: r.name || "固定費", amount: r.amount || "" } } });
    // 今月ぶんを「支払った」チェック済みにする
    const key = new Date().getFullYear() + "-" + (new Date().getMonth() + 1);
    updateRecurring(r.id, { paid: { ...((settings.recurring || {})[r.id] || {}).paid, [key]: true } });
    alert(`「${r.name || "固定費"}」を今日の経費に追加しました`);
  };
  // 今月ぶんが支払い済みか / チェックの切り替え
  const payKey = () => new Date().getFullYear() + "-" + (new Date().getMonth() + 1);
  const isPaidThisMonth = (r) => !!((r.paid || {})[payKey()]);
  const togglePaid = (r) => updateRecurring(r.id, { paid: { ...(r.paid || {}), [payKey()]: !isPaidThisMonth(r) } });

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
  // キャストの並び順を上下に入れ替える
  const moveCast = (index, dir) => {
    const ni = index + dir;
    if (ni < 0 || ni >= cast.length) return;
    const arr = [...cast];
    const tmp = arr[index]; arr[index] = arr[ni]; arr[ni] = tmp;
    updateCast(arr);
  };

  const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const weekSales = dates.reduce((sum, d) => sum + (Number((sales[d.toDateString()] || {}).amount) || 0), 0);
  const totalStat = (castId, key) => dates.reduce((sum, d) => sum + (Number(getStat(castId, d.toDateString())[key]) || 0), 0);
  const rankColor = (rank) => {
    if (RANK_COLORS[rank]) return RANK_COLORS[rank];
    if (!rank) return "#888";
    // 未登録のランク名は、文字列から自動で色を生成する(同じ名前なら常に同じ色)
    let hash = 0;
    for (let i = 0; i < rank.length; i++) {
      hash = rank.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 55%)`;
  };
  const [shiftView, setShiftView] = useState("week");
  // スマホ表示かどうか(横幅700px未満ならスマホレイアウト)
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 700);
  const [mobileDayIdx, setMobileDayIdx] = useState(null); // スマホで選択中の日(null=今日)
  useEffect(() => {
    // スマホで画面幅に合わせて表示するための設定(viewport)
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "viewport");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [salesView, setSalesView] = useState("week");
  const [summaryMonth, setSummaryMonth] = useState(new Date().getMonth());
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());

  const prevMonth = () => {
    if (summaryMonth === 0) { setSummaryMonth(11); setSummaryYear(y => y - 1); }
    else setSummaryMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (summaryMonth === 11) { setSummaryMonth(0); setSummaryYear(y => y + 1); }
    else setSummaryMonth(m => m + 1);
  };

  const daysInMonth = new Date(summaryYear, summaryMonth + 1, 0).getDate();
  const monthDates = Array.from({ length: daysInMonth }, (_, i) => new Date(summaryYear, summaryMonth, i + 1));
  const monthStatTotal = (castId, key) => monthDates.reduce((sum, d) => sum + (Number(getStat(castId, d.toDateString())[key]) || 0), 0);
  const STAT_ITEMS = [
    { key: "douhan", label: "本指名", color: "#FF6B6B", emoji: "💖" },
    { key: "shimei", label: "姫指名", color: "#FFC93C", emoji: "⭐" },
    { key: "drink", label: "雑費", color: "#5DC9E2", emoji: "💰" },
  ];

  // シフトをCSVでダウンロードする(キャスト名,日付,開始,終了)
  const exportShiftCSV = (dateList, label) => {
    const pad = (n) => String(n).padStart(2, "0");
    const rows = [["キャスト名", "日付", "開始", "終了"]];
    dateList.forEach((d) => {
      const dateStr = d.toDateString();
      const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      cast.forEach((c) => {
        const s = getShift(c.id, dateStr);
        if (s.status !== "off" && s.in && s.out) {
          rows.push([c.name, ymd, s.in, s.out]);
        }
      });
    });
    if (rows.length === 1) {
      alert("この期間に出勤データがありません");
      return;
    }
    const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shift_${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDetail = (castId, dateStr) => setDetailModal({ castId, dateStr });
  const closeDetail = () => setDetailModal(null);

  // 希望シフトを承認 → 実際のシフトに反映
  const approveRequest = (key, req) => {
    const newShifts = { ...shifts };
    newShifts[req.castId] = { ...(newShifts[req.castId] || {}) };
    Object.entries(req.entries || {}).forEach(([dateStr, entry]) => {
      newShifts[req.castId][dateStr] = {
        status: entry.status === "work" ? "work" : "off",
        in: entry.in || "",
        out: entry.out || "",
      };
    });
    setShifts(newShifts);
    saveToFirebase({ cast, shifts: newShifts, sales, stats, expenses, settings });
    update(ref(db, `shiftRequests/${key}`), { status: "approved" });
  };

  const rejectRequest = (key) => {
    update(ref(db, `shiftRequests/${key}`), { status: "rejected" });
  };

  const deleteRequest = (key) => {
    remove(ref(db, `shiftRequests/${key}`));
  };

  const pendingRequests = Object.entries(requests || {})
    .filter(([, r]) => r.status === "pending")
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  // LINEから開いた場合は希望シフト提出フォームだけを表示する
  if (isRequestPage) {
    return <ShiftRequestForm />;
  }

  // スタッフ向け:シフトを見るだけの画面(編集不可・パスワード不要)
  if (isViewPage) {
    return (
      <div style={{ fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", ...DARK_LINE_BG, color: "#5C3344", padding: 16 }}>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 18, marginBottom: 16, color: "#5C3344" }}>🌸 シフト表</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, maxWidth: 500, margin: "0 auto 16px" }}>
          <button onClick={() => setWeekOffset((w) => w - 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>← 前週</button>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{formatDate(dates[0])} 〜 {formatDate(dates[6])}</div>
          <button onClick={() => setWeekOffset((w) => w + 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>次週 →</button>
        </div>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          {dates.map((d, i) => {
            const dateStr = d.toDateString();
            const isToday = d.toDateString() === new Date().toDateString();
            const isWeekend = i >= 5;
            const working = cast.filter((c) => getShift(c.id, dateStr).status !== "off")
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

  if (!unlocked) {
    return (
      <div style={{ fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", ...DARK_LINE_BG, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ color: "#5C3344", fontWeight: 700, fontSize: 18 }}>管理画面ログイン</div>
        <input
          type="password"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          placeholder="パスワードを入力"
          autoFocus
          style={{ padding: "12px 16px", borderRadius: 10, border: "1.5px solid #FFD9E8", fontSize: 16, width: 240, textAlign: "center", outline: "none" }}
        />
        {passwordError && <div style={{ color: "#FF6B6B", fontSize: 13, fontWeight: 700 }}>{passwordError}</div>}
        <button
          onClick={handleUnlock}
          style={{ background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 32px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          ログイン
        </button>
      </div>
    );
  }

  if (loading) return (
    <div style={{ fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", ...DARK_LINE_BG, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 40 }}>🌸</div>
      <div style={{ color: "#D4789F", fontWeight: 700 }}>読み込み中...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", ...DARK_LINE_BG, color: "#5C3344" }}>
      <div style={{ background: "linear-gradient(135deg, #FFD1E3 0%, #FFB6D5 100%)", padding: "20px 24px 0", boxShadow: "0 2px 20px rgba(255,182,213,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg, #FF8FAB, #FFB6D5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🌸</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#5C3344", fontWeight: 700, fontSize: 20, letterSpacing: 2 }}>キャスト管理</div>
            <div style={{ color: "#D4789F", fontSize: 12 }}>在籍 {cast.length}名</div>
          </div>
          {saved && <div style={{ background: "#6BCB77", color: "#fff", borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700 }}>☁️ 保存済み</div>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {[{ id: "shift", label: "シフト" }, { id: "sales", label: "売上" }, { id: "expenses", label: "経費" }, { id: "summary", label: "集計" }, { id: "cast", label: "キャスト" }, { id: "requests", label: `希望シフト${pendingRequests.length ? ` (${pendingRequests.length})` : ""}` }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, borderRadius: "8px 8px 0 0", background: tab === t.id ? "#FFF5F8" : "transparent", color: tab === t.id ? "#5C3344" : "#D4789F" }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 1000, margin: "0 auto" }}>
        {/* 支払日のお知らせ(3日前から表示) */}
        {(() => {
          const upcoming = recurringList
            .map((r) => ({ ...r, left: daysUntilPay(r.day) }))
            .filter((r) => r.name && r.left != null && r.left <= 3 && !isPaidThisMonth(r))
            .sort((a, b) => a.left - b.left);
          if (!upcoming.length) return null;
          return (
            <div style={{ marginBottom: 16 }}>
              {upcoming.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: r.left === 0 ? "linear-gradient(135deg, #FF8FAB, #FF6B9D)" : "#FFF7E0", border: r.left === 0 ? "none" : "1.5px solid #FFC93C", borderRadius: 12, padding: "10px 14px", marginBottom: 8, boxShadow: r.left === 0 ? "0 4px 12px rgba(255,107,157,0.35)" : "none" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: r.left === 0 ? "#fff" : "#8a6d1a" }}>
                    {r.left === 0 ? `🔔 今日は「${r.name}」の支払日です!` : `📅 「${r.name}」の支払日(${r.day}日)まで あと${r.left}日`}
                    {r.amount && <span style={{ marginLeft: 8, fontWeight: 700 }}>{formatYen(Number(r.amount) || 0)}</span>}
                  </div>
                  {r.left === 0 && (
                    <button onClick={() => payToExpense(r)} style={{ flexShrink: 0, background: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, color: "#FF6B9D", cursor: "pointer" }}>経費に追加</button>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
        {tab === "shift" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[{ id: "week", label: "週間" }, { id: "month", label: "月間" }].map((v) => (
                <button key={v.id} onClick={() => setShiftView(v.id)} style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", background: shiftView === v.id ? "linear-gradient(135deg, #FFB6D5, #FF8FAB)" : "#fff", color: shiftView === v.id ? "#fff" : "#D4789F", boxShadow: shiftView === v.id ? "0 2px 8px rgba(255,107,157,0.3)" : "none" }}>
                  {v.label}
                </button>
              ))}
            </div>

            {shiftView === "week" && (
            <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <button onClick={() => setWeekOffset((w) => w - 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>← 前週</button>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{formatDate(dates[0])} 〜 {formatDate(dates[6])}</div>
              <button onClick={() => setWeekOffset((w) => w + 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>次週 →</button>
            </div>
            <div style={{ textAlign: "right", marginBottom: 12 }}>
              <button onClick={() => { const pad = (n) => String(n).padStart(2, "0"); const l = `${dates[0].getFullYear()}-${pad(dates[0].getMonth() + 1)}-${pad(dates[0].getDate())}`; exportShiftCSV(dates, l); }} style={{ background: "linear-gradient(135deg, #7ED9A7, #4CBF87)", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#fff", boxShadow: "0 2px 8px rgba(76,191,135,0.3)" }}>📥 この週をCSV書き出し</button>
            </div>

            {/* ===== スマホ用レイアウト:今日(選択日)を大きく表示 ===== */}
            {isMobile && (() => {
              const todayIdx = dates.findIndex((d) => d.toDateString() === new Date().toDateString());
              const selIdx = mobileDayIdx != null ? mobileDayIdx : todayIdx >= 0 ? todayIdx : 0;
              const selDate = dates[selIdx] || dates[0];
              const selStr = selDate.toDateString();
              const isTodaySel = selDate.toDateString() === new Date().toDateString();
              const sorted = [...cast].sort((a, b) => {
                const sa = getShift(a.id, selStr); const sb = getShift(b.id, selStr);
                if ((sa.status === "off") !== (sb.status === "off")) return sa.status === "off" ? 1 : -1;
                return (sa.in || "99:99").localeCompare(sb.in || "99:99");
              });
              const workingCount = cast.filter((c) => getShift(c.id, selStr).status !== "off").length;
              return (
                <div>
                  {/* 日付えらびボタン(横一列) */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 12 }}>
                    {dates.map((d, i) => {
                      const isT = d.toDateString() === new Date().toDateString();
                      const isSel = i === selIdx;
                      const cnt = cast.filter((c) => getShift(c.id, d.toDateString()).status !== "off").length;
                      return (
                        <button key={i} onClick={() => setMobileDayIdx(i)} style={{ border: isSel ? "2px solid #FF6B9D" : isT ? "1.5px solid #FFC93C" : "1.5px solid #FFD9E8", borderRadius: 10, padding: "5px 0", background: isSel ? "linear-gradient(135deg, #FFB6D5, #FF8FAB)" : "#fff", cursor: "pointer" }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: isSel ? "#fff" : i >= 5 ? "#FF4D8D" : "#D4789F" }}>{DAYS[i]}</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: isSel ? "#fff" : isT ? "#FFC93C" : "#5C3344" }}>{d.getDate()}</div>
                          <div style={{ fontSize: 8, color: isSel ? "#FFE3EF" : "#D4789F" }}>{cnt}名</div>
                        </button>
                      );
                    })}
                  </div>
                  {/* 選択した日の大きなカード */}
                  <div style={{ background: "#fff", borderRadius: 16, border: isTodaySel ? "2px solid #FFC93C" : "2px solid #FFD9E8", boxShadow: "0 4px 16px rgba(255,107,157,0.15)", padding: "14px 12px", marginBottom: 16 }}>
                    <div style={{ textAlign: "center", marginBottom: 12 }}>
                      {isTodaySel && <span style={{ background: "linear-gradient(135deg, #FFC93C, #FFB03C)", color: "#fff", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 800, marginRight: 8, verticalAlign: "middle" }}>今日</span>}
                      <span style={{ fontSize: 24, fontWeight: 800, color: "#5C3344", verticalAlign: "middle" }}>{formatDate(selDate)}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: selIdx >= 5 ? "#FF4D8D" : "#D4789F", marginLeft: 6, verticalAlign: "middle" }}>({DAYS[selIdx]})</span>
                      <div style={{ fontSize: 13, color: "#D4789F", marginTop: 4, fontWeight: 700 }}>出勤 {workingCount}名</div>
                    </div>
                    {sorted.map((member) => {
                      const s = getShift(member.id, selStr);
                      const isOff = s.status === "off";
                      const hours = calcHours(s.in, s.out);
                      const stat = getStat(member.id, selStr);
                      return (
                        <div key={member.id} style={{ borderRadius: 12, border: isOff ? "1.5px solid #f0f0f0" : `1.5px solid ${rankColor(member.rank)}55`, background: isOff ? "#fafafa" : "#FFF5F8", padding: "8px 10px", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: isOff ? 13 : 17, color: isOff ? "#bbb" : "#5C3344", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name}</div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: isOff ? "#ccc" : rankColor(member.rank) }}>{member.rank}</div>
                            </div>
                            <button onClick={() => updateShift(member.id, selStr, { status: isOff ? "work" : "off" })} style={{ border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", background: isOff ? "#f0f0f0" : "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: isOff ? "#bbb" : "#fff", flexShrink: 0 }}>{isOff ? "休み" : "出勤"}</button>
                          </div>
                          {!isOff && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                              <div style={{ width: 108 }}><TimeSelect value={s.in || ""} onChange={(v) => updateShift(member.id, selStr, { in: v })} style={{ fontSize: 14, padding: "6px 2px" }} /></div>
                              <span style={{ color: "#D4789F", fontWeight: 700 }}>〜</span>
                              <div style={{ width: 108 }}><TimeSelect value={s.out || ""} onChange={(v) => updateShift(member.id, selStr, { out: v })} style={{ fontSize: 14, padding: "6px 2px" }} /></div>
                              {hours && <span style={{ fontSize: 12, color: "#D4789F", fontWeight: 700 }}>{hours}h</span>}
                              <button onClick={() => openDetail(member.id, selStr)} style={{ background: "rgba(255,199,60,0.15)", border: "1px solid rgba(255,199,60,0.3)", borderRadius: 8, padding: "6px 8px", fontSize: 11, color: "#FFC93C", cursor: "pointer", fontWeight: 700, marginLeft: "auto" }}>本{stat.douhan} 姫{stat.shimei} 💰{stat.drink}</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {!isMobile && (<>
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

            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(255,107,157,0.12)", minWidth: 640 }}>
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
                              <TimeSelect value={s.in || ""} onChange={(v) => updateShift(member.id, dateStr, { in: v })} style={{ width: "100%" }} />
                              <TimeSelect value={s.out || ""} onChange={(v) => updateShift(member.id, dateStr, { out: v })} style={{ width: "100%" }} />
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
            </>)}
            </div>
            )}

            {shiftView === "month" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <button onClick={prevMonth} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>← 前月</button>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{summaryYear}年{summaryMonth + 1}月</div>
                  <button onClick={nextMonth} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>次月 →</button>
                </div>
                <div style={{ textAlign: "right", marginBottom: 12 }}>
                  <button onClick={() => exportShiftCSV(monthDates, `${summaryYear}-${String(summaryMonth + 1).padStart(2, "0")}`)} style={{ background: "linear-gradient(135deg, #7ED9A7, #4CBF87)", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#fff", boxShadow: "0 2px 8px rgba(76,191,135,0.3)" }}>📥 この月をCSV書き出し</button>
                </div>
                {monthDates.map((d, i) => {
                  const dateStr = d.toDateString();
                  const isToday = d.toDateString() === new Date().toDateString();
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const dayLabel = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
                  const working = cast.filter((c) => getShift(c.id, dateStr).status !== "off").length;
                  return (
                    <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", marginBottom: 8, border: isToday ? "2px solid #FFC93C" : "2px solid transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: isWeekend ? "#FF4D8D" : "#D4789F" }}>{dayLabel}</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: isToday ? "#FFC93C" : "#5C3344" }}>{d.getMonth() + 1}/{d.getDate()}</div>
                        <div style={{ fontSize: 11, color: "#D4789F" }}>{working}名出勤</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {cast.map((member) => {
                          const s = getShift(member.id, dateStr);
                          const isOff = s.status === "off";
                          const hours = calcHours(s.in, s.out);
                          return (
                            <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 8, background: isOff ? "transparent" : "#FFF5F8", borderRadius: 8, padding: "4px 8px" }}>
                              <div style={{ width: 64, fontSize: 12, fontWeight: 700, color: "#5C3344", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name}</div>
                              <button onClick={() => updateShift(member.id, dateStr, { status: isOff ? "work" : "off" })} style={{ border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", background: isOff ? "#f0f0f0" : "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: isOff ? "#bbb" : "#fff" }}>
                                {isOff ? "休み" : "出勤"}
                              </button>
                              {!isOff && (
                                <>
                                  <TimeSelect value={s.in || ""} onChange={(v) => updateShift(member.id, dateStr, { in: v })} style={{ width: 84 }} />
                                  <span style={{ fontSize: 11, color: "#D4789F" }}>〜</span>
                                  <TimeSelect value={s.out || ""} onChange={(v) => updateShift(member.id, dateStr, { out: v })} style={{ width: 84 }} />
                                  {hours && <span style={{ fontSize: 10, color: "#D4789F" }}>{hours}h</span>}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "sales" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[{ id: "week", label: "週間" }, { id: "month", label: "月間" }].map((v) => (
                <button key={v.id} onClick={() => setSalesView(v.id)} style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", background: salesView === v.id ? "linear-gradient(135deg, #FFB6D5, #FF8FAB)" : "#fff", color: salesView === v.id ? "#fff" : "#D4789F", boxShadow: salesView === v.id ? "0 2px 8px rgba(255,107,157,0.3)" : "none" }}>
                  {v.label}
                </button>
              ))}
            </div>

            {salesView === "week" && (
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
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#5C3344", marginBottom: 4 }}>キャスト週間成績</div>
                  <div style={{ fontSize: 11, color: "#D4789F", marginBottom: 12 }}>キャストをタップすると、その場で日ごとの数値を入力できます</div>
                  {[...cast].sort((a, b) => totalStat(b.id, "sales") - totalStat(a.id, "sales")).map((member) => {
                    const isExpanded = expandedStatCastId === member.id;
                    const editDateStr = isExpanded ? (statEditDateStr || dates[0].toDateString()) : null;
                    const editStat = isExpanded ? getStat(member.id, editDateStr) : null;
                    return (
                      <div key={member.id} style={{ background: "#FFF5F8", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                        <div
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedStatCastId(null);
                            } else {
                              setExpandedStatCastId(member.id);
                              setStatEditDateStr(dates[0].toDateString());
                            }
                          }}
                          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, cursor: "pointer" }}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${rankColor(member.rank)}, #FF8FAB)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>{member.name[0]}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{member.name}</div>
                            <div style={{ fontSize: 10, color: rankColor(member.rank), fontWeight: 700 }}>{member.rank}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: "#FF6B9D" }}>{formatYen(totalStat(member.id, "sales"))}</div>
                            <div style={{ fontSize: 9, color: "#D4789F" }}>個人売上</div>
                          </div>
                          <div style={{ fontSize: 16, color: "#D4789F" }}>{isExpanded ? "▲" : "▼"}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {[{ key: "douhan", label: "本指名", color: "#FF6B6B" }, { key: "shimei", label: "姫指名", color: "#FFC93C" }, { key: "drink", label: "雑費", color: "#5DC9E2" }].map(({ key, label, color }) => (
                            <div key={key} style={{ textAlign: "center", background: `${color}22`, borderRadius: 8, padding: "4px 10px" }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color }}>{totalStat(member.id, key)}</div>
                              <div style={{ fontSize: 9, color: "#D4789F" }}>{label}</div>
                            </div>
                          ))}
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #FFD9E8" }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
                              {dates.map((d, di) => {
                                const ds = d.toDateString();
                                const active = ds === editDateStr;
                                return (
                                  <button
                                    key={di}
                                    onClick={() => setStatEditDateStr(ds)}
                                    style={{
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 8px",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      background: active ? "linear-gradient(135deg, #FF8FAB, #FF6B9D)" : "#fff",
                                      color: active ? "#fff" : "#D4789F",
                                    }}
                                  >
                                    {DAYS[di]} {d.getMonth() + 1}/{d.getDate()}
                                  </button>
                                );
                              })}
                            </div>

                            {[{ key: "douhan", label: "本指名", color: "#FF6B6B", emoji: "💖" }, { key: "shimei", label: "姫指名", color: "#FFC93C", emoji: "⭐" }, { key: "drink", label: "雑費", color: "#5DC9E2", emoji: "💰" }].map(({ key, label, color, emoji }) => (
                              <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                                <div style={{ fontSize: 16 }}>{emoji}</div>
                                <div style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{label}</div>
                                <button onClick={() => updateStat(member.id, editDateStr, { [key]: Math.max(0, (editStat[key] || 0) - 1) })} style={{ width: 28, height: 28, border: "none", borderRadius: 8, background: "#fff", color: "#5C3344", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>－</button>
                                <div style={{ width: 28, textAlign: "center", fontWeight: 800, fontSize: 16, color }}>{editStat[key] || 0}</div>
                                <button onClick={() => updateStat(member.id, editDateStr, { [key]: (editStat[key] || 0) + 1 })} style={{ width: 28, height: 28, border: "none", borderRadius: 8, background: color, color: "#fff", fontSize: 16, cursor: "pointer", fontWeight: 700 }}>＋</button>
                              </div>
                            ))}

                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ fontSize: 16 }}>💴</div>
                              <div style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>個人売上</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", borderRadius: 8, padding: "6px 10px", border: "1.5px solid #FFD9E8" }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#FFB6D5" }}>¥</span>
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={editStat.sales || ""}
                                  onChange={(e) => updateStat(member.id, editDateStr, { sales: e.target.value })}
                                  style={{ width: 90, border: "none", background: "transparent", fontSize: 14, fontWeight: 700, color: "#5C3344", outline: "none" }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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

            {salesView === "month" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <button onClick={prevMonth} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>← 前月</button>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{summaryYear}年{summaryMonth + 1}月</div>
                  <button onClick={nextMonth} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>次月 →</button>
                </div>
                {(() => {
                  const monthTotal = monthDates.reduce((sum, d) => sum + (Number((sales[d.toDateString()] || {}).amount) || 0), 0);
                  return (
                    <div style={{ background: "linear-gradient(135deg, #FFB6D5, #FF8FAB)", borderRadius: 14, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>月間売上合計</div>
                        <div style={{ color: "#fff", fontSize: 28, fontWeight: 800, marginTop: 4 }}>{formatYen(monthTotal)}</div>
                      </div>
                      <div style={{ fontSize: 36 }}>💎</div>
                    </div>
                  );
                })()}
                {monthDates.map((d, i) => {
                  const dateStr = d.toDateString();
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = d.toDateString() === new Date().toDateString();
                  const dayData = sales[dateStr] || {};
                  const working = cast.filter((c) => getShift(c.id, dateStr).status !== "off").length;
                  const dayLabel = ["日","月","火","水","木","金","土"][d.getDay()];
                  return (
                    <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "12px 16px", marginBottom: 8, border: isToday ? "2px solid #FFC93C" : "2px solid transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ minWidth: 52 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: isWeekend ? "#FF4D8D" : "#D4789F" }}>{dayLabel}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? "#FFC93C" : isWeekend ? "#FF4D8D" : "#5C3344" }}>{d.getMonth()+1}/{d.getDate()}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFF5F8", borderRadius: 10, padding: "6px 12px", border: "1.5px solid #FFD9E8" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#FFB6D5" }}>¥</span>
                            <input type="number" placeholder="売上を入力" value={dayData.amount || ""} onChange={(e) => updateSales({ ...sales, [dateStr]: { ...(sales[dateStr] || {}), amount: e.target.value } })} style={{ flex: 1, border: "none", background: "transparent", fontSize: 16, fontWeight: 700, color: "#5C3344", outline: "none" }} />
                          </div>
                        </div>
                        <div style={{ textAlign: "right", minWidth: 60 }}>
                          <div style={{ fontSize: 11, color: "#FF6B9D", fontWeight: 700 }}>{working}名</div>
                          {dayData.amount && working > 0 && <div style={{ fontSize: 10, color: "#FFC93C", fontWeight: 700 }}>¥{Math.round(Number(dayData.amount)/working).toLocaleString()}/人</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "expenses" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <button onClick={() => setWeekOffset((w) => w - 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>← 前週</button>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{formatDate(dates[0])} 〜 {formatDate(dates[6])}</div>
              <button onClick={() => setWeekOffset((w) => w + 1)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}>次週 →</button>
            </div>

            {(() => {
              const weekExpenseTotal = dates.reduce((sum, d) => sum + getExpenseList(d.toDateString()).reduce((s, e) => s + (Number(e.amount) || 0), 0), 0);
              // 費目ごとの内訳を集計する
              const byCat = {};
              dates.forEach((d) => getExpenseList(d.toDateString()).forEach((e) => {
                const amt = Number(e.amount) || 0;
                if (!amt) return;
                const c = (e.category || "").trim() || "費目なし";
                byCat[c] = (byCat[c] || 0) + amt;
              }));
              const catList = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
              return (
                <div>
                <div style={{ background: "linear-gradient(135deg, #B6C9FF, #8FA8FF)", borderRadius: 14, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>週間経費合計</div>
                    <div style={{ color: "#fff", fontSize: 28, fontWeight: 800, marginTop: 4 }}>{formatYen(weekExpenseTotal)}</div>
                  </div>
                  <div style={{ fontSize: 36 }}>🧾</div>
                </div>
                {catList.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 16, boxShadow: "0 2px 8px rgba(143,168,255,0.15)" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#5C3344", marginBottom: 10 }}>📊 費目べつ内訳(この週)</div>
                    {catList.map(([c, amt]) => {
                      const pct = weekExpenseTotal ? Math.round((amt / weekExpenseTotal) * 100) : 0;
                      return (
                        <div key={c} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#5C3344" }}>{c}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8FE8" }}>{formatYen(amt)} <span style={{ fontSize: 11, color: "#B0BCE8" }}>({pct}%)</span></div>
                          </div>
                          <div style={{ background: "#EEF1FF", borderRadius: 6, height: 8, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(135deg, #B6C9FF, #8FA8FF)", borderRadius: 6 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              );
            })()}

            {/* 過去に使った費目の候補(入力欄でタップ/クリックすると選べる) */}
            <datalist id="expense-cat-list">
              {(() => {
                const set = new Set();
                Object.values(expenses).forEach((day) => Object.values(day || {}).forEach((e) => {
                  const c = ((e && e.category) || "").trim();
                  if (c) set.add(c);
                }));
                return [...set].sort().map((c) => <option key={c} value={c} />);
              })()}
            </datalist>

            {/* 毎月の支払い(固定費)の登録 */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 16, boxShadow: "0 2px 8px rgba(255,201,60,0.2)", border: "1.5px solid #FFE9B0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: recurringList.length ? 10 : 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#5C3344" }}>📅 毎月の支払い(家賃など)</div>
                <button onClick={addRecurring} style={{ background: "#FFF7E0", color: "#c9971a", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ 追加</button>
              </div>
              {recurringList.length === 0 && <div style={{ fontSize: 12, color: "#D4B98A", marginTop: 8 }}>「+ 追加」で家賃などを登録すると、支払日の3日前からお知らせが出ます</div>}
              {recurringList.map((r) => {
                const paid = isPaidThisMonth(r);
                return (
                <div key={r.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap", background: paid ? "#F0FBF3" : "transparent", borderRadius: 8, padding: paid ? "4px 4px" : 0 }}>
                  <button onClick={() => togglePaid(r)} title="今月の支払い済み" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: paid ? "none" : "1.5px solid #FFD9E8", background: paid ? "linear-gradient(135deg, #6FCF97, #4CAF7D)" : "#fff", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>{paid ? "✓" : ""}</button>
                  <input
                    placeholder="なまえ(例: 家賃)"
                    value={r.name || ""}
                    onChange={(ev) => updateRecurring(r.id, { name: ev.target.value })}
                    style={{ flex: 2, minWidth: 100, border: "1px solid #FFE9B0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", textDecoration: paid ? "line-through" : "none", color: paid ? "#9ac9ad" : "#5C3344" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#c9971a", fontWeight: 700 }}>毎月</span>
                    <select value={r.day || ""} onChange={(ev) => updateRecurring(r.id, { day: ev.target.value })} style={{ border: "1px solid #FFE9B0", borderRadius: 8, padding: "8px 4px", fontSize: 13, outline: "none", background: "#fff", color: "#5C3344" }}>
                      <option value="">--</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((dd) => <option key={dd} value={dd}>{dd}</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: "#c9971a", fontWeight: 700 }}>日</span>
                  </div>
                  <input
                    type="number"
                    placeholder="金額(任意)"
                    value={r.amount || ""}
                    onChange={(ev) => updateRecurring(r.id, { amount: ev.target.value })}
                    style={{ width: 100, border: "1px solid #FFE9B0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }}
                  />
                  <button onClick={() => removeRecurring(r.id)} style={{ background: "#fff0f0", border: "none", borderRadius: 8, padding: "8px 10px", color: "#FF6B6B", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>削除</button>
                </div>
                );
              })}
            </div>

            {dates.map((d, i) => {
              const dateStr = d.toDateString();
              const isWeekend = i >= 5;
              const isToday = d.toDateString() === new Date().toDateString();
              const list = getExpenseList(dateStr);
              const dayTotal = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
              return (
                <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 10, border: isToday ? "2px solid #FFC93C" : "2px solid transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: list.length ? 10 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isWeekend ? "#FF4D8D" : "#D4789F" }}>{DAYS[i]}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? "#FFC93C" : "#5C3344" }}>{formatDate(d)}</div>
                      {dayTotal > 0 && <div style={{ fontSize: 12, color: "#8FA8FF", fontWeight: 700 }}>計 {formatYen(dayTotal)}</div>}
                    </div>
                    <button onClick={() => addExpense(dateStr)} style={{ background: "#EEF1FF", color: "#7B8FE8", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      + 追加
                    </button>
                  </div>
                  {list.map((e) => (
                    <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <input
                        placeholder="費目(例: 備品)"
                        list="expense-cat-list"
                        value={e.category || ""}
                        onChange={(ev) => updateExpense(dateStr, e.id, { category: ev.target.value })}
                        style={{ flex: 1, border: "1px solid #E0E4FF", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }}
                      />
                      <input
                        type="number"
                        placeholder="金額"
                        value={e.amount || ""}
                        onChange={(ev) => updateExpense(dateStr, e.id, { amount: ev.target.value })}
                        style={{ width: 100, border: "1px solid #E0E4FF", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }}
                      />
                      <button onClick={() => removeExpense(dateStr, e.id)} style={{ background: "#fff0f0", border: "none", borderRadius: 8, padding: "8px 10px", color: "#FF6B6B", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {tab === "summary" && (
          <div>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(255,107,157,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#5C3344" }}>📅 月間集計</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={prevMonth} style={{ background: "#FFF0F5", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: "#FF6B9D", fontWeight: 700 }}>←</button>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#5C3344" }}>{summaryYear}年{summaryMonth + 1}月</div>
                  <button onClick={nextMonth} style={{ background: "#FFF0F5", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: "#FF6B9D", fontWeight: 700 }}>→</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "80px repeat(3, 1fr)", gap: 4, marginBottom: 8 }}>
                <div />
                {STAT_ITEMS.map(({ label, color, emoji }) => (
                  <div key={label} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color }}>{emoji}{label}</div>
                ))}
              </div>
              {[...cast].sort((a, b) => monthStatTotal(b.id, "shimei") - monthStatTotal(a.id, "shimei")).map((member) => (
                <div key={member.id} style={{ display: "grid", gridTemplateColumns: "80px repeat(3, 1fr)", gap: 4, marginBottom: 6, background: "#FFF5F8", borderRadius: 10, padding: "8px 10px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#5C3344" }}>{member.name}</div>
                    <div style={{ fontSize: 10, color: rankColor(member.rank) }}>{member.rank}</div>
                  </div>
                  {STAT_ITEMS.map(({ key, color }) => (
                    <div key={key} style={{ textAlign: "center", fontWeight: 800, fontSize: 20, color }}>{monthStatTotal(member.id, key)}</div>
                  ))}
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "80px repeat(3, 1fr)", gap: 4, marginTop: 8, borderTop: "2px solid #FFD9E8", paddingTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#D4789F" }}>合計</div>
                {STAT_ITEMS.map(({ key, color }) => (
                  <div key={key} style={{ textAlign: "center", fontWeight: 800, fontSize: 20, color }}>
                    {cast.reduce((sum, m) => sum + monthStatTotal(m.id, key), 0)}
                  </div>
                ))}
              </div>
            </div>
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
                  <input placeholder="ランク(自由入力)" value={newRank} onChange={(e) => setNewRank(e.target.value)} style={{ border: "1.5px solid #FFD9E8", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", background: "#fff", minWidth: 120 }} />
                  <button onClick={addCast} style={{ background: "#FF8FAB", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>追加</button>
                  <button onClick={() => setShowAddForm(false)} style={{ background: "#FFF0F5", color: "#D4789F", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}>キャンセル</button>
                </div>
              </div>
            )}
            {cast.map((member, idx) => (
              <div key={member.id} style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                {editingCast?.id !== member.id && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                    <button onClick={() => moveCast(idx, -1)} disabled={idx === 0} title="上へ" style={{ width: 30, height: 24, border: "1px solid #FFD9E8", borderRadius: 6, background: idx === 0 ? "#f7f7f7" : "#fff", color: idx === 0 ? "#ccc" : "#FF6B9D", cursor: idx === 0 ? "default" : "pointer", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>▲</button>
                    <button onClick={() => moveCast(idx, 1)} disabled={idx === cast.length - 1} title="下へ" style={{ width: 30, height: 24, border: "1px solid #FFD9E8", borderRadius: 6, background: idx === cast.length - 1 ? "#f7f7f7" : "#fff", color: idx === cast.length - 1 ? "#ccc" : "#FF6B9D", cursor: idx === cast.length - 1 ? "default" : "pointer", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>▼</button>
                  </div>
                )}
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg, ${rankColor(member.rank)}, #FF8FAB)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20 }}>{member.name[0]}</div>
                {editingCast?.id === member.id ? (
                  <div style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={editingCast.name} onChange={(e) => setEditingCast({ ...editingCast, name: e.target.value })} style={{ flex: 1, minWidth: 120, border: "1.5px solid #FF8FAB", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none" }} />
                    <input placeholder="ランク(自由入力)" value={editingCast.rank} onChange={(e) => setEditingCast({ ...editingCast, rank: e.target.value })} style={{ border: "1.5px solid #FFD9E8", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", background: "#fff", minWidth: 120 }} />
                    <input placeholder="🔑 パスワード(半角英数)" value={editingCast.password || ""} onChange={(e) => setEditingCast({ ...editingCast, password: e.target.value })} style={{ border: "1.5px solid #FFC93C", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", background: "#FFFDF5", minWidth: 150 }} />
                    <button onClick={saveEdit} style={{ background: "#FF8FAB", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>保存</button>
                    <button onClick={() => setEditingCast(null)} style={{ background: "#FFF0F5", color: "#D4789F", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>キャンセル</button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{member.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: rankColor(member.rank), marginTop: 2 }}>{member.rank}</div>
                      <div style={{ fontSize: 11, marginTop: 3, fontWeight: 700, color: member.password ? "#c9971a" : "#FF6B6B" }}>
                        🔑 {member.password ? member.password : "パスワード未設定"}
                      </div>
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

        {tab === "requests" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>LINEからの希望シフト</div>

            <div style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#5C3344" }}>LINE提出画面に確定シフト表を表示</div>
                <div style={{ fontSize: 11, color: "#D4789F", marginTop: 2 }}>キャストの希望提出画面で、確定済みシフトを見せるかどうかです</div>
              </div>
              <button
                onClick={() => updateSettings({ ...settings, showConfirmedShifts: !settings.showConfirmedShifts })}
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 20,
                  border: "none",
                  cursor: "pointer",
                  background: settings.showConfirmedShifts ? "linear-gradient(135deg, #FF8FAB, #FF6B9D)" : "#e0e0e0",
                  position: "relative",
                  flexShrink: 0,
                  marginLeft: 12,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: 3,
                    left: settings.showConfirmedShifts ? 25 : 3,
                    transition: "left 0.15s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </button>
            </div>

            {pendingRequests.length === 0 && (
              <div style={{ textAlign: "center", color: "#D4789F", padding: 40, background: "#fff", borderRadius: 14 }}>
                現在、届いている希望シフトはありません
              </div>
            )}
            {pendingRequests.map(([key, req]) => {
              const member = cast.find((c) => String(c.id) === String(req.castId));
              const entryList = Object.entries(req.entries || {}).sort(
                (a, b) => new Date(a[0]) - new Date(b[0])
              );
              return (
                <div key={key} style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, border: "2px solid #FFD9E8" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{member?.name || "不明なキャスト"}</div>
                      <div style={{ fontSize: 11, color: "#D4789F" }}>
                        {req.lineName ? `LINE: ${req.lineName}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#D4789F" }}>
                      {req.weekStart}週
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {entryList.map(([dateStr, entry]) => {
                      const d = new Date(dateStr);
                      const isWork = entry.status === "work";
                      return (
                        <div key={dateStr} style={{ background: isWork ? "#FFF0F5" : "#f5f5f5", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
                          <div style={{ fontWeight: 700 }}>{d.getMonth() + 1}/{d.getDate()}({DAYS[(d.getDay() + 6) % 7]})</div>
                          <div style={{ color: isWork ? "#FF6B9D" : "#999" }}>
                            {isWork ? `${entry.in || "?"}〜${entry.out || "?"}` : "休み希望"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => approveRequest(key, req)} style={{ flex: 1, background: "linear-gradient(135deg, #6BCB77, #4CAF50)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, cursor: "pointer" }}>
                      承認してシフトに反映
                    </button>
                    <button onClick={() => rejectRequest(key)} style={{ background: "#FFF0F5", color: "#D4789F", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer" }}>
                      却下
                    </button>
                    <button onClick={() => deleteRequest(key)} style={{ background: "#fff0f0", color: "#FF6B6B", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer" }}>
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
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
              <div style={{ borderTop: "1px solid #FFF0F5", paddingTop: 14, marginTop: 4, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 20 }}>💴</div>
                  <div style={{ flex: 1, fontWeight: 600 }}>個人売上</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFF5F8", borderRadius: 10, padding: "8px 12px", border: "1.5px solid #FFD9E8", marginTop: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#FFB6D5" }}>¥</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={stat.sales || ""}
                    onChange={(e) => updateStat(castId, dateStr, { sales: e.target.value })}
                    style={{ flex: 1, border: "none", background: "transparent", fontSize: 16, fontWeight: 700, color: "#5C3344", outline: "none" }}
                  />
                </div>
              </div>
              <button onClick={closeDetail} style={{ width: "100%", background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 8 }}>閉じる</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
