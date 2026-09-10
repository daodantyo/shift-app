// ============================================================
//  LINE送信窓口(Vercel サーバーレス関数)  ※お店ごとに対応
//  ・通常: {shopId, messages:[{to, text}]} を指定した相手に送る
//  ・管理者送信: {shopId, toAdmin:true, text:"..."} で、そのお店の管理者に送る
//
//  【お店ごとの鍵(トークン)の読み方】
//   1. 環境変数 FIREBASE_SERVICE_ACCOUNT(Firebaseのサービスアカウント鍵JSON)があれば、
//      Firebase の shops/{shopId}/secrets から、そのお店のトークンと管理者IDを読む
//   2. なければ(または shopId がなければ)、環境変数 LINE_TOKEN / ADMIN_LINE_ID を使う
//      → 最初のお店は、今までどおり環境変数だけで動く
//
//  【いたずら対策】
//  ・送り先は、希望シフトを提出したことのあるキャスト(castLine 登録済み)だけ
//  ・1回に送れる人数と、文面の長さに上限を設ける
// ============================================================

const DB_URL = process.env.FIREBASE_DB_URL || "https://shift-app-fa13d-default-rtdb.firebaseio.com";
const MAX_RECIPIENTS = 100;   // 1回に送れる最大人数
const MAX_TEXT_LENGTH = 5000; // LINEのテキスト上限

// ---- Firebase Admin(サービスアカウント鍵があるときだけ使う) ----
let adminDb = null;
let adminInitTried = false;
async function getAdminDb() {
  if (adminInitTried) return adminDb;
  adminInitTried = true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const admin = await import("firebase-admin");
    const app = admin.default || admin;
    const cred = JSON.parse(raw);
    if (!app.apps || app.apps.length === 0) {
      app.initializeApp({ credential: app.credential.cert(cred), databaseURL: DB_URL });
    }
    adminDb = app.database();
  } catch (e) {
    console.error("firebase-admin の初期化に失敗:", e && e.message);
    adminDb = null;
  }
  return adminDb;
}

// お店IDが正しい形か(英数字・-・_ のみ)
function isValidShopId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

// そのお店の LINE トークン・管理者ID を決める
async function resolveShop(shopId) {
  if (shopId) {
    const db = await getAdminDb();
    if (db) {
      try {
        const snap = await db.ref(`shops/${shopId}/secrets`).get();
        const s = snap.val() || {};
        if (s.lineToken) {
          return { token: s.lineToken, adminId: s.adminLineId || "", castLinePath: `shops/${shopId}/castLine`, source: "shop" };
        }
      } catch (e) {
        console.error("secrets の読み取りに失敗:", e && e.message);
      }
    }
  }
  // 最初のお店(環境変数)にフォールバック
  return {
    token: process.env.LINE_TOKEN || "",
    adminId: process.env.ADMIN_LINE_ID || "",
    castLinePath: shopId ? `shops/${shopId}/castLine` : "castLine",
    source: "env",
  };
}

// 登録済みのLINE ID一覧を読む(読めなかったら null を返す = チェックをスキップ)
async function loadRegisteredLineIds(path) {
  try {
    let data = null;
    const db = await getAdminDb();
    if (db) {
      data = (await db.ref(path).get()).val();
    } else {
      const r = await fetch(`${DB_URL}/${path}.json`);
      if (!r.ok) return null;
      data = await r.json();
    }
    const ids = new Set();
    Object.values(data || {}).forEach((v) => {
      if (v && v.lineUserId) ids.add(String(v.lineUserId));
    });
    return ids;
  } catch {
    return null;
  }
}

async function pushLine(token, to, text) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (r.status === 200) return { ok: true };
  return { ok: false, status: r.status, error: await r.text() };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "LINE送信窓口は動いています",
      tokenSet: !!process.env.LINE_TOKEN,
      adminSet: !!process.env.ADMIN_LINE_ID,
      multiShop: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POSTで送ってください" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const shopId = body.shopId ? String(body.shopId) : "";
  if (shopId && !isValidShopId(shopId)) {
    return res.status(400).json({ ok: false, error: "お店IDの形式が正しくありません" });
  }

  const shop = await resolveShop(shopId);
  if (!shop.token) {
    return res.status(500).json({ ok: false, error: shopId && !process.env.LINE_TOKEN ? "このお店のLINEトークンが未設定です(お店の設定から登録してください)" : "鍵(LINE_TOKEN)が未設定です" });
  }

  // ---- 管理者への送信 ----
  if (body.toAdmin) {
    if (!shop.adminId) {
      return res.status(500).json({ ok: false, error: "管理者のLINE IDが未設定です" });
    }
    if (!body.text || typeof body.text !== "string") {
      return res.status(400).json({ ok: false, error: "textが空です" });
    }
    if (body.text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ ok: false, error: `文面が長すぎます(${MAX_TEXT_LENGTH}文字まで)` });
    }
    try {
      const r = await pushLine(shop.token, shop.adminId, body.text);
      if (r.ok) return res.status(200).json({ ok: true, success: 1, fail: 0 });
      return res.status(200).json({ ok: false, error: r.error, status: r.status });
    } catch (e) {
      return res.status(200).json({ ok: false, error: String(e) });
    }
  }

  // ---- 通常の送信(相手を指定) ----
  const messages = body.messages || [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: "送る相手(messages)がありません" });
  }
  if (messages.length > MAX_RECIPIENTS) {
    return res.status(400).json({ ok: false, error: `1回に送れるのは${MAX_RECIPIENTS}人までです` });
  }

  // 登録済みのキャスト以外には送らない
  const registered = await loadRegisteredLineIds(shop.castLinePath);

  const results = [];
  for (const m of messages) {
    if (!m || !m.to || !m.text || typeof m.text !== "string") {
      results.push({ to: m && m.to, ok: false, error: "toかtextが空" });
      continue;
    }
    if (m.text.length > MAX_TEXT_LENGTH) {
      results.push({ to: m.to, ok: false, error: `文面が長すぎます(${MAX_TEXT_LENGTH}文字まで)` });
      continue;
    }
    if (registered && !registered.has(String(m.to))) {
      results.push({ to: m.to, ok: false, error: "登録されていない送り先です" });
      continue;
    }
    try {
      const r = await pushLine(shop.token, m.to, m.text);
      results.push(r.ok ? { to: m.to, ok: true } : { to: m.to, ok: false, status: r.status, error: r.error });
    } catch (e) {
      results.push({ to: m.to, ok: false, error: String(e) });
    }
    await new Promise((res2) => setTimeout(res2, 200));
  }

  const success = results.filter((x) => x.ok).length;
  const fail = results.length - success;
  return res.status(200).json({ ok: true, success, fail, results });
}
