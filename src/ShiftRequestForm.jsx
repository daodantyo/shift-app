import { useState, useEffect } from "react";
import liff from "@line/liff";
import { db } from "./firebase";
import { ref, push, onValue } from "firebase/database";

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

// 黒地に白い線が交差する背景デザイン(App.jsxと共通デザイン)
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

// ↓ LINE Developersコンソールで発行したLIFF IDに置き換えてください
const LIFF_ID = "2010692487-HEfxObPq";

// ↓ 女の子に伝える「合言葉」。ここの文字を変えれば合言葉が変わります
const REQUEST_PASSWORD = "123456789";

function TimeSelect({ value, onChange }) {
  const [h, m] = (value || "").split(":");
  const hour = h || "";
  const minute = m || "";
  const setHour = (newH) => onChange(newH && minute ? `${newH}:${minute}` : newH ? `${newH}:00` : "");
  const setMinute = (newM) => onChange(hour ? `${hour}:${newM}` : "");
  const selectStyle = {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: "1px solid #FFD9E8",
    background: "#fff",
    fontSize: 14,
  };
  return (
    <div style={{ display: "flex", gap: 4, flex: 1 }}>
      <select value={hour} onChange={(e) => setHour(e.target.value)} style={selectStyle}>
        <option value="">--</option>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((hh) => (
          <option key={hh} value={hh}>{hh}</option>
        ))}
      </select>
      <select value={minute} onChange={(e) => setMinute(e.target.value)} style={selectStyle}>
        <option value="">--</option>
        <option value="00">00</option>
        <option value="30">30</option>
      </select>
    </div>
  );
}

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

function getMonthDates(monthOffset = 1) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
}

