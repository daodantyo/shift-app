// 「面接」タブの動き(一覧・探す・登録・その人の画面・写真と書類・結果・消す)の試験。
// 実際のデータベースには、つなげない(firebase と、画像を小さくする部分は、作り物に差しかえる)。
import { act } from "react";
import { createRoot } from "react-dom/client";
import { get, onValue, update } from "firebase/database";
import InterviewTab from "./InterviewTab";
import { makeImageSet } from "./image";

jest.mock("./firebase", () => ({ db: {} }));
jest.mock("firebase/database", () => ({
  ref: (db, path) => ({ path }),
  onValue: jest.fn(),
  update: jest.fn(() => Promise.resolve()),
  get: jest.fn(),
  increment: (n) => ({ inc: n }),
}));
jest.mock("./image", () => ({
  makeImageSet: jest.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const JPG = "data:image/jpeg;base64,AAAA";
const BASE = "shops/s1";
const DAY = 86400000;

let host;
let root;
const listeners = {}; // 場所ごとの、データが届いたときの関数

function show() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<InterviewTab base={BASE} />); });
}
const emit = (path, val) => act(() => { (listeners[path] || []).forEach((cb) => cb({ val: () => val })); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const buttons = () => Array.from(host.querySelectorAll("button"));
const buttonText = (t) => buttons().find((b) => b.textContent.includes(t));
const click = (el) => act(() => { el.click(); });
function typeInto(el, value) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function pickFiles(input, files) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await flush();
}

const people = {
  p1: { name: "さくら", interviewDate: "2026-11-18", age: 24, phone: "090-1234-5678", source: "求人サイト", note: "落ち着いた雰囲気", status: "pending", statusAt: 1, photoCount: 2, docCount: 1, ageCheckedAt: "2026-11-18", thumb: JPG, thumbId: "f1", createdAt: 30 },
  p2: { name: "ミウ", interviewDate: "2026-11-10", status: "hired", photoCount: 0, docCount: 0, createdAt: 20 },
  p3: { name: "レナ", interviewDate: "2026-02-01", status: "rejected", statusAt: Date.now() - 300 * DAY, photoCount: 0, docCount: 0, createdAt: 10 },
};
const files = {
  f1: { kind: "photo", at: 1, thumb: JPG, mini: JPG, kb: 50 },
  f2: { kind: "photo", at: 2, thumb: JPG, mini: JPG, kb: 50 },
  d1: { kind: "doc", docType: "id", label: "運転免許証", at: 3, kb: 300 },
};

beforeEach(() => {
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  onValue.mockReset();
  onValue.mockImplementation((r, cb) => { (listeners[r.path] = listeners[r.path] || []).push(cb); return () => {}; });
  update.mockClear();
  get.mockReset();
  makeImageSet.mockReset();
  window.confirm = jest.fn(() => true);
  show();
});
afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

test("一覧: 面接日が新しい順に、名前・年齢・件数・結果が出る。鍵の案内と、できないことの注意も出る", () => {
  emit(`${BASE}/interviews`, people);
  const rows = Array.from(host.querySelectorAll("button[aria-label$='を開く']"));
  expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["さくら を開く", "ミウ を開く", "レナ を開く"]);
  expect(rows[0].textContent).toContain("24歳");
  expect(rows[0].textContent).toContain("写真 2 ・ 書類 1");
  expect(rows[0].textContent).toContain("年齢確認ずみ");
  expect(rows[0].textContent).toContain("結果待ち");
  expect(rows[0].querySelector("img").getAttribute("src")).toBe(JPG);
  expect(host.textContent).toContain("お店のログインをした人だけが見られます");
  expect(host.textContent).toContain("画面の撮影(スクリーンショット)は、止められません");
  expect(host.textContent).toContain("自動バックアップは、まだありません");
});

test("一覧だけでは、大きな画像の場所を読まない(書類の写真は、一覧に出ない)", () => {
  emit(`${BASE}/interviews`, people);
  expect(onValue.mock.calls.map((c) => c[0].path)).toEqual([`${BASE}/interviews`]);
  expect(get).not.toHaveBeenCalled();
});

