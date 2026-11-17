// メモ帳の計算(画面に使わない部分)。保存先: shops/<お店ID>/memo = { text, at }(at はサーバーの時刻。最後に書いた日時)。
// お店のログインだけが読み書きできる場所(データベースのルールは変えていない)。
// 管理画面(members-app)のメモ帳と、同じ作り。

export const MEMO_MAX = 3000; // 書ける文字数の上限
export const MEMO_SAVE_MS = 800; // 入力が止まってから、保存するまでの時間

// 画面の文字を、保存できる形にする(文字だけ。改行は LF にそろえる。上限で切る)
export function cleanMemo(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\r\n?/g, "\n").slice(0, MEMO_MAX);
}

// データベースの値から、メモの文字と、最後に書いた日時を読む(壊れた値は、空と 0)
export function readMemo(v) {
  const text = v && typeof v.text === "string" ? cleanMemo(v.text) : "";
  const at = v && Number.isFinite(Number(v.at)) ? Number(v.at) : 0;
  return { text, at };
}

// 保存する中身。空(空白だけ)なら null = メモごと消す。at は、呼ぶ側が渡す(画面はサーバーの時刻)
export function memoToSave(text, at) {
  const t = cleanMemo(text);
  return t.trim() === "" ? null : { text: t, at };
}

/* ================= メモの日付の行を、予定表に入れる =================
   メモ帳の「予定表に入れる」ボタンの計算。メモの文字は、変えない(読むだけ)。
   予定表の持ち方: schedule = { "Fri Nov 20 2026"(Date の toDateString): { <ID>: { type, text } } }(App.jsx と同じ) */
export const PLAN_TEXT_MAX = 200; // 予定1件の文字数の上限
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
// 全角の数字・「／」を半角にする(1文字は1文字のまま。位置は、ずれない)
function toHalf(s) { return s.replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10)).replace(/／/g, "/"); }
// 行の先頭が日付: 「11/20」「11月20日」「2027/1/5」「2027年1月5日」。前に「・」「-」「*」などの印や空白があってもよい
const DATE_AT_START = /^[\s・\-*•●○■□▶▷>＊]*(?:(\d{4})\s*[/年]\s*)?(\d{1,2})\s*[/月]\s*(\d{1,2})\s*日?(?![\d/])/;

// 年を書いていない日付は、「今日以降で、いちばん近い日」にする(過ぎた日付は、来年)。書いてあれば、その年(過去でもよい)
function resolveDate(year, month, day, today) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const make = (y) => {
    const d = new Date(y, month - 1, day);
    return d.getFullYear() === y && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
  };
  if (year) return year >= 2000 ? make(year) : null;
  for (let y = t0.getFullYear(); y <= t0.getFullYear() + 8; y++) {
    const d = make(y);
    if (d && d >= t0) return d;
  }
  return null;
}

// メモの文字から、「日付で始まる行」を探す。日付の後ろが空の行・正しくない日付(13/40 など)は、入れない
// 返す: [{ line, dateStr, year, month, day, weekday, text, key }](line は 0 から数えた行の番号。key は「日付|文字」)
export function memoDateLines(text, today = new Date()) {
  const out = [];
  cleanMemo(text).split("\n").forEach((raw, line) => {
    const m = toHalf(raw).match(DATE_AT_START);
    if (!m) return;
    const d = resolveDate(m[1] ? Number(m[1]) : 0, Number(m[2]), Number(m[3]), today);
    if (!d) return;
    const rest = raw.slice(m[0].length)
      .replace(/^[\s]*(?:[(（][月火水木金土日](?:曜日?)?[)）])?/, "") // 「(金)」の曜日は、はずす
      .replace(/^[\s:：\-–—、,，]+/, "")
      .trim();
    const body = Array.from(rest).slice(0, PLAN_TEXT_MAX).join("");
    if (!body) return;
    const dateStr = d.toDateString();
    out.push({ line, dateStr, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), weekday: WEEKDAYS[d.getDay()], text: body, key: `${dateStr}|${body}` });
  });
  return out;
}

// その日に、同じ文字の予定が、もう入っているか(種類は問わない)
export function planExists(schedule, dateStr, text) {
  const day = schedule && schedule[dateStr];
  return !!day && Object.values(day).some((p) => p && p.text === text);
}

// 選んだ行を、予定表(「やること・メモ」の種類)に足した、新しい予定表を作る。もう入っている予定は、足さない
// stamp: IDの元になる数(呼ぶ側が Date.now() を渡す)。返す: { schedule, added(足した件数) }
export function addMemoPlans(schedule, items, stamp) {
  const next = { ...(schedule || {}) };
  let added = 0;
  (items || []).forEach((it) => {
    const text = it && typeof it.text === "string" ? it.text.trim() : "";
    if (!text || !it.dateStr) return;
    if (planExists(next, it.dateStr, text)) return;
    next[it.dateStr] = { ...(next[it.dateStr] || {}), [`p${stamp}_${added}`]: { type: "memo", text } };
    added += 1;
  });
  return { schedule: next, added };
}

// 小さくしたときに出す1行。最初の、文字のある行を、max 文字まで(超えたら「…」)
export function memoPreview(text, max = 40) {
  const line = cleanMemo(text).split("\n").map((s) => s.trim()).find((s) => s !== "") || "";
  const chars = Array.from(line);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : line;
}
