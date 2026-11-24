// 上のメニュー(TabMenu)の試験。
// 広い画面: 今までどおり、9つのボタンが並ぶ。スマホ: 「☰ メニュー」ボタン1つ。押すと一覧が開き、選ぶと閉じる。
import { act } from "react";
import { createRoot } from "react-dom/client";
import TabMenu from "./TabMenu";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TABS = [
  { id: "shift", label: "シフト" },
  { id: "sales", label: "売上" },
  { id: "expenses", label: "経費" },
  { id: "summary", label: "集計" },
  { id: "schedule", label: "予定表" },
  { id: "cast", label: "キャスト" },
  { id: "interview", label: "面接" },
  { id: "commission", label: "報酬" },
  { id: "requests", label: "希望シフト", badge: 0 },
];
const withPending = (n) => TABS.map((t) => (t.id === "requests" ? { ...t, badge: n } : t));

let host;
let root;
let picked;

function show(props) {
  picked = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<TabMenu tabs={TABS} current="shift" onSelect={(id) => picked.push(id)} {...props} />); });
}
const rerender = (props) => act(() => { root.render(<TabMenu tabs={TABS} current="shift" onSelect={(id) => picked.push(id)} {...props} />); });
const buttons = () => Array.from(host.querySelectorAll("button"));
const byText = (t) => buttons().find((b) => b.textContent.includes(t));
const press = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const menuButton = () => host.querySelector("button[aria-expanded]");

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("広い画面(compact なし)", () => {
  test("9つのボタンが、そのまま並ぶ。「☰ メニュー」は出ない", () => {
    show({ compact: false });
    expect(buttons().map((b) => b.textContent)).toEqual(["シフト", "売上", "経費", "集計", "予定表", "キャスト", "面接", "報酬", "希望シフト"]);
    expect(host.textContent).not.toContain("メニュー");
  });

  test("新しい希望シフトがあると、「希望シフト (2)」と出る(今までと同じ文字)", () => {
    show({ compact: false, tabs: withPending(2) });
    expect(buttons()[8].textContent).toBe("希望シフト (2)");
  });

  test("押すと、そのタブの ID が渡る", () => {
    show({ compact: false });
    press(byText("面接"));
    expect(picked).toEqual(["interview"]);
  });
});

describe("スマホ(compact)", () => {
  test("はじめは「☰ メニュー」ボタン1つだけ。いま開いている画面の名前が出る。一覧は出ない", () => {
    show({ compact: true, current: "commission" });
    expect(buttons()).toHaveLength(1);
    expect(menuButton().textContent).toContain("☰ メニュー");
    expect(menuButton().textContent).toContain("報酬");
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
  });

  test("押すと、9つの一覧が開く。いまの画面には aria-current が付く", () => {
    show({ compact: true, current: "cast" });
    press(menuButton());
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
    const items = buttons().slice(1);
    expect(items.map((b) => b.textContent)).toEqual(["シフト", "売上", "経費", "集計", "予定表", "キャスト", "面接", "報酬", "希望シフト"]);
    expect(items.filter((b) => b.getAttribute("aria-current") === "page").map((b) => b.textContent)).toEqual(["キャスト"]);
  });

  test("一覧から選ぶと、その ID が渡り、一覧は閉じる", () => {
    show({ compact: true });
    press(menuButton());
    press(byText("売上"));
    expect(picked).toEqual(["sales"]);
    expect(buttons()).toHaveLength(1);
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
  });

  test("ボタンをもう一度押す・Escape で、一覧が閉じる(選んだことにはならない)", () => {
    show({ compact: true });
    press(menuButton());
    expect(buttons()).toHaveLength(10);
    press(menuButton());
    expect(buttons()).toHaveLength(1);
    press(menuButton());
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(buttons()).toHaveLength(1);
    expect(picked).toEqual([]);
  });

  test("新しい希望シフトがあると、閉じていても、ボタンに数が出る。一覧の「希望シフト」にも出る", () => {
    show({ compact: true, tabs: withPending(3) });
    expect(menuButton().querySelector('[aria-label="3件"]').textContent).toBe("3");
    press(menuButton());
    expect(byText("希望シフト").querySelector('[aria-label="3件"]').textContent).toBe("3");
  });

  test("希望シフトが0件のときは、数の札は出ない", () => {
    show({ compact: true });
    press(menuButton());
    expect(host.querySelector('[aria-label$="件"]')).toBeNull();
  });

  test("画面の幅が変わって、広い画面になると、9つのボタンの並びに戻る", () => {
    show({ compact: true });
    press(menuButton());
    rerender({ compact: false });
    expect(buttons()).toHaveLength(9);
    expect(host.textContent).not.toContain("メニュー");
  });
});
