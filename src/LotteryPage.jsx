import { useState, useEffect } from "react";
import liff from "@line/liff";
import { db } from "./firebase";
import { ref, onValue, set, get } from "firebase/database";

const LIFF_ID = "2010692487-HEfxObPq";

const BG = {
  background: "linear-gradient(135deg, #FFF0F5, #FFE4EF)",
  minHeight: "100vh",
};

function todayKey() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

export default function LotteryPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [baseProb, setBaseProb] = useState(0.0001);
  const [perShift, setPerShift] = useState(0);
  const [vacancy, setVacancy] = useState("");
  const [myShiftDays, setMyShiftDays] = useState(0);
  const [alreadyToday, setAlreadyToday] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [rolling, setRolling] = useState("🎰");

  useEffect(() => {
    liff
      .init({ liffId: LIFF_ID })
      .then(() => {
        if (!liff.isLoggedIn()) { liff.login(); return null; }
        return liff.getProfile();
      })
      .then((p) => { if (p) setProfile(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const settingsRef = ref(db, "shiftapp/settings");
    const unsub = onValue(settingsRef, (snap) => {
      const s = snap.val() || {};
      if (typeof s.lotteryProb === "number") setBaseProb(s.lotteryProb);
      if (typeof s.lotteryPerShift === "number") setPerShift(s.lotteryPerShift);
      setVacancy(s.lotteryVacancy || "");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile || !profile.userId) return;
    let castId = null;
    get(ref(db, "castLine")).then((snap) => {
      const cl = snap.val() || {};
      for (const key in cl) {
        if (cl[key] && cl[key].lineUserId === profile.userId) { castId = cl[key].castId; break; }
      }
      if (!castId) return;
      get(ref(db, "shiftapp/shifts")).then((s2) => {
        const shifts = s2.val() || {};
        const now = new Date();
        const day = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        let cnt = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          const ds = d.toDateString();
          const sh = (shifts[castId] || {})[ds];
          if (sh && sh.status !== "off" && sh.in) cnt++;
        }
        setMyShiftDays(cnt);
      });
    }).catch(() => {});
  }, [profile]);

  useEffect(() => {
    if (!profile || !profile.userId) return;
    const r = ref(db, "lottery/" + profile.userId + "/" + todayKey());
    get(r).then((snap) => {
      if (snap.exists()) {
        setAlreadyToday(true);
        setResult(snap.val().result || null);
      }
    }).catch(() => {});
  }, [profile]);

  const finalProb = baseProb + myShiftDays * perShift;

  const doSpin = async () => {
    if (spinning || alreadyToday) return;
    setSpinning(true);
    setResult(null);
    const faces = ["🎰", "🎁", "💎", "🌸", "⭐", "🍀", "💰"];
    let count = 0;
    const timer = setInterval(() => { setRolling(faces[count % faces.length]); count++; }, 100);
    await new Promise((r) => setTimeout(r, 2500));
    clearInterval(timer);

    const isWin = Math.random() * 100 < finalProb;
    const res = isWin ? "win" : "lose";
    setResult(res);
    setRolling(isWin ? "🎉" : "😢");
    setSpinning(false);
    setAlreadyToday(true);

    const uid = (profile && profile.userId) ? profile.userId : ("guest_" + Date.now());
    const dname = (profile && profile.displayName) ? profile.displayName : "ゲスト";

    try {
      await set(ref(db, "lottery/" + uid + "/" + todayKey()), {
        castName: dname,
        lineUserId: (profile && profile.userId) ? profile.userId : "",
        result: res,
        prob: finalProb,
        playedAt: Date.now(),
      });
    } catch (e) { /* noop */ }

    if (isWin) {
      try {
        await fetch("/api/send-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toAdmin: true,
            text: "🎉 抽選当選のお知らせ\n\n" + dname + "さんが「当日雑費全額無料」に当選しました！",
          }),
        });
      } catch (e) { /* noop */ }
    }
  };

  if (loading) {
    return (
      <div style={{ ...BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#FF6B9D", fontWeight: 700, fontSize: 16 }}>読み込み中...</div>
      </div>
    );
  }

  return (
    <div style={{ ...BG, fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}>
      {vacancy && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "14px 18px", width: "100%", maxWidth: 380, marginBottom: 16, boxShadow: "0 4px 16px rgba(255,107,157,0.15)", marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#FF6B9D", marginBottom: 6 }}>🏠 本日の空き状況</div>
          <div style={{ fontSize: 14, color: "#5C3344", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{vacancy}</div>
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 24, padding: "28px 24px", width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 8px 30px rgba(255,107,157,0.25)" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#FF6B9D", marginBottom: 4 }}>🎰 全額雑費無料抽選</div>
        <div style={{ fontSize: 13, color: "#D4789F", marginBottom: 6 }}>
          {profile ? profile.displayName + "さん" : "ようこそ"}
        </div>
        {perShift > 0 && myShiftDays > 0 && (
          <div style={{ fontSize: 11, color: "#C97F0A", background: "#FFF9E5", borderRadius: 10, padding: "6px 10px", marginBottom: 14, display: "inline-block" }}>
            今週{myShiftDays}日出勤 → 当たりやすさUP中✨
          </div>
        )}

        <div style={{ fontSize: 80, marginBottom: 16, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {rolling}
        </div>

        {result === "win" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#FF4D8D", marginBottom: 8 }}>🎉 大当たり！ 🎉</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#5C3344" }}>当日雑費 全額無料！</div>
            <div style={{ fontSize: 12, color: "#D4789F", marginTop: 8 }}>スタッフにこの画面を見せてくださいね</div>
          </div>
        )}
        {result === "lose" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#999", marginBottom: 8 }}>残念、はずれ…</div>
            <div style={{ fontSize: 13, color: "#D4789F" }}>また明日チャレンジしてね🌸</div>
          </div>
        )}

        {!alreadyToday && !result && (
          <button
            onClick={doSpin}
            disabled={spinning}
            style={{ width: "100%", background: spinning ? "#FFC0D8" : "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", border: "none", borderRadius: 16, padding: "16px 0", fontWeight: 800, fontSize: 18, cursor: spinning ? "default" : "pointer", boxShadow: "0 4px 16px rgba(255,107,157,0.4)" }}
          >
            {spinning ? "抽選中..." : "🎰 抽選する"}
          </button>
        )}

        {alreadyToday && (
          <div style={{ fontSize: 13, color: "#D4789F", marginTop: 8, background: "#FFF0F5", borderRadius: 12, padding: "12px" }}>
            本日の抽選は終了しました。<br />また明日チャレンジしてね🌸
          </div>
        )}
      </div>
    </div>
  );
}