test("探す・しぼりこみ: 名前(カタカナでも)・電話。結果のボタンの件数。「すべて」にもどる", () => {
  emit(`${BASE}/interviews`, people);
  const names = () => Array.from(host.querySelectorAll("button[aria-label$='を開く']")).map((r) => r.getAttribute("aria-label").replace(" を開く", ""));
  typeInto(host.querySelector("input[type=search]"), "サクラ");
  expect(names()).toEqual(["さくら"]);
  typeInto(host.querySelector("input[type=search]"), "09012345678");
  expect(names()).toEqual(["さくら"]);
  typeInto(host.querySelector("input[type=search]"), "");
  expect(buttonText("すべて").textContent).toBe("すべて 3");
  expect(buttonText("採用").textContent).toBe("採用 1");
  click(buttonText("採用"));
  expect(names()).toEqual(["ミウ"]);
  click(buttonText("採用")); // もう一度押すと、もどる
  expect(names()).toHaveLength(3);
  typeInto(host.querySelector("input[type=search]"), "いない人");
  expect(host.textContent).toContain("あてはまる人が、いません");
});

test("不採用から半年たった人: お知らせが出て、「見る」で、その人だけになる。自動では消さない", () => {
  emit(`${BASE}/interviews`, people);
  expect(host.textContent).toContain("半年たった人が、1人います");
  click(buttonText("見る"));
  const rows = Array.from(host.querySelectorAll("button[aria-label$='を開く']"));
  expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["レナ を開く"]);
  expect(rows[0].textContent).toContain("消す時期");
  expect(update).not.toHaveBeenCalled();
});

test("まだ誰もいないとき: 案内が出る", () => {
  emit(`${BASE}/interviews`, null);
  expect(host.textContent).toContain("まだ、面接した人が登録されていません");
});

test("登録: 名前がないとエラー。入れて送ると、保存して、その人の画面が開く", async () => {
  emit(`${BASE}/interviews`, null);
  click(buttonText("面接を登録する"));
  const submit = () => buttons().find((b) => b.textContent === "登録する"); // 上の「面接を登録する」ではなく、入力欄の下の「登録する」
  click(submit());
  expect(host.querySelector("[role=alert]").textContent).toContain("名前を入れてください");
  expect(update).not.toHaveBeenCalled();

  const inputs = host.querySelectorAll("form input");
  typeInto(inputs[0], "あやか");
  typeInto(inputs[2], "２２");
  typeInto(host.querySelector("form textarea"), "メモです");
  click(submit());
  await flush();
  expect(update).toHaveBeenCalledTimes(1);
  const [r, u] = update.mock.calls[0];
  expect(r.path).toBe(BASE);
  const [key, rec] = Object.entries(u)[0];
  expect(key).toMatch(/^interviews\/p/);
  expect(rec).toMatchObject({ name: "あやか", age: 22, note: "メモです", status: "pending", photoCount: 0, docCount: 0 });
  expect(rec.phone).toBeUndefined(); // 空の項目は、入れない

  // データベースに入ると、その人の画面が開く
  emit(`${BASE}/interviews`, { [key.split("/")[1]]: rec });
  expect(host.textContent).toContain("あやか");
  expect(host.textContent).toContain("← 一覧にもどる");
  expect(onValue.mock.calls.map((c) => c[0].path)).toContain(`${BASE}/interviewFiles/${key.split("/")[1]}`);
});

function openSakura() {
  emit(`${BASE}/interviews`, people);
  click(host.querySelector("button[aria-label='さくら を開く']"));
  emit(`${BASE}/interviewFiles/p1`, files);
}

