// Google カレンダーに入れる、アドレスの試験(日付の終わりの決まり・月末と年末・文字の符号化・長すぎる文字・読めない日付)。
import { gcalUrl, GCAL_TITLE_MAX } from "./gcal";

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
