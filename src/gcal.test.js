// Google カレンダーに入れる、アドレスの試験(日付の終わりの決まり・月末と年末・文字の符号化・長すぎる文字・読めない日付)。
import { gcalUrl, GCAL_TITLE_MAX, icsText, icsFold, monthIcs, icsFileName } from "./gcal";

const BASE = "https://calendar.google.com/calendar/render?action=TEMPLATE";

test("終日の予定として、その日から翌日までのアドレスを作る。題名と補足は、符号化される", () => {
  expect(gcalUrl("Fri Nov 20 2026", "備品の発注", "やること・メモ")).toBe(
    `${BASE}&text=${encodeURIComponent("備品の発注")}&dates=20261120/20261121&details=${encodeURIComponent("やること・メモ")}`,
  );
});

test("補足がなければ、details は付けない。前後の空白は取る", () => {
  expect(gcalUrl("Fri Nov 20 2026", "  家賃の振り込み  ")).toBe(`${BASE}&text=${encodeURIComponent("家賃の振り込み")}&dates=20261120/20261121`);
});

test("月末と年末と、うるう日の、「翌日」", () => {
  expect(gcalUrl("Mon Nov 30 2026", "x")).toContain("dates=20261130/20261201");
  expect(gcalUrl("Thu Dec 31 2026", "x")).toContain("dates=20261231/20270101");
  expect(gcalUrl("Tue Feb 29 2028", "x")).toContain("dates=20280229/20280301");
});

test("&・#・改行・絵文字が入っていても、アドレスは壊れない(符号化されて、1つの題名のまま)", () => {
  const url = gcalUrl("Fri Nov 20 2026", "A&B #1\n🌸");
  const q = new URL(url).searchParams;
  expect(q.get("text")).toBe("A&B #1\n🌸");
  expect(q.get("dates")).toBe("20261120/20261121");
  expect(q.get("action")).toBe("TEMPLATE");
});

test("長すぎる題名は、上限で切る(絵文字を割らない)。読めない日付・空の題名は、空の文字", () => {
  const url = gcalUrl("Fri Nov 20 2026", "🌸".repeat(GCAL_TITLE_MAX + 50));
  expect(Array.from(new URL(url).searchParams.get("text")).length).toBe(GCAL_TITLE_MAX);
  expect(gcalUrl("日付ではない", "x")).toBe("");
  expect(gcalUrl("", "x")).toBe("");
  expect(gcalUrl("Fri Nov 20 2026", "   ")).toBe("");
  expect(gcalUrl("Fri Nov 20 2026", undefined)).toBe("");
});

// ---- 1か月ぶんの予定を、Google カレンダー用のファイル(.ics)にする ----
const unfold = (s) => s.replace(/\r\n /g, "");
const NOW = new Date(Date.UTC(2026, 10, 18, 3, 4, 5));
const label = (t) => ({ shop: "お店の予定", cast: "キャストの予定", memo: "やること・メモ" }[t] || "");

test("icsText: バックスラッシュ・セミコロン・カンマ・改行を、決まりどおりに書く", () => {
  expect(icsText("A,B;C\\D\nE")).toBe("A\\,B\\;C\\\\D\\nE");
  expect(icsText(undefined)).toBe("");
});

test("icsFold: 1行75バイトまでで折り返す。つなぎ直すと、元の文字に戻る(文字の途中では切らない)", () => {
  const long = "SUMMARY:" + "予定の確認".repeat(20) + "🌸ab";
  const folded = icsFold(long);
  const bytes = (s) => Array.from(s).reduce((n, ch) => { const c = ch.codePointAt(0); return n + (c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4); }, 0);
  folded.split("\r\n").forEach((l) => expect(bytes(l)).toBeLessThanOrEqual(75));
  expect(unfold(folded)).toBe(long);
  expect(folded.includes("\r\n ")).toBe(true);
  expect(icsFold("SUMMARY:短い")).toBe("SUMMARY:短い");
});

test("monthIcs: その月の予定だけを、終日の予定として入れる(印・終わりは翌日・補足・改行はCRLF)", () => {
  const schedule = {
    "Fri Nov 20 2026": {
      p2: { type: "memo", text: "家賃の振り込み, 来週まで" },
      p1: { type: "shop", text: "備品の発注;A" },
      p3: { type: "cast", text: "   " }, // 空の文字は入れない
    },
    "Mon Nov 30 2026": { p4: { type: "cast", text: "月末の面談" } },
    "Tue Dec 01 2026": { p5: { type: "memo", text: "来月の予定" } }, // 別の月は入れない
  };
  const { text, count } = monthIcs(2026, 10, schedule, label, NOW);
  expect(count).toBe(3);
  const t = unfold(text);
  expect(t.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
  expect(t.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(t.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  expect(t).toContain("UID:p1-20261120@shift-app");
  expect(t).toContain("DTSTAMP:20261118T030405Z");
  expect(t).toContain("DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261121");
  expect(t).toContain("DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201"); // 月末の「翌日」
  expect(t).toContain("SUMMARY:備品の発注\\;A");
  expect(t).toContain("SUMMARY:家賃の振り込み\\, 来週まで");
  expect(t).toContain("DESCRIPTION:やること・メモ(キャスト管理の予定表から)");
  expect(t).not.toContain("来月の予定");
  expect(t.indexOf("UID:p1-20261120")).toBeLessThan(t.indexOf("UID:p2-20261120")); // 同じ日の中は、IDの順
  expect(t).not.toMatch(/[^\r]\n/); // 改行は、すべて CRLF
});

test("monthIcs: 12月31日の翌日は、翌年の1月1日。予定のない月は、0件(中身は、枠だけ)", () => {
  const { text } = monthIcs(2026, 11, { "Thu Dec 31 2026": { a: { type: "memo", text: "大掃除" } } }, label, NOW);
  expect(text).toContain("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101");
  const none = monthIcs(2026, 0, {}, label, NOW);
  expect(none.count).toBe(0);
  expect(none.text).not.toContain("BEGIN:VEVENT");
  expect(monthIcs(2026, 0, undefined, label, NOW).count).toBe(0);
});

test("icsFileName: 年と月が入った名前", () => {
  expect(icsFileName(2026, 10)).toBe("予定表_2026-11.ics");
  expect(icsFileName(2027, 0)).toBe("予定表_2027-01.ics");
});