test("その人の画面: 情報・結果・写真・書類が出る。書類の写真は、「開く」を押すまで、読まない", async () => {
  openSakura();
  expect(host.textContent).toContain("090-1234-5678");
  expect(host.textContent).toContain("求人サイト");
  expect(host.textContent).toContain("落ち着いた雰囲気");
  expect(host.textContent).toContain("写真(2)");
  expect(host.textContent).toContain("書類(1)");
  expect(host.textContent).toContain("運転免許証");
  expect(host.textContent).toContain("年齢確認ずみ 11/18");
  expect(host.querySelectorAll("img[src^='data:image']")).toHaveLength(2); // 写真の小さな画像だけ。書類の画像は、ない
  expect(get).not.toHaveBeenCalled();

  get.mockResolvedValue({ val: () => ({ data: JPG }) });
  click(buttonText("開く"));
  await flush();
  expect(get).toHaveBeenCalledTimes(1);
  expect(get.mock.calls[0][0].path).toBe(`${BASE}/interviewData/p1/d1`);
  expect(host.querySelector("[role=dialog]").textContent).toContain("個人情報です");
  expect(host.querySelector("[role=dialog] img").getAttribute("src")).toBe(JPG);
  click(Array.from(host.querySelectorAll("[role=dialog] button")).find((b) => b.textContent === "閉じる"));
  expect(host.querySelector("[role=dialog]")).toBeNull();
});

test("結果を変える: 変えた結果と、変えた時刻が、保存される。いまの結果は、押しても何もしない", async () => {
  openSakura();
  click(buttons().find((b) => b.textContent === "結果待ち" && b.getAttribute("aria-pressed") === "true"));
  await flush();
  expect(update).not.toHaveBeenCalled();
  click(buttons().find((b) => b.textContent === "保留"));
  await flush();
  expect(update).toHaveBeenCalledTimes(1);
  const u = update.mock.calls[0][1];
  expect(u["interviews/p1/status"]).toBe("hold");
  expect(typeof u["interviews/p1/statusAt"]).toBe("number");
});

test("写真を足す: 小さくして、写真の場所に1枚ずつ保存する。数を増やす(最初の写真ではないので、顔写真は変えない)", async () => {
  openSakura();
  makeImageSet.mockResolvedValue({ data: JPG, thumb: JPG, mini: JPG, kb: 80 });
  const input = Array.from(host.querySelectorAll("input[type=file]"))[0];
  await pickFiles(input, [new File(["x"], "a.jpg", { type: "image/jpeg" }), new File(["y"], "b.jpg", { type: "image/jpeg" })]);
  expect(makeImageSet).toHaveBeenCalledTimes(2);
  expect(makeImageSet.mock.calls[0][1]).toMatchObject({ maxPx: 1200, thumbPx: 320, miniPx: 160 });
  expect(update).toHaveBeenCalledTimes(2);
  const u = update.mock.calls[0][1];
  const fileKey = Object.keys(u).find((k) => k.startsWith("interviewFiles/p1/"));
  expect(u[fileKey]).toMatchObject({ kind: "photo", kb: 80 });
  expect(u[fileKey.replace("interviewFiles", "interviewData")]).toEqual({ data: JPG });
  expect(u["interviews/p1/photoCount"]).toEqual({ inc: 1 });
  expect(u["interviews/p1/thumb"]).toBeUndefined();
  expect(host.textContent).toContain("2枚を保存しました");
});

test("書類を足す: 種類と名前をつけて、書類の場所に保存する。小さな画像は、作らない", async () => {
  openSakura();
  makeImageSet.mockResolvedValue({ data: JPG, thumb: "", mini: "", kb: 300 });
  click(buttonText("書類を足す"));
  click(buttons().find((b) => b.textContent === "履歴書"));
  typeInto(host.querySelector("input[list]"), "履歴書(2枚目)");
  const input = Array.from(host.querySelectorAll("input[type=file]"))[1];
  await pickFiles(input, [new File(["x"], "r.jpg", { type: "image/jpeg" })]);
  expect(makeImageSet.mock.calls[0][1]).toMatchObject({ maxPx: 1800, thumbPx: 0, miniPx: 0 });
  const u = update.mock.calls[0][1];
  const fileKey = Object.keys(u).find((k) => k.startsWith("interviewFiles/p1/"));
  expect(u[fileKey]).toMatchObject({ kind: "doc", docType: "resume", label: "履歴書(2枚目)" });
  expect(u[fileKey].thumb).toBeUndefined();
  expect(u["interviews/p1/docCount"]).toEqual({ inc: 1 });
});

