// jest で動かす(もとは node:test)
import assert from "assert/strict";
import { autoSales, calcBack, computeCommissions, dealNet, dealSales, dealTake, resolveValue, scoutRows, scoutSettings, scoutTotals, summarize } from "./calc.js";

const types = {
  intro: { name: "紹介料", mode: "rate", value: 10, tierBasis: "amount", tiers: { a: { min: 100000, value: 15 } } },
  contract: { name: "新規契約", mode: "fixed", value: 5000, tierBasis: "count", tiers: { a: { min: 3, value: 8000 } } },
};

test("率計算と段階制（売上合計）", () => {
  const deals = [
    { id: 1, date: "2026-09-01", memberId: "m1", typeId: "intro", amount: 50000 },
    { id: 2, date: "2026-09-10", memberId: "m1", typeId: "intro", amount: 60000 },
    { id: 3, date: "2026-08-10", memberId: "m1", typeId: "intro", amount: 20000 },
  ];
  const c = computeCommissions(deals, types);
  // 9月は合計110,000 -> 15%
  assert.equal(c[1].commission, 7500);
  assert.equal(c[2].commission, 9000);
  assert.equal(c[1].label, "15%");
  // 8月は20,000 -> 10%
  assert.equal(c[3].commission, 2000);
});

test("固定額と段階制（件数）", () => {
  const deals = [1, 2, 3].map((i) => ({ id: i, date: "2026-09-0" + i, memberId: "m1", typeId: "contract", amount: 0 }));
  const c = computeCommissions(deals, types);
  assert.equal(c[1].commission, 8000);
  const two = computeCommissions(deals.slice(0, 2), types);
  assert.equal(two[1].commission, 5000);
});

test("手入力の上書きと種別なし", () => {
  const c = computeCommissions(
    [
      { id: 1, date: "2026-09-01", memberId: "m1", typeId: "intro", amount: 10000, manualCommission: 1234 },
      { id: 2, date: "2026-09-01", memberId: "m1", typeId: "nope", amount: 10000 },
    ],
    types
  );
  assert.equal(c[1].commission, 1234);
  assert.equal(c[1].label, "手入力");
  assert.equal(c[2].commission, 0);
});

test("tiers が空でも動く", () => {
  assert.equal(resolveValue({ mode: "rate", value: 10 }, 0, 0), 10);
});

test("売上・計・バックの計算", () => {
  const d = { coursePrice: 10000, courseBack: 5000, nomination: 1000, option: 2000, opBack: 1000, extension: 3000 };
  assert.equal(dealSales(d), 15000);
  assert.equal(autoSales(d), 15000);
  // 手入力の売上があればそれを優先
  assert.equal(dealSales({ ...d, amount: 38000 }), 38000);
  assert.equal(dealTake(d), 10000);
  assert.equal(dealNet({ ...d, expense: 1500 }), 8500);
  assert.equal(dealNet(d), 10000);
  assert.equal(calcBack(10000, 50), 5000);
  assert.equal(calcBack("12345", 33), 4073);
  // 古い登録は amount をそのまま売上にする
  assert.equal(dealSales({ amount: 8000 }), 8000);
  // 報酬は売上に対して計算される
  const c = computeCommissions([{ id: 1, date: "2026-09-01", memberId: "m1", typeId: "intro", ...d }], types);
  assert.equal(c[1].commission, 1500);
});

test("集計", () => {
  const deals = [
    { id: 1, date: "2026-09-01", memberId: "m1", typeId: "intro", amount: 10000, paid: true },
    { id: 2, date: "2026-09-02", memberId: "m1", typeId: "intro", amount: 20000 },
    { id: 3, date: "2026-10-02", memberId: "m1", typeId: "intro", amount: 20000 },
  ];
  const c = computeCommissions(deals, types);
  const s = summarize(deals, "2026-09");
  assert.equal(s.m1.count, 2);
  assert.equal(s.m1.amount, 30000);
  const s2 = summarize([{ id: 9, date: "2026-09-03", memberId: "m2", courseBack: 4000, nomination: 1000, expense: 700 }, { id: 10, date: "2026-09-04", memberId: "m2", courseBack: 2000, paid: true }], "2026-09");
  assert.equal(s2.m2.take, 7000);
  assert.equal(s2.m2.expense, 700);
  assert.equal(s2.m2.net, 6300);
  assert.equal(s2.m2.unpaid, 4300);
  assert.equal(s2.m2.paid, 2000);
});

test("紹介スカウトバック：見本（DC）と同じ金額になる", () => {
  const mk = (id, date, pay, extra = {}) => ({ id, date, hours: "12:00-24:00", course: "60", coursePrice: 18000, courseBack: pay, createdAt: id, ...extra });
  const deals = [mk(1, "2026-10-23", 13000), mk(2, "2026-10-27", 18000), mk(3, "2026-10-31", 18000, { hours: "19:00-02:00" }), mk(4, "2026-11-01", 18000)];
  const cfg = scoutSettings({});
  assert.deepEqual(cfg, { rate: 15, perDay: 1000, tax: 10 });
  const rows = scoutRows(deals);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].reserve, "60分");
  assert.deepEqual(rows.map((r) => r.work), [1, 1, 1, 1]);
  const t = scoutTotals(rows, cfg);
  assert.equal(t.days, 4);
  assert.equal(t.pay, 67000);
  assert.equal(t.bonus, 10050);
  assert.equal(t.perDayTotal, 4000);
  assert.equal(t.subtotal, 14050);
  assert.equal(t.tax, 1405);
  assert.equal(t.total, 15455);
});

test("紹介スカウトバック：同じ日の2件目は勤務0、並び順、設定の変更", () => {
  const deals = [
    { id: "b", date: "2026-10-02", coursePrice: 10000, courseBack: 6000, createdAt: 2, course: "SK-spa/100" },
    { id: "a", date: "2026-10-02", coursePrice: 10000, courseBack: 7000, nomination: 1000, createdAt: 1 },
    { id: "c", date: "2026-10-01", courseBack: 5000, createdAt: 3 },
  ];
  const rows = scoutRows(deals);
  assert.deepEqual(rows.map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(rows.map((r) => r.work), [1, 1, 0]);
  assert.equal(rows[2].reserve, "SK-spa/100");
  assert.equal(rows[1].pay, 8000);
  const cfg = scoutSettings({ scoutback: { rate: "20", perDay: 500, tax: 8 } });
  assert.deepEqual(cfg, { rate: 20, perDay: 500, tax: 8 });
  const t = scoutTotals(rows, cfg);
  assert.equal(t.days, 2);
  assert.equal(t.workCount, 2);
  assert.equal(t.pay, 19000);
  assert.equal(t.bonus, 3800);
  assert.equal(t.perDayTotal, 1000);
  assert.equal(t.subtotal, 4800);
  assert.equal(t.tax, 384);
  assert.equal(t.total, 5184);
});

test("紹介スカウトバック：設定が空・おかしいときは初期値、0 はそのまま", () => {
  assert.deepEqual(scoutSettings(undefined), { rate: 15, perDay: 1000, tax: 10 });
  assert.deepEqual(scoutSettings({ scoutback: { rate: "", perDay: "abc", tax: -3 } }), { rate: 15, perDay: 1000, tax: 10 });
  assert.deepEqual(scoutSettings({ scoutback: { rate: 0, perDay: 0, tax: 0 } }), { rate: 0, perDay: 0, tax: 0 });
  const t = scoutTotals([], scoutSettings({}));
  assert.equal(t.total, 0);
  assert.equal(t.days, 0);
});
