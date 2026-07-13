import { useState, useEffect } from "react";
import liff from "@line/liff";
import { db } from "./firebase";
import { ref, push, onValue } from "firebase/database";

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

// ↓ LINE Developersコンソールで発行したLIFF IDに置き換えてください
const LIFF_ID = "2010692487-HEfxObPq";

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
      <div style={{ padding: 60, textAlign: "center", color: "#D4789F" }}>
        読み込み中...
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        style={{
          padding: 60,
          textAlign: "center",
          fontWeight: 700,
          fontSize: 18,
          color: "#FF6B9D",
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
        background: "#FFF5F8",
        padding: 20,
      }}
    >
      <h2 style={{ color: "#5C3344", textAlign: "center", marginBottom: 4 }}>
        希望シフト提出
      </h2>
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
                <input
                  type="time"
                  value={entry.in || ""}
                  onChange={(e) => updateEntry(dateStr, { in: e.target.value })}
                  style={{
                    flex: 1,
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #FFD9E8",
                  }}
                />
                <span style={{ alignSelf: "center" }}>〜</span>
                <input
                  type="time"
                  value={entry.out || ""}
                  onChange={(e) => updateEntry(dateStr, { out: e.target.value })}
                  style={{
                    flex: 1,
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #FFD9E8",
                  }}
                />
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
