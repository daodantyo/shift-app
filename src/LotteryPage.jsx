import { useState, useEffect } from "react";
import liff from "@line/liff";
import { db } from "./firebase";
import { ref, onValue, set, get } from "firebase/database";

const LIFF_ID = "2010692487-HEfxObPq";

// 黒に白い線が交差する背景(アプリ本体と合わせる)
const BG = {
  background: "linear-gradient(135deg, #FFF0F5, #FFE4EF)",
  minHeight: "100vh",
};

export default function LotteryPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prob, setProb] = useState(0.0001); // 当たる確率(%) 初期0.0001%
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null); // "win" | "lose" | null
  const [rolling, setRolling] = useState("🎰");

  // LINEログインして本人を特定
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
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 確率を読み込む
  useEffect(() => {
    const settingsRef = ref(db, "shiftapp/settings");
    const unsub = onValue(settingsRef, (snap) => {
      const s = snap.val() || {};
      if (typeof s.lotteryProb === "number") setProb(s.lotteryProb);
    });
    return () => unsub();
  }, []);

  // すでに引いたことがあるか確認
  useEffect(() => {
    if (!profile?.userId) return;
    const r = ref(db, "lottery/" + profile.userId);
    get(r).then((snap) => {
      if (snap.exists()) {
        setAlreadyPlayed(true);
        const v = snap.val();
        setResult(v.result || null);
      }
    }).catch(() => {});
  }, [profile]);

  const doSpin = async () => {
    if (spinning || alreadyPlayed || !profile?.userId) return;
    setSpinning(true);
    setResult(null);

    // ガラガラ演出(絵文字を回す)
    const faces = ["🎰", "🎁", "💎", "🌸", "⭐", "🍀", "💰"];
    let count = 0;
    const timer = setInterval(() => {
      setRolling(faces[count % faces.length]);
      count++;
    }, 100);

    // 2.5秒回してから結果
    await new Promise((r) => setTimeout(r, 2500));
    clearInterval(timer);

    // 抽選(prob% の確率で当たり)
    const isWin = Math.random() * 100 < prob;
    const res = isWin ? "win" : "lose";
    setResult(res);
    setRolling(isWin ? "🎉" : "😢");
    setSpinning(false);
    setAlreadyPlayed(true);

    // 記録を保存(1人1回)
    try {
      await set(ref(db, "lottery/" + profile.userId), {
        castName: profile.displayName || "",
        lineUserId: profile.userId,
        result: res,
        playedAt: Date.now(),
      });
    } catch {}

    // 当たったら管理者に通知
    if (isWin) {
      try {
        await fetch("/api/send-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toAdmin: true,
            text: `🎉 抽選当選のお知らせ\n\n${profile.displayName || "キャスト"}さんが「当日雑費全額無料」に当選しました！`,
          }),
        });
      } catch {}
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
    <div style={{ ...BG, fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: "32px 24px", width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 8px 30px rgba(255,107,157,0.25)" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#FF6B9D", marginBottom: 4 }}>🎰 お楽しみ抽選</div>
        <div style={{ fontSize: 13, color: "#D4789F", marginBottom: 24 }}>
          {profile ? `${profile.displayName}さん` : "ようこそ"}
        </div>

        <div style={{ fontSize: 80, marginBottom: 20, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
            <div style={{ fontSize: 13, color: "#D4789F" }}>また次の機会にチャレンジしてね🌸</div>
          </div>
        )}

        {!alreadyPlayed && !result && (
          <button
            onClick={doSpin}
            disabled={spinning || !profile}
            style={{
              width: "100%",
              background: spinning ? "#FFC0D8" : "linear-gradient(135deg, #FF8FAB, #FF6B9D)",
              color: "#fff",
              border: "none",
              borderRadius: 16,
              padding: "16px 0",
              fontWeight: 800,
              fontSize: 18,
              cursor: spinning ? "default" : "pointer",
              boxShadow: "0 4px 16px rgba(255,107,157,0.4)",
            }}
          >
            {spinning ? "抽選中..." : "🎰 抽選する"}
          </button>
        )}

        {alreadyPlayed && (
          <div style={{ fontSize: 13, color: "#D4789F", marginTop: 8, background: "#FFF0F5", borderRadius: 12, padding: "12px" }}>
            この抽選は、お一人様1回までです。<br />ご参加ありがとうございました🌸
          </div>
        )}
      </div>
    </div>
  );
}
