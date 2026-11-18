// Google カレンダーの「予定を追加」の画面を開くアドレスを作る(予定表の予定を、1件ずつ、Google カレンダーに入れる)。
// 開くだけ。あなたが Google カレンダーで「保存」を押すと、入る(登録や鍵は、いらない。予定表の中身は、Google に送らない)。
// 日付は、予定表と同じ形: Date の toDateString(例: "Fri Nov 20 2026")。終日の予定として入れる。

export const GCAL_TITLE_MAX = 300; // 題名の文字数の上限(アドレスが長くなりすぎないように)
export const GCAL_DETAIL_MAX = 300;

function cut(s, max) { return Array.from(String(s || "").trim()).slice(0, max).join(""); }
function ymd(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; }

// dateStr: 予定表の日付 / title: 予定の文字 / details: 補足(なくてもよい)。日付が読めない・題名が空なら、空の文字を返す
export function gcalUrl(dateStr, title, details = "") {
  const d = new Date(dateStr);
  const text = cut(title, GCAL_TITLE_MAX);
  if (Number.isNaN(d.getTime()) || !text) return "";
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); // 終日の予定は、終わりの日を「翌日」で書く決まり
  const note = cut(details, GCAL_DETAIL_MAX);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${ymd(d)}/${ymd(next)}${note ? `&details=${encodeURIComponent(note)}` : ""}`;
}

// ---- 1か月ぶんの予定を、Google カレンダーに取り込めるファイル(.ics)にする ----
// 予定ごとに決まった印(UID)を付ける。直して、もう一度取り込むと、Google カレンダーが同じ予定を上書きする見込み(実際の動きは Google 次第)。
// 予定表の中身は、ファイルにして自分の端末に保存するだけ(どこにも送らない)。

// .ics の文字の決まり: \ ; , と改行を、そのまま書かない
export function icsText(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// 1行は、75バイト(UTF-8)まで。長いときは、改行+空白で折り返す(文字の途中では、切らない)
const utf8Len = (ch) => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
export function icsFold(line) {
  const out = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of Array.from(line)) {
    const n = utf8Len(ch);
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // 2行目からは、先頭の空白の1バイトぶん、少なくする
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const pad2 = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;

// 見ている月の予定を、1件ずつの一覧にする(.ics にも、Google カレンダーに直接入れるときにも、同じ一覧を使う)
// year, month(0-11) / schedule: { 日付の文字(toDateString): { 予定のID: { type, text } } } / labelOf(type): 予定の種類の名前
// 返すもの: [{ id: 予定のID, ymd: "20261120", nextYmd: "20261121", title, note }]
export function monthPlans(year, month, schedule, labelOf = () => "") {
  const days = new Date(year, month + 1, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const day = (schedule && schedule[date.toDateString()]) || {};
    const next = new Date(year, month, d + 1); // 終日の予定は、終わりを「翌日」で書く決まり
    for (const id of Object.keys(day).sort()) {
      const p = day[id];
      const title = String((p && p.text) || "").trim();
      if (!title) continue;
      const note = labelOf(p.type);
      out.push({ id, ymd: ymd(date), nextYmd: ymd(next), title, note: note ? `${note}(キャスト管理の予定表から)` : "" });
    }
  }
  return out;
}

// 返すもの: { text: ファイルの中身, count: 入れた予定の数 }  now: 作った時刻(試験で固定するため)
export function monthIcs(year, month, schedule, labelOf = () => "", now = new Date()) {
  const plans = monthPlans(year, month, schedule, labelOf);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shift-app//schedule//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const p of plans) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsText(p.id)}-${p.ymd}@shift-app`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${p.ymd}`,
      `DTEND;VALUE=DATE:${p.nextYmd}`,
      `SUMMARY:${icsText(p.title)}`,
    );
    if (p.note) lines.push(`DESCRIPTION:${icsText(p.note)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return { text: lines.map(icsFold).join("\r\n") + "\r\n", count: plans.length };
}

export function icsFileName(year, month) {
  return `予定表_${year}-${pad2(month + 1)}.ics`;
}

// ---- Google カレンダーに、そのまま入れる(Google の許可を使う。ログインや許可の画面は gcal-google.js) ----
// 予定ごとに決まった ID を付けるので、直してもう一度入れると、同じ予定が上書きされる(2つに増えない)。
export const GCAL_API = "https://www.googleapis.com/calendar/v3/calendars/primary";

// Google の予定の ID は、a-v と 0-9 だけ・5〜1024文字、という決まり。同じ予定は、いつも同じ ID
export function gcalEventId(planId, ymdStr) {
  const hex = Array.from(`${planId}-${ymdStr}`).map((ch) => ch.codePointAt(0).toString(16).padStart(2, "0")).join("");
  return `shiftapp${hex}`;
}

const dashed = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;

export function gcalEventBody(p) {
  return {
    id: gcalEventId(p.id, p.ymd),
    summary: cut(p.title, GCAL_TITLE_MAX),
    description: cut(p.note, GCAL_DETAIL_MAX),
    start: { date: dashed(p.ymd) },
    end: { date: dashed(p.nextYmd) },
    transparency: "transparent", // 「空き」のまま(終日の予定で、ほかの予定を邪魔しない)
  };
}

async function failure(res, p) {
  let reason = "";
  let detail = "";
  try {
    const j = await res.json();
    detail = (j && j.error && j.error.message) || "";
    reason = (j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || "";
  } catch (e) { /* 返事が読めなくても、番号だけ伝える */ }
  return { title: p.title, status: res.status, reason, detail };
}

// plans: monthPlans の一覧 / token: Google の許可でもらった鍵 / fetchFn: 試験で差し替える
// 返すもの: { created, updated, failed: [{ title, status, reason, detail }], skipped }
export async function pushPlansToGoogle(plans, token, fetchFn, onProgress = () => {}) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const out = { created: 0, updated: 0, failed: [], skipped: 0 };
  let n = 0;
  for (const p of plans) {
    const body = gcalEventBody(p);
    try {
      let res = await fetchFn(`${GCAL_API}/events`, { method: "POST", headers, body: JSON.stringify(body) });
      if (res.status === 409) {
        // すでに同じ ID の予定がある(前に入れた予定、または、Google で消した予定) → 上書きして、生きている予定にする
        res = await fetchFn(`${GCAL_API}/events/${body.id}`, { method: "PUT", headers, body: JSON.stringify({ ...body, status: "confirmed" }) });
        if (res.ok) out.updated++;
        else out.failed.push(await failure(res, p));
      } else if (res.ok) {
        out.created++;
      } else {
        out.failed.push(await failure(res, p));
      }
    } catch (e) {
      out.failed.push({ title: p.title, status: 0, reason: "network", detail: "" });
    }
    const last = out.failed[out.failed.length - 1];
    n++;
    onProgress(n, plans.length);
    // 許可がない・APIがオフ、のときは、残りも全部だめなので、止める
    if (last && (last.status === 401 || (last.status === 403 && last.reason !== "rateLimitExceeded" && last.reason !== "userRateLimitExceeded"))) {
      out.skipped = plans.length - n;
      break;
    }
  }
  return out;
}
