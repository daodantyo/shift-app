// メモ帳の動き(読み込む・自動で保存・書いている途中は上書きしない・空にすると消える・小さくする)の試験。
// 実際のデータベースには、つなげない(firebase は、作り物に差しかえる)。
import { act } from "react";
import { createRoot } from "react-dom/client";
import { onValue, set } from "firebase/database";
import MemoPad from "./MemoPad";
import { addMemoPlans, cleanMemo, memoDateLines, memoPreview, memoToSave, planExists, readMemo, MEMO_MAX } from "./memo";

jest.mock("./firebase", () => ({ db: {} }));
jest.mock("firebase/database", () => ({
  ref: (db, path) => ({ path }),
  onValue: jest.fn(),
  set: jest.fn(() => Promise.resolve()),
  serverTimestamp: () => ({ ".sv": "timestamp" }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;

function show() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<MemoPad path="shops/s1/memo" />); });
}
const withProps = (props) => act(() => { root.render(<MemoPad path="shops/s1/memo" {...props} />); }); // 予定表につなぐ(schedule と onAddPlans を渡す)
const buttonText = (t) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent.includes(t));
const emit = (val) => act(() => { onValue.mock.calls[onValue.mock.calls.length - 1][1]({ val: () => val }); });
const box = () => host.querySelector("textarea");
function typeInto(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const wait = (ms) => act(async () => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  onValue.mockReset();
  onValue.mockImplementation(() => () => {});
  set.mockClear();
  localStorage.clear();
  show();
});
afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
  jest.useRealTimers();
});

test("読み込む: データベースのメモが、枠に出る。最後に書いた日時も出る", () => {
  emit({ text: "・11/20 家賃の振り込み", at: new Date(2026, 10, 20, 9, 5).getTime() });
  expect(box().value).toBe("・11/20 家賃の振り込み");
  expect(host.textContent).toContain("最後に書いた日時: 2026/11/20 09:05");
});

test("書く: 止まって0.8秒たつと、1回だけ、サーバーの時刻つきで保存する", async () => {
  emit(null);
  typeInto(box(), "・綾波さん　来週は休み");
  expect(host.textContent).toContain("書いています");
  await wait(799);
  expect(set).not.toHaveBeenCalled();
  await wait(1);
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith({ path: "shops/s1/memo" }, { text: "・綾波さん　来週は休み", at: { ".sv": "timestamp" } });
  expect(host.textContent).toContain("自動で保存されます");
});

test("続けて書くあいだは、保存を待つ（止まってから、数える）", async () => {
  emit(null);
  typeInto(box(), "あ");
  await wait(500);
  typeInto(box(), "あい");
  await wait(500);
  expect(set).not.toHaveBeenCalled();
  await wait(300);
  expect(set).toHaveBeenCalledTimes(1);
  expect(set.mock.calls[0][1].text).toBe("あい");
});

test("書いている途中は、ほかの端末のメモで、上書きしない。保存したあとは、反映される", async () => {
  emit({ text: "最初", at: 1 });
  typeInto(box(), "自分で書いている");
  emit({ text: "別の端末のメモ", at: 2 });
  expect(box().value).toBe("自分で書いている");
  await wait(800);
  expect(set).toHaveBeenCalledTimes(1);
  emit({ text: "別の端末のメモ", at: 3 });
  expect(box().value).toBe("別の端末のメモ");
});

test("全部消す(空白だけ)と、メモごと消す（null を保存する）", async () => {
  emit({ text: "消すメモ", at: 1 });
  typeInto(box(), "  \n ");
  await wait(800);
  expect(set).toHaveBeenCalledWith({ path: "shops/s1/memo" }, null);
});

test("保存できないときは、「保存できていません」と出て、「保存し直す」で、もう一度保存する", async () => {
  emit(null);
  set.mockImplementationOnce(() => Promise.reject(new Error("permission_denied")));
  typeInto(box(), "メモ");
  await wait(800);
  expect(host.textContent).toContain("保存できていません");
  const retry = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "保存し直す");
  expect(retry).toBeTruthy();
  await act(async () => { retry.click(); });
  expect(set).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("自動で保存されます");
});

