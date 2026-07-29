// ============================================================
//  LINE送信窓口(Vercel サーバーレス関数)
//  アプリの「LINE送信」ボタンから呼ばれ、LINEにメッセージを送る
//  鍵(トークン)は Vercel の環境変数 LINE_TOKEN から読む(コードには書かない)
// ============================================================

export default async function handler(req, res) {
  // どこからでも呼べるようにする(同じサイト内なので実質自分のアプリから)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ブラウザの事前確認(OPTIONS)にはOKだけ返す
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 動作確認用:ブラウザで直接開くと(GET)、生きているか返す
  if (req.method === "GET") {
    const hasToken = !!process.env.LINE_TOKEN;
    return res.status(200).json({
      ok: true,
      message: "LINE送信窓口は動いています",
      tokenSet: hasToken, // 鍵が登録されていれば true
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POSTで送ってください" });
  }

  const TOKEN = process.env.LINE_TOKEN;
  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: "鍵(LINE_TOKEN)が未設定です" });
  }

  // リクエストの中身を受け取る
  // messages = [{ to: "LINEのuserId", text: "本文" }, ...]
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const messages = (body && body.messages) || [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: "送る相手(messages)がありません" });
  }

  const results = [];
  for (const m of messages) {
    if (!m || !m.to || !m.text) {
      results.push({ to: m && m.to, ok: false, error: "toかtextが空" });
      continue;
    }
    try {
      const r = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + TOKEN,
        },
        body: JSON.stringify({ to: m.to, messages: [{ type: "text", text: m.text }] }),
      });
      if (r.status === 200) {
        results.push({ to: m.to, ok: true });
      } else {
        const errText = await r.text();
        results.push({ to: m.to, ok: false, status: r.status, error: errText });
      }
    } catch (e) {
      results.push({ to: m.to, ok: false, error: String(e) });
    }
    // 少し間隔をあける
    await new Promise((res2) => setTimeout(res2, 200));
  }

  const success = results.filter((x) => x.ok).length;
  const fail = results.length - success;
  return res.status(200).json({ ok: true, success, fail, results });
}
