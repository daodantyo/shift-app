// Google の許可(ログインと「予定を書き込んでよい」の確認)をもらって、鍵(アクセストークン)を受け取る。
// 画面(ブラウザ)だけで動く。サーバーには、何も送らない・何も保存しない。
import { GOOGLE_CLIENT_ID } from "./gcal-config";
import { GCAL_API } from "./gcal";

const SCOPE = "https://www.googleapis.com/auth/calendar.events"; // 予定の追加・変更だけ(予定の読み取りや、カレンダーの設定は、許可しない)

let loading = null;

export const gsiReady = () => !!(window.google && window.google.accounts && window.google.accounts.oauth2);

// Google のログイン部品を、先に読み込んでおく(ボタンを押した瞬間に、許可の画面を開けるように)
export function preloadGsi() {
  if (gsiReady()) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error("gsi_load")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// 許可の画面を開く。アカウントは、毎回、選べる(どのアカウントに入れるか、分かるように)。成功すると、鍵の文字を返す
// 押した直後に呼ぶ(ポップアップを止められないため)。部品が読み込み前なら、読み込んでから開く
export function requestGoogleToken() {
  return new Promise((resolve, reject) => {
    const fail = (code) => reject(Object.assign(new Error(code), { code }));
    const go = () => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPE,
          callback: (resp) => (resp && resp.access_token ? resolve(resp.access_token) : fail((resp && resp.error) || "no_token")),
          error_callback: (e) => fail((e && e.type) || "unknown"),
        });
        client.requestAccessToken({ prompt: "select_account" });
      } catch (e) {
        fail("init_failed");
      }
    };
    if (gsiReady()) go();
    else preloadGsi().then(go, () => fail("gsi_load"));
  });
}

// 入れ先(そのアカウントの、いちばん上のカレンダー)の名前。ふつうは、メールアドレス
export async function primaryCalendarName(token) {
  const res = await fetch(GCAL_API, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "";
  const j = await res.json();
  return (j && (j.id || j.summary)) || "";
}

// 許可の画面で起きたことを、やさしい日本語にする
export function googleErrorText(e) {
  const code = (e && e.code) || (e && e.message) || "";
  if (code === "popup_closed") return "許可の画面が、閉じられました。もう一度、押してください。";
  if (code === "popup_failed_to_open") return "許可の画面を開けませんでした。ブラウザのポップアップのブロックを、許可してください。";
  if (code === "access_denied") return "許可されませんでした。予定を入れるには、許可が要ります。";
  if (code === "gsi_load") return "Google の部品を読み込めませんでした。通信を確かめて、もう一度押してください。";
  if (code === "invalid_client" || code === "init_failed") return "Google の設定に、問題があります。管理者に伝えてください。";
  return `Google の許可で、うまくいきませんでした。（${code || "不明"}）`;
}
