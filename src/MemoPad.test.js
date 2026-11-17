// メモ帳の動き(読み込む・自動で保存・書いている途中は上書きしない・空にすると消える・小さくする)の試験。
// 実際のデータベースには、つなげない(firebase は、作り物に差しかえる)。
import { act } from "react";
import { createRoot } from "react-dom/client";
import { onValue, set } from "firebase/database";
import MemoPad from "./MemoPad";
import { cleanMemo, memoPreview, memoToSave, readMemo, MEMO_MAX } from "./memo";

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