export default function ShiftRequestForm() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [castList, setCastList] = useState([]);
  const [selectedCastId, setSelectedCastId] = useState("");
  const [entries, setEntries] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [requestView, setRequestView] = useState("week");
  const [monthOffset, setMonthOffset] = useState(1);
  const [showConfirmedShifts, setShowConfirmedShifts] = useState(true);

  // 合言葉(1回入れたらそのスマホでは次から不要)
  const [unlocked, setUnlocked] = useState(
    typeof window !== "undefined" && localStorage.getItem("shiftRequestUnlocked") === "1"
  );
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const tryUnlock = () => {
    if (pwInput.trim() === REQUEST_PASSWORD) {
      localStorage.setItem("shiftRequestUnlocked", "1");
      setUnlocked(true);
      setPwError("");
    } else {
      setPwError("合言葉がちがいます");
      setPwInput("");
    }
  };

  // 来週分の希望を出す想定(必要なら offset を 0 に変えて今週分にできます)
  const weekDates = getWeekDates(1);
  const monthDates = getMonthDates(monthOffset);
  const dates = requestView === "week" ? weekDates : monthDates;

  const switchView = (v) => {
    setRequestView(v);
    setEntries({});
  };

  useEffect(() => {
    liff
      .init({ liffId: LIFF_ID })
      .then(() => {
        if (!liff.isLoggedIn()) {
          liff.login();
          return null;
        }
        return liff.getProfile();
      })
      .then((p) => {
        if (p) setProfile(p);
        setReady(true);
      })
      .catch((e) => setError("LINEの初期化に失敗しました: " + e.message));
  }, []);

  useEffect(() => {
    const castRef = ref(db, "shiftapp/cast");
    const unsub = onValue(castRef, (snap) => {
      const data = snap.val();
      if (data) setCastList(data);
    });
    return () => unsub();
  }, []);

  const [confirmedShifts, setConfirmedShifts] = useState({});

  useEffect(() => {
    const shiftsRef = ref(db, "shiftapp/shifts");
    const unsub = onValue(shiftsRef, (snap) => {
      setConfirmedShifts(snap.val() || {});
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const settingsRef = ref(db, "shiftapp/settings");
    const unsub = onValue(settingsRef, (snap) => {
      const data = snap.val();
      // 未設定の場合は表示する(true)がデフォルト
      setShowConfirmedShifts(data && data.showConfirmedShifts === false ? false : true);
    });
    return () => unsub();
  }, []);

  const getConfirmedShift = (castId, dateStr) =>
    (confirmedShifts[castId] || {})[dateStr] || { status: "off", in: "", out: "" };

  const updateEntry = (dateStr, patch) => {
    setEntries((prev) => ({
      ...prev,
      [dateStr]: { ...(prev[dateStr] || { status: "off" }), ...patch },
    }));
  };

  const submit = () => {
    if (!selectedCastId) {
      setError("お名前を選択してください");
      return;
    }
    setError("");
    const requestsRef = ref(db, "shiftRequests");
    push(requestsRef, {
      castId: selectedCastId,
      lineUserId: profile?.userId || null,
      lineName: profile?.displayName || null,
      periodType: requestView,
      weekStart: dates[0].toDateString(),
      entries,
      createdAt: Date.now(),
      status: "pending",
    }).then(() => setSubmitted(true));
  };

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", padding: 60, textAlign: "center", color: "#D4789F", ...DARK_LINE_BG }}>
        読み込み中...
      </div>
    );
  }

  // 合言葉が未入力のあいだは、この画面だけを表示する
  if (!unlocked) {
    return (
      <div style={{ fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", ...DARK_LINE_BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: "28px 22px", width: "100%", maxWidth: 340, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
          <div style={{ textAlign: "center", fontSize: 34, marginBottom: 6 }}>🌸</div>
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 17, color: "#5C3344", marginBottom: 4 }}>希望シフト提出</div>
          <div style={{ textAlign: "center", fontSize: 12, color: "#D4789F", marginBottom: 18 }}>お店から聞いた合言葉を入れてね</div>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
            placeholder="合言葉"
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #FFD9E8", fontSize: 16, outline: "none", textAlign: "center" }}
          />
          {pwError && <div style={{ color: "#FF6B6B", fontSize: 12, textAlign: "center", marginTop: 8, fontWeight: 700 }}>{pwError}</div>}
          <button
            onClick={tryUnlock}
            style={{ width: "100%", marginTop: 14, padding: 13, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}
          >
            はいる
          </button>
          <div style={{ textAlign: "center", fontSize: 11, color: "#FFB6D5", marginTop: 12 }}>一度入れたら次回からは省略されます</div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 60,
          textAlign: "center",
          fontWeight: 700,
          fontSize: 18,
          color: "#FF6B9D",
          ...DARK_LINE_BG,
        }}
      >
        🌸 希望シフトを送信しました!
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "'Segoe UI','Noto Sans JP',sans-serif",
        minHeight: "100vh",
        ...DARK_LINE_BG,
        padding: 20,
      }}
    >
      <h2 style={{ color: "#5C3344", textAlign: "center", marginBottom: 4 }}>
        希望シフト提出
      </h2>

      {showConfirmedShifts && (
      <div style={{ marginBottom: 16 }}>
        <div
          style={{ fontWeight: 700, color: "#5C3344", fontSize: 13, marginBottom: 6 }}
        >
          🌸 現在のシフト表(確定分)
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
          {dates.map((d, i) => {
            const dateStr = d.toDateString();
            const isToday = d.toDateString() === new Date().toDateString();
            const working = castList
              .filter((c) => getConfirmedShift(c.id, dateStr).status !== "off")
              .sort((a, b) => (getConfirmedShift(a.id, dateStr).in || "99:99").localeCompare(getConfirmedShift(b.id, dateStr).in || "99:99"));
            return (
              <div
                key={i}
                style={{
                  background: isToday ? "rgba(255,199,60,0.15)" : "#fff",
                  borderRadius: 10,
                  padding: "6px 6px",
                  border: isToday ? "1.5px solid #FFC93C" : "1.5px solid #FFD9E8",
                  minWidth: 78,
                  flexShrink: 0,
                }}
              >
                <div style={{ textAlign: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#D4789F" }}>
                    {requestView === "week" ? DAYS[i] : DAYS[(d.getDay() + 6) % 7]}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: isToday ? "#FFC93C" : "#5C3344" }}>
                    {d.getMonth() + 1}/{d.getDate()}
                  </div>
                </div>
                {working.length === 0 ? (
                  <div style={{ textAlign: "center", fontSize: 8, color: "#FFB6D5" }}>なし</div>
                ) : (
                  working.map((c) => {
                    const s = getConfirmedShift(c.id, dateStr);
                    return (
                      <div key={c.id} style={{ marginBottom: 2 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#5C3344", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name}
                        </div>
                        {s.in && (
                          <div style={{ fontSize: 8, color: "#D4789F", textAlign: "center" }}>
                            {s.in}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}
      {false && profile && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 16,
            color: "#D4789F",
            fontSize: 13,
          }}
        >
          LINE: {profile.displayName}
        </div>
      )}
      {error && (
        <div style={{ color: "#FF6B6B", textAlign: "center", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 700, color: "#5C3344", fontSize: 13 }}>
          お名前を選択
        </label>
        <select
          value={selectedCastId}
          onChange={(e) => setSelectedCastId(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            marginTop: 6,
            borderRadius: 8,
            border: "1px solid #FFD9E8",
          }}
        >
          <option value="">選択してください</option>
          {castList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[{ id: "week", label: "週間" }, { id: "month", label: "月間" }].map((v) => (
          <button
            key={v.id}
            onClick={() => switchView(v.id)}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              background: requestView === v.id ? "linear-gradient(135deg, #FFB6D5, #FF8FAB)" : "#fff",
              color: requestView === v.id ? "#fff" : "#D4789F",
              boxShadow: requestView === v.id ? "0 2px 8px rgba(255,107,157,0.3)" : "none",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {requestView === "week" && (
        <div style={{ marginBottom: 12, fontWeight: 700, color: "#5C3344" }}>
          {dates[0].getMonth() + 1}/{dates[0].getDate()} 〜 {dates[dates.length - 1].getMonth() + 1}/
          {dates[dates.length - 1].getDate()} の希望(来週分)
        </div>
      )}

      {requestView === "month" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button
            onClick={() => setMonthOffset((m) => m - 1)}
            style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}
          >
            ← 前月
          </button>
          <div style={{ fontWeight: 700, color: "#5C3344" }}>
            {dates[0].getFullYear()}年{dates[0].getMonth() + 1}月 の希望
          </div>
          <button
            onClick={() => setMonthOffset((m) => m + 1)}
            style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, color: "#FF6B9D" }}
          >
            次月 →
          </button>
        </div>
      )}

      {dates.map((d, i) => {
        const dateStr = d.toDateString();
        const entry = entries[dateStr] || { status: "off" };
        const isWork = entry.status === "work";
        const dayLabel = requestView === "week" ? DAYS[i] : DAYS[(d.getDay() + 6) % 7];
        return (
          <div
            key={i}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {dayLabel} {d.getMonth() + 1}/{d.getDate()}
              </div>
              <button
                onClick={() =>
                  updateEntry(dateStr, { status: isWork ? "off" : "work" })
                }
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                  color: isWork ? "#fff" : "#999",
                  background: isWork ? "#FF6B9D" : "#eee",
                }}
              >
                {isWork ? "出勤希望" : "休み希望"}
              </button>
            </div>
            {isWork && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <TimeSelect value={entry.in || ""} onChange={(v) => updateEntry(dateStr, { in: v })} />
                <span style={{ alignSelf: "center" }}>〜</span>
                <TimeSelect value={entry.out || ""} onChange={(v) => updateEntry(dateStr, { out: v })} />
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={submit}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 10,
          border: "none",
          background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
          marginTop: 12,
          cursor: "pointer",
        }}
      >
        送信する
      </button>
    </div>
  );
}
