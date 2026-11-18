// Google カレンダーに入れる、アドレスの試験(日付の終わりの決まり・月末と年末・文字の符号化・長すぎる文字・読めない日付)。
import { gcalUrl, GCAL_TITLE_MAX, icsText, icsFold, monthIcs, icsFileName, monthPlans, gcalEventId, gcalEventBody, pushPlansToGoogle, GCAL_API } from "./gcal";

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

// ---- Google カレンダーに、そのまま入れる(Google の返事は、偽の fetch で作る) ----
const planList = () => monthPlans(2026, 10, {
  "Fri Nov 20 2026": { p1: { type: "memo", text: "家賃の振り込み" }, p2: { type: "shop", text: "備品の発注" } },
  "Mon Nov 30 2026": { p3: { type: "cast", text: "月末の面談" } },
}, label);

const reply = (status, json = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

test("monthPlans: 月の予定を、日付と ID の順に、終わりの日つきで並べる", () => {
  const plans = planList();
  expect(plans.map((p) => `${p.id}:${p.ymd}>${p.nextYmd}`)).toEqual(["p1:20261120>20261121", "p2:20261120>20261121", "p3:20261130>20261201"]);
  expect(plans[0].note).toBe("やること・メモ(キャスト管理の予定表から)");
});

test("gcalEventId: Google の決まり(a-v と 0-9 だけ・5〜1024文字)を守り、同じ予定は、いつも同じ ID", () => {
  const a = gcalEventId("p1794915893661", "20261120");
  expect(a).toMatch(/^[a-v0-9]{5,1024}$/);
  expect(gcalEventId("p1794915893661", "20261120")).toBe(a);
  expect(gcalEventId("p1794915893661", "20261121")).not.toBe(a);
  expect(gcalEventId("p2", "20261120")).not.toBe(gcalEventId("p1", "20261120"));
});

test("gcalEventBody: 終日の予定(終わりは翌日)・空きのまま・題名と補足が入る", () => {
  const p = planList()[2];
  const b = gcalEventBody(p);
  expect(b).toEqual({
    id: gcalEventId("p3", "20261130"),
    summary: "月末の面談",
    description: "キャストの予定(キャスト管理の予定表から)",
    start: { date: "2026-11-30" },
    end: { date: "2026-12-01" },
    transparency: "transparent",
  });
});

test("pushPlansToGoogle: 新しい予定は POST で入れる(鍵と内容が付く)。進み具合も伝える", async () => {
  const calls = [];
  const fetchFn = async (url, opt) => { calls.push({ url, method: opt.method, auth: opt.headers.Authorization, body: JSON.parse(opt.body) }); return reply(200); };
  const progress = [];
  const r = await pushPlansToGoogle(planList(), "TOKEN", fetchFn, (n, t) => progress.push(`${n}/${t}`));
  expect(r).toEqual({ created: 3, updated: 0, failed: [], skipped: 0 });
  expect(calls).toHaveLength(3);
  calls.forEach((c) => { expect(c.method).toBe("POST"); expect(c.auth).toBe("Bearer TOKEN"); expect(c.url).toBe(`${GCAL_API}/events`); });
  expect(calls[0].body.summary).toBe("家賃の振り込み");
  expect(progress).toEqual(["1/3", "2/3", "3/3"]);
});

test("pushPlansToGoogle: すでに同じ予定がある(409)ときは、PUT で上書きする。消した予定も、生きた予定に戻す", async () => {
  const calls = [];
  const fetchFn = async (url, opt) => {
    calls.push({ url, method: opt.method, body: JSON.parse(opt.body) });
    return opt.method === "POST" ? reply(409, { error: { message: "exists" } }) : reply(200);
  };
  const r = await pushPlansToGoogle(planList().slice(0, 2), "T", fetchFn);
  expect(r).toEqual({ created: 0, updated: 2, failed: [], skipped: 0 });
  const put = calls.find((c) => c.method === "PUT");
  expect(put.url).toBe(`${GCAL_API}/events/${gcalEventId("p1", "20261120")}`);
  expect(put.body.status).toBe("confirmed");
});

test("pushPlansToGoogle: 1件だけ失敗しても、残りは続ける。通信の失敗も、失敗として数える", async () => {
  let n = 0;
  const fetchFn = async () => {
    n++;
    if (n === 1) return reply(400, { error: { message: "bad", errors: [{ reason: "invalid" }] } });
    if (n === 2) throw new Error("offline");
    return reply(200);
  };
  const r = await pushPlansToGoogle(planList(), "T", fetchFn);
  expect(r.created).toBe(1);
  expect(r.failed).toEqual([
    { title: "家賃の振り込み", status: 400, reason: "invalid", detail: "bad" },
    { title: "備品の発注", status: 0, reason: "network", detail: "" },
  ]);
  expect(r.skipped).toBe(0);
});

test("pushPlansToGoogle: 許可がない(401)・APIがオフ(403)のときは、残りを試さずに止める。回数の上限(403 の rateLimit)は止めない", async () => {
  let n = 0;
  const f401 = async () => { n++; return reply(401, { error: { message: "invalid credentials" } }); };
  const r1 = await pushPlansToGoogle(planList(), "T", f401);
  expect(n).toBe(1);
  expect(r1.failed).toHaveLength(1);
  expect(r1.skipped).toBe(2);

  n = 0;
  const f403 = async () => { n++; return reply(403, { error: { message: "off", errors: [{ reason: "accessNotConfigured" }] } }); };
  const r2 = await pushPlansToGoogle(planList(), "T", f403);
  expect(n).toBe(1);
  expect(r2.failed[0].reason).toBe("accessNotConfigured");

  n = 0;
  const fRate = async () => { n++; return reply(403, { error: { message: "slow", errors: [{ reason: "rateLimitExceeded" }] } }); };
  const r3 = await pushPlansToGoogle(planList(), "T", fRate);
  expect(n).toBe(3);
  expect(r3.failed).toHaveLength(3);
});
