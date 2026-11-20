// 勤務・報酬管理表（紹介スカウトバック）を Excel（.xlsx）にする。
// 見本（勤務報酬管理表_DC.xlsx）と同じ並び：A4たて／日付 勤務時間 予約 勤務 コース 女子給 備考 → 勤務日数 合計 → 報酬集計（税込）
// ExcelJS は呼び出し側から渡す（画面では「Excelで保存」を押したときに遅れて読み込む。試験では node から渡す）。
// 合計は計算式で入れるので、Excel で直すと合計も変わる。

const MIN_LAST = 37; // 見本と同じく、データの行は 6〜37 の32行（足りなければ増やす）
const FIRST = 6;

const NAVY = "FF283D60", HEAD = "FFDCE8F5", SOFT = "FFF1F5FA", GOLD = "FFFFE0A3", GRAY = "FF64748B";
const YEN = '#,##0"円"';
const thin = { style: "thin", color: { argb: "FF9AA5B5" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

// 1つの数を、小数のおまけ（15.0 など）なしの文字にする（15 → "15"、12.5 → "12.5"）
const plain = (n) => String(Number(n));

export function sheetName(name) {
  const s = String(name || "").replace(/[[\]:*?/\\]/g, "").trim();
  return (s ? s + "_勤務報酬" : "勤務報酬").slice(0, 31);
}

export function xlsxFileName(name, from, to) {
  const safe = String(name || "").replace(/[\\/:*?"<>|]/g, "").trim();
  return `勤務報酬管理表_${safe}_${from}〜${to}.xlsx`;
}

// "2026-10-23" → Excel の日付（時差でずれないよう UTC で作る）
function toDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : s || "";
}

// info: { name, shop, scout, rows: [{ date, hours, reserve, work, coursePrice, pay, memo }], cfg: { rate, perDay, tax }, totals }
export async function buildScoutXlsx(ExcelJS, info) {
  const { name, shop, scout, rows, cfg, totals } = info;
  const wb = new ExcelJS.Workbook();
  wb.creator = "報酬管理";
  const ws = wb.addWorksheet(sheetName(name), {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [15, 19, 12, 11, 18, 17, 25].map((width) => ({ width }));

  const last = Math.max(MIN_LAST, FIRST - 1 + rows.length); // データの最後の行
  const rTotal = last + 1; // 勤務日数 合計
  const rHead = last + 3; // 報酬集計（税込）
  const rLine = rHead + 1; // 女子給合計の行
  const rNote = rHead + 8;

  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const box = (ref) => {
    const [a, b] = ref.split(":");
    const c1 = ws.getCell(a), c2 = ws.getCell(b || a);
    for (let r = c1.row; r <= c2.row; r++) for (let c = c1.col; c <= c2.col; c++) ws.getCell(r, c).border = BORDER;
  };
  const put = (ref, value, style = {}) => {
    const c = ws.getCell(ref);
    c.value = value;
    Object.assign(c, style);
    return c;
  };
  const center = { horizontal: "center", vertical: "middle" };

  // 1〜2行：タイトル
  ws.mergeCells("A1:G2");
  put("A1", `${name}さん  勤務・報酬実績`, { font: { bold: true, size: 16, color: { argb: "FFFFFFFF" } }, fill: fill(NAVY), alignment: center });

  // 3行：店舗・担当者
  put("A3", "店舗", { font: { bold: true, color: { argb: "FF24334A" } }, fill: fill(HEAD), alignment: center });
  ws.mergeCells("B3:D3");
  put("B3", shop || "", { alignment: { vertical: "middle" } });
  put("E3", "担当者", { font: { bold: true, color: { argb: "FF24334A" } }, fill: fill(HEAD), alignment: center });
  ws.mergeCells("F3:G3");
  put("F3", scout || "", { alignment: { vertical: "middle" } });
  box("A3:G3");

  // 5行：見出し
  ["日付", "勤務時間", "予約", "勤務", "コース", "女子給", "備考"].forEach((t, i) => {
    put(ws.getCell(5, i + 1).address, t, { font: { bold: true, color: { argb: "FF24334A" } }, fill: fill(HEAD), alignment: center });
  });
  box("A5:G5");

  // データの行（6〜）
  for (let i = 0; i < last - FIRST + 1; i++) {
    const r = FIRST + i;
    const row = rows[i];
    box(`A${r}:G${r}`);
    if (!row) continue;
    put(`A${r}`, toDate(row.date), { numFmt: 'm"月"d"日"', alignment: center });
    put(`B${r}`, row.hours || "", { alignment: center });
    put(`C${r}`, row.reserve || "", { alignment: center });
    if (Number(row.work)) put(`D${r}`, Number(row.work), { alignment: center });
    if (Number(row.coursePrice)) put(`E${r}`, Number(row.coursePrice), { numFmt: YEN, alignment: { horizontal: "right", vertical: "middle" } });
    put(`F${r}`, Number(row.pay) || 0, { numFmt: YEN, alignment: { horizontal: "right", vertical: "middle" } });
    if (row.memo) put(`G${r}`, row.memo, { alignment: { vertical: "middle", wrapText: true } });
  }

  // 勤務日数 合計
  ws.mergeCells(`A${rTotal}:C${rTotal}`);
  put(`A${rTotal}`, "勤務日数 合計", { font: { bold: true }, fill: fill(SOFT), alignment: center });
  const dateRange = `A${FIRST}:A${last}`;
  put(`D${rTotal}`, { formula: `SUMPRODUCT((${dateRange}<>"")/COUNTIF(${dateRange},${dateRange}&""))`, result: totals.days }, { numFmt: '0"日"', font: { bold: true }, fill: fill(SOFT), alignment: center });
  put(`E${rTotal}`, "", { fill: fill(SOFT) });
  put(`F${rTotal}`, { formula: `SUM(F${FIRST}:F${last})`, result: totals.pay }, { numFmt: YEN, font: { bold: true }, fill: fill(SOFT), alignment: { horizontal: "right", vertical: "middle" } });
  put(`G${rTotal}`, "", { fill: fill(SOFT) });
  box(`A${rTotal}:G${rTotal}`);

  // 報酬集計（税込）
  ws.mergeCells(`A${rHead}:G${rHead}`);
  put(`A${rHead}`, "報酬集計（税込）", { font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } }, fill: fill(NAVY), alignment: center });

  const rate = plain(cfg.rate), tax = plain(cfg.tax), perDay = plain(cfg.perDay);
  const lines = [
    ["女子給合計", `F${rTotal}`, totals.pay],
    [`女子給の${rate}％報酬`, `ROUND(F${rLine}*${rate}%,0)`, totals.bonus],
    [`勤務加算（1勤務×${Number(cfg.perDay).toLocaleString("ja-JP")}円）`, `SUM(D${FIRST}:D${last})*${perDay}`, totals.perDayTotal],
    ["報酬小計", `SUM(F${rLine + 1}:F${rLine + 2})`, totals.subtotal],
    [`消費税${tax}％`, `ROUND(F${rLine + 3}*${tax}%,0)`, totals.tax],
    ["税込最終合計", `SUM(F${rLine + 3}:F${rLine + 4})`, totals.total],
  ];
  lines.forEach(([label, formula, result], i) => {
    const r = rLine + i;
    const isTotal = i === lines.length - 1;
    ws.mergeCells(`A${r}:E${r}`);
    ws.mergeCells(`F${r}:G${r}`);
    put(`A${r}`, label, { font: { bold: isTotal || i === 3 }, fill: fill(isTotal ? GOLD : SOFT), alignment: { horizontal: "left", vertical: "middle", indent: 1 } });
    const valueStyle = { numFmt: YEN, font: { bold: isTotal || i === 3, size: isTotal ? 12 : 11 }, alignment: { horizontal: "right", vertical: "middle" } };
    if (isTotal) valueStyle.fill = fill(GOLD);
    put(`F${r}`, { formula, result }, valueStyle);
    box(`A${r}:G${r}`);
  });

  // 注意書き
  ws.mergeCells(`A${rNote}:G${rNote}`);
  put(`A${rNote}`, `${rate}％は女子給のみに適用／勤務加算は1勤務${Number(cfg.perDay).toLocaleString("ja-JP")}円／消費税は報酬小計の${tax}％`, { font: { size: 9, color: { argb: GRAY } }, alignment: { vertical: "middle" } });

  return wb.xlsx.writeBuffer();
}