test("保存に失敗した画像: 理由を出す。ほかの画像は、保存する", async () => {
  openSakura();
  makeImageSet.mockRejectedValueOnce(new Error("画像が大きすぎて、小さくできませんでした。")).mockResolvedValue({ data: JPG, thumb: JPG, mini: JPG, kb: 80 });
  const input = Array.from(host.querySelectorAll("input[type=file]"))[0];
  await pickFiles(input, [new File(["x"], "big.jpg", { type: "image/jpeg" }), new File(["y"], "ok.jpg", { type: "image/jpeg" })]);
  expect(update).toHaveBeenCalledTimes(1);
  expect(host.querySelector("[role=alert]").textContent).toContain("big.jpg");
  expect(host.querySelector("[role=alert]").textContent).toContain("画像が大きすぎて");
  expect(host.querySelector("[role=alert]").textContent).toContain("1枚を保存しました");
});

test("書類を消す: 確認で「いいえ」なら消さない。「はい」なら、書類の場所と数を消す", async () => {
  openSakura();
  window.confirm = jest.fn(() => false);
  click(buttons().find((b) => b.textContent === "消す"));
  await flush();
  expect(update).not.toHaveBeenCalled();
  window.confirm = jest.fn(() => true);
  click(buttons().find((b) => b.textContent === "消す"));
  await flush();
  const u = update.mock.calls[0][1];
  expect(u["interviewFiles/p1/d1"]).toBeNull();
  expect(u["interviewData/p1/d1"]).toBeNull();
  expect(u["interviews/p1/docCount"]).toEqual({ inc: -1 });
});

test("その人の記録を、すべて消す: 写真と書類の数を知らせる確認のあと、3つの場所を消して、一覧にもどる", async () => {
  openSakura();
  click(buttonText("この人の記録を、すべて消す"));
  await flush();
  expect(window.confirm.mock.calls[0][0]).toContain("写真 2 枚・書類 1 点");
  expect(window.confirm.mock.calls[0][0]).toContain("元に戻せません");
  expect(update.mock.calls[0][1]).toEqual({ "interviews/p1": null, "interviewFiles/p1": null, "interviewData/p1": null });
  emit(`${BASE}/interviews`, { p2: people.p2, p3: people.p3 }); // 消えたあとの一覧
  expect(host.querySelector("button[aria-label='さくら を開く']")).toBeNull();
  expect(host.textContent).toContain("面接した人(2人)");
});

test("情報を直す: 空にした項目は消す(null)", async () => {
  openSakura();
  click(buttonText("直す"));
  const inputs = host.querySelectorAll("form input");
  typeInto(inputs[3], ""); // 連絡先を空に
  click(buttonText("直したことを保存する"));
  await flush();
  const u = update.mock.calls[0][1];
  expect(u["interviews/p1/phone"]).toBeNull();
  expect(u["interviews/p1/name"]).toBe("さくら");
  expect(u["interviews/p1/age"]).toBe(24);
});

test("年齢の確認: 「今日、確認した」で、今日の日付が入る。「なしにする」で消える", async () => {
  openSakura();
  click(buttonText("今日、確認した"));
  await flush();
  expect(update.mock.calls[0][1]["interviews/p1/ageCheckedAt"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  click(buttonText("なしにする"));
  await flush();
  expect(update.mock.calls[1][1]["interviews/p1/ageCheckedAt"]).toBeNull();
});

test("読み込めなかったとき: 知らせる", () => {
  const errCb = onValue.mock.calls[0][2];
  act(() => { errCb(new Error("denied")); });
  expect(host.querySelector("[role=alert]").textContent).toContain("読み込めませんでした");
});
