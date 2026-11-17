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