test("小さくする: 1行の帯になり、最初の文字のある行が出る。この端末では、小さいまま覚える", () => {
  emit({ text: "\n  ・LINEのトークン　12月に更新\n二行目", at: 1 });
  const fold = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "小さくする");
  act(() => { fold.click(); });
  expect(box()).toBeNull();
  expect(host.textContent).toContain("・LINEのトークン　12月に更新");
  expect(host.textContent).not.toContain("二行目");
  expect(localStorage.getItem("memoFolded")).toBe("1");
  act(() => { root.unmount(); });
  host.remove();
  show();
  expect(box()).toBeNull(); // 開き直しても、小さいまま
  const open = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "広げる");
  act(() => { open.click(); });
  expect(box()).not.toBeNull();
  expect(localStorage.getItem("memoFolded")).toBe("0");
});

const TODAY = new Date(2026, 10, 17, 9, 0); // 2026/11/17(火)

test("memoDateLines: 行の先頭の日付を読む(11/20・11月20日・全角・曜日つき・印つき)。日付のない行・ありえない日付・文字のない行は、出ない", () => {
  const rows = memoDateLines([
    "11/20 家賃の振り込み",
    "・11/25　綾波さん 面接",
    "12月3日(木) 備品の発注",
    "１２／５：全角の日付",
    "LINEのトークン　12月に更新",
    "13/40 ありえない日付",
    "11/30",
    "2027年1月5日 来年の会議",
  ].join("\n"), TODAY);
  expect(rows.map((r) => [r.line, r.dateStr, r.text])).toEqual([
    [0, "Fri Nov 20 2026", "家賃の振り込み"],
    [1, "Wed Nov 25 2026", "綾波さん 面接"],
    [2, "Thu Dec 03 2026", "備品の発注"],
    [3, "Sat Dec 05 2026", "全角の日付"],
    [7, "Tue Jan 05 2027", "来年の会議"],
  ]);
  expect(rows[0]).toMatchObject({ year: 2026, month: 11, day: 20, weekday: "金" });
});

test("memoDateLines: 年を書いていない日付は、今日以降で、いちばん近い日(過ぎた日付は来年・2/29 は次のうるう年)。年を書けば、過去でもそのまま", () => {
  const r = memoDateLines("11/17 今日\n11/16 きのう\n2/29 うるう日\n2026/11/10 年つき", TODAY);
  expect(r.map((x) => x.dateStr)).toEqual(["Tue Nov 17 2026", "Tue Nov 16 2027", "Tue Feb 29 2028", "Tue Nov 10 2026"]);
});

test("addMemoPlans: 「やること・メモ」の種類で足す。同じ日に同じ文字があれば足さない。IDは重ならない。元の予定表は変えない", () => {
  const schedule = { "Fri Nov 20 2026": { p1: { type: "shop", text: "家賃の振り込み" } } };
  const items = [
    { dateStr: "Fri Nov 20 2026", text: "家賃の振り込み" },
    { dateStr: "Fri Nov 20 2026", text: "銀行へ" },
    { dateStr: "Fri Nov 20 2026", text: "銀行へ" },
    { dateStr: "Wed Nov 25 2026", text: " 面接 " },
    { dateStr: "", text: "日付なし" },
  ];
  const { schedule: next, added } = addMemoPlans(schedule, items, 1000);
  expect(added).toBe(2);
  expect(next["Fri Nov 20 2026"]).toEqual({ p1: { type: "shop", text: "家賃の振り込み" }, p1000_0: { type: "memo", text: "銀行へ" } });
  expect(next["Wed Nov 25 2026"]).toEqual({ p1000_1: { type: "memo", text: "面接" } });
  expect(Object.keys(schedule["Fri Nov 20 2026"])).toEqual(["p1"]);
  expect(planExists(next, "Fri Nov 20 2026", "銀行へ")).toBe(true);
  expect(planExists({}, "Fri Nov 20 2026", "銀行へ")).toBe(false);
});

