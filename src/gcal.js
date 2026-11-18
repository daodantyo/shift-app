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

// year, month(0-11): 取り込む月 / schedule: { 日付の文字(toDateString): { 予定のID: { type, text } } }
// labelOf(type): 予定の種類の名前(補足に入れる) / now: 作った時刻(試験で固定するため)
// 返すもの: { text: ファイルの中身, count: 入れた予定の数 }
export function monthIcs(year, month, schedule, labelOf = () => "", now = new Date()) {
  const days = new Date(year, month + 1, 0).getDate();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shift-app//schedule//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const day = (schedule && schedule[date.toDateString()]) || {};
    const next = new Date(year, month, d + 1);
    const ymd = (x) => `${x.getFullYear()}${pad2(x.getMonth() + 1)}${pad2(x.getDate())}`;
    for (const id of Object.keys(day).sort()) {
      const p = day[id];
      const title = String((p && p.text) || "").trim();
      if (!title) continue;
      const note = labelOf(p.type);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${icsText(id)}-${ymd(date)}@shift-app`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${ymd(date)}`,
        `DTEND;VALUE=DATE:${ymd(next)}`, // 終日の予定は、終わりを「翌日」で書く決まり
        `SUMMARY:${icsText(title)}`,
      );
      if (note) lines.push(`DESCRIPTION:${icsText(`${note}(キャスト管理の予定表から)`)}`);
      lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
      count++;
    }
  }
  lines.push("END:VCALENDAR");
  return { text: lines.map(icsFold).join("\r\n") + "\r\n", count };
}

export function icsFileName(year, month) {
  return `予定表_${year}-${pad2(month + 1)}.ics`;
}
