// ============================================================
//  LINE送信窓口(Vercel サーバーレス関数)
//  ・通常: messages:[{to, text}] を指定した相手に送る
//  ・管理者送信: {toAdmin:true, text:"..."} で、環境変数 ADMIN_LINE_ID の人に送る
//  鍵(トークン)は環境変数 LINE_TOKEN、管理者IDは ADMIN_LINE_ID から読む
// ============================================================

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
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POSTで送ってください" });
  }

  const TOKEN = process.env.LINE_TOKEN;
  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: "鍵(LINE_TOKEN)が未設定です" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // ---- 管理者への送信 ----
  if (body && body.toAdmin) {
    const adminId = process.env.ADMIN_LINE_ID;
    if (!adminId) {
      return res.status(500).json({ ok: false, error: "管理者ID(ADMIN_LINE_ID)が未設定です" });
    }
    if (!body.text) {
      return res.status(400).json({ ok: false, error: "textが空です" });
    }
    try {
      const r = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN },
        body: JSON.stringify({ to: adminId, messages: [{ type: "text", text: body.text }] }),
      });
      if (r.status === 200) return res.status(200).json({ ok: true, success: 1, fail: 0 });
      const errText = await r.text();
      return res.status(200).json({ ok: false, error: errText, status: r.status });
    } catch (e) {
      return res.status(200).json({ ok: false, error: String(e) });
    }
  }

  // ---- 通常の送信(相手を指定) ----
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
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN },
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
    await new Promise((res2) => setTimeout(res2, 200));
  }

  const success = results.filter((x) => x.ok).length;
  const fail = results.length - success;
  return res.status(200).json({ ok: true, success, fail, results });
}