test("予定表に入れる: ボタンに件数が出る。押すと日付の行が並び、チェックした行だけが予定表に入る。メモの文字は、変わらない", () => {
  jest.setSystemTime(TODAY);
  const onAddPlans = jest.fn(() => 1);
  withProps({ schedule: {}, onAddPlans });
  const memo = "11/20 家賃の振り込み\n11/25 綾波さん 面接\nLINEのトークン　12月に更新";
  emit({ text: memo, at: 1 });
  act(() => { buttonText("予定表に入れる(2)").click(); });
  const boxes = host.querySelectorAll('input[type="checkbox"]');
  expect(boxes.length).toBe(2); // 日付のない行は、出ない
  expect(host.textContent).toContain("11/20(金)");
  expect(host.textContent).toContain("11/25(水)");
  act(() => { boxes[1].click(); }); // 2つ目のチェックを外す
  act(() => { buttonText("選んだ1件を、予定表に入れる").click(); });
  expect(onAddPlans).toHaveBeenCalledTimes(1);
  expect(onAddPlans).toHaveBeenCalledWith([{ dateStr: "Fri Nov 20 2026", text: "家賃の振り込み" }]);
  expect(host.textContent).toContain("1件を、予定表に入れました");
  expect(set).not.toHaveBeenCalled(); // メモそのものは、保存し直さない
  expect(box().value).toBe(memo);
});

test("予定表に、もう入っている行は「入っています」と出て、選べない。年がちがう日付には、年が付く", () => {
  jest.setSystemTime(TODAY);
  const schedule = { "Fri Nov 20 2026": { p1: { type: "shop", text: "家賃の振り込み" } } };
  withProps({ schedule, onAddPlans: jest.fn() });
  emit({ text: "11/20 家賃の振り込み\n1/5 来年の予定", at: 1 });
  act(() => { buttonText("予定表に入れる(1)").click(); });
  const boxes = host.querySelectorAll('input[type="checkbox"]');
  expect(boxes.length).toBe(2);
  expect(boxes[0].disabled).toBe(true);
  expect(boxes[0].checked).toBe(false);
  expect(boxes[1].checked).toBe(true);
  expect(host.textContent).toContain("入っています");
  expect(host.textContent).toContain("2027/1/5(火)");
});

test("日付で始まる行がないときは、説明が出る。予定表につながっていないとき(onAddPlans なし)は、ボタンが出ない", () => {
  jest.setSystemTime(TODAY);
  emit({ text: "LINEのトークン　12月に更新", at: 1 });
  expect(buttonText("予定表に入れる")).toBeUndefined();
  withProps({ schedule: {}, onAddPlans: jest.fn() });
  act(() => { buttonText("予定表に入れる").click(); });
  expect(host.textContent).toContain("日付で始まる行が、ありません");
  expect(buttonText("を、予定表に入れる")).toBeUndefined();
});

test("memo.js: 文字のそろえ・壊れた値・空の判定・1行の見出し", () => {
  expect(cleanMemo("a\r\nb")).toBe("a\nb");
  expect(cleanMemo("あ".repeat(MEMO_MAX + 5)).length).toBe(MEMO_MAX);
  expect(cleanMemo(undefined)).toBe("");
  expect(readMemo(null)).toEqual({ text: "", at: 0 });
  expect(readMemo({ text: 5, at: "x" })).toEqual({ text: "", at: 0 });
  expect(memoToSave("  \n", 1)).toBeNull();
  expect(memoToSave("a", 7)).toEqual({ text: "a", at: 7 });
  expect(memoPreview("あ".repeat(41))).toBe(`${"あ".repeat(40)}…`);
  expect(memoPreview("🌸".repeat(5), 3)).toBe("🌸🌸🌸…");
  expect(memoPreview("")).toBe("");
});
