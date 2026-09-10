import { useState } from "react";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";

// 黒地に白い線が交差する背景デザイン(App.jsxと共通)
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

const S = {
  page: { fontFamily: "'Segoe UI','Noto Sans JP',sans-serif", minHeight: "100vh", ...DARK_LINE_BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { background: "#fff", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 380, boxShadow: "0 8px 30px rgba(255,107,157,0.25)", boxSizing: "border-box" },
  title: { fontWeight: 800, fontSize: 20, color: "#5C3344", textAlign: "center", marginBottom: 2 },
  sub: { fontSize: 13, color: "#D4789F", textAlign: "center", marginBottom: 18, fontWeight: 700 },
  label: { fontSize: 12, fontWeight: 700, color: "#5C3344", marginBottom: 4, display: "block" },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #FFD9E8", fontSize: 16, outline: "none", marginBottom: 12 },
  primary: { width: "100%", background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 16px rgba(255,107,157,0.35)" },
  link: { background: "none", border: "none", color: "#D4789F", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "6px 0", textDecoration: "underline" },
  err: { background: "#FFF0F0", color: "#E05252", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, marginBottom: 12 },
  info: { background: "#EAF7EC", color: "#2E7D32", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, marginBottom: 12 },
};

// Firebase のエラーコードを日本語に
function message(err) {
  const code = (err && err.code) || "";
  const map = {
    "auth/invalid-email": "メールアドレスの形式が正しくありません。",
    "auth/user-not-found": "このメールアドレスは登録されていません。",
    "auth/wrong-password": "パスワードが違います。",
    "auth/invalid-credential": "メールアドレスかパスワードが違います。",
    "auth/email-already-in-use": "このメールアドレスはすでに登録されています。「ログイン」からお入りください。",
    "auth/weak-password": "パスワードは6文字以上にしてください。",
    "auth/too-many-requests": "しばらく時間をおいてからもう一度お試しください。",
    "auth/network-request-failed": "通信できませんでした。電波状況を確認してください。",
    "auth/operation-not-allowed": "メールでのログインがまだ有効になっていません(Firebaseの設定で「メール／パスワード」を有効にしてください)。",
  };
  return map[code] || `エラーが起きました(${code || (err && err.message) || "不明"})`;
}

// お店のログイン / 新規登録 / パスワード再設定
export function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setInfo("");
    const em = email.trim();
    if (!em) { setErr("メールアドレスを入力してください。"); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, em, pw);
      } else if (mode === "signup") {
        if (pw.length < 6) { setErr("パスワードは6文字以上にしてください。"); return; }
        if (pw !== pw2) { setErr("パスワード(確認)が一致しません。"); return; }
        const cred = await createUserWithEmailAndPassword(auth, em, pw);
        try { await sendEmailVerification(cred.user); } catch {}
      } else {
        await sendPasswordResetEmail(auth, em);
        setInfo("パスワード再設定のメールを送りました。メール内のリンクから新しいパスワードを設定してください。");
        setMode("login");
      }
    } catch (e2) {
      setErr(message(e2));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "お店のログイン" : mode === "signup" ? "お店の新規登録" : "パスワード再設定";

  return (
    <div style={S.page}>
      <form style={S.card} onSubmit={submit}>
        <div style={{ textAlign: "center", fontSize: 36, marginBottom: 4 }}>🌸</div>
        <div style={S.title}>キャスト管理</div>
        <div style={S.sub}>{title}</div>
        <label style={S.label}>メールアドレス</label>
        <input style={S.input} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        {mode !== "reset" && (<>
          <label style={S.label}>パスワード{mode === "signup" ? "(6文字以上)" : ""}</label>
          <input style={S.input} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
        </>)}
        {mode === "signup" && (<>
          <label style={S.label}>パスワード(確認)</label>
          <input style={S.input} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </>)}
        {err && <div style={S.err}>{err}</div>}
        {info && <div style={S.info}>{info}</div>}
        <button style={{ ...S.primary, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
          {busy ? "お待ちください..." : mode === "login" ? "ログイン" : mode === "signup" ? "登録する" : "再設定メールを送る"}
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 12 }}>
          {mode !== "login" && <button type="button" style={S.link} onClick={() => { setMode("login"); setErr(""); }}>ログインへ戻る</button>}
          {mode === "login" && <button type="button" style={S.link} onClick={() => { setMode("signup"); setErr(""); }}>はじめてのお店の方(新規登録)</button>}
          {mode === "login" && <button type="button" style={S.link} onClick={() => { setMode("reset"); setErr(""); }}>パスワードを忘れた</button>}
        </div>
      </form>
    </div>
  );
}

// 確認メールのリンクを押すまで先に進めない画面
export function VerifyScreen({ user }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const resend = async () => {
    setBusy(true); setMsg("");
    try { await sendEmailVerification(user); setMsg("確認メールをもう一度送りました。"); }
    catch (e) { setMsg(message(e)); }
    finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setMsg("");
    try {
      await user.reload();
      if (user.emailVerified) window.location.reload();
      else setMsg("まだ確認できていません。メール内のリンクを押してから、もう一度お試しください。");
    } finally { setBusy(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ textAlign: "center", fontSize: 36, marginBottom: 4 }}>📩</div>
        <div style={S.title}>メールの確認</div>
        <p style={{ fontSize: 13, color: "#5C3344", lineHeight: 1.8, margin: "12px 0 16px" }}>
          <b>{user.email}</b> に確認メールを送りました。<br />
          メールの中のリンクを押してから、下の「確認しました」を押してください。<br />
          届かないときは迷惑メールフォルダも確認してください。
        </p>
        {msg && <div style={S.info}>{msg}</div>}
        <button style={S.primary} onClick={check} disabled={busy}>確認しました</button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 12 }}>
          <button type="button" style={S.link} onClick={resend} disabled={busy}>確認メールを再送信</button>
          <button type="button" style={S.link} onClick={() => signOut(auth)}>別のメールでやり直す(ログアウト)</button>
        </div>
      </div>
    </div>
  );
}
