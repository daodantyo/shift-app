// jest で動かす(もとは node:test)
import assert from "assert/strict";
import ExcelJS from "exceljs";
import { scoutRows, scoutSettings, scoutTotals } from "./calc.js";
import { buildScoutXlsx, sheetName, xlsxFileName } from "./scoutXlsx.js";

// 見本（勤務報酬管理表_DC.xlsx）と同じ4日ぶん
const mk = (id, date, pay, extra = {}) => ({ id, date, hours: "12:00-24:00", course: "60", coursePrice: 18000, courseBack: pay, createdAt: id, ...extra });
const deals = [mk(1, "2026-10-23", 13000), mk(2, "2026-10-27", 18000, { course: "80", coursePrice: 25000 }), mk(3, "2026-10-31", 18000, { hours: "19:00-02:00", course: "80", coursePrice: 25000 }), mk(4, "2026-11-01", 18000, { course: "80", coursePrice: 25000, memo: "指名あり" })];

async function build(rows, cfg = scoutSettings({})) {
  const totals = scoutTotals(rows, cfg);
  const buf = await buildScoutXlsx(ExcelJS, { name: "日南ひなみ", shop: "変態", scout: "前田", rows, cfg, totals });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { ws: wb.worksheets[0], totals };
}

test("Excel：見本と同じ並びと合計（15,455円）", async () => {
  const { ws } = await build(scoutRows(deals));
  assert.equal(ws.name, "日南ひなみ_勤務報酬");
  assert.equal(ws.getCell("A1").value, "日南ひなみさん  勤務・報酬実績");
  assert.equal(ws.getCell("B3").value, "変態");
  assert.equal(ws.getCell("F3").value, "前田");
  assert.deepEqual(["A5", "B5", "C5", "D5", "E5", "F5", "G5"].map((a) => ws.getCell(a).value), ["日付", "勤務時間", "予約", "勤務", "コース", "女子給", "備考"]);
  // データの行
  assert.equal(ws.getCell("A6").value.toISOString().slice(0, 10), "2026-10-23");
  assert.equal(ws.getCell("B8").value, "19:00-02:00");
  assert.equal(ws.getCell("C6").value, "60分");
  assert.equal(ws.getCell("D6").value, 1);
  assert.equal(ws.getCell("E7").value, 25000);
  assert.equal(ws.getCell("F6").value, 13000);
  assert.equal(ws.getCell("G9").value, "指名あり");
  // 合計は計算式（見本と同じ位置：38 / 40〜46 / 48）
  assert.equal(ws.getCell("A38").value, "勤務日数 合計");
  assert.equal(ws.getCell("D38").value.result, 4);
  assert.match(ws.getCell("D38").value.formula, /^SUMPRODUCT/);
  assert.equal(ws.getCell("F38").value.formula, "SUM(F6:F37)");
  assert.equal(ws.getCell("F38").value.result, 67000);
  assert.equal(ws.getCell("A40").value, "報酬集計（税込）");
  const lines = [41, 42, 43, 44, 45, 46].map((r) => [ws.getCell("A" + r).value, ws.getCell("F" + r).value.formula, ws.getCell("F" + r).value.result]);
  assert.deepEqual(lines, [
    ["女子給合計", "F38", 67000],
    ["女子給の15％報酬", "ROUND(F41*15%,0)", 10050],
    ["勤務加算（1勤務×1,000円）", "SUM(D6:D37)*1000", 4000],
    ["報酬小計", "SUM(F42:F43)", 14050],
    ["消費税10％", "ROUND(F44*10%,0)", 1405],
    ["税込最終合計", "SUM(F44:F45)", 15455],
  ]);
  assert.equal(ws.getCell("A48").value, "15％は女子給のみに適用／勤務加算は1勤務1,000円／消費税は報酬小計の10％");
  assert.ok(ws.model.merges.includes("A1:G2") && ws.model.merges.includes("F46:G46"));
});

test("Excel：32行より多いとき、集計の位置が下がり、式の範囲も広がる", async () => {
  const many = Array.from({ length: 40 }, (_, i) => mk(i + 1, "2026-10-" + String((i % 28) + 1).padStart(2, "0"), 1000));
  const { ws, totals } = await build(scoutRows(many));
  // データは 6〜45。勤務日数 合計は 46、集計の見出しは 48、最終合計は 48+7=55
  assert.equal(ws.getCell("A46").value, "勤務日数 合計");
  assert.equal(ws.getCell("F46").value.formula, "SUM(F6:F45)");
  assert.equal(ws.getCell("A48").value, "報酬集計（税込）");
  assert.equal(ws.getCell("A54").value, "税込最終合計");
  assert.equal(ws.getCell("F54").value.result, totals.total);
  assert.equal(ws.getCell("F51").value.formula, "SUM(D6:D45)*1000");
});

test("Excel：設定を変えると、見出し・式・注意書きも変わる。ファイル名・シート名", async () => {
  const cfg = scoutSettings({ scoutback: { rate: 12.5, perDay: 2000, tax: 8 } });
  const { ws } = await build(scoutRows(deals), cfg);
  assert.equal(ws.getCell("A42").value, "女子給の12.5％報酬");
  assert.equal(ws.getCell("F42").value.formula, "ROUND(F41*12.5%,0)");
  assert.equal(ws.getCell("A43").value, "勤務加算（1勤務×2,000円）");
  assert.equal(ws.getCell("F43").value.formula, "SUM(D6:D37)*2000");
  assert.equal(ws.getCell("A45").value, "消費税8％");
  assert.equal(ws.getCell("A48").value, "12.5％は女子給のみに適用／勤務加算は1勤務2,000円／消費税は報酬小計の8％");
  assert.equal(sheetName("A/B[x]:y?"), "ABxy_勤務報酬");
  assert.equal(sheetName(""), "勤務報酬");
  assert.equal(xlsxFileName("日南ひなみ", "2026-10-23", "2026-11-01"), "勤務報酬管理表_日南ひなみ_2026-10-23〜2026-11-01.xlsx");
});
